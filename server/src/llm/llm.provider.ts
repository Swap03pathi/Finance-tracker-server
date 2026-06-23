import type { SlotRole } from '@finman/engine';

/**
 * LLM induction provider abstraction (doc 02 §8, doc 10 §1.D). The ONLY off-device derived-data path.
 * Input is ALWAYS a redacted skeleton (zero real values) — the provider identifies which slot token is
 * amount/balance/date/tail/ref/merchant. Swappable: MockLlmProvider (deterministic, local) vs
 * OpenAiProvider (real). `LlmProvider` is the Nest DI token.
 */
export interface InductionPlan {
  roles: SlotRole[]; // aligned to the ordered §…§ tokens in the skeleton
  merchantSpan?: string | null;
}

export abstract class LlmProvider {
  abstract induce(skeleton: string): Promise<InductionPlan>;
}
