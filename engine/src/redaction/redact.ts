import { maskBody } from '../fingerprint/mask';

/**
 * Redaction — the one privacy-critical path (doc 02 §2.4, doc 07 §8). The skeleton sent for LLM
 * induction is produced by the SAME masker as the fingerprint, then ASSERTED clean. Enforced on
 * device before send AND on server before storing a contribution (PRIV-01/02/03). A failure here
 * is a privacy breach, not a parse error — so this throws rather than leaks.
 */
export class RedactionLeakError extends Error {
  constructor(public readonly residue: string, public readonly skeleton: string) {
    super(`Redaction leak: real value-like token "${residue}" survived masking`);
    this.name = 'RedactionLeakError';
  }
}

/**
 * Assert a skeleton carries ZERO real values. Rejects if any amount-like / balance-like / long
 * digit-run survives (doc 07 §8 "reject if any digit-run that looks like an amount/balance
 * survives"). Used server-side too (PRIV-03). NEVER mock this in tests.
 */
export function assertRedacted(skeleton: string): void {
  // currency followed by a digit → an unmasked amount
  const currencyDigit = skeleton.match(/(?:rs\.?|inr|₹|rupees)\s*\d/i);
  if (currencyDigit) throw new RedactionLeakError(currencyDigit[0], skeleton);
  // any run of 3+ digits → likely amount/balance/tail/ref
  const longRun = skeleton.match(/\d{3,}/);
  if (longRun) throw new RedactionLeakError(longRun[0], skeleton);
}

/** Produce the redacted skeleton for induction and assert it is clean. */
export function redactForInduction(body: string): string {
  const skeleton = maskBody(body);
  assertRedacted(skeleton); // device-side enforcement before anything leaves
  return skeleton;
}
