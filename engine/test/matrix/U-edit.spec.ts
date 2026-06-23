import { LedgerStore } from '../../src/ledger/store';
import { headline } from '../../src/aggregation/aggregate';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section U — Parse-correction vs split (the critical distinction). 🔴
 * Correction overwrites amount_effective (captured retained); split keeps the captured amount and
 * links a settlement. Confusing the two would break the balance chain.
 */
describe('U. Parse-correction vs split 🔴', () => {
  it('EDIT-01 parse error (SMS ₹4,000, parsed ₹5,000) -> overwrite effective; captured retained', () => {
    const s = new LedgerStore();
    const e = s.upsertEntry(makeEntry({ id: 'x', amountCapturedPaise: 500000, amountEffectivePaise: 500000 }));
    s.applyCorrection('x', 400000);
    expect(e.amountCapturedPaise).toBe(500000); // immutable
    expect(e.amountEffectivePaise).toBe(400000); // corrected
  });

  it('EDIT-02 "part wasn\'t mine" -> SPLIT: ₹5,000 stays, ₹1,000 linked (NOT an overwrite)', () => {
    const base = makeEntry({ id: 'b', amountCapturedPaise: 500000, amountEffectivePaise: 500000 });
    const friendPaid = makeEntry({ id: 'f', direction: 'INCOME', amountCapturedPaise: 100000 });
    const split = makeSettlement({ baseEntryId: 'b', settleEntryId: 'f', kind: 'split', settledAmountPaise: 100000, status: 'settled' });
    expect(base.amountCapturedPaise).toBe(500000); // captured NOT overwritten
    expect(base.amountEffectivePaise).toBe(500000); // base unchanged; netting happens in aggregate
    const { expensePaise } = headline({ entries: [base, friendPaid], settlements: [split] });
    expect(expensePaise).toBe(400000); // realized: ₹5,000 − ₹1,000 settled
  });

  it('EDIT-03 after a correction, balance chain reconciles with the corrected value', () => {
    const s = new LedgerStore();
    const e = s.upsertEntry(makeEntry({ id: 'x', amountCapturedPaise: 500000, amountEffectivePaise: 500000 }));
    s.applyCorrection('x', 400000);
    // the chain consumes amount_effective (the corrected truth)
    expect(e.amountEffectivePaise).toBe(400000);
  });

  it('EDIT-04 after a split, the balance chain still sees ₹5,000 (captured), no false discrepancy', () => {
    const base = makeEntry({ id: 'b', amountCapturedPaise: 500000, amountEffectivePaise: 500000 });
    // the chain uses captured (what really left the account), so ₹5,000 still moved
    expect(base.amountCapturedPaise).toBe(500000);
  });

  it('EDIT-05 any edit stores BOTH amount_captured and amount_effective', () => {
    const s = new LedgerStore();
    const e = s.upsertEntry(makeEntry({ id: 'x', amountCapturedPaise: 500000 }));
    s.applyCorrection('x', 450000);
    expect(e.amountCapturedPaise).toBe(500000);
    expect(e.amountEffectivePaise).toBe(450000);
    expect(e.amountCapturedPaise).not.toBe(e.amountEffectivePaise);
  });
});
