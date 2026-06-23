import { Paise } from '../money';

/**
 * Daily-interest mode (doc 01 §10, doc 03 §7, doc 08 §R). Interest credits arrive with NO SMS, so a
 * balance creeps up and would trip a false missing-inflow daily. Handled by PROPORTIONALITY: confirm
 * once, learn the RATE (credit ÷ balance) not the amount, then absorb future drips that match
 * balance × rate as interest income; an off-magnitude jump re-surfaces as a real discrepancy.
 */
export interface InterestState {
  confirmed: boolean;
  rateDaily?: number; // learned credit ÷ balance
}

export type InterestVerdict = 'ask' | 'absorb' | 'flag';

/** Tolerance band for proportional match (±50% catches rate changes / genuine missed inflows). */
const TOLERANCE = 0.5;

export function learnRate(creditPaise: Paise, balancePaise: Paise): number {
  if (balancePaise <= 0) return 0;
  return creditPaise / balancePaise;
}

export function expectedInterest(balancePaise: Paise, rateDaily: number): Paise {
  return Math.round(balancePaise * rateDaily);
}

/**
 * Classify an unexplained (no-SMS) balance rise on a line.
 * - not yet confirmed → ASK once
 * - confirmed & magnitude ≈ balance × rate → ABSORB silently as interest income
 * - confirmed & magnitude wildly off → FLAG as a real discrepancy
 */
export function classifyUnexplainedCredit(
  balanceBeforePaise: Paise,
  creditPaise: Paise,
  state: InterestState,
): InterestVerdict {
  if (!state.confirmed || state.rateDaily == null) return 'ask';
  const expected = expectedInterest(balanceBeforePaise, state.rateDaily);
  if (expected <= 0) return 'flag';
  const ratio = Math.abs(creditPaise - expected) / expected;
  return ratio <= TOLERANCE ? 'absorb' : 'flag';
}
