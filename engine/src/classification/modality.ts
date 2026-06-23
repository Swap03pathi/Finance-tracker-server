import { loadConfig, GateRules } from '../config/loadConfig';
import { Modality } from '../types';

/**
 * Modality classification (doc 02 §3, doc 08 §F). Tense/modality discriminator that stops phantom
 * transactions from corrupting totals. Only `actual` is eligible to count; future/conditional/
 * failed/hold/mandate are recorded but never counted.
 *
 * Order matters: mandate before future (a mandate SMS often mentions "autopay"); failed/hold before
 * the actual fallback.
 */
const rules = (): GateRules => loadConfig<GateRules>('gate-rules.json');

function has(body: string, words: string[]): boolean {
  const lower = body.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

export function classifyModality(body: string): Modality {
  const r = rules();
  if (has(body, r.mandate)) return 'mandate';
  if (has(body, r.future)) return 'future';
  if (has(body, r.conditional)) return 'conditional';
  if (has(body, [...r.failedContext, 'failed', 'declined'])) return 'failed';
  if (has(body, r.hold)) return 'hold';
  return 'actual';
}

/** A reversal notice ("transaction reversed") is an actual credit that NETS via settlement (MOD-10). */
export function isReversalNotice(body: string): boolean {
  return /\breversed\b|reversal of|credited back/i.test(body);
}
