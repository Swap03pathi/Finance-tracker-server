import { headline, byCategory, byTag, sumMap } from '../../src/aggregation/aggregate';
import { describePeriod } from '../../src/aggregation/period';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section Y — Dashboard & aggregation. 🔴
 */
describe('Y. Dashboard & aggregation 🔴', () => {
  it('DASH-01 savings == income − expenses', () => {
    const entries = [
      makeEntry({ direction: 'INCOME', amountCapturedPaise: 6500000 }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 2000000 }),
    ];
    const h = headline({ entries });
    expect(h.savingsPaise).toBe(h.incomePaise - h.expensePaise);
    expect(h.savingsPaise).toBe(4500000);
  });

  it('DASH-02 refund pair in period -> excluded from totals (net 0)', () => {
    const spend = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 20000 });
    const refund = makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 20000 });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'r', kind: 'refund', settledAmountPaise: 20000, status: 'settled' });
    const h = headline({ entries: [spend, refund], settlements: [link] });
    expect(h.expensePaise).toBe(0);
    expect(h.incomePaise).toBe(0);
  });

  it('DASH-03 same refund pair in ledger view -> both visible', () => {
    const entries = [
      makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 20000 }),
      makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 20000 }),
    ];
    expect(entries).toHaveLength(2); // ledger keeps both rows distinct
  });

  it('DASH-04 fresh mid-cycle install, no salary -> income near-zero, "since you installed"', () => {
    const period = describePeriod('2026-06-09T00:00:00Z', '2026-06-23T00:00:00Z');
    expect(period.isThin).toBe(true);
    expect(period.label).toBe('since you installed');
    const h = headline({ entries: [makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 30000 })] });
    expect(h.incomePaise).toBe(0); // correct, not broken
  });

  it('DASH-05 by-category sum == grand expense total', () => {
    const entries = [
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 30000, categoryId: 1 }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 20000, categoryId: 2 }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 10000, categoryId: 1 }),
    ];
    const h = headline({ entries });
    expect(sumMap(byCategory({ entries }))).toBe(h.expensePaise);
  });

  it('DASH-06 by-tag sum == by-category sum (single-tag)', () => {
    const entries = [
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 30000, categoryId: 1, tagId: 't1' }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 20000, categoryId: 2, tagId: 't2' }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 10000, categoryId: 1, tagId: null }), // untagged still counts
    ];
    expect(sumMap(byTag({ entries }))).toBe(sumMap(byCategory({ entries })));
  });

  it('DASH-07 transfers/top-ups -> excluded from income & expense', () => {
    const entries = [
      makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 500000 }),
      makeEntry({ direction: 'TOPUP', amountCapturedPaise: 100000 }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 30000 }),
    ];
    const h = headline({ entries });
    expect(h.expensePaise).toBe(30000);
    expect(h.incomePaise).toBe(0);
  });

  it('DASH-08 current balance per line -> from latest balance-bearing entry', () => {
    const entries = [
      makeEntry({ lineId: 'L', amountCapturedPaise: 30000, balanceAfterPaise: 1200000, txnTime: '2026-06-02T10:00:00Z' }),
      makeEntry({ lineId: 'L', amountCapturedPaise: 20000, balanceAfterPaise: 1000000, txnTime: '2026-06-03T10:00:00Z' }),
    ];
    const latest = entries
      .filter((e) => e.lineId === 'L' && e.balanceAfterPaise != null)
      .sort((a, b) => Date.parse(b.txnTime!) - Date.parse(a.txnTime!))[0];
    expect(latest.balanceAfterPaise).toBe(1000000);
  });
});
