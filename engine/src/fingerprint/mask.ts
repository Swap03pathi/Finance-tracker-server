/**
 * Structural masker (doc 07 §7). Replaces amounts/dates/account-tails/long-numbers/VPAs with slot
 * tokens. **This is the SAME code path used for redaction** (doc 07 §7/§8): the skeleton produced
 * here is exactly what the induction call may see, which is what guarantees the LLM never sees a
 * real value. Order matters — amounts before generic numbers.
 */
export const SLOTS = {
  amount: '§AMT§',
  date: '§DATE§',
  acct: '§ACCT§',
  num: '§NUM§',
  vpa: '§VPA§',
  merchant: '§MERCHANT§',
} as const;

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

// 1) currency amounts incl L/Cr/k notation, "/-" suffix, and the word "rupees"
const RE_AMOUNT =
  /(?:rs\.?|inr|₹|rupees)\s*\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lac|l|crores?|cr)?(?:\s*\/-)?/gi;
// 1b) bare multiplier amounts without currency ("2.5Cr", "1.2 lakh")
const RE_AMOUNT_BARE = /\b\d[\d,]*(?:\.\d+)?\s*(?:k|lakhs?|lac|crores?|cr|l)\b/gi;
// 2) dates: dd-mm-yy(yy), dd/mm/yyyy, dd Mon yy
const RE_DATE = new RegExp(
  String.raw`\b\d{1,2}[-/ ](?:\d{1,2}|${MONTHS})[-/ ]?\d{2,4}\b`,
  'gi',
);
// 3) account tails: XX1234, **1234, a/c ...3456, ending 1234, Card XX9012
const RE_ACCT =
  /\b(?:x{2,}|\*{2,}|a\/c\s*[*.]*\s*|ending\s+|acct\.?\s*|account\s+|card\s+x*)\s*\d{2,6}\b/gi;
// 4) VPAs: local@psp
const RE_VPA = /\b[\w.\-]+@[a-z]+\b/gi;
// 5) merchant: the free-text span after an anchor preposition (at/to/for/towards) up to the next
//    structural keyword or another anchor (doc 10 §2.1). The DLT boilerplate is the fingerprint key;
//    the variable merchant becomes a wildcard slot so the same shape with a different merchant
//    yields the SAME fingerprint. Runs AFTER amount/date/acct/vpa are already slot tokens.
const MERCHANT_BOUNDARY = 'via|on|from|using|thru|through|ref|avl|bal|upi|info|txn|dated|at|to|for|towards|a\\/c|acct';
const RE_MERCHANT = new RegExp(
  String.raw`\b(at|to|for|towards)\s+(.+?)(?=\s+(?:${MERCHANT_BOUNDARY})\b|\s*§|[.,]|$)`,
  'gi',
);
// 6) any remaining long-ish number run (ref/txn id, leftover tails) — privacy backstop
const RE_LONGNUM = /\d{3,}/g;

export function maskBody(body: string): string {
  let s = (body ?? '').toLowerCase().trim();
  s = s.replace(RE_AMOUNT, SLOTS.amount);
  s = s.replace(RE_AMOUNT_BARE, SLOTS.amount);
  s = s.replace(RE_DATE, SLOTS.date);
  s = s.replace(RE_ACCT, SLOTS.acct);
  s = s.replace(RE_VPA, SLOTS.vpa);
  s = s.replace(RE_MERCHANT, (_m, prep) => `${prep} ${SLOTS.merchant}`); // merchant → wildcard slot
  s = s.replace(RE_LONGNUM, SLOTS.num); // final numeric sweep → nothing 3+ digits survives
  s = s.replace(/\s+/g, ' ').trim(); // collapse whitespace
  return s;
}
