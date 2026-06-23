import Decimal from 'decimal.js';

/**
 * Money core. The compute layer works in INTEGER PAISE (exact, no float drift, doc 07 §1).
 * Conversion to/from NUMERIC(14,2) rupees (Decimal) happens only at the persistence/presentation
 * boundary. ₹1,234.50 === 123450 paise.
 *
 * Never use a JS `number` for *fractional* money arithmetic — integers add/subtract exactly within
 * Number.MAX_SAFE_INTEGER (9.007e15 paise ≈ ₹90 trillion), well beyond any real amount (NUM-03).
 */
export type Paise = number;

/** Exact sum of paise — integer addition, zero drift (guards NUM-01). */
export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) {
      throw new Error(`sumPaise received a non-integer paise value: ${v}`);
    }
    total += v;
  }
  return total;
}

/** Rupees (string/Decimal) -> integer paise, via Decimal so 0.1+0.2 never drifts. */
export function rupeesToPaise(rupees: Decimal.Value): Paise {
  return new Decimal(rupees).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Integer paise -> Decimal rupees (NUMERIC(14,2) storage shape). */
export function paiseToRupees(paise: Paise): Decimal {
  return new Decimal(paise).dividedBy(100);
}

/** Presentation only: paise -> "₹1,23,456.78" (Indian grouping). */
export function formatPaise(paise: Paise): string {
  const rupees = paiseToRupees(Math.abs(paise)).toFixed(2);
  const [intPart, decPart] = rupees.split('.');
  // Indian grouping: last 3 digits, then groups of 2.
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${grouped}.${decPart}`;
}

export { Decimal };
