import { Injectable } from '@nestjs/common';
import { headline, byCategory, byTag, byLine, describePeriod, Paise } from '@finman/engine';
import { PrismaService } from '../prisma/prisma.service';
import { domainFromPrisma } from '../persistence/entry.mapper';
import { paiseToWire } from '../common/money';

/** The three headline numbers + breakdowns (doc 08 §Y), computed by the pure engine over DB rows. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadEntries(userId: string) {
    const rows = await this.prisma.ledgerEntry.findMany({ where: { userId } });
    return rows.map(domainFromPrisma);
  }

  async dashboard(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const entries = await this.loadEntries(userId);
    const h = headline({ entries });

    const cats = [...byCategory({ entries }).entries()].sort((a, b) => b[1] - a[1]);
    const topCategory = cats[0] ? { categoryId: cats[0][0], amount: paiseToWire(cats[0][1]) } : null;

    // balances: latest balance-bearing entry per line (doc 08 DASH-08)
    const balancesByLine = new Map<string, { paise: Paise; at: number }>();
    for (const e of entries) {
      if (e.balanceAfterPaise == null) continue;
      const at = e.txnTime ? Date.parse(e.txnTime) : 0;
      const cur = balancesByLine.get(e.lineId);
      if (!cur || at >= cur.at) balancesByLine.set(e.lineId, { paise: e.balanceAfterPaise, at });
    }
    const balances = [...balancesByLine.entries()].map(([lineId, v]) => ({ lineId, balance: paiseToWire(v.paise) }));

    const nowIso = new Date().toISOString();
    const period = describePeriod(user.createdAt.toISOString(), nowIso);

    return {
      income: paiseToWire(h.incomePaise),
      expenses: paiseToWire(h.expensePaise),
      savings: paiseToWire(h.savingsPaise),
      balances,
      topCategory,
      biggestPayee: null, // payees arrive in Phase 5
      period,
    };
  }

  async breakdown(userId: string, by: 'category' | 'tag' | 'line') {
    const entries = await this.loadEntries(userId);
    const map = by === 'category' ? byCategory({ entries }) : by === 'tag' ? byTag({ entries }) : byLine({ entries });
    return [...map.entries()].map(([key, paise]) => ({ key: String(key), amount: paiseToWire(paise) }));
  }
}
