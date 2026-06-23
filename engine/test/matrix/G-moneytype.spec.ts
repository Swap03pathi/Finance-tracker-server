import { classifyMoneyType, isSeededOwnNode, isTopupText, verbDirection } from '../../src/classification/moneyType';
import { headline } from '../../src/aggregation/aggregate';
import { makeEntry } from '../fixtures/factory';

/**
 * Section G — Money-type classification (the boundary). 🔴
 */
describe('G. Money-type classification (the boundary) 🔴', () => {
  it('TYPE-01 salary credited from employer -> INCOME', () => {
    expect(classifyMoneyType({ direction: 'in', counterpartyIsOwnNode: false })).toBe('INCOME');
  });

  it('TYPE-02 spent at Zomato -> EXPENSE', () => {
    expect(classifyMoneyType({ direction: 'out', counterpartyIsOwnNode: false })).toBe('EXPENSE');
  });

  it('TYPE-03 bank -> Paytm wallet load -> TRANSFER (not counted)', () => {
    expect(isSeededOwnNode('PAYTM')).toBe(true);
    expect(classifyMoneyType({ direction: 'out', counterpartyIsOwnNode: true })).toBe('TRANSFER');
  });

  it('TYPE-04 gift card -> Amazon balance -> TOPUP (not income, not expense)', () => {
    expect(isTopupText('Rs 1,000 gift card added to your Amazon Pay balance')).toBe(true);
    expect(classifyMoneyType({ direction: 'in', counterpartyIsOwnNode: false, isTopup: true })).toBe('TOPUP');
  });

  it('TYPE-05 full chain Bank->Paytm->Swiggy->order ₹500 -> exactly ONE ₹500 expense', () => {
    const bankToPaytm = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 50000, lineId: 'bank' });
    const paytmToSwiggy = makeEntry({ direction: 'TRANSFER', amountCapturedPaise: 50000, lineId: 'paytm' });
    const swiggyOrder = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 50000, lineId: 'swiggy' });
    const { expensePaise } = headline({ entries: [bankToPaytm, paytmToSwiggy, swiggyOrder] });
    expect(expensePaise).toBe(50000); // ONE ₹500, not four
  });

  it('TYPE-06 spend ₹600 of gift-card Amazon balance -> ₹600 expense, ₹400 remains, never income', () => {
    const topup = makeEntry({ direction: 'TOPUP', amountCapturedPaise: 100000, lineId: 'amazonpay', balanceAfterPaise: 100000 });
    const spend = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 60000, lineId: 'amazonpay', balanceAfterPaise: 40000 });
    const { expensePaise, incomePaise } = headline({ entries: [topup, spend] });
    expect(expensePaise).toBe(60000);
    expect(incomePaise).toBe(0); // topup is never income
    expect(spend.balanceAfterPaise).toBe(40000); // ₹400 remains on the wallet
  });

  it('TYPE-07 self FD transfer ₹10,000 -> TRANSFER, neither in nor out', () => {
    expect(classifyMoneyType({ direction: 'out', counterpartyIsOwnNode: true })).toBe('TRANSFER');
  });

  it('TYPE-08 bank charges / penalty ₹25 -> EXPENSE (fee), not a merchant spend', () => {
    const fee = makeEntry({ direction: 'EXPENSE', amountCapturedPaise: 2500, categoryId: 10 /* Loans/Fees */ });
    expect(fee.isCounted).toBe(true);
    expect(headline({ entries: [fee] }).expensePaise).toBe(2500);
  });

  it('verbDirection reads in/out from the verb', () => {
    expect(verbDirection('Rs 450 spent at Zomato')).toBe('out');
    expect(verbDirection('Rs 65,000 credited by salary')).toBe('in');
  });
});
