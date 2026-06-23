import { LedgerEntry as DomainEntry, computeIsCounted } from '@finman/engine';
import type { LedgerEntry as PrismaEntry } from '@prisma/client';
import { dbToPaise } from '../common/money';

/**
 * Map a persisted Prisma row to the engine's in-memory domain shape (paise) so the pure engine
 * aggregation/recon logic can run over DB data unchanged.
 */
export function domainFromPrisma(row: PrismaEntry): DomainEntry {
  return {
    id: row.id,
    userId: row.userId,
    lineId: row.lineId,
    instrumentId: row.instrumentId,
    payeeId: row.payeeId,
    messageId: row.messageId,
    direction: row.direction,
    modality: row.modality,
    amountCapturedPaise: dbToPaise(row.amountCaptured)!,
    amountEffectivePaise: dbToPaise(row.amountEffective)!,
    balanceAfterPaise: dbToPaise(row.balanceAfter),
    categoryId: row.categoryId,
    tagId: row.tagId,
    merchantText: row.merchantText,
    txnTime: row.txnTime ? row.txnTime.toISOString() : null,
    receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
    source: row.source,
    netStatus: row.netStatus,
    reversesEntryId: row.reversesEntryId,
    isCounted: row.isCounted,
    templateId: row.templateId,
  };
}

/** Recompute the counted flag server-side from direction+modality — never trust a client claim. */
export function serverIsCounted(direction: DomainEntry['direction'], modality: DomainEntry['modality']): boolean {
  return computeIsCounted(direction, modality);
}
