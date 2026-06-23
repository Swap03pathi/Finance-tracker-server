import { headline } from '../../src/aggregation/aggregate';
import { matchesPendingRefund } from '../../src/settlement/settle';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section L — Refunds. 🔴 ledger keeps both rows; aggregate nets.
 */
describe('L. Refunds 🔴', () => {
  it('REF-01 ₹200 spend + ₹200 refund -> ledger 2 entries; aggregate both vanish (net 0)', () => {
    const spend = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 20000 });
    const refund = makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 20000 });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'r', kind: 'refund', settledAmountPaise: 20000, status: 'settled' });
    const entries = [spend, refund];
    expect(entries).toHaveLength(2); // ledger honesty
    expect(headline({ entries, settlements: [link] }).expensePaise).toBe(0); // aggregate nets
  });

  it('REF-02 ₹200 spend, ₹50 partial refund -> aggregate nets to ₹150', () => {
    const spend = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 20000 });
    const refund = makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 5000 });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'r', kind: 'refund', settledAmountPaise: 5000, status: 'partial' });
    expect(headline({ entries: [spend, refund], settlements: [link] }).expensePaise).toBe(15000);
  });

  it('REF-03 refund announced now, credited 7 days later -> pending settlement, auto-matched on arrival', () => {
    const pending = makeSettlement({ baseEntryId: 'b', kind: 'refund', expectedAmountPaise: 20000, status: 'pending', expectedAt: '2026-06-09T00:00:00Z' });
    expect(matchesPendingRefund(pending, { amountPaise: 20000, atIso: '2026-06-09T10:00:00Z' })).toBe(true);
  });

  it('REF-04 refund lands in wallet, not the paying bank -> still linked (cross-line)', () => {
    const spend = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 20000, lineId: 'bank' });
    const refund = makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 20000, lineId: 'wallet' });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'r', kind: 'refund', settledAmountPaise: 20000, status: 'settled' });
    expect(headline({ entries: [spend, refund], settlements: [link] }).expensePaise).toBe(0);
  });

  it('REF-05 refund SMS with no matching original -> stands alone, NOT income', () => {
    // an unlinked credit flagged as a refund-with-no-match is suppressed from income (held for review)
    const orphan = makeEntry({ id: 'r', direction: 'INCOME', amountCapturedPaise: 20000, isCounted: false });
    expect(headline({ entries: [orphan] }).incomePaise).toBe(0);
  });

  it('REF-06 ambiguous refund (amount differs) -> not auto-matched (suggest-confirm)', () => {
    const pending = makeSettlement({ baseEntryId: 'b', kind: 'refund', expectedAmountPaise: 20000, status: 'pending', expectedAt: '2026-06-09T00:00:00Z' });
    expect(matchesPendingRefund(pending, { amountPaise: 15000, atIso: '2026-06-09T10:00:00Z' })).toBe(false);
  });

  it('REF-07 30-day-delayed refund -> still matched; aging tracked', () => {
    const pending = makeSettlement({ baseEntryId: 'b', kind: 'refund', expectedAmountPaise: 20000, status: 'pending', expectedAt: '2026-06-02T00:00:00Z' });
    expect(matchesPendingRefund(pending, { amountPaise: 20000, atIso: '2026-07-02T00:00:00Z' })).toBe(true);
  });
});
