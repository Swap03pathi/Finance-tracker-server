import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { assertRedacted, RedactionLeakError, synthesiseRegex, SlotRole } from '@finman/engine';
import type { InduceInput } from '@finman/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { LlmProvider } from '../llm/llm.provider';

/**
 * Shared template library + induction (doc 03 §3). The induce endpoint receives ONLY a redacted
 * skeleton; server-side redaction is RE-ASSERTED here (defence in depth) before anything is processed.
 * Round-trip-against-real-messages stays on-device (raw never leaves the phone); the server trust gate
 * promotes when independent inductions reproducibly AGREE on the slot roles.
 */
const TRUST_RUNS = 5;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmProvider,
  ) {}

  async listTrusted(since?: string) {
    return this.prisma.template.findMany({
      where: { trustState: 'trusted', ...(since ? { createdAt: { gt: new Date(since) } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async induce(input: InduceInput) {
    // 🔴 server-side redaction enforcement — reject if any amount-like run survived (PRIV-03)
    try {
      assertRedacted(input.redactedSkeleton);
    } catch (e) {
      if (e instanceof RedactionLeakError) {
        throw new UnprocessableEntityException({ message: 'redaction leak: skeleton carries a real value', residue: e.residue });
      }
      throw e;
    }

    const plan = await this.llm.induce(input.redactedSkeleton);
    const regex = synthesiseRegex(input.redactedSkeleton, plan.roles);

    // trust gate: N independent inductions must agree on the slot roles
    let agree = 0;
    for (let i = 0; i < TRUST_RUNS; i++) {
      const p = await this.llm.induce(input.redactedSkeleton);
      if (sameRoles(p.roles, plan.roles)) agree++;
    }
    const trustState = agree >= TRUST_RUNS ? 'trusted' : 'provisional';
    const slotMap = Object.fromEntries(plan.roles.map((r, i) => [i, r]));

    const tmpl = await this.prisma.template.upsert({
      where: { fingerprint: input.fingerprint },
      create: { fingerprint: input.fingerprint, issuer: input.issuer ?? null, regex, slotMap, trustState, validationRuns: agree },
      update: { regex, slotMap, trustState, validationRuns: agree },
    });
    return tmpl;
  }
}

function sameRoles(a: SlotRole[], b: SlotRole[]): boolean {
  return a.length === b.length && a.every((r, i) => r === b[i]);
}
