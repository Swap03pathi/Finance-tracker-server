import { parseSmsDate } from '../../src/parsing/dateParse';

/**
 * Section C — Date / time parsing. 🟠
 */
describe('C. Date / time parsing 🟠', () => {
  it('DATE-01 `05-03-2026` -> 5 Mar 2026 (DD-MM default)', () => {
    expect(parseSmsDate('05-03-2026').iso).toBe('2026-03-05T00:00:00.000Z');
  });

  it('DATE-02 `05-03` (no year) -> year inferred from receipt date', () => {
    expect(parseSmsDate('05-03', '2026-03-06T12:00:00Z').iso).toBe('2026-03-05T00:00:00.000Z');
  });

  it('DATE-03 `05 Mar 26` / `5-Mar-2026` -> parsed correctly', () => {
    expect(parseSmsDate('05 Mar 26').iso).toBe('2026-03-05T00:00:00.000Z');
    expect(parseSmsDate('5-Mar-2026').iso).toBe('2026-03-05T00:00:00.000Z');
  });

  it('DATE-04 txn_time differs from received_at -> both representable (reconcile by balance order)', () => {
    const txn = parseSmsDate('02-06-2026').iso;
    const received = '2026-06-03T09:00:00.000Z';
    expect(txn).not.toBe(received); // both stored; reconciliation orders by balance, not receipt
  });

  it('DATE-05 SMS near midnight IST -> stored UTC, correct day', () => {
    // 02-06-2026 stored as UTC midnight; IST display (+5:30) still lands on 2 Jun
    const iso = parseSmsDate('02-06-2026').iso!;
    const istDay = new Date(Date.parse(iso) + 5.5 * 3600_000).getUTCDate();
    expect(istDay).toBe(2);
  });
});
