import { loadConfig, OwnNodeConfig } from '../config/loadConfig';
import { Direction } from '../types';

/**
 * Money-type classification — the boundary (doc 02 §3, doc 03 §5, doc 08 §G). Money inside the
 * user's accounts/cards/wallets is own; merchants/people are outside.
 *   EXPENSE  = counted outflow to an external party
 *   INCOME   = counted inflow from an external source
 *   TRANSFER = own ↔ own (wallet load, self-transfer) — never counted
 *   TOPUP    = external value into a wallet that is NOT income (gift card) — never counted
 */
export type VerbDirection = 'out' | 'in';

const ownNodes = (): Set<string> =>
  new Set(loadConfig<OwnNodeConfig>('own-node-senders.json').ownNodeIssuers.map((s) => s.toUpperCase()));

/** From the transaction verb: is money leaving (out) or entering (in) this line? */
export function verbDirection(body: string): VerbDirection | null {
  const lower = body.toLowerCase();
  if (/\b(debited|spent|withdrawn|paid|deducted|debit|sent|blocked|added)\b/.test(lower)) {
    // "added to wallet" is an inflow to the wallet but an outflow from the bank — caller resolves
    // per-line; default to 'out' for the bank-side leg.
    if (/added to .*wallet/i.test(body)) return 'in'; // wallet-side leg receives
    return 'out';
  }
  if (/\b(credited|received|refund|reversed|returned|load|loaded)\b/.test(lower)) return 'in';
  return null;
}

export interface MoneyTypeInput {
  direction: VerbDirection;
  /** counterparty (the other end) is one of the user's own nodes (wallet/own account) */
  counterpartyIsOwnNode: boolean;
  /** external value entering a wallet without being earnings (gift card / promo voucher) */
  isTopup?: boolean;
}

export function classifyMoneyType(input: MoneyTypeInput): Direction {
  if (input.isTopup) return 'TOPUP';
  if (input.counterpartyIsOwnNode) return 'TRANSFER';
  return input.direction === 'out' ? 'EXPENSE' : 'INCOME';
}

/** Is the named issuer/counterparty a seeded own-node wallet? (extended by learned own-nodes) */
export function isSeededOwnNode(issuer: string | null | undefined, learned: ReadonlySet<string> = new Set()): boolean {
  if (!issuer) return false;
  const up = issuer.toUpperCase();
  return ownNodes().has(up) || learned.has(up);
}

/** TOPUP detection from text: external value into a wallet (gift card / voucher). */
export function isTopupText(body: string): boolean {
  return /gift card|gift voucher|voucher|added to .*(amazon pay|wallet) balance/i.test(body);
}
