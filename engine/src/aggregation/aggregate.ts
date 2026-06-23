import { LedgerEntry, Settlement } from '../types';
import { Paise, sumPaise } from '../money';

/**
 * Aggregation (doc 04 §3.7 rule, doc 08 §Y). Headline numbers sum COUNTED entries using
 * amount_effective and SUBTRACT linked settlements (realized accounting), so refunds/reimbursements/
 * splits net. Settlement legs themselves are excluded from direct counting. by-category and by-tag
 * are derived from the SAME counted base entries, so they reconcile to the grand total by construction
 * (single-tag invariant, doc 04 §6.4).
 */
export interface AggInput {
  entries: LedgerEntry[];
  settlements?: Settlement[];
}

export interface Headline {
  incomePaise: Paise;
  expensePaise: Paise;
  savingsPaise: Paise;
}

const NO_TAG = '__uncategorised__';
const NO_CAT = -1;

/** Entry ids that are settlement legs (refund credit, friend repayment) — netted, not counted alone. */
function settleLegIds(settlements: Settlement[]): Set<string> {
  const s = new Set<string>();
  for (const st of settlements) if (st.settleEntryId) s.add(st.settleEntryId);
  return s;
}

/** Realized reduction against a base entry: only settled/partial settlements reduce it. */
function settledAgainst(baseId: string, settlements: Settlement[]): Paise {
  return sumPaise(
    settlements
      .filter((s) => s.baseEntryId === baseId && (s.status === 'settled' || s.status === 'partial'))
      .map((s) => s.settledAmountPaise ?? 0),
  );
}

/** The effective, realized amount a counted base entry contributes after netting its settlements. */
export function effectiveContribution(entry: LedgerEntry, settlements: Settlement[]): Paise {
  return entry.amountEffectivePaise - settledAgainst(entry.id, settlements);
}

function countedBases(input: AggInput): LedgerEntry[] {
  const settlements = input.settlements ?? [];
  const legs = settleLegIds(settlements);
  return input.entries.filter((e) => e.isCounted && e.netStatus !== 'is_reversal' && !legs.has(e.id));
}

export function headline(input: AggInput): Headline {
  const settlements = input.settlements ?? [];
  const bases = countedBases(input);
  const income = sumPaise(
    bases.filter((e) => e.direction === 'INCOME').map((e) => effectiveContribution(e, settlements)),
  );
  const expense = sumPaise(
    bases.filter((e) => e.direction === 'EXPENSE').map((e) => effectiveContribution(e, settlements)),
  );
  return { incomePaise: income, expensePaise: expense, savingsPaise: income - expense };
}

/** Expense by system category — sums to the grand expense total (DASH-05). */
export function byCategory(input: AggInput): Map<number, Paise> {
  const settlements = input.settlements ?? [];
  const out = new Map<number, Paise>();
  for (const e of countedBases(input).filter((e) => e.direction === 'EXPENSE')) {
    const k = e.categoryId ?? NO_CAT;
    out.set(k, (out.get(k) ?? 0) + effectiveContribution(e, settlements));
  }
  return out;
}

/** Expense by personal tag — single-tag means this sums to the SAME total as byCategory (DASH-06). */
export function byTag(input: AggInput): Map<string, Paise> {
  const settlements = input.settlements ?? [];
  const out = new Map<string, Paise>();
  for (const e of countedBases(input).filter((e) => e.direction === 'EXPENSE')) {
    const k = e.tagId ?? NO_TAG;
    out.set(k, (out.get(k) ?? 0) + effectiveContribution(e, settlements));
  }
  return out;
}

export function byLine(input: AggInput): Map<string, Paise> {
  const settlements = input.settlements ?? [];
  const out = new Map<string, Paise>();
  for (const e of countedBases(input).filter((e) => e.direction === 'EXPENSE')) {
    out.set(e.lineId, (out.get(e.lineId) ?? 0) + effectiveContribution(e, settlements));
  }
  return out;
}

export function sumMap(m: Map<unknown, Paise>): Paise {
  return sumPaise([...m.values()]);
}
