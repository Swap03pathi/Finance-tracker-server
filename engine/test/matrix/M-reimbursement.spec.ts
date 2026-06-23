import { headline } from '../../src/aggregation/aggregate';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section M — Reimbursement linking (1:1, v1). 🟠
 */
describe('M. Reimbursement linking (1:1) 🟠', () => {
  it('REIMB-01 ₹3,000 Amazon for friend, friend sends ₹3,000 -> inbound NOT auto-tagged', () => {
    const inbound = makeEntry({ id: 'in', direction: 'INCOME', amountCapturedPaise: 300000 });
    // not linked yet → it is just money-in, no settlement attached
    expect(headline({ entries: [makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 300000 }), inbound], settlements: [] }).incomePaise).toBe(300000);
  });

  it('REIMB-02 user links inbound to the ₹3,000 expense -> net spend on Amazon = ₹0', () => {
    const base = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 300000 });
    const inbound = makeEntry({ id: 'in', direction: 'INCOME', amountCapturedPaise: 300000 });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'in', kind: 'reimbursement', settledAmountPaise: 300000, status: 'settled' });
    expect(headline({ entries: [base, inbound], settlements: [link] }).expensePaise).toBe(0);
  });

  it('REIMB-03 linked inbound -> suppressed from INCOME total', () => {
    const base = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 300000 });
    const inbound = makeEntry({ id: 'in', direction: 'INCOME', amountCapturedPaise: 300000 });
    const link = makeSettlement({ baseEntryId: 'b', settleEntryId: 'in', kind: 'reimbursement', settledAmountPaise: 300000, status: 'settled' });
    expect(headline({ entries: [base, inbound], settlements: [link] }).incomePaise).toBe(0); // not income
  });

  it('REIMB-04 unrelated ₹3,000 credit from same friend -> only suggested, must confirm', () => {
    // with no settlement link, the credit stays income (not silently netted)
    const base = makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 300000 });
    const unrelated = makeEntry({ id: 'in', direction: 'INCOME', amountCapturedPaise: 300000 });
    expect(headline({ entries: [base, unrelated], settlements: [] }).incomePaise).toBe(300000);
  });
});
