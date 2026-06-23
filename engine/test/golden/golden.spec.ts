import * as fs from 'fs';
import * as path from 'path';
import { parseAmount } from '../../src/amount/parseAmount';
import { fingerprint } from '../../src/fingerprint/fingerprint';
import { maskBody } from '../../src/fingerprint/mask';
import { gate } from '../../src/gating/gate';

/**
 * Golden-vector lockstep (doc 10 §3). The committed /golden-vectors/*.json are the language-neutral
 * contract the Dart device port must also satisfy. This test asserts the TS engine still reproduces
 * every vector — so a parsing change that forgets to regenerate (or that drifts) fails CI here.
 * Redaction vectors are the highest-priority set.
 */
const DIR = path.resolve(__dirname, '../../../golden-vectors');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')).vectors;

describe('Golden vectors — TS engine reproduces the committed contract 🔴', () => {
  it('amount-vectors.json', () => {
    for (const v of load('amount-vectors.json') as Array<{ input: string; paise: number | null; confidence: string }>) {
      const r = parseAmount(v.input);
      expect(`${v.input} => ${r.paise}/${r.confidence}`).toBe(`${v.input} => ${v.paise}/${v.confidence}`);
    }
  });

  it('fingerprint-vectors.json (incl. merchant-independence)', () => {
    for (const v of load('fingerprint-vectors.json') as Array<{ input: string; fingerprint: string; skeleton: string }>) {
      expect(fingerprint(v.input)).toBe(v.fingerprint);
      expect(maskBody(v.input)).toBe(v.skeleton);
    }
  });

  it('redaction-vectors.json — every skeleton matches AND leaks nothing', () => {
    for (const v of load('redaction-vectors.json') as Array<{ input: string; skeleton: string; leaks: boolean }>) {
      expect(maskBody(v.input)).toBe(v.skeleton);
      expect(v.leaks).toBe(false); // the committed contract must never carry a leak
      expect(/\d{3,}/.test(maskBody(v.input))).toBe(false);
    }
  });

  it('gate-vectors.json', () => {
    for (const v of load('gate-vectors.json') as Array<{ sender: string; body: string; admit: boolean; reason: string }>) {
      const r = gate(v.sender, v.body);
      expect(`${r.admit}/${r.reason}`).toBe(`${v.admit}/${v.reason}`);
    }
  });
});
