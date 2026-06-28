import { Injectable } from '@nestjs/common';
import {
  gate,
  fingerprint,
  redactForInduction,
  parseWithTemplate,
  classifyModality,
  verbDirection,
  classifyMoneyType,
  isSeededOwnNode,
  isTopupText,
  computeIsCounted,
  logicalEntryId,
  extractReference,
  merchantCategoryHint,
  parseAmount,
  Template,
} from '@finman/engine';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { EntriesService } from '../entries/entries.service';
import { paiseToWire } from '../common/money';

export interface IngestLog {
  step: string;
  detail: string;
}
export interface IngestResult {
  outcome: 'dropped' | 'stored';
  entryId?: string;
  log: IngestLog[];
}

/**
 * DEV/TEST ONLY (env-gated). Runs the WHOLE ingestion pipeline server-side over a pasted SMS and
 * returns a step-by-step log, storing the structured entry under the device's user so the emulator
 * sees it on next sync. NOTE: in production the device parses on-device and raw SMS never reaches the
 * server — this endpoint exists purely so you can watch the pipeline + impact live during dogfooding.
 */
@Injectable()
export class DevIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly entries: EntriesService,
  ) {}

  private instrumentKind(body: string): string {
    const l = body.toLowerCase();
    if (l.includes('@')) return 'vpa';
    if (l.includes('debit card')) return 'debit_card';
    if (l.includes('card')) return 'credit_card';
    if (l.includes('a/c') || l.includes('account') || l.includes('net banking')) return 'netbanking';
    return 'vpa';
  }

  async ingest(deviceKey: string, sender: string, body: string): Promise<IngestResult> {
    const log: IngestLog[] = [];
    const user = await this.prisma.user.upsert({
      where: { googleSub: `dev:${deviceKey}` },
      create: { googleSub: `dev:${deviceKey}` },
      update: {},
    });

    const g = gate(sender, body);
    log.push({ step: '1 · gate', detail: g.admit ? `ADMIT — sender → ${g.normalisedSender}` : `DROP (${g.reason})` });
    if (!g.admit) return { outcome: 'dropped', log };

    const issuer = g.normalisedSender;
    const fp = fingerprint(body);
    log.push({ step: '2 · fingerprint', detail: fp.slice(0, 24) + '…' });

    let row = await this.prisma.template.findUnique({ where: { fingerprint: fp } });
    if (!row) {
      const skeleton = redactForInduction(body);
      log.push({ step: '3 · redact (only this leaves the device)', detail: skeleton });
      row = await this.templates.induce({ redactedSkeleton: skeleton, fingerprint: fp, issuer });
      log.push({ step: '4 · induce', detail: `template ${row.trustState}` });
    } else {
      log.push({ step: '3 · template', detail: `cache hit (${row.trustState})` });
    }

    const m = parseWithTemplate({ regex: row.regex } as Template, body);
    const amountPaise = m?.amountPaise ?? parseAmount(body).paise ?? 0;
    const balancePaise = m?.balancePaise ?? null;
    const merchant = m?.merchant ?? null;
    log.push({
      step: '5 · parse',
      detail: `amount=₹${paiseToWire(amountPaise)} · balance=${balancePaise != null ? '₹' + paiseToWire(balancePaise) : '—'} · merchant=${merchant ?? '—'}`,
    });

    const modality = classifyModality(body);
    const vd = verbDirection(body) ?? 'out';
    const ownNode = isSeededOwnNode(issuer) || (merchant ? isSeededOwnNode(merchant) : false);
    const direction = classifyMoneyType({ direction: vd, counterpartyIsOwnNode: ownNode, isTopup: isTopupText(body) });
    const counted = computeIsCounted(direction, modality);
    log.push({ step: '6 · classify', detail: `${direction} · ${modality} · counted=${counted}` });

    const last4 = body.match(/(?:x{2,}|\*{2,}|a\/c\s*[*.]*\s*|ending\s+|card\s+x*)\s*(\d{2,6})/i)?.[1] ?? null;
    const reference = extractReference(body);
    const id = logicalEntryId({
      userId: deviceKey,
      lineKey: `${issuer ?? '?'}|${last4 ?? '?'}`,
      direction,
      amountPaise,
      epochSec: Math.floor(Date.now() / 1000),
      reference,
      content: body,
    });

    let categoryId: number | null = null;
    if (direction === 'EXPENSE') {
      const name = (merchant ? merchantCategoryHint(merchant) : null) ?? 'Miscellaneous';
      categoryId = (await this.prisma.category.findFirst({ where: { name } }))?.id ?? null;
    }

    await this.entries.upsert(user.id, [
      {
        id,
        hint: { issuer, last4, instrumentKind: this.instrumentKind(body) as 'vpa' },
        direction,
        modality,
        amountCaptured: paiseToWire(amountPaise),
        amountEffective: paiseToWire(amountPaise),
        balanceAfter: balancePaise != null ? paiseToWire(balancePaise) : undefined,
        categoryId: categoryId ?? undefined,
        merchantText: merchant ?? undefined,
        txnTime: new Date().toISOString(),
        source: 'sms',
      },
    ]);
    log.push({ step: '7 · store', detail: `entry ${id.slice(0, 8)} → user ${user.id.slice(0, 8)} (${counted ? 'counts' : 'not counted'})` });
    return { outcome: 'stored', entryId: id, log };
  }
}
