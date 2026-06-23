/**
 * Date/time parsing (doc 07 §10, doc 08 §C). Indian DD-MM default; missing year inferred from the
 * SMS receipt date. All timestamps normalised to UTC ISO; display is IST at the presentation layer.
 */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export interface ParsedDate {
  iso: string | null;
  confidence: 'high' | 'low';
}

export function parseSmsDate(raw: string, receivedAtIso?: string): ParsedDate {
  const s = raw.trim().toLowerCase();
  const receivedYear = receivedAtIso ? new Date(receivedAtIso).getUTCFullYear() : new Date().getUTCFullYear();

  // dd-mm-yyyy / dd/mm/yy  (DD-MM Indian convention)
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (m) {
    const day = +m[1];
    const month = +m[2] - 1;
    let year = m[3] ? +m[3] : receivedYear;
    if (year < 100) year += 2000;
    if (day > 31 || month > 11) return { iso: null, confidence: 'low' };
    return { iso: new Date(Date.UTC(year, month, day)).toISOString(), confidence: 'high' };
  }
  // dd Mon yy / d-Mon-yyyy
  m = s.match(/^(\d{1,2})[-\s]([a-z]{3,})[-\s](\d{2,4})$/);
  if (m && MONTHS[m[2].slice(0, 3)] != null) {
    const day = +m[1];
    const month = MONTHS[m[2].slice(0, 3)];
    let year = +m[3];
    if (year < 100) year += 2000;
    return { iso: new Date(Date.UTC(year, month, day)).toISOString(), confidence: 'high' };
  }
  return { iso: null, confidence: 'low' };
}
