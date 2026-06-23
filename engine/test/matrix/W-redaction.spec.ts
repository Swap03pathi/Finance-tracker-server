import { redactForInduction, assertRedacted, RedactionLeakError } from '../../src/redaction/redact';
import { maskBody } from '../../src/fingerprint/mask';
import { CORPUS } from '../fixtures/corpus';

/**
 * Section W — Privacy & redaction. 🔴 The single most important test set (doc 07 §13).
 * These run on the ACTUAL masker/redactor code path — NOT mocked.
 */
describe('W. Privacy & redaction 🔴 (real code path, never mocked)', () => {
  it('PRIV-01 induction skeleton carries zero real amounts/names/balances', () => {
    const body = 'Rs.450.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00';
    const skeleton = redactForInduction(body);
    expect(skeleton).not.toMatch(/450/);
    expect(skeleton).not.toMatch(/12,?000/);
    expect(skeleton).not.toMatch(/1234/);
    expect(skeleton).toContain('§AMT§');
  });

  it('PRIV-02 adversarial amounts in unusual notation are still masked', () => {
    const adversarial = [
      '₹1,23,456.78 debited',
      'INR 2.5 crore credited',
      'Rs 1.2L spent',
      'Rupees 450 paid',
      'Amount 9,999/- withdrawn',
      'debited Rs0.50',
    ];
    for (const body of adversarial) {
      expect(() => redactForInduction(body)).not.toThrow();
      const skeleton = maskBody(body);
      expect(skeleton).not.toMatch(/\d{3,}/); // no 3+ digit run survives
    }
  });

  it('PRIV-03 server rejects a skeleton if any amount-like digit-run survives', () => {
    expect(() => assertRedacted('debit of rs 4500 at §VPA§')).toThrow(RedactionLeakError);
    expect(() => assertRedacted('balance §AMT§ acct 1234')).toThrow(RedactionLeakError);
    expect(() => assertRedacted('debit of §AMT§ at §ACCT§ on §DATE§')).not.toThrow();
  });

  it('PRIV-04/06/07 no raw value leaks for ANY corpus message that would be induced', () => {
    for (const m of CORPUS) {
      const skeleton = maskBody(m.body);
      // the redaction invariant: nothing 3+ digits, no currency+digit
      expect(skeleton).not.toMatch(/\d{3,}/);
      expect(skeleton).not.toMatch(/(?:rs\.?|inr|₹|rupees)\s*\d/i);
    }
  });
});
