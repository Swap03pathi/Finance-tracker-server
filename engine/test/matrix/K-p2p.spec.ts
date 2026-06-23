import { classifyCounterparty, merchantCategoryHint, routePersonReason } from '../../src/payee/payee';

/**
 * Section K — P2P vs P2M & person-reason routing. 🟠
 */
describe('K. P2P vs P2M & person-reason routing 🟠', () => {
  it('P2P-01 phone-number VPA, no merchant string -> person/unclassified (needs one tap)', () => {
    expect(classifyCounterparty('9876543210@ybl')).toBe('person');
  });

  it('P2P-02 merchant-string VPA -> lean P2M (merchant) + category hint', () => {
    expect(classifyCounterparty('swiggy@hdfcbank', 'Swiggy order')).toBe('merchant');
    expect(merchantCategoryHint('Swiggy order')).toBe('Food');
  });

  it('P2P-03 pay friend, reason "my share of dinner" -> EXPENSE', () => {
    expect(routePersonReason('my_share')).toBe('expense');
  });

  it('P2P-04 pay friend, reason "lending" -> receivable, NOT spend', () => {
    expect(routePersonReason('lending')).toBe('receivable');
  });

  it('P2P-05 pay friend, reason "repaying borrow" -> debt repayment, NOT spend now', () => {
    expect(routePersonReason('repaying')).toBe('debt_repayment');
  });

  it('P2P-06 rent to landlord\'s personal VPA -> user marks as Rent EXPENSE (not transfer)', () => {
    expect(routePersonReason('rent')).toBe('expense');
  });
});
