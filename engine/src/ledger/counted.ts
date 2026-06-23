import { Direction, Modality, NetStatus } from '../types';

/**
 * The single source of truth for "does this entry hit the headline numbers?" (doc 04 §6, doc 07 §15).
 * Counted IFF: direction is EXPENSE/INCOME AND modality is actual AND it is not a reversal leg.
 * TRANSFER/TOPUP and future/hold/mandate/conditional/failed are NEVER counted.
 */
export function computeIsCounted(
  direction: Direction,
  modality: Modality,
  netStatus: NetStatus = 'active',
): boolean {
  if (direction === 'TRANSFER' || direction === 'TOPUP') return false;
  if (modality !== 'actual') return false;
  if (netStatus === 'is_reversal') return false;
  return true;
}
