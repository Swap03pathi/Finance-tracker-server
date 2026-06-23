import { Decimal, Paise } from '../money';

/**
 * parseAmount — the single, well-tested money extractor (doc 07 §1).
 * Returns integer paise for confident parses; marks low-confidence (paise=null) for garbled input
 * rather than silently mis-parsing (AMT-12). Handles all Indian + Western notation (AMT-01..09).
 */
export interface ParsedAmount {
  paise: Paise | null;
  confidence: 'high' | 'low';
  matched: string | null;
}

const MULTIPLIERS: Record<string, Decimal.Value> = {
  k: 1_000,
  l: 100_000,
  lac: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

const CLEAN_NUMBER = /^[0-9][0-9,]*(?:\.[0-9]+)?$/; // digits, commas (any grouping), optional decimals
const MULT_WORD = '(k|lakhs?|lac|l|crores?|cr)';

// currency-led: Rs / Rs. / INR / ₹  then a number blob, with optional spaced multiplier word.
const CURRENCY_LED = new RegExp(
  String.raw`(?:rs\.?|inr|₹)\s*([0-9a-z.,]+)(?:\s+${MULT_WORD})?`,
  'i',
);
// bare number + multiplier (no currency), e.g. "2.5Cr", "2.5 crore"
const BARE_MULT = new RegExp(
  String.raw`\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*${MULT_WORD}\b`,
  'i',
);

function buildPaise(coreNumber: string, multiplier?: string): Paise {
  const cleaned = coreNumber.replace(/,/g, ''); // commas are grouping only — both Indian & Western
  let value = new Decimal(cleaned);
  if (multiplier) {
    value = value.times(MULTIPLIERS[multiplier.toLowerCase()]);
  }
  return value.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Strip a trailing glued multiplier word from a number blob: "1.2lakh" -> {core:"1.2", mult:"lakh"} */
function splitGluedMultiplier(blob: string): { core: string; mult?: string } {
  const m = blob.match(new RegExp(`^([0-9.,]+)(${Object.keys(MULTIPLIERS).join('|')})$`, 'i'));
  if (m) return { core: m[1], mult: m[2] };
  return { core: blob };
}

export function parseAmount(raw: string): ParsedAmount {
  // 1) currency-led (the common case)
  const c = raw.match(CURRENCY_LED);
  if (c) {
    const blob = c[1];
    const spacedMult = c[2];
    let core: string;
    let mult: string | undefined;
    if (spacedMult) {
      core = blob;
      mult = spacedMult;
    } else {
      ({ core, mult } = splitGluedMultiplier(blob));
    }
    if (!CLEAN_NUMBER.test(core)) {
      // blob held stray letters (e.g. "4,5O.00") — refuse to guess (AMT-12)
      return { paise: null, confidence: 'low', matched: c[0] };
    }
    return { paise: buildPaise(core, mult), confidence: 'high', matched: c[0] };
  }

  // 2) bare number + multiplier, no currency ("2.5Cr")
  const b = raw.match(BARE_MULT);
  if (b) {
    return { paise: buildPaise(b[1], b[2]), confidence: 'high', matched: b[0] };
  }

  return { paise: null, confidence: 'low', matched: null };
}

/**
 * Extract every currency amount from a body, in order (for slot disambiguation, AMT-11):
 * the transaction amount is typically the first; a balance is a later "bal/avail" amount.
 */
export function extractAmounts(body: string): Paise[] {
  const out: Paise[] = [];
  const re = new RegExp(
    String.raw`(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*${MULT_WORD}?`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(buildPaise(m[1], m[2]));
  }
  return out;
}
