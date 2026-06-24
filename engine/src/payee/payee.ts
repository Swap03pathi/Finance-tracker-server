import { loadConfig, MerchantDict } from '../config/loadConfig';
import { LedgerEntry, Payee } from '../types';

/**
 * UPI payee identity & tagging (doc 01 §7, doc 08 §J/§K). Labels live on the payee ENTITY, never
 * copied onto the transaction — so renaming/re-tagging reflects across all history. A transaction
 * inherits the payee default but can override for that one payment without changing the default.
 */

/** PSP-stripped local-part as the join key: name@paytm and 9876@okaxis → their local parts. */
export function normalizeVpaKey(vpa: string): string {
  const at = vpa.indexOf('@');
  return (at >= 0 ? vpa.slice(0, at) : vpa).toLowerCase();
}

export function isPhoneVpa(vpa: string): boolean {
  return /^\d{10}$/.test(normalizeVpaKey(vpa));
}

/** Cold-start classification (doc 08 §K): phone-VPA → person/unclassified; merchant string → merchant. */
export function classifyCounterparty(vpa: string, merchantText?: string | null): 'person' | 'merchant' | 'unknown' {
  if (merchantText && merchantCategoryHint(merchantText) != null) return 'merchant';
  if (isPhoneVpa(vpa)) return 'person';
  return 'unknown';
}

/** Big-merchant dictionary → a cold-start category hint (first guess; user confirmation wins). */
export function merchantCategoryHint(merchantText: string): string | null {
  const dict = loadConfig<MerchantDict>('merchant-vpa-dictionary.json').merchants;
  const key = merchantText.toLowerCase();
  for (const name of Object.keys(dict)) if (key.includes(name)) return dict[name];
  return null;
}

// ── label-on-entity resolution (retroactive, rename-safe) ────────────────────
export function effectiveCategoryId(entry: LedgerEntry, payee?: Payee | null): number | null {
  return entry.categoryId ?? payee?.defaultCategoryId ?? null;
}
export function effectiveTagId(entry: LedgerEntry, payee?: Payee | null): string | null {
  return entry.tagId ?? payee?.defaultTagId ?? null;
}

// ── tag hygiene ──────────────────────────────────────────────────────────────
function similarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.startsWith(shorter) || longer.includes(shorter)) return 0.9; // smoke ⊂ smoking
  // shared-prefix score catches stem fragmentation (smoke / smoking share "smok")
  let prefix = 0;
  while (prefix < shorter.length && a[prefix] === b[prefix]) prefix++;
  const prefixScore = prefix / shorter.length;
  // edit-distance ratio catches typos (cigarette / ciggarette)
  const levScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.max(prefixScore, levScore);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** On tag creation, suggest an existing similar tag to prevent fragmentation (PAYEE-06). */
export function fuzzyMatchTag(name: string, existing: string[], threshold = 0.6): string | null {
  let best: string | null = null;
  let bestScore = threshold;
  for (const e of existing) {
    const score = similarity(name, e);
    if (score >= bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** Person-payee reason routing (doc 08 §K) — where a P2P payment lands in the accounting. */
export type PersonReason = 'my_share' | 'lending' | 'repaying' | 'transfer' | 'rent';
export function routePersonReason(reason: PersonReason): 'expense' | 'receivable' | 'debt_repayment' | 'transfer' {
  switch (reason) {
    case 'my_share':
    case 'rent':
      return 'expense';
    case 'lending':
      return 'receivable';
    case 'repaying':
      return 'debt_repayment';
    case 'transfer':
      return 'transfer';
  }
}
