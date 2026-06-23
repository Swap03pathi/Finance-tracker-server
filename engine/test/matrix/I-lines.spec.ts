import { LedgerStore } from '../../src/ledger/store';

/**
 * Section I — Lines & instruments. 🔴
 */
describe('I. Lines & instruments 🔴', () => {
  it('LINE-01 first SMS from new card ••1234 -> instrument + provisional line auto-created', () => {
    const s = new LedgerStore();
    const line = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    const inst = s.ensureInstrument('u1', line.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '1234' });
    expect(s.lines).toHaveLength(1);
    expect(inst.lineId).toBe(line.id);
    expect(inst.isConfirmed).toBe(false);
  });

  it('LINE-02 two HDFC cards sharing a limit -> two instruments, ONE credit pool (after confirm)', () => {
    const s = new LedgerStore();
    const lineA = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    const lineB = s.ensureCreditLine('u1', 'HDFCBK', '5678');
    const a = s.ensureInstrument('u1', lineA.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '1234' });
    const b = s.ensureInstrument('u1', lineB.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '5678' });
    expect(s.lines).toHaveLength(2); // default separate
    s.confirmSharedPool(lineA.id, lineB.id);
    expect(s.lines).toHaveLength(1); // one pool
    expect(s.instruments.map((i) => i.lineId)).toEqual([a.lineId, lineA.id]);
    expect(b.lineId).toBe(lineA.id);
  });

  it('LINE-04 third HDFC card with its own limit -> separate line', () => {
    const s = new LedgerStore();
    s.ensureCreditLine('u1', 'HDFCBK', '1234');
    s.ensureCreditLine('u1', 'HDFCBK', '5678');
    const third = s.ensureCreditLine('u1', 'HDFCBK', '9012');
    expect(s.lines).toHaveLength(3);
    expect(third.id).toBeDefined();
  });

  it('LINE-05 debit card + UPI VPA on same account -> both instruments on one bank line', () => {
    const s = new LedgerStore();
    const bank = s.ensureBankLine('u1', 'HDFCBK', '3456');
    const debit = s.ensureInstrument('u1', bank.id, { kind: 'debit_card', issuer: 'HDFCBK', last4: '3456' });
    const vpa = s.ensureInstrument('u1', bank.id, { kind: 'vpa', issuer: 'HDFCBK', vpa: 'user@okhdfc' });
    expect(s.lines).toHaveLength(1);
    expect(debit.lineId).toBe(bank.id);
    expect(vpa.lineId).toBe(bank.id);
  });

  it('LINE-06 add-on/family card on same pool -> extra instrument, holder user-assigned', () => {
    const s = new LedgerStore();
    const pool = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    s.ensureInstrument('u1', pool.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '1234', holder: 'self' });
    const addon = s.ensureInstrument('u1', pool.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '7777', holder: 'wife add-on' });
    expect(addon.lineId).toBe(pool.id);
    expect(addon.holder).toBe('wife add-on');
  });

  it('LINE-07 SMS with no last-4 -> "unattributed at <issuer>" bucket, not a guessed card', () => {
    const s = new LedgerStore();
    const line = s.unattributedLine('u1', 'HDFCBK');
    expect(line.displayName).toBe('Unattributed at HDFCBK');
  });

  it('LINE-08 two issuers share a last-4 (1234) -> kept distinct by (issuer,last4,kind)', () => {
    const s = new LedgerStore();
    const hdfc = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    const icici = s.ensureCreditLine('u1', 'ICICIB', '1234');
    const a = s.ensureInstrument('u1', hdfc.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '1234' });
    const b = s.ensureInstrument('u1', icici.id, { kind: 'credit_card', issuer: 'ICICIB', last4: '1234' });
    expect(a.id).not.toBe(b.id);
    expect(a.lineId).not.toBe(b.lineId);
  });

  it('LINE-09 shared-pool detection: limits track -> suggest, default separate until confirmed', () => {
    const s = new LedgerStore();
    const a = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    const b = s.ensureCreditLine('u1', 'HDFCBK', '5678');
    a.availableCreditPaise = 15000000;
    b.availableCreditPaise = 15000000; // tracking
    expect(s.suggestSharedPool(a, b)).toBe(true);
    expect(s.lines).toHaveLength(2); // still separate until user confirms
  });

  it('LINE-03/LINE-10 pooled cards: spend on either draws ONE pool (no phantom-drop double-count)', () => {
    const s = new LedgerStore();
    const lineA = s.ensureCreditLine('u1', 'HDFCBK', '1234');
    const lineB = s.ensureCreditLine('u1', 'HDFCBK', '5678');
    s.ensureInstrument('u1', lineA.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '1234' });
    s.ensureInstrument('u1', lineB.id, { kind: 'credit_card', issuer: 'HDFCBK', last4: '5678' });
    s.confirmSharedPool(lineA.id, lineB.id);
    // both instruments now resolve to one line → a balance move is ONE line event, not two
    expect(new Set(s.instruments.map((i) => i.lineId)).size).toBe(1);
    expect(s.lines).toHaveLength(1);
  });
});
