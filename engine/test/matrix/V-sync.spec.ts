import { Outbox } from '../../src/sync/outbox';
import { LedgerStore } from '../../src/ledger/store';
import { makeEntry } from '../fixtures/factory';

/**
 * Section V — Sync, idempotency & offline. 🔴 (idempotency). Transport-level cases are modelled with
 * the offline outbox + idempotent store; true network/real-time delivery is a server integration concern.
 */
describe('V. Sync, idempotency & offline 🔴', () => {
  it('SYNC-01 parse while offline -> stored locally, queued in outbox', () => {
    const ob = new Outbox();
    ob.setOnline(false);
    ob.enqueue(makeEntry({ id: 'a' }));
    ob.enqueue(makeEntry({ id: 'b' }));
    const server = new LedgerStore();
    expect(ob.drain((e) => server.upsertEntry(e))).toBe(0); // nothing flushed offline
    expect(ob.pending()).toBe(2);
    expect(server.list()).toHaveLength(0);
  });

  it('SYNC-02 network returns -> outbox drains, entries synced', () => {
    const ob = new Outbox();
    ob.enqueue(makeEntry({ id: 'a' }));
    ob.enqueue(makeEntry({ id: 'b' }));
    const server = new LedgerStore();
    ob.setOnline(true);
    expect(ob.drain((e) => server.upsertEntry(e))).toBe(2);
    expect(ob.pending()).toBe(0);
    expect(server.list()).toHaveLength(2);
  });

  it('SYNC-03 same entry synced twice (retry) -> upsert on device id -> one row', () => {
    const server = new LedgerStore();
    const e = makeEntry({ id: 'device-uuid-1' });
    server.upsertEntry(e);
    server.upsertEntry({ ...e }); // retry of the same device-generated id
    expect(server.list()).toHaveLength(1);
  });

  it('SYNC-04 real-time sync of a new txn -> appears server-side promptly', () => {
    const ob = new Outbox();
    ob.setOnline(true);
    const server = new LedgerStore();
    ob.enqueue(makeEntry({ id: 'rt' }));
    ob.drain((e) => server.upsertEntry(e));
    expect(server.entries.has('rt')).toBe(true);
  });

  it('SYNC-05 concurrent edits -> last-write-wins, no corruption', () => {
    const server = new LedgerStore();
    server.upsertEntry(makeEntry({ id: 'x', tagId: 'tag-A' }));
    server.upsertEntry(makeEntry({ id: 'x', tagId: 'tag-B' })); // later write
    expect(server.list()).toHaveLength(1);
    expect(server.entries.get('x')!.tagId).toBe('tag-B');
  });
});
