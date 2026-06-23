import { loadConfig, GateRules } from '../config/loadConfig';
import { normaliseSender } from './senderNormalisation';
import { extractAmounts } from '../amount/parseAmount';

/**
 * The cheap rule-based gate (doc 02 §2.1, doc 03 §2). Microsecond, no model.
 * Admits messages that carry an amount token AND a transaction verb and are NOT OTP/promo/personal.
 *
 * Note on `failed`: a declined/reversed txn carries amount+verb, so it passes the gate and is
 * RECORDED downstream with modality=failed and isCounted=false (doc 02 §3 "recorded but never
 * counted"). The gate only discards true noise (OTP/promo/personal/empty), never a real-looking txn.
 */
export type DropReason =
  | 'admit'
  | 'empty'
  | 'personal'
  | 'denylist'
  | 'otp'
  | 'promo'
  | 'balance_only';

export interface GateResult {
  admit: boolean;
  reason: DropReason;
  normalisedSender: string | null;
  buffered: boolean; // OTP/refund-notice buffered briefly for dedup, then raw discarded
}

const rules = (): GateRules => loadConfig<GateRules>('gate-rules.json');

function hasWord(body: string, words: string[]): boolean {
  const lower = body.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower));
}

function hasAmountToken(body: string): boolean {
  return extractAmounts(body).length > 0;
}

function isOtp(body: string): boolean {
  return /\botp\b|one time password|do not share|code is/i.test(body);
}

function isPromo(body: string): boolean {
  // promotional markers, incl. promotional "cashback" (doc 07 §6: cashback when promotional)
  return (
    /\b(offer|sale|win|won|discount|expires|click|claim|shop now|flat \d+%|\d+% off)\b/i.test(body) ||
    /\bcashback\b/i.test(body)
  );
}

export function gate(
  sender: string,
  body: string,
  denylist: ReadonlySet<string> = new Set(),
): GateResult {
  const norm = normaliseSender(sender);

  if (!body || !body.trim()) {
    return { admit: false, reason: 'empty', normalisedSender: norm.entity, buffered: false };
  }
  if (norm.kind === 'personal') {
    return { admit: false, reason: 'personal', normalisedSender: null, buffered: false };
  }
  if (norm.entity && denylist.has(norm.entity)) {
    return { admit: false, reason: 'denylist', normalisedSender: norm.entity, buffered: false };
  }
  if (isOtp(body)) {
    // buffered briefly for dedup/linkage, then the raw is discarded (doc 03 §2)
    return { admit: false, reason: 'otp', normalisedSender: norm.entity, buffered: true };
  }
  if (isPromo(body)) {
    return { admit: false, reason: 'promo', normalisedSender: norm.entity, buffered: false };
  }

  const r = rules();
  const amount = hasAmountToken(body);
  const verb = hasWord(body, r.transactionVerbs);
  // a candidate also includes phantom-modality events (future/conditional/hold/mandate/failed/
  // refund) — they carry an amount + a modality trigger and must be RECORDED (doc 02 §3), then
  // classified and left uncounted. The gate only discards true noise (OTP/promo/personal).
  const trigger = hasWord(body, [
    ...r.future,
    ...r.conditional,
    ...r.hold,
    ...r.mandate,
    ...r.refund,
    ...r.failedContext,
  ]);

  if (amount && (verb || trigger)) {
    return { admit: true, reason: 'admit', normalisedSender: norm.entity, buffered: false };
  }
  if (amount && !verb && !trigger) {
    // balance enquiry ("Balance is Rs 5,000") — updates balance, but is NOT a counted txn
    return { admit: false, reason: 'balance_only', normalisedSender: norm.entity, buffered: false };
  }
  // no amount → noise, never templated
  return { admit: false, reason: 'balance_only', normalisedSender: norm.entity, buffered: false };
}
