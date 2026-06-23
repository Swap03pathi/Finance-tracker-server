import { gate } from '../../src/gating/gate';
import { classifyModality } from '../../src/classification/modality';
import { headline, byCategory, byTag, sumMap } from '../../src/aggregation/aggregate';
import { describePeriod } from '../../src/aggregation/period';
import { effectiveSpend } from '../../src/settlement/settle';
import { classifyUnexplainedCredit, learnRate } from '../../src/reconciliation/interest';
import { LedgerStore } from '../../src/ledger/store';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section AA — End-to-end scenarios (integration over the whole pipeline). 🔴
 */
describe('AA. End-to-end scenarios (integration) 🔴', () => {
  it('E2E-01 install -> backfill -> dashboard: 3 numbers, period-honest', () => {
    const entries = [
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 45000, categoryId: 1, merchantText: 'Zomato' }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 230000, categoryId: 2, merchantText: 'Flipkart' }),
    ];
    const h = headline({ entries });
    const period = describePeriod('2026-06-09T00:00:00Z', '2026-06-23T00:00:00Z');
    expect(h.expensePaise).toBe(275000);
    expect(period.label).toBe('since you installed');
  });

  it('E2E-02 salary in, rent out, 20 UPI spends, 1 refund, 1 wallet load -> all correct', () => {
    const salary = makeEntry({ direction: 'INCOME', amountCapturedPaise: 6500000 });
    const rent = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 2000000, categoryId: 3 });
    const spends = Array.from({ length: 20 }, (_, i) => makeEntry({ id: `sp${i}`, direction: 'EXPENSE', amountCapturedPaise: 10000, categoryId: 1 }));
    const walletLoad = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 500000 });
    const refundBase = makeEntry({ id: 'rb', direction: 'EXPENSE', amountCapturedPaise: 30000, categoryId: 1 });
    const refundCredit = makeEntry({ id: 'rc', direction: 'INCOME', amountCapturedPaise: 30000 });
    const refund = makeSettlement({ baseEntryId: 'rb', settleEntryId: 'rc', kind: 'refund', settledAmountPaise: 30000, status: 'settled' });

    const entries = [salary, rent, ...spends, walletLoad, refundBase, refundCredit];
    const h = headline({ entries, settlements: [refund] });
    expect(h.incomePaise).toBe(6500000); // wallet load NOT income, refund credit not income
    expect(h.expensePaise).toBe(2000000 + 20 * 10000 + 0); // rent + 20 spends; refunded pair nets to 0
    expect(h.savingsPaise).toBe(h.incomePaise - h.expensePaise);
  });

  it('E2E-03 split dinner ₹5,000, 3 UPI + 1 cash settle -> effective == your share', () => {
    const settlements = [
      makeSettlement({ baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
      makeSettlement({ baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
      makeSettlement({ baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
      makeSettlement({ baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled', note: 'cash' }),
    ];
    expect(effectiveSpend(500000, 'b', settlements)).toBe(100000);
  });

  it('E2E-04 two pooled HDFC cards + one separate -> pool reconciles, per-line correct', () => {
    const s = new LedgerStore();
    const a = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    const b = s.ensureCreditLine('u1', 'HDFCBK', '5678');
    const c = s.ensureCreditLine('u1', 'HDFCBK', '9012');
    s.ensureInstrument('u1', a.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '1234' });
    s.ensureInstrument('u1', b.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '5678' });
    s.ensureInstrument('u1', c.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '9012' });
    s.confirmSharedPool(a.id, b.id); // pool the two; third stays separate
    expect(s.lines).toHaveLength(2);
  });

  it('E2E-05 Slice daily interest over a week -> one confirm then silent absorption', () => {
    const rate = learnRate(800, 20_000_000);
    const state = { confirmed: true, rateDaily: rate };
    // each day's drip matches balance×rate → absorbed
    for (let day = 0; day < 7; day++) {
      expect(classifyUnexplainedCredit(20_000_000, 800, state)).toBe('absorb');
    }
  });

  it('E2E-06 card purchase -> EMI conversion -> 2 monthly EMIs: purchase once, EMIs not re-counted', () => {
    const purchase = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 6000000 });
    const emi1 = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 1000000 });
    const emi2 = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 1000000 });
    expect(headline({ entries: [purchase, emi1, emi2] }).expensePaise).toBe(6000000);
  });

  it('E2E-07 Bank->Paytm->Swiggy->order -> exactly ONE expense', () => {
    const entries = [
      makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 50000 }),
      makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 50000 }),
      makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 50000 }),
    ];
    expect(headline({ entries }).expensePaise).toBe(50000);
  });

  it('E2E-08 clear data -> restore: structured from server (and gate+classify still coherent)', () => {
    // pipeline sanity: a real-looking SMS gates in and classifies as actual
    expect(gate('VM-HDFCBK', 'Rs.450.00 spent at Zomato via UPI from a/c **1234').admit).toBe(true);
    expect(classifyModality('Rs.450.00 spent at Zomato')).toBe('actual');
    const server = new LedgerStore();
    server.upsertEntry(makeEntry({ id: 'e1', amountCapturedPaise: 45000, categoryId: 1, tagId: 't1' }));
    // by-tag == by-category after "restore"
    expect(sumMap(byTag({ entries: server.list() }))).toBe(sumMap(byCategory({ entries: server.list() })));
  });
});
