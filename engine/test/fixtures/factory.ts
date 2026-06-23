import { LedgerEntry, Settlement, Direction, Modality, NetStatus } from '../../src/types';
import { computeIsCounted } from '../../src/ledger/counted';

let n = 0;

/** Concise ledger-entry builder for matrix tests. isCounted defaults to the real rule. */
export function makeEntry(p: Partial<LedgerEntry> = {}): LedgerEntry {
  const direction: Direction = p.direction ?? 'EXPENSE';
  const modality: Modality = p.modality ?? 'actual';
  const netStatus: NetStatus = p.netStatus ?? 'active';
  const captured = p.amountCapturedPaise ?? 10000;
  return {
    id: p.id ?? `e-${++n}`,
    userId: p.userId ?? 'u1',
    lineId: p.lineId ?? 'line-1',
    instrumentId: p.instrumentId ?? null,
    payeeId: p.payeeId ?? null,
    messageId: p.messageId ?? null,
    direction,
    modality,
    amountCapturedPaise: captured,
    amountEffectivePaise: p.amountEffectivePaise ?? captured,
    balanceAfterPaise: p.balanceAfterPaise ?? null,
    categoryId: p.categoryId ?? null,
    tagId: p.tagId ?? null,
    merchantText: p.merchantText ?? null,
    txnTime: p.txnTime ?? null,
    receivedAt: p.receivedAt ?? null,
    source: p.source ?? 'sms',
    netStatus,
    reversesEntryId: p.reversesEntryId ?? null,
    isCounted: p.isCounted ?? computeIsCounted(direction, modality, netStatus),
    templateId: p.templateId ?? null,
  };
}

export function makeSettlement(p: Partial<Settlement> & Pick<Settlement, 'baseEntryId' | 'kind'>): Settlement {
  return {
    id: p.id ?? `s-${++n}`,
    userId: p.userId ?? 'u1',
    baseEntryId: p.baseEntryId,
    settleEntryId: p.settleEntryId ?? null,
    kind: p.kind,
    expectedAmountPaise: p.expectedAmountPaise ?? null,
    settledAmountPaise: p.settledAmountPaise ?? null,
    status: p.status ?? 'pending',
    expectedAt: p.expectedAt ?? null,
    personalDebtId: p.personalDebtId ?? null,
    note: p.note ?? null,
  };
}
