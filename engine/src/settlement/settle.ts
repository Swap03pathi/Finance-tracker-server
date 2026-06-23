import { Paise, sumPaise } from '../money';
import { Settlement } from '../types';

/**
 * Settlement / linking engine (doc 02 §5, doc 03 §6, doc 08 §L/M/N/O). One mechanism for refunds,
 * reimbursements, splits and self-transfers. Realized accounting: effective = base − Σ settled; the
 * unsettled remainder stays the user's expense; a write-off re-adds it (you really did spend it).
 */
export function realizedReduction(baseEntryId: string, settlements: Settlement[]): Paise {
  return sumPaise(
    settlements
      .filter((s) => s.baseEntryId === baseEntryId && (s.status === 'settled' || s.status === 'partial'))
      .map((s) => s.settledAmountPaise ?? 0),
  );
}

/** The realized effective spend on a base outflow (doc 02 §5). */
export function effectiveSpend(baseAmountPaise: Paise, baseEntryId: string, settlements: Settlement[]): Paise {
  return baseAmountPaise - realizedReduction(baseEntryId, settlements);
}

/** Forgive an unpaid receivable: the remainder stays YOUR expense (SPLIT-05). */
export function writeOff(s: Settlement): Settlement {
  s.status = 'written_off'; // written_off is NOT subtracted → the amount remains in your spend
  return s;
}

/**
 * Auto-match a pending refund when a credit lands — possibly on a DIFFERENT line/wallet (REF-03/04/07).
 * Matches on amount within the aging window; the landing line may differ from the paying line.
 */
export function matchesPendingRefund(
  pending: Settlement,
  incoming: { amountPaise: Paise; atIso: string },
): boolean {
  if (pending.kind !== 'refund' || pending.status !== 'pending') return false;
  const amountOk = (pending.expectedAmountPaise ?? 0) === incoming.amountPaise;
  const withinWindow =
    !pending.expectedAt || Date.parse(incoming.atIso) >= Date.parse(pending.expectedAt) - 86_400_000;
  return amountOk && withinWindow;
}

/** Own-node registry: self-transfer linking registers a node so future ones auto-classify (SELF-03/04). */
export class OwnNodeRegistry {
  private nodes = new Set<string>();
  register(key: string): void {
    this.nodes.add(key.toUpperCase());
  }
  has(key: string): boolean {
    return this.nodes.has(key.toUpperCase());
  }
}
