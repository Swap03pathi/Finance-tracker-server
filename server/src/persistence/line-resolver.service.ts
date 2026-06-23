import { Injectable } from '@nestjs/common';
import type { LineHint } from '@finman/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Auto-discovery (doc 04 §1.5, doc 08 §I): materialise a line + instrument on first sighting of an
 * (issuer, last4/vpa). Ports the engine LedgerStore resolution to Prisma. Deterministic — a re-sync of
 * the same entry resolves the SAME instrument/line (so idempotent upsert never spawns duplicates).
 * Missing last4 AND vpa → an "Unattributed at <issuer>" bucket line, never a guessed card (LINE-07).
 */
@Injectable()
export class LineResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, hint: LineHint): Promise<{ lineId: string; instrumentId: string | null }> {
    const issuer = hint.issuer ?? null;
    const kind = hint.instrumentKind ?? 'vpa';
    const lineKind = hint.lineKind ?? (kind === 'credit_card' ? 'credit_pool' : 'bank');

    // 1) known instrument → its line (this is what makes re-sync idempotent)
    let instrument = null;
    if (hint.vpa) {
      instrument = await this.prisma.instrument.findFirst({ where: { userId, kind: 'vpa', vpa: hint.vpa } });
    } else if (hint.last4) {
      instrument = await this.prisma.instrument.findFirst({ where: { userId, kind, issuer, last4: hint.last4 } });
    }
    if (instrument) return { lineId: instrument.lineId, instrumentId: instrument.id };

    // 2) no last4/vpa → unattributed bucket per issuer (deterministic by display name)
    if (!hint.last4 && !hint.vpa) {
      const name = `Unattributed at ${issuer ?? 'unknown'}`;
      const existing = await this.prisma.line.findFirst({ where: { userId, kind: lineKind, issuer, displayName: name } });
      const line = existing ?? (await this.prisma.line.create({
        data: { userId, kind: lineKind, issuer, displayName: name, isOwnNode: true, balanceIsSoft: true },
      }));
      return { lineId: line.id, instrumentId: null };
    }

    // 3) new instrument → new line (user may later confirm a shared pool; defaults separate)
    const line = await this.prisma.line.create({
      data: { userId, kind: lineKind, issuer, isOwnNode: true, balanceIsSoft: lineKind === 'wallet' },
    });
    const created = await this.prisma.instrument.create({
      data: { userId, lineId: line.id, kind, issuer, last4: hint.last4 ?? null, vpa: hint.vpa ?? null, isConfirmed: false },
    });
    return { lineId: line.id, instrumentId: created.id };
  }
}
