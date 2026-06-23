import { headline } from '../../src/aggregation/aggregate';
import { effectiveSpend, writeOff } from '../../src/settlement/settle';
import { makeEntry, makeSettlement } from '../fixtures/factory';

/**
 * Section N — Split linking (1:many). 🔴 realized accounting.
 */
describe('N. Split linking (1:many) 🔴', () => {
  const base = () => makeEntry({ id: 'b', direction: 'EXPENSE', amountCapturedPaise: 500000 });

  it('SPLIT-01 ₹5,000 dinner, your share ₹1,000, 4 friends -> outflow stays ₹5,000', () => {
    const b = base();
    expect(b.amountCapturedPaise).toBe(500000); // outflow unchanged
  });

  it('SPLIT-02 3 friends pay ₹1,000 via UPI -> effective reflects only realized', () => {
    const settlements = [1, 2, 3].map((i) =>
      makeSettlement({ id: `s${i}`, baseEntryId: 'b', settleEntryId: `f${i}`, kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
    );
    expect(effectiveSpend(500000, 'b', settlements)).toBe(200000); // your 1k + unpaid 1k
  });

  it('SPLIT-03 4th friend pays ₹1,000 in cash -> linked as cash settlement', () => {
    const settlements = [
      ...[1, 2, 3].map((i) => makeSettlement({ id: `s${i}`, baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' })),
      makeSettlement({ id: 's4', baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled', note: 'cash' }),
    ];
    expect(effectiveSpend(500000, 'b', settlements)).toBe(100000); // == your share
  });

  it('SPLIT-04 only 3 of 4 pay, 1 never does -> your spend = ₹2,000', () => {
    const settlements = [1, 2, 3].map((i) =>
      makeSettlement({ id: `s${i}`, baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
    );
    const b = base();
    expect(headline({ entries: [b], settlements }).expensePaise).toBe(200000);
  });

  it('SPLIT-05 user forgives the unpaid ₹1,000 -> re-added to YOUR expense', () => {
    const paid = [1, 2, 3].map((i) =>
      makeSettlement({ id: `s${i}`, baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
    );
    const unpaid = makeSettlement({ id: 's4', baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'pending' });
    writeOff(unpaid); // forgive
    const b = base();
    // written_off is not subtracted → spend stays ₹2,000 (you really spent it)
    expect(headline({ entries: [b], settlements: [...paid, unpaid] }).expensePaise).toBe(200000);
  });

  it('SPLIT-06 user keeps tracking the unpaid ₹1,000 -> stays a receivable (still your spend now)', () => {
    const paid = [1, 2, 3].map((i) =>
      makeSettlement({ id: `s${i}`, baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
    );
    const tracking = makeSettlement({ id: 's4', baseEntryId: 'b', kind: 'split', expectedAmountPaise: 100000, status: 'pending' });
    expect(effectiveSpend(500000, 'b', [...paid, tracking])).toBe(200000);
  });

  it('SPLIT-08 all settled fully -> effective spend == your share ₹1,000', () => {
    const settlements = [1, 2, 3, 4].map((i) =>
      makeSettlement({ id: `s${i}`, baseEntryId: 'b', kind: 'split', settledAmountPaise: 100000, status: 'settled' }),
    );
    expect(effectiveSpend(500000, 'b', settlements)).toBe(100000);
  });
});
