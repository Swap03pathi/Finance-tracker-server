import { Injectable } from '@nestjs/common';
import type { SlotRole } from '@finman/engine';
import { InductionPlan, LlmProvider } from './llm.provider';

/**
 * Deterministic mock provider — assigns slot roles by token order + surrounding boilerplate words in
 * the (already redacted) skeleton. Used for local/CI until an OPENAI_API_KEY is configured; because it
 * is deterministic, the trust-gate "independent inductions agree" check promotes consistently.
 */
@Injectable()
export class MockLlmProvider extends LlmProvider {
  async induce(skeleton: string): Promise<InductionPlan> {
    const roles: SlotRole[] = [];
    const tokenRe = /§(AMT|DATE|ACCT|NUM|VPA|MERCHANT)§/g;
    let m: RegExpExecArray | null;
    let seenAmount = false;
    while ((m = tokenRe.exec(skeleton)) !== null) {
      const fam = m[1];
      const before = skeleton.slice(Math.max(0, m.index - 16), m.index);
      if (fam === 'AMT') {
        if (/bal/.test(before)) roles.push('balance');
        else if (!seenAmount) {
          roles.push('amount');
          seenAmount = true;
        } else roles.push('balance');
      } else if (fam === 'DATE') roles.push('date');
      else if (fam === 'ACCT') roles.push('account_tail');
      else if (fam === 'NUM') roles.push('ref');
      else if (fam === 'MERCHANT') roles.push('merchant');
      else roles.push('none');
    }
    return { roles, merchantSpan: null };
  }
}
