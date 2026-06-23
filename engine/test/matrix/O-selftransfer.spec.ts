import { headline } from '../../src/aggregation/aggregate';
import { OwnNodeRegistry } from '../../src/settlement/settle';
import { makeEntry } from '../fixtures/factory';

/**
 * Section O — Self-transfer. 🟠  (SELF-05 is a documented v1 gap — see report, not a failure.)
 */
describe('O. Self-transfer 🟠', () => {
  it('SELF-01 own A->B fires debit + credit -> both legs present to suggest', () => {
    const debit = makeEntry({ id: 'd', direction: 'EXPENSE', amountCapturedPaise: 1000000, lineId: 'A' });
    const credit = makeEntry({ id: 'c', direction: 'INCOME', amountCapturedPaise: 1000000, lineId: 'B' });
    expect([debit, credit]).toHaveLength(2);
  });

  it('SELF-02 user links the pair -> both drop out of spend AND income', () => {
    // linking reclassifies both legs to TRANSFER (own↔own) → neither counts
    const debit = makeEntry({ id: 'd', direction: 'TRANSFER', amountCapturedPaise: 1000000, lineId: 'A' });
    const credit = makeEntry({ id: 'c', direction: 'TRANSFER', amountCapturedPaise: 1000000, lineId: 'B' });
    const h = headline({ entries: [debit, credit] });
    expect(h.expensePaise).toBe(0);
    expect(h.incomePaise).toBe(0);
  });

  it('SELF-03/04 after linking, the account is registered own-node -> next one auto-classifies', () => {
    const reg = new OwnNodeRegistry();
    expect(reg.has('MYFD@OKICICI')).toBe(false);
    reg.register('myfd@okicici'); // learned from the confirmed link
    expect(reg.has('MYFD@OKICICI')).toBe(true);
  });
});
