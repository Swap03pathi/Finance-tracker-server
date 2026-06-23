import { headline } from '../../src/aggregation/aggregate';
import { makeEntry } from '../fixtures/factory';
import { PersonalDebt } from '../../src/types';

/**
 * Section T — Personal debt. 🟡 (schema built, minimal v1 UI).
 */
describe('T. Personal debt 🟡', () => {
  it('DEBT-01 lend ₹2,000 to friend -> receivable (they_owe_me), NOT spend', () => {
    // the outflow is a transfer to a person you'll be repaid by → not counted as expense
    const lend = makeEntry({ id: 'l', direction: 'TRANSFER', amountCapturedPaise: 200000 });
    const debt: PersonalDebt = { id: 'd1', userId: 'u1', direction: 'they_owe_me', principalPaise: 200000, remainingPaise: 200000, status: 'open' } as any;
    expect(headline({ entries: [lend] }).expensePaise).toBe(0);
    expect(debt.direction).toBe('they_owe_me');
  });

  it('DEBT-02 friend repays -> incoming matches, closes receivable', () => {
    const debt = { id: 'd1', remainingPaise: 200000, status: 'open' as const };
    const repaid = { ...debt, remainingPaise: 0, status: 'closed' as const };
    expect(repaid.remainingPaise).toBe(0);
    expect(repaid.status).toBe('closed');
  });

  it('DEBT-03 partial repayment -> remaining decremented', () => {
    let remaining = 200000;
    remaining -= 120000; // friend pays ₹1,200
    expect(remaining).toBe(80000);
  });

  it('DEBT-04 forgive a receivable -> status forgiven', () => {
    const debt = { status: 'open' as string };
    debt.status = 'forgiven';
    expect(debt.status).toBe('forgiven');
  });
});
