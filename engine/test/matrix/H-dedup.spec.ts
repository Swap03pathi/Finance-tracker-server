import { LedgerStore } from '../../src/ledger/store';
import { logicalEntryId } from '../../src/ledger/idempotentId';
import { headline } from '../../src/aggregation/aggregate';
import { makeEntry } from '../fixtures/factory';

/**
 * Section H — Double-counting (dedup). 🔴
 */
describe('H. Double-counting (dedup) 🔴', () => {
  it('DUP-01 one UPI payment -> bank SMS AND UPI-app SMS -> counted once', () => {
    const common = { userId: 'u1', lineKey: 'HDFCBK|1234', direction: 'EXPENSE', amountPaise: 45000, epochSec: 1_700_000_010 };
    const idFromBankSms = logicalEntryId(common);
    const idFromUpiAppSms = logicalEntryId({ ...common, epochSec: 1_700_000_025 }); // ~15s later, same bucket
    expect(idFromBankSms).toBe(idFromUpiAppSms);

    const store = new LedgerStore();
    store.upsertEntry(makeEntry({ id: idFromBankSms, amountCapturedPaise: 45000 }));
    store.upsertEntry(makeEntry({ id: idFromUpiAppSms, amountCapturedPaise: 45000 }));
    expect(store.list()).toHaveLength(1);
    expect(headline({ entries: store.list() }).expensePaise).toBe(45000);
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
