import { Paise } from '../money';
import { DiscrepancyType } from '../types';

/**
 * Per-line balance-chain reconciliation (doc 02 §4, doc 03 §7, doc 08 §Q). Forward-anchored from the
 * first balance-bearing entry (no opening-balance prompt). Breaks become typed discrepancies rather
 * than being silently swallowed. Cash/manual entries are excluded from the chain (they can't break it).
 */
export interface ChainEntry {
  id: string;
  amountPaise: Paise;
  balanceAfterPaise: Paise;
  direction: 'debit' | 'credit' | 'none'; // 'none' = balance observation only (enquiry)
  txnTime: string; // ISO
  isHold?: boolean; // pre-auth dip-then-recover, not a missed txn
  source?: 'sms' | 'cash' | 'manual';
}

export interface ReconDiscrepancy {
  type: DiscrepancyType;
  magnitudePaise: Paise;
  atId: string;
}

export interface ReconResult {
  discrepancies: ReconDiscrepancy[];
  confidence: number; // 0–1
  anchorId: string | null;
}

export interface ReconOptions {
  /** Sort by balance-implied order when receipt time conflicts with the chain (RECON-05). */
  balanceImpliedOrder?: boolean;
}

function signedExpected(e: ChainEntry): Paise {
  if (e.direction === 'credit') return e.amountPaise;
  if (e.direction === 'debit') return -e.amountPaise;
  return 0;
}

export function reconcileLine(entries: ChainEntry[], opts: ReconOptions = {}): ReconResult {
  // chain only over SMS balance-bearing entries; cash/manual never break it (CASH-05)
  let chain = entries.filter((e) => (e.source ?? 'sms') === 'sms');
  if (chain.length === 0) return { discrepancies: [], confidence: 1, anchorId: null };

  chain = [...chain].sort((a, b) => Date.parse(a.txnTime) - Date.parse(b.txnTime));
  if (opts.balanceImpliedOrder) {
    // when receipt order conflicts with the balance, trust the balance-implied order
    chain = [...chain].sort((a, b) => b.balanceAfterPaise - a.balanceAfterPaise);
  }

  const discrepancies: ReconDiscrepancy[] = [];
  const anchorId = chain[0].id;
  let prev = chain[0].balanceAfterPaise;

  for (let i = 1; i < chain.length; i++) {
    const e = chain[i];
    if (e.isHold) continue; // dip-then-recover state, not a missed txn (RECON-09)
    const actualDelta = e.balanceAfterPaise - prev;
    const expectedDelta = signedExpected(e);
    const gap = actualDelta - expectedDelta;
    if (gap !== 0) {
      if (gap < 0) {
        discrepancies.push({ type: 'missing_outflow', magnitudePaise: -gap, atId: e.id });
      } else {
        discrepancies.push({ type: 'missing_inflow', magnitudePaise: gap, atId: e.id });
      }
    }
    prev = e.balanceAfterPaise;
  }

  const steps = Math.max(1, chain.length - 1);
  const confidence = Math.max(0, 1 - discrepancies.length / steps);
  return { discrepancies, confidence, anchorId };
}
