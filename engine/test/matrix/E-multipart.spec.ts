import { reassemble, SmsPart } from '../../src/parsing/multipart';
import { gate } from '../../src/gating/gate';

/**
 * Section E — Multipart / malformed SMS. 🟠
 */
describe('E. Multipart / malformed SMS 🟠', () => {
  it('MULTI-01 long SMS split into 2 parts -> reassembled before gating/fingerprint', () => {
    const parts: SmsPart[] = [
      { refId: 'r1', partIndex: 1, totalParts: 2, text: 'Rs.450.00 spent at Zomato via UPI ' },
      { refId: 'r1', partIndex: 2, totalParts: 2, text: 'from a/c **1234. Avl Bal Rs.12,000.00' },
    ];
    const r = reassemble(parts);
    expect(r.complete).toBe(true);
    expect(gate('VM-HDFCBK', r.body!).admit).toBe(true);
  });

  it('MULTI-02 parts arrive out of order -> reassembled correctly by ref id', () => {
    const parts: SmsPart[] = [
      { refId: 'r1', partIndex: 2, totalParts: 2, text: 'world' },
      { refId: 'r1', partIndex: 1, totalParts: 2, text: 'hello ' },
    ];
    expect(reassemble(parts).body).toBe('hello world');
  });

  it('MULTI-03 one part missing -> flagged, no half-parse', () => {
    const parts: SmsPart[] = [{ refId: 'r1', partIndex: 1, totalParts: 2, text: 'hello ' }];
    const r = reassemble(parts);
    expect(r.complete).toBe(false);
    expect(r.body).toBeNull(); // never half-parsed
    expect(r.missing).toEqual([2]);
  });
});
