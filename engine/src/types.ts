/**
 * Framework-free domain types — the in-memory shape of the structured ledger, mirroring the
 * Prisma schema (docs/04) but with money as INTEGER PAISE. The server maps these to/from NUMERIC.
 */
import { Paise } from './money';

export type Direction = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'TOPUP';
export type Modality = 'actual' | 'future' | 'conditional' | 'failed' | 'hold' | 'mandate';
export type EntrySource = 'sms' | 'cash' | 'manual' | 'aa' | 'email' | 'statement';
export type NetStatus = 'active' | 'reversed' | 'is_reversal' | 'settled';
export type LineKind = 'bank' | 'credit_pool' | 'wallet' | 'loan';
export type InstrumentKind = 'credit_card' | 'debit_card' | 'vpa' | 'netbanking';
export type CounterpartyType = 'merchant' | 'person' | 'own_node' | 'unknown';
export type SettlementKind = 'refund' | 'reimbursement' | 'split' | 'self_transfer';
export type SettlementStatus = 'pending' | 'partial' | 'settled' | 'written_off';
export type DiscrepancyType =
  | 'missing_outflow'
  | 'missing_inflow'
  | 'suspected_emi'
  | 'suspected_duplicate'
  | 'suspected_refund'
  | 'suspected_interest';

export interface Category {
  id: number;
  name: string;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  categoryId: number;
}

export interface Payee {
  id: string;
  userId: string;
  normalizedKey: string;
  rawVpas: string[];
  displayName?: string;
  defaultCategoryId?: number;
  defaultTagId?: string;
  counterpartyType: CounterpartyType;
  isUserConfirmed: boolean;
}

export interface Line {
  id: string;
  userId: string;
  kind: LineKind;
  issuer?: string;
  displayName?: string;
  currentBalancePaise?: Paise;
  creditLimitPaise?: Paise;
  availableCreditPaise?: Paise;
  isOwnNode: boolean;
  balanceIsSoft: boolean;
  accruesDailyInterest: boolean;
  interestRateDaily?: number; // learned credit ÷ balance
  anchorBalancePaise?: Paise;
}

export interface Instrument {
  id: string;
  userId: string;
  lineId: string;
  kind: InstrumentKind;
  issuer?: string;
  last4?: string;
  vpa?: string;
  holder?: string;
  displayName?: string;
  isConfirmed: boolean;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  lineId: string;
  instrumentId?: string | null;
  payeeId?: string | null;
  messageId?: string | null;
  direction: Direction;
  modality: Modality;
  amountCapturedPaise: Paise; // immutable once set (doc 04 §6.1)
  amountEffectivePaise: Paise; // after correction and/or settlements
  balanceAfterPaise?: Paise | null;
  categoryId?: number | null;
  tagId?: string | null;
  merchantText?: string | null;
  txnTime?: string | null; // ISO UTC
  receivedAt?: string | null; // ISO UTC
  source: EntrySource;
  netStatus: NetStatus;
  reversesEntryId?: string | null;
  isCounted: boolean; // false for future/hold/mandate/failed/transfer/topup
  templateId?: string | null;
}

export interface Settlement {
  id: string;
  userId: string;
  baseEntryId: string;
  settleEntryId?: string | null;
  kind: SettlementKind;
  expectedAmountPaise?: Paise | null;
  settledAmountPaise?: Paise | null;
  status: SettlementStatus;
  expectedAt?: string | null;
  personalDebtId?: string | null;
  note?: string | null;
}

export interface Discrepancy {
  id: string;
  userId: string;
  lineId: string;
  type: DiscrepancyType;
  magnitudePaise: Paise;
  status: 'open' | 'resolved' | 'ignored';
}

export type LiabilityKind = 'loan' | 'card_emi';

export interface Liability {
  id: string;
  userId: string;
  kind: LiabilityKind;
  repaidViaLineId: string;
  originEntryId?: string | null; // the original purchase (card EMI) so it is not re-counted
  principalPaise?: Paise;
  tenureMonths?: number;
  installmentAmountPaise?: Paise;
  remainingPaise?: Paise;
  isUserDeclared: boolean;
}

export type DebtDirection = 'they_owe_me' | 'i_owe_them';
export type DebtStatus = 'open' | 'partial' | 'closed' | 'forgiven';

export interface PersonalDebt {
  id: string;
  userId: string;
  counterpartyName?: string;
  direction: DebtDirection;
  principalPaise?: Paise;
  remainingPaise?: Paise;
  status: DebtStatus;
}
