import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntryInput, CorrectInput } from '@finman/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { LineResolverService } from '../persistence/line-resolver.service';
import { serverIsCounted } from '../persistence/entry.mapper';
import { wireToPaise, paiseToDb } from '../common/money';

/** Idempotent entry sync + parse-correction (doc 08 §V/§U). */
@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lines: LineResolverService,
  ) {}

  /** Upsert by device-generated id (ON CONFLICT) — a retry/dual-SMS never duplicates. */
  async upsert(userId: string, entries: EntryInput[]): Promise<{ upserted: number; ids: string[] }> {
    const ids: string[] = [];
    for (const e of entries) {
      // process sequentially so line auto-discovery is deterministic across a batch
      const { lineId, instrumentId } = await this.lines.resolve(userId, e.hint);
      const isCounted = serverIsCounted(e.direction, e.modality);
      const capturedDb = paiseToDb(wireToPaise(e.amountCaptured));
      const effectiveDb = paiseToDb(wireToPaise(e.amountEffective ?? e.amountCaptured));
      const balanceDb = e.balanceAfter ? paiseToDb(wireToPaise(e.balanceAfter)) : null;
      const common = {
        lineId,
        instrumentId,
        direction: e.direction,
        modality: e.modality,
        amountEffective: effectiveDb,
        balanceAfter: balanceDb,
        categoryId: e.categoryId ?? null,
        tagId: e.tagId ?? null,
        merchantText: e.merchantText ?? null,
        txnTime: e.txnTime ? new Date(e.txnTime) : null,
        receivedAt: e.receivedAt ? new Date(e.receivedAt) : null,
        source: e.source,
        messageId: e.messageId ?? null,
        isCounted,
        templateId: e.templateId ?? null,
      };
      await this.prisma.ledgerEntry.upsert({
        where: { id: e.id },
        // amount_captured is set ONCE on create and never updated (immutable, doc 04 §6.1)
        create: { id: e.id, userId, amountCaptured: capturedDb, ...common },
        update: common,
      });
      ids.push(e.id);
    }
    return { upserted: ids.length, ids };
  }

  /** Parse-correction: write amount_effective, keep amount_captured frozen (EDIT-01/05). */
  async correct(userId: string, id: string, input: CorrectInput) {
    const row = await this.prisma.ledgerEntry.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('entry not found');
    const updated = await this.prisma.ledgerEntry.update({
      where: { id },
      data: { amountEffective: paiseToDb(wireToPaise(input.amountEffective)) },
    });
    return {
      id: updated.id,
      amountCaptured: updated.amountCaptured.toString(),
      amountEffective: updated.amountEffective.toString(),
    };
  }

  async list(userId: string, q: { from?: string; to?: string; line?: string }) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: {
        userId,
        ...(q.line ? { lineId: q.line } : {}),
        ...(q.from || q.to
          ? { txnTime: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
          : {}),
      },
      orderBy: { txnTime: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      lineId: r.lineId,
      direction: r.direction,
      modality: r.modality,
      amountCaptured: r.amountCaptured.toString(),
      amountEffective: r.amountEffective.toString(),
      merchantText: r.merchantText,
      txnTime: r.txnTime?.toISOString() ?? null,
      isCounted: r.isCounted,
    }));
  }
}
