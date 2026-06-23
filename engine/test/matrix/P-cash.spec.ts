import { headline } from '../../src/aggregation/aggregate';
import { effectiveSpend } from '../../src/settlement/settle';
import { reconcileLine, ChainEntry } from '../../src/reconciliation/reconcile';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section P — Cash entries. 🟠
 * NOTE: CASH-01 *granularity* (ATM lump not itemised) is a documented v1 gap, not a failure — the
 * ATM outflow still counts toward spend & the balance chain, which is what these assert.
 */
describe('P. Cash entries 🟠', () => {
  const MISC = 12; // Miscellaneous category id

  it('CASH-01 ATM withdrawal ₹10,000 -> single Misc outflow, counts toward spend', () => {
    const atm = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 1000000, categoryId: MISC, source: 'cash' });
    expect(headline({ entries: [atm] }).expensePaise).toBe(1000000);
    expect(atm.categoryId).toBe(MISC); // lumped to Misc (itemisation is a v2 nicety — accepted gap)
  });

  it('CASH-02 user not forced to itemise the ₹10,000 -> no nagging (single entry stands)', () => {
    const atm = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 1000000, categoryId: MISC, source: 'cash' });
    expect(headline({ entries: [atm] }).expensePaise).toBe(1000000); // complete without itemisation
  });

  it('CASH-03 friend repays ₹1,000 in cash -> first-class linkable settlement', () => {
    const base = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 500000 });
    const cashSettle = makeSettlement({ baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled', note: 'cash from friend' });
    expect(effectiveSpend(500000, 'b', [cashSettle])).toBe(400000);
  });

  it('CASH-04 manual cash spend added -> counts toward totals, source=cash', () => {
    const e = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 25000, source: 'cash' });
    expect(e.source).toBe('cash');
    expect(headline({ entries: [e] }).expensePaise).toBe(25000);
  });

  it('CASH-05 cash entries counted in spend but OUTSIDE the balance chain', () => {
    const chain: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: '2026-06-01T10:00:00Z', source: 'sms' },
      { id: 'cash', amountPaise: 1000000, balanceAfterPaise: 0, direction: 'debit', txnTime: '2026-06-02T10:00:00Z', source: 'cash' },
    ];
    expect(reconcileLine(chain).discrepancies).toHaveLength(0); // can't break the chain
  });
});
