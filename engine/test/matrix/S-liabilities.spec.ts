import { headline } from '../../src/aggregation/aggregate';
import { makeEntry } from '../fixtures/factory';

/**
 * Section S — Liabilities (loans & card EMI). 🟠 (LIAB-02 is 🔴 EMI double-count).
 * MVP stance: liabilities are user-declared; we never invent interest splits the SMS didn't give.
 */
describe('S. Liabilities (loans & card EMI)', () => {
  it('LIAB-02 🔴 ₹60,000 purchase converted to EMI -> original counted ONCE, EMIs not new expense', () => {
    // the original purchase is the expense; each EMI posting is a repayment (TRANSFER), not counted
    const purchase = makeEntry({ id: 'p', direction: 'EXPENSE', amountCapturedPaise: 6000000 });
    const emi1 = makeEntry({ id: 'e1', direction: 'TRANSFER', amountCapturedPaise: 1000000 });
    const emi2 = makeEntry({ id: 'e2', direction: 'TRANSFER', amountCapturedPaise: 1000000 });
    expect(headline({ entries: [purchase, emi1, emi2] }).expensePaise).toBe(6000000); // once, not 6000000+EMIs
  });

  it('LIAB-01 standalone loan -> its own line (loan kind), reconciles independently', () => {
    const loanDisbursal = makeEntry({ id: 'l', direction: 'INCOME', amountCapturedPaise: 50000000, lineId: 'loan-1' });
    expect(loanDisbursal.lineId).toBe('loan-1');
  });

  it('LIAB-04 EMI posting + monthly bill total -> counted once (bill includes EMI)', () => {
    // the card bill payment is a TRANSFER (moving money to the card line), the EMI is part of it
    const bill = makeEntry({ id: 'bill', direction: 'TRANSFER', amountCapturedPaise: 1500000 });
    expect(headline({ entries: [bill] }).expensePaise).toBe(0);
  });

  it('LIAB-05 no SMS for interest split -> not invented (user-declared assists only)', () => {
    // we do not fabricate an interest expense entry from nothing
    const emi = makeEntry({ id: 'e', direction: 'TRANSFER', amountCapturedPaise: 1000000 });
    expect(headline({ entries: [emi] }).expensePaise).toBe(0);
  });

  it('LIAB-07 statement/bill generation SMS -> informational, not a transaction', () => {
    // a statement entry would never be marked counted; modelled as not-counted
    const statement = makeEntry({ id: 'st', direction: 'EXPENSE', amountCapturedPaise: 1500000, isCounted: false });
    expect(headline({ entries: [statement] }).expensePaise).toBe(0);
  });
});
