import { fingerprint } from '../fingerprint/fingerprint';
import { maskBody } from '../fingerprint/mask';
import { redactForInduction } from '../redaction/redact';
import { parseAmount } from '../amount/parseAmount';
import { Paise } from '../money';

/**
 * Template lifecycle (doc 03 §3, doc 07 §8): novel fingerprint → redacted skeleton → LLM induces a
 * slot plan → synthesise regex → round-trip validate vs the cluster → provisional → trust gate
 * (5–6 agreement runs) → trusted. No versioning. LLM is a template AUTHOR, never a per-message parser.
 */
export type SlotRole = 'amount' | 'balance' | 'date' | 'account_tail' | 'ref' | 'merchant' | 'none';
export type TrustState = 'provisional' | 'trusted' | 'flagged';

export interface InductionResult {
  roles: SlotRole[]; // aligned to the ordered slot tokens in the skeleton
  merchantSpan?: string | null;
}

/** The only off-device call. `induce` authors a template; `extract` is a fresh per-example read
 *  used ONLY inside the trust gate to corroborate the regex. Mocked deterministically in tests. */
export interface LlmInductionClient {
  induce(skeleton: string): InductionResult;
  extract(body: string): { amountPaise: Paise | null };
}

export interface Template {
  key: string; // issuer|fingerprint
  issuer: string | null;
  fingerprint: string;
  regex: string;
  roles: SlotRole[];
  trustState: TrustState;
  validationRuns: number;
}

const FAMILY: Record<string, string> = {
  AMT: String.raw`(?:rs\.?|inr|₹|rupees)?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lac|l|crores?|cr)?(?:\s*\/-)?`,
  DATE: String.raw`\d{1,2}[-/ ](?:\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-/ ]?\d{0,4}`,
  ACCT: String.raw`(?:card\s+)?(?:x{2,}|\*{2,}|a\/c\s*[*.]*\s*|ending\s+|account\s+)?\s*\d{2,6}`,
  NUM: String.raw`\d{3,}`,
  VPA: String.raw`[\w.\-]+@[a-z]+`,
  MERCHANT: String.raw`.+?`,
};

function roleGroupName(role: SlotRole): string | null {
  if (role === 'amount') return 'amount';
  if (role === 'balance') return 'balance';
  if (role === 'date') return 'date';
  if (role === 'account_tail') return 'account_tail';
  if (role === 'ref') return 'ref';
  if (role === 'merchant') return 'merchant';
  return null; // 'none' → non-capturing
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

/** Build a named-group regex from the masked skeleton + the LLM's role assignment. */
export function synthesiseRegex(skeleton: string, roles: SlotRole[]): string {
  const tokenRe = /§(AMT|DATE|ACCT|NUM|VPA|MERCHANT)§/g;
  let out = '';
  let last = 0;
  let i = 0;
  const used = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(skeleton)) !== null) {
    out += escapeLiteral(skeleton.slice(last, m.index));
    const family = m[1];
    const role = roles[i] ?? 'none';
    let name = roleGroupName(role);
    if (name && used.has(name)) name = `${name}_${i}`;
    if (name) used.add(name);
    out += name ? `(?<${name}>${FAMILY[family]})` : `(?:${FAMILY[family]})`;
    last = m.index + m[0].length;
    i++;
  }
  out += escapeLiteral(skeleton.slice(last));
  return `^${out}$`;
}

export function parseWithTemplate(
  t: Template,
  body: string,
): { amountPaise: Paise | null; balancePaise: Paise | null; merchant: string | null } | null {
  const re = new RegExp(t.regex, 'i');
  const m = body.match(re);
  if (!m) return null;
  const g = m.groups ?? {};
  return {
    amountPaise: g.amount ? parseAmount(g.amount).paise : null,
    balancePaise: g.balance ? parseAmount(g.balance).paise : null,
    merchant: g.merchant ? g.merchant.trim() : null,
  };
}

/** Round-trip: the synthesised regex must match & extract an amount from EVERY cluster message. */
export function roundTripValidate(t: Template, clusterBodies: string[]): boolean {
  return clusterBodies.every((b) => {
    const r = parseWithTemplate(t, b);
    return r !== null && r.amountPaise !== null;
  });
}

export interface IngestStats {
  template: Template | null;
  llmInduceCalls: number;
}

/** Induce ONE template from a fingerprint cluster, validate, and run the trust gate. */
export function induceTemplate(
  issuer: string | null,
  clusterBodies: string[],
  llm: LlmInductionClient,
  trustRuns = 5,
): IngestStats {
  const representative = clusterBodies[0];
  const skeleton = redactForInduction(representative); // privacy-critical, unmocked, asserts clean
  const fp = fingerprint(representative);
  const plan = llm.induce(skeleton); // ← the single LLM call per cluster
  const regex = synthesiseRegex(maskBody(representative), plan.roles);
  const template: Template = {
    key: `${issuer ?? ''}|${fp}`,
    issuer,
    fingerprint: fp,
    regex,
    roles: plan.roles,
    trustState: 'provisional',
    validationRuns: 0,
  };
  if (!roundTripValidate(template, clusterBodies)) {
    template.trustState = 'flagged';
    return { template, llmInduceCalls: 1 };
  }
  // trust gate: N runs comparing regex extraction vs a fresh LLM extraction on real examples
  let agree = 0;
  for (let run = 0; run < trustRuns; run++) {
    const body = clusterBodies[run % clusterBodies.length];
    const viaRegex = parseWithTemplate(template, body)?.amountPaise ?? null;
    const viaLlm = llm.extract(body).amountPaise;
    if (viaRegex !== null && viaRegex === viaLlm) agree++;
  }
  template.validationRuns = agree;
  template.trustState = agree >= trustRuns ? 'trusted' : 'flagged';
  return { template, llmInduceCalls: 1 };
}

/** Cluster many unmatched messages by fingerprint; induce ONE template per cluster (TMPL-08). */
export function induceBatch(
  messages: { issuer: string | null; body: string }[],
  llm: LlmInductionClient,
): { templates: Template[]; llmInduceCalls: number } {
  const clusters = new Map<string, { issuer: string | null; bodies: string[] }>();
  for (const msg of messages) {
    const fp = fingerprint(msg.body);
    const key = `${msg.issuer ?? ''}|${fp}`;
    if (!clusters.has(key)) clusters.set(key, { issuer: msg.issuer, bodies: [] });
    clusters.get(key)!.bodies.push(msg.body);
  }
  let calls = 0;
  const templates: Template[] = [];
  for (const { issuer, bodies } of clusters.values()) {
    const stats = induceTemplate(issuer, bodies, llm);
    calls += stats.llmInduceCalls;
    if (stats.template) templates.push(stats.template);
  }
  return { templates, llmInduceCalls: calls };
}

/** The shared template library + local cache (doc 03 §3). Keyed by (issuer, fingerprint). */
export class TemplateLibrary {
  private byKey = new Map<string, Template>();

  add(t: Template): void {
    this.byKey.set(t.key, t);
  }

  /** Match a known template with ZERO LLM calls (TMPL-09 cache hit). */
  match(issuer: string | null, body: string): Template | null {
    const key = `${issuer ?? ''}|${fingerprint(body)}`;
    return this.byKey.get(key) ?? null;
  }
}
