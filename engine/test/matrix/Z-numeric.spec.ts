import * as fc from 'fast-check';
import { parseAmount } from '../../src/amount/parseAmount';
import { sumPaise, rupeesToPaise, Decimal } from '../../src/money';

/**
 * Section Z — Numeric integrity & robustness. 🔴 paise-integer math, no float drift.
 */
describe('Z. Numeric integrity & robustness 🔴', () => {
  it('NUM-01 1,000 small txns summed — exact, no float drift', () => {
    // 1000 amounts that are notorious for float drift (0.01..0.99 rupees)
    const paise: number[] = [];
    let expected = new Decimal(0);
    for (let i = 1; i <= 1000; i++) {
      const rupees = (i % 99) / 100 + 0.01; // e.g. 0.02, 0.03 ...
      const p = rupeesToPaise(rupees);
      paise.push(p);
      expected = expected.plus(p);
    }
    expect(sumPaise(paise)).toBe(expected.toNumber());
    // and the naive float path WOULD drift — prove our integer path doesn't:
    expect(Number.isInteger(sumPaise(paise))).toBe(true);
  });

  it('NUM-02 ₹0.01 handled exactly', () => {
    expect(parseAmount('Rs 0.01').paise).toBe(1);
  });

  it('NUM-03 very large ₹2.5Cr — no overflow (safe integer)', () => {
    const p = parseAmount('Rs 2.5Cr').paise!;
    expect(p).toBe(2_500_000_000);
    expect(Number.isSafeInteger(p)).toBe(true);
  });

  it('NUM-01 (property) sum of N paise == Decimal sum, for any amounts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9_999_99 }), { minLength: 0, maxLength: 5000 }),
        (paise) => {
          const viaInt = sumPaise(paise);
          const viaDecimal = paise.reduce((acc, p) => acc.plus(p), new Decimal(0)).toNumber();
          return viaInt === viaDecimal && Number.isInteger(viaInt);
        },
      ),
    );
  });
});
