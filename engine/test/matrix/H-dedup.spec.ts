import { LedgerStore } from '../../src/ledger/store';
import { logicalEntryId, extractReference } from '../../src/ledger/idempotentId';
import { headline } from '../../src/aggregation/aggregate';
import { makeEntry } from '../fixtures/factory';

/**
 * Section H — Double-counting (dedup). 🔴
 * doc 10 §2.2: dedup on the bank's own transaction reference (UPI ref / RRN / txn id) when present
 * (exact), falling back to a SMALL time-bucket only when no reference exists. This lets DUP-01/05/07
 * pass TOGETHER — which a single bucket width cannot.
 */
describe('H. Double-counting (dedup) 🔴', () => {
  it('extractReference pulls UPI ref / RRN / txn id from the SMS', () => {
    expect(extractReference('Rs 450 spent at Zomato. UPI Ref no 412345678901')).toBe('412345678901');
    expect(extractReference('debited Rs 450 RRN 123456789012')).toBe('123456789012');
    expect(extractReference('Rs 450 spent, no reference here')).toBeNull();
  });

  it('DUP-01 dual bank+UPI-app SMS sharing the SAME ref -> collapse to ONE', () => {
    // same UPI ref in both SMS → exact dedup regardless of the few-seconds delivery gap
    const ref = '412345678901';
    const base = { userId: 'u1', lineKey: 'HDFCBK|1234', direction: 'EXPENSE', amountPaise: 45000 };
    const idBank = logicalEntryId({ ...base, epochSec: 1_700_000_010, reference: ref });
    const idUpiApp = logicalEntryId({ ...base, epochSec: 1_700_000_028, reference: ref }); // 18s later
    expect(idBank).toBe(idUpiApp);

    const store = new LedgerStore();
    store.upsertEntry(makeEntry({ id: idBank, amountCapturedPaise: 45000 }));
    store.upsertEntry(makeEntry({ id: idUpiApp, amountCapturedPaise: 45000 }));
    expect(store.list()).toHaveLength(1);
    expect(headline({ entries: store.list() }).expensePaise).toBe(45000);
  });

  it('DUP-07 two genuine ₹50 to same stall 30s apart with DIFFERENT refs -> stay TWO', () => {
    const base = { userId: 'u1', lineKey: 'HDFCBK|1234', direction: 'EXPENSE', amountPaise: 5000 };
    const id1 = logicalEntryId({ ...base, epochSec: 1_700_000_000, reference: 'REF000000001' });
    const id2 = logicalEntryId({ ...base, epochSec: 1_700_000_030, reference: 'REF000000002' });
    expect(id1).not.toBe(id2);
    const store = new LedgerStore();
    store.upsertEntry(makeEntry({ id: id1, amountCapturedPaise: 5000 }));
    store.upsertEntry(makeEntry({ id: id2, amountCapturedPaise: 5000 }));
    expect(store.list()).toHaveLength(2);
  });

  it('DUP-07b no-ref fallback keys on CONTENT: identical text (dual-capture, diff timestamps) -> ONE', () => {
    const base = { userId: 'u1', lineKey: 'HDFCBK|1234', direction: 'EXPENSE', amountPaise: 5000, epochSec: 0 };
    const body = 'Rs.50.00 spent at Chai Point from a/c **1234. Avl Bal Rs.900.00';
    // same SMS captured by the real-time receiver AND the catch-up sweep, with different timestamps →
    // the content hash collapses them to one id (this is the double-count bug fix)
    expect(logicalEntryId({ ...base, epochSec: 1_700_000_000, content: body }))
      .toBe(logicalEntryId({ ...base, epochSec: 1_700_000_045, content: body }));
  });

  it('DUP-07c no-ref fallback: two genuine ₹50 with DIFFERENT text -> TWO', () => {
    const base = { userId: 'u1', lineKey: 'HDFCBK|1234', direction: 'EXPENSE', amountPaise: 5000, epochSec: 0 };
    // real bank SMS for two purchases differ (balance/time) → different content hash → two entries
    expect(logicalEntryId({ ...base, content: 'Rs.50 at Chai Point. Avl Bal Rs.900.00' }))
      .not.toBe(logicalEntryId({ ...base, content: 'Rs.50 at Chai Point. Avl Bal Rs.850.00' }));
  });

  it('DUP-03 wallet load then wallet spend -> load=transfer, spend=expense (not both)', () => {
    const load = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 500000 });
    const spend = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 30000 });
    expect(headline({ entries: [load, spend] }).expensePaise).toBe(30000);
  });

  it('DUP-04 card spend + later card-bill payment -> spend once, bill=transfer', () => {
    const spend = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 230000 });
    const billPayment = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 230000 });
    expect(headline({ entries: [spend, billPayment] }).expensePaise).toBe(230000);
  });

  it('DUP-05 / SYNC-03 same entry synced twice (retry) -> idempotent, one row', () => {
    const store = new LedgerStore();
    const e = makeEntry({ id: 'fixed-id', amountCapturedPaise: 45000 });
    store.upsertEntry(e);
    store.upsertEntry({ ...e }); // retry
    expect(store.list()).toHaveLength(1);
  });

  it('DUP-06 identical amount, same merchant, 90s apart -> SUGGESTED duplicate, not auto-merged', () => {
    const store = new LedgerStore();
    store.upsertEntry(makeEntry({ id: 'a', amountCapturedPaise: 50000, merchantText: 'Zomato', txnTime: '2026-06-02T10:00:00Z' }));
    store.upsertEntry(makeEntry({ id: 'b', amountCapturedPaise: 50000, merchantText: 'Zomato', txnTime: '2026-06-02T10:01:30Z' }));
    expect(store.list()).toHaveLength(2); // NOT auto-merged
    expect(store.suspectedDuplicates(120)).toContainEqual(['a', 'b']); // flagged for confirm
  });

  it('DUP-07 identical amount, same merchant, genuinely two purchases -> both kept', () => {
    const store = new LedgerStore();
    store.upsertEntry(makeEntry({ id: 'a', amountCapturedPaise: 50000, merchantText: 'Zomato', txnTime: '2026-06-02T10:00:00Z' }));
    store.upsertEntry(makeEntry({ id: 'b', amountCapturedPaise: 50000, merchantText: 'Zomato', txnTime: '2026-06-02T13:00:00Z' }));
    expect(store.list()).toHaveLength(2);
    expect(store.suspectedDuplicates(120)).toHaveLength(0); // 3h apart → not even suggested
  });
});
