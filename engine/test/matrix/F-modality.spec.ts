import { classifyModality, isReversalNotice } from '../../src/classification/modality';
import { computeIsCounted } from '../../src/ledger/counted';
import { headline } from '../../src/aggregation/aggregate';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section F — Modality classification. 🔴
 */
describe('F. Modality classification 🔴', () => {
  it('MOD-01 "debited for purchase at Amazon" -> actual (counted)', () => {
    expect(classifyModality('Rs 1,200 debited for purchase at Amazon')).toBe('actual');
    expect(computeIsCounted('EXPENSE', 'actual')).toBe(true);
  });

  it('MOD-02 "will be debited on 5th for SIP" -> future (NOT counted)', () => {
    expect(classifyModality('Rs 5,000 will be debited on 5th for SIP')).toBe('future');
    expect(computeIsCounted('EXPENSE', 'future')).toBe(false);
  });

  it('MOD-03 "Ramesh has requested Rs 500" -> conditional (NOT counted)', () => {
    expect(classifyModality('Ramesh has requested Rs 500')).toBe('conditional');
    expect(computeIsCounted('EXPENSE', 'conditional')).toBe(false);
  });

  it('MOD-04 "declined / could not be processed" -> failed (NOT counted)', () => {
    expect(classifyModality('Txn of Rs 1,200 declined, could not be processed')).toBe('failed');
    expect(computeIsCounted('EXPENSE', 'failed')).toBe(false);
  });

  it('MOD-05 "blocked for hotel booking" -> hold (NOT counted until settle)', () => {
    expect(classifyModality('Rs 3,000 blocked for hotel booking')).toBe('hold');
    expect(computeIsCounted('EXPENSE', 'hold')).toBe(false);
  });

  it('MOD-06 "Mandate created for Rs 2,000/month at Netflix" -> mandate (NOT counted)', () => {
    expect(classifyModality('Mandate created for Rs 2,000/month at Netflix via Autopay')).toBe('mandate');
    expect(computeIsCounted('EXPENSE', 'mandate')).toBe(false);
  });

  it('MOD-07 future SMS then actual debit -> future not counted, actual counted once', () => {
    const future = makeEntry({ direction: 'EXPENSE', modality: 'future', amountCapturedPaise: 500000 });
    const actual = makeEntry({ direction: 'EXPENSE', modality: 'actual', amountCapturedPaise: 500000 });
    const { expensePaise } = headline({ entries: [future, actual] });
    expect(expensePaise).toBe(500000); // only the actual, once
  });

  it('MOD-08 hold then settlement at different amount -> resolves to settled amount', () => {
    // hold not counted; the settled actual (fuel ₹2,000 vs ₹3,000 hold) is what counts
    const hold = makeEntry({ direction: 'EXPENSE', modality: 'hold', amountCapturedPaise: 300000 });
    const settled = makeEntry({ direction: 'EXPENSE', modality: 'actual', amountCapturedPaise: 200000 });
    const { expensePaise } = headline({ entries: [hold, settled] });
    expect(expensePaise).toBe(200000);
  });

  it('MOD-09 hold that releases entirely -> no expense recorded', () => {
    const hold = makeEntry({ direction: 'EXPENSE', modality: 'hold', amountCapturedPaise: 300000 });
    const { expensePaise } = headline({ entries: [hold] });
    expect(expensePaise).toBe(0);
  });

  it('MOD-10 "transaction reversed" right after a debit -> reversal, nets to 0', () => {
    expect(isReversalNotice('Rs 1,200 transaction reversed')).toBe(true);
    const spend = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 120000 });
    const reversal = makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 120000, netStatus: 'is_reversal' });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'r', kind: 'refund', settledAmountPaise: 120000, status: 'settled' });
    const { expensePaise, incomePaise } = headline({ entries: [spend, reversal], settlements: [link] });
    expect(expensePaise).toBe(0);
    expect(incomePaise).toBe(0); // reversal leg is not income
  });
});
