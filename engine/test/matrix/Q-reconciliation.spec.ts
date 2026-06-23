import { reconcileLine, ChainEntry } from '../../src/reconciliation/reconcile';

/**
 * Section Q — Reconciliation & balance chain. 🔴
 */
describe('Q. Reconciliation & balance chain 🔴', () => {
  const at = (n: number) => `2026-06-${String(n).padStart(2, '0')}T10:00:00Z`;

  it('RECON-01 closing == prev − debit -> chain holds, confidence up', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'b', amountPaise: 50000, balanceAfterPaise: 950000, direction: 'debit', txnTime: at(2) },
    ];
    const r = reconcileLine(entries);
    expect(r.discrepancies).toHaveLength(0);
    expect(r.confidence).toBe(1);
  });

  it('RECON-02 balance drops with no debit SMS -> MISSING_OUTFLOW', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'b', amountPaise: 0, balanceAfterPaise: 950000, direction: 'none', txnTime: at(2) },
    ];
    const r = reconcileLine(entries);
    expect(r.discrepancies).toEqual([{ type: 'missing_outflow', magnitudePaise: 50000, atId: 'b' }]);
  });

  it('RECON-03 balance rises with no credit SMS (not interest line) -> MISSING_INFLOW', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'b', amountPaise: 0, balanceAfterPaise: 1050000, direction: 'none', txnTime: at(2) },
    ];
    expect(reconcileLine(entries).discrepancies[0]).toEqual({ type: 'missing_inflow', magnitudePaise: 50000, atId: 'b' });
  });

  it('RECON-04 first in-window SMS sets the anchor (forward only, no opening-balance prompt)', () => {
    const entries: ChainEntry[] = [
      { id: 'anchor', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'b', amountPaise: 50000, balanceAfterPaise: 950000, direction: 'debit', txnTime: at(2) },
    ];
    expect(reconcileLine(entries).anchorId).toBe('anchor');
  });

  it('RECON-05 SMS out of order vs balance -> reconcile by balance-implied order', () => {
    // receipt order is b then a, but balances imply a (higher) precedes b (lower)
    const entries: ChainEntry[] = [
      { id: 'b', amountPaise: 50000, balanceAfterPaise: 950000, direction: 'debit', txnTime: at(5) },
      { id: 'a', amountPaise: 30000, balanceAfterPaise: 1000000, direction: 'debit', txnTime: at(2) },
    ];
    const r = reconcileLine(entries, { balanceImpliedOrder: true });
    expect(r.anchorId).toBe('a'); // higher balance anchors first
    // once ordered by balance, the chain reconciles cleanly (1000000 − 50000 = 950000): no false break
    expect(r.discrepancies).toHaveLength(0);
  });

  it('RECON-06 a misread amount breaks the chain -> surfaces the parse error', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'b', amountPaise: 500000, balanceAfterPaise: 960000, direction: 'debit', txnTime: at(2) }, // really ₹400
    ];
    expect(reconcileLine(entries).discrepancies).toHaveLength(1); // chain break surfaces it
  });

  it('RECON-08 credit-card payment raises available limit -> not a discrepancy (inverted)', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'b', amountPaise: 500000, balanceAfterPaise: 1500000, direction: 'credit', txnTime: at(2) }, // payment raises available
    ];
    expect(reconcileLine(entries).discrepancies).toHaveLength(0);
  });

  it('RECON-09 hold dips balance then recovers -> not flagged as missed txn', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1) },
      { id: 'h', amountPaise: 300000, balanceAfterPaise: 700000, direction: 'debit', txnTime: at(2), isHold: true },
      { id: 'c', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(3) },
    ];
    expect(reconcileLine(entries).discrepancies).toHaveLength(0);
  });

  it('RECON-07 / CASH-05 cash entries are outside the chain (cannot break it)', () => {
    const entries: ChainEntry[] = [
      { id: 'a', amountPaise: 0, balanceAfterPaise: 1000000, direction: 'none', txnTime: at(1), source: 'sms' },
      { id: 'cash', amountPaise: 100000, balanceAfterPaise: 0, direction: 'debit', txnTime: at(2), source: 'cash' },
    ];
    expect(reconcileLine(entries).discrepancies).toHaveLength(0);
  });
});
