import { parseAmount, extractAmounts } from '../../src/amount/parseAmount';
import { sumPaise } from '../../src/money';

/**
 * Section B — Amount parsing (Indian notation). 🔴 corrupts totals if wrong.
 * Expected values are integer PAISE (doc 08 §B).
 */
describe('B. Amount parsing (Indian notation) 🔴', () => {
  it('AMT-01 `Rs 450` -> 45000', () => {
    expect(parseAmount('Rs 450').paise).toBe(45000);
  });

  it('AMT-02 `Rs.1,234.50` -> 123450 (Western grouping + decimals)', () => {
    expect(parseAmount('Rs.1,234.50').paise).toBe(123450);
  });

  it('AMT-03 `INR 1,23,456.78` -> 12345678 (Indian grouping)', () => {
    expect(parseAmount('INR 1,23,456.78').paise).toBe(12345678);
  });

  it('AMT-04 `₹1.2L` and `Rs 1.2 lakh` -> 12000000 (lakh)', () => {
    expect(parseAmount('₹1.2L').paise).toBe(12000000);
    expect(parseAmount('Rs 1.2 lakh').paise).toBe(12000000);
  });

  it('AMT-05 `2.5Cr` and `2.5 crore` -> 2500000000 (crore)', () => {
    expect(parseAmount('2.5Cr').paise).toBe(2500000000);
    expect(parseAmount('2.5 crore').paise).toBe(2500000000);
  });

  it('AMT-06 `Rs 1.2k` -> 120000 (k)', () => {
    expect(parseAmount('Rs 1.2k').paise).toBe(120000);
  });

  it('AMT-07 `Rs450` -> 45000 (no space)', () => {
    expect(parseAmount('Rs450').paise).toBe(45000);
  });

  it('AMT-08 `Rs 0.50` -> 50 (sub-rupee)', () => {
    expect(parseAmount('Rs 0.50').paise).toBe(50);
  });

  it('AMT-09 `Rs 1,00,000` -> 10000000 (no-decimal large)', () => {
    expect(parseAmount('Rs 1,00,000').paise).toBe(10000000);
  });

  it('AMT-10 ₹0.10 + ₹0.20 == ₹0.30 exactly (no float drift)', () => {
    const a = parseAmount('₹0.10').paise!;
    const b = parseAmount('₹0.20').paise!;
    expect(sumPaise([a, b])).toBe(30);
  });

  it('AMT-11 two amounts in one SMS — txn chosen as amount, other as balance', () => {
    const amounts = extractAmounts('Rs 450 spent at Zomato. Avl Bal Rs 5,000');
    expect(amounts).toEqual([45000, 500000]);
    const [txnAmount, balance] = amounts;
    expect(txnAmount).toBe(45000);
    expect(balance).toBe(500000);
  });

  it('AMT-12 garbled `Rs 4,5O.00` (letter O) -> low-confidence, not silently mis-parsed', () => {
    const r = parseAmount('Rs 4,5O.00');
    expect(r.confidence).toBe('low');
    expect(r.paise).toBeNull();
  });
});
