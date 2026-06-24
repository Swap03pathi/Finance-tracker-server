import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { SlotRole } from '@finman/engine';
import { InductionPlan, LlmProvider } from './llm.provider';

/**
 * Real OpenAI induction (doc 07 §8). Sends ONLY the redacted skeleton with the strict induction
 * prompt and parses a JSON slot map. Wired behind the abstraction; exercised once OPENAI_API_KEY is
 * set (deferred while infra is paused). The skeleton is asserted-clean by the caller before we get here.
 */
@Injectable()
export class OpenAiProvider extends LlmProvider {
  private readonly client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  async induce(skeleton: string): Promise<InductionPlan> {
    const system =
      'You are given the structural skeleton of an Indian bank/UPI SMS where all real values are ' +
      'masked as tokens (§AMT§, §DATE§, §ACCT§, §NUM§, §VPA§, §MERCHANT§). For each token IN ORDER, ' +
      'identify which financial field it is. Return ONLY JSON: ' +
      '{"roles":["amount|balance|date|account_tail|ref|merchant|none", ...]}';
    const res = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: skeleton },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? '{"roles":[]}';
    const parsed = JSON.parse(raw) as { roles: SlotRole[] };
    return { roles: parsed.roles ?? [], merchantSpan: null };
  }
}
