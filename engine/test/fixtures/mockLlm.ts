import { LlmInductionClient, SlotRole } from '../../src/templates/induction';
import { parseAmount } from '../../src/amount/parseAmount';

/**
 * Deterministic mock LLM for induction tests. It assigns slot roles by inspecting the masked
 * skeleton's token order and the literal words around them — NEVER from real values (it only ever
 * receives a skeleton). The real-redaction assertion in redact.ts is NOT mocked.
 */
export function makeMockLlm(opts: { disagree?: boolean } = {}): LlmInductionClient & { induceCalls: number } {
  const client = {
    induceCalls: 0,
    induce(skeleton: string) {
      this.induceCalls++;
      // role each §..§ occurrence in order: first §AMT§ = amount; a §AMT§ after "bal" = balance.
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
    },
    extract(body: string) {
      // a fresh independent read of the amount (first currency amount in the body)
      const p = parseAmount(body).paise;
      // simulate a disagreeing/poisoned model for the poison-protection test
      return { amountPaise: opts.disagree ? (p === null ? null : p + 1) : p };
    },
  };
  return client;
}
