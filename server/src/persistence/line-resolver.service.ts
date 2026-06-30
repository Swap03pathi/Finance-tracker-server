import { Injectable } from '@nestjs/common';
import type { LineHint } from '@finman/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Auto-discovery (doc 04 §1.5, doc 08 §I): materialise a line + instrument on first sighting of an
 * (issuer, last4/vpa). Ports the engine LedgerStore resolution to Prisma. Deterministic — a re-sync of
 * the same entry resolves the SAME instrument/line (so idempotent upsert never spawns duplicates).
 *
 * DEPOSIT ACCOUNTS share ONE line per issuer. A bank's available balance belongs to the underlying
 * ACCOUNT, not to the card or VPA used: a debit-card swipe, a UPI payment and a netbanking transfer at
 * the same bank all report the SAME running balance. So every deposit-side instrument (debit card /
 * VPA / netbanking) and every no-last4 balance message for an issuer attaches to that issuer's single
 * bank line — exactly LINE-05 ("debit card + UPI VPA on same account → one bank line"). This is what
 * lets per-account reconciliation chain the whole history instead of fragmenting it into a line-per-
 * last4 (the "off by ₹1,000" / duplicate-account symptom).
 *
 * CREDIT POOLS stay separate per (issuer, last4) — each card has its own limit/outstanding (LINE-02/
 * 04/08); the user may later confirm a shared pool. Missing last4 AND vpa for a credit pool → an
 * "Unattributed at <issuer>" bucket, never a guessed card (LINE-07).
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

    // 2) DEPOSIT ACCOUNTS → the issuer's single bank line (reuse if present, else create once). A bare
    //    balance message (no last4/vpa) joins the same account; a sighting that carries an instrument
    //    attaches it. This is the per-account balance-reconciliation fix.
    if (lineKind === 'bank') {
      const line =
        (await this.prisma.line.findFirst({ where: { userId, kind: 'bank', issuer } })) ??
        (await this.prisma.line.create({ data: { userId, kind: 'bank', issuer, isOwnNode: true } }));
      let instrumentId: string | null = null;
      if (hint.last4 || hint.vpa) {
        const created = await this.prisma.instrument.create({
          data: { userId, lineId: line.id, kind, issuer, last4: hint.last4 ?? null, vpa: hint.vpa ?? null, isConfirmed: false },
        });
        instrumentId = created.id;
      }
      return { lineId: line.id, instrumentId };
    }

    // 3) non-bank, no last4/vpa → unattributed bucket per issuer (deterministic by display name)
    if (!hint.last4 && !hint.vpa) {
      const name = `Unattributed at ${issuer ?? 'unknown'}`;
      const existing = await this.prisma.line.findFirst({ where: { userId, kind: lineKind, issuer, displayName: name } });
      const line = existing ?? (await this.prisma.line.create({
        data: { userId, kind: lineKind, issuer, displayName: name, isOwnNode: true, balanceIsSoft: true },
      }));
      return { lineId: line.id, instrumentId: null };
    }

    // 4) new credit/wallet instrument → new line (user may later confirm a shared pool; default separate)
    const line = await this.prisma.line.create({
      data: { userId, kind: lineKind, issuer, isOwnNode: true, balanceIsSoft: lineKind === 'wallet' },
    });
    const created = await this.prisma.instrument.create({
      data: { userId, lineId: line.id, kind, issuer, last4: hint.last4 ?? null, vpa: hint.vpa ?? null, isConfirmed: false },
    });
    return { lineId: line.id, instrumentId: created.id };
  }

  /**
   * One-time repair for data created before deposit accounts shared a line: collapse every issuer's
   * bank lines into a single canonical line (oldest wins), repointing instruments + ledger entries,
   * then deleting the now-empty duplicates. Idempotent — a second run merges nothing. The canonical
   * line's "Unattributed at …" placeholder name is cleared so its label derives from issuer + last4.
   */
  async consolidateBankLines(userId: string): Promise<{ merged: number }> {
    const banks = await this.prisma.line.findMany({ where: { userId, kind: 'bank' }, orderBy: { createdAt: 'asc' } });
    const byIssuer = new Map<string, typeof banks>();
    for (const l of banks) {
      const key = l.issuer ?? '∅'; // group null-issuer banks together
      const g = byIssuer.get(key) ?? [];
      g.push(l);
      byIssuer.set(key, g);
    }
    let merged = 0;
    for (const group of byIssuer.values()) {
      if (group.length < 2) continue;
      const [canonical, ...dupes] = group; // oldest is canonical
      const dupeIds = dupes.map((d) => d.id);
      await this.prisma.instrument.updateMany({ where: { userId, lineId: { in: dupeIds } }, data: { lineId: canonical.id } });
      await this.prisma.ledgerEntry.updateMany({ where: { userId, lineId: { in: dupeIds } }, data: { lineId: canonical.id } });
      await this.prisma.line.deleteMany({ where: { id: { in: dupeIds } } });
      if (canonical.displayName) await this.prisma.line.update({ where: { id: canonical.id }, data: { displayName: null } });
      merged += dupes.length;
    }
    return { merged };
  }
}
