import { classifyUnexplainedCredit, learnRate, expectedInterest, InterestState } from '../../src/reconciliation/interest';

/**
 * Section R — Daily-interest accounts (Slice/neobank). 🔴 proportional, not fixed.
 */
describe('R. Daily-interest accounts 🔴', () => {
  it('INT-01 ₹8 on ₹2L, no SMS, first time -> asks once', () => {
    const unconfirmed: InterestState = { confirmed: false };
    expect(classifyUnexplainedCredit(20_000_000, 800, unconfirmed)).toBe('ask');
  });

  it('INT-02 user confirms -> learns RATE (8/200000), not the amount', () => {
    const rate = learnRate(800, 20_000_000);
    expect(rate).toBeCloseTo(800 / 20_000_000, 12);
  });

  it('INT-03 balance halved to ₹1L, next credit ₹4 (no SMS) -> absorbed (proportional)', () => {
    const rate = learnRate(800, 20_000_000); // 0.00004
    const state: InterestState = { confirmed: true, rateDaily: rate };
    expect(expectedInterest(10_000_000, rate)).toBe(400); // ₹4 expected on ₹1L
    expect(classifyUnexplainedCredit(10_000_000, 400, state)).toBe('absorb');
  });

  it('INT-04 absorbed interest -> logged as interest income (computable amount)', () => {
    const rate = learnRate(800, 20_000_000);
    // a week of drips on ~₹2L ≈ 7 × ₹8 = ₹56 of interest income
    const week = Array.from({ length: 7 }, () => expectedInterest(20_000_000, rate));
    expect(week.reduce((a, b) => a + b, 0)).toBe(5600);
  });

  it('INT-05 sudden ₹8,000 appears (way off expected ₹4) -> re-flagged as real discrepancy', () => {
    const rate = learnRate(800, 20_000_000);
    const state: InterestState = { confirmed: true, rateDaily: rate };
    expect(classifyUnexplainedCredit(10_000_000, 800000, state)).toBe('flag');
  });

  it('INT-06 bank changes rate -> off-magnitude flags, then re-learns', () => {
    const oldRate = learnRate(800, 20_000_000);
    const state: InterestState = { confirmed: true, rateDaily: oldRate };
    // rate doubles → credit ₹16 on ₹2L is >50% off expected ₹8 → flag
    expect(classifyUnexplainedCredit(20_000_000, 1600, state)).toBe('flag');
    const reLearned = learnRate(1600, 20_000_000);
    expect(reLearned).toBeCloseTo(oldRate * 2, 12);
  });

  it('INT-07 first 2–3 days before pattern learned -> asks (self-corrects after confirm)', () => {
    expect(classifyUnexplainedCredit(20_000_000, 800, { confirmed: false })).toBe('ask');
  });
});
