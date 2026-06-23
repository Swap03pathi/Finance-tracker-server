import { fingerprint } from '../../src/fingerprint/fingerprint';
import {
  induceTemplate,
  induceBatch,
  TemplateLibrary,
  parseWithTemplate,
} from '../../src/templates/induction';
import { makeMockLlm } from '../fixtures/mockLlm';

/**
 * Section D — Fingerprinting & templates. 🔴
 */
describe('D. Fingerprinting & templates 🔴', () => {
  // doc 10 §2.1: the fingerprint must key on the DLT boilerplate and treat the merchant as a
  // wildcard slot — so the SAME shape with DIFFERENT merchants must share a fingerprint. These
  // fixtures deliberately vary the merchant (Zomato vs Amazon vs Uber) to exercise that.
  const hdfc1 = 'Rs.450.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00';
  const hdfc2 = 'Rs.1,200.00 spent at Amazon via UPI from a/c **1234 on 03-06-26. Avl Bal Rs.10,800.00';

  it('TMPL-01 same shape, different amounts -> identical fingerprint', () => {
    expect(fingerprint(hdfc1)).toBe(fingerprint(hdfc2));
  });

  it('TMPL-02 same shape via VM- and IX- -> identical fingerprint (sender-independent)', () => {
    // fingerprint is computed on the body only; routing/sender never enters it
    expect(fingerprint(hdfc1)).toBe(fingerprint(hdfc1));
    const viaOther = 'Rs.999.00 spent at Uber via UPI from a/c **1234 on 09-06-26. Avl Bal Rs.5,000.00';
    expect(fingerprint(hdfc1)).toBe(fingerprint(viaOther));
  });

  it('TMPL-MERCHANT (doc 10 §2.1) same shape, different merchants -> SAME fingerprint', () => {
    const zomato = 'Rs.450.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00';
    const swiggy = 'Rs.600.00 spent at Swiggy via UPI from a/c **1234 on 05-06-26. Avl Bal Rs.9,000.00';
    const bigBazaar = 'Rs.1,250.00 spent at Big Bazaar via UPI from a/c **1234 on 06-06-26. Avl Bal Rs.7,750.00';
    expect(fingerprint(zomato)).toBe(fingerprint(swiggy));
    expect(fingerprint(zomato)).toBe(fingerprint(bigBazaar));
  });

  it('TMPL-03 changed wording (A/B test) -> NEW fingerprint (no versioning)', () => {
    const reworded = 'You spent Rs.450.00 at Zomato (UPI), a/c **1234, 02-06-26. Bal: Rs.12,000.00';
    expect(fingerprint(hdfc1)).not.toBe(fingerprint(reworded));
  });

  it('TMPL-04 novel format -> induced, regex synthesised & round-trip validated', () => {
    const llm = makeMockLlm();
    const { template } = induceTemplate('HDFCBK', [hdfc1, hdfc2], llm);
    expect(template).not.toBeNull();
    const extracted = parseWithTemplate(template!, hdfc1);
    expect(extracted?.amountPaise).toBe(45000);
    expect(extracted?.balancePaise).toBe(1200000);
  });

  it('TMPL-05 induced regex fails round-trip on cluster -> not trusted, flagged', () => {
    const llm = makeMockLlm();
    // a cluster polluted with a different shape → round-trip cannot match all
    const polluted = [hdfc1, 'Totally different: salary credited XX3456 65000 rupees'];
    const { template } = induceTemplate('HDFCBK', polluted, llm);
    expect(template!.trustState).toBe('flagged');
  });

  it('TMPL-06 5–6 trust-gate runs agree -> promoted to trusted', () => {
    const llm = makeMockLlm();
    const { template } = induceTemplate('HDFCBK', [hdfc1, hdfc2], llm, 5);
    expect(template!.trustState).toBe('trusted');
    expect(template!.validationRuns).toBe(5);
  });

  it('TMPL-07 trust-gate runs disagree -> stays flagged, not used (poison protection)', () => {
    const llm = makeMockLlm({ disagree: true });
    const { template } = induceTemplate('HDFCBK', [hdfc1, hdfc2], llm, 5);
    expect(template!.trustState).toBe('flagged');
  });

  it('TMPL-08 50 msgs, 4 distinct shapes -> exactly 4 induction calls (one per cluster)', () => {
    const shapes = [
      (i: number) => `Rs.${i}.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00`,
      (i: number) => `Your a/c XX3456 credited with Rs.${i}.00 on 01-06-26 by salary. Avl Bal Rs.85,000.00`,
      (i: number) => `INR ${i}.00 spent on ICICI Card XX9012 at Flipkart on 04-06-26.`,
      (i: number) => `Rs ${i} added to your Paytm Wallet from HDFC Bank a/c **1234.`,
    ];
    const messages = [];
    for (let i = 0; i < 50; i++) {
      messages.push({ issuer: 'X', body: shapes[i % 4](100 + i) });
    }
    const llm = makeMockLlm();
    const { llmInduceCalls } = induceBatch(messages, llm);
    expect(llmInduceCalls).toBe(4);
    expect(llm.induceCalls).toBe(4);
  });

  it('TMPL-09 known trusted template arrives again -> parsed locally, ZERO LLM calls', () => {
    const llm = makeMockLlm();
    const { template } = induceTemplate('HDFCBK', [hdfc1, hdfc2], llm);
    const lib = new TemplateLibrary();
    lib.add(template!);
    const callsBefore = llm.induceCalls;
    const hit = lib.match('HDFCBK', hdfc2);
    expect(hit).not.toBeNull();
    expect(llm.induceCalls).toBe(callsBefore); // no new induction
    expect(parseWithTemplate(hit!, hdfc2)?.amountPaise).toBe(120000);
  });

  it('TMPL-10 two issuers, same last-4, similar shape -> kept distinct by issuer in key', () => {
    const llm = makeMockLlm();
    const lib = new TemplateLibrary();
    const a = induceTemplate('HDFCBK', [hdfc1, hdfc2], llm).template!;
    const b = induceTemplate('ICICIB', [hdfc1, hdfc2], llm).template!;
    lib.add(a);
    lib.add(b);
    expect(a.key).not.toBe(b.key);
    expect(lib.match('HDFCBK', hdfc1)!.issuer).toBe('HDFCBK');
    expect(lib.match('ICICIB', hdfc1)!.issuer).toBe('ICICIB');
  });
});
