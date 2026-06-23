/**
 * Golden-vector generator (doc 10 §3). Runs the TS reference engine over canonical inputs and writes
 * language-neutral JSON to /golden-vectors/. The Dart device port loads the SAME files and must
 * reproduce every value — especially the redaction vectors (a Dart redaction bug is a privacy breach
 * the server can't catch). Regenerate whenever parsing logic changes; commit the result.
 *
 * Run:  npx ts-node engine/scripts/gen-golden-vectors.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseAmount } from '../src/amount/parseAmount';
import { fingerprint } from '../src/fingerprint/fingerprint';
import { maskBody } from '../src/fingerprint/mask';
import { gate } from '../src/gating/gate';
import { CORPUS } from '../test/fixtures/corpus';

const OUT = path.resolve(__dirname, '../../golden-vectors');

// canonical amount inputs (mirrors matrix §B + sub-rupee/large)
const AMOUNTS = [
  'Rs 450', 'Rs.1,234.50', 'INR 1,23,456.78', '₹1.2L', 'Rs 1.2 lakh', '2.5Cr', '2.5 crore',
  'Rs 1.2k', 'Rs450', 'Rs 0.50', 'Rs 1,00,000', '₹0.10', '₹0.20', 'Rs 0.01', 'Rs 2.5Cr', 'Rs 4,5O.00',
];

// canonical fingerprint inputs — same shape/different merchant must share a hash (doc 10 §2.1)
const FINGERPRINTS = [
  'Rs.450.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00',
  'Rs.600.00 spent at Swiggy via UPI from a/c **1234 on 05-06-26. Avl Bal Rs.9,000.00',
  'Rs.1,250.00 spent at Big Bazaar via UPI from a/c **1234 on 06-06-26. Avl Bal Rs.7,750.00',
  'Your a/c XX3456 credited with Rs.65,000.00 on 01-06-26 by salary. Avl Bal Rs.85,000.00',
  'INR 2,300.00 spent on ICICI Card XX9012 at Flipkart on 04-06-26.',
];

// redaction inputs — corpus + adversarial notations; NONE may leak a 3+ digit run
const REDACTION = [
  ...CORPUS.map((m) => m.body),
  '₹1,23,456.78 debited', 'INR 2.5 crore credited', 'Rs 1.2L spent', 'Rupees 450 paid',
  'Amount 9,999/- withdrawn', 'debited Rs0.50', 'UPI Ref no 412345678901',
];

function write(name: string, vectors: unknown[]) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify({ version: 1, vectors }, null, 2) + '\n');
  // eslint-disable-next-line no-console
  console.log(`wrote ${name}: ${vectors.length} vectors`);
}

fs.mkdirSync(OUT, { recursive: true });

write(
  'amount-vectors.json',
  AMOUNTS.map((input) => {
    const r = parseAmount(input);
    return { input, paise: r.paise, confidence: r.confidence };
  }),
);

write(
  'fingerprint-vectors.json',
  FINGERPRINTS.map((input) => ({ input, fingerprint: fingerprint(input), skeleton: maskBody(input) })),
);

write(
  'redaction-vectors.json',
  REDACTION.map((input) => {
    const skeleton = maskBody(input);
    return { input, skeleton, leaks: /\d{3,}/.test(skeleton) || /(?:rs\.?|inr|₹|rupees)\s*\d/i.test(skeleton) };
  }),
);

write(
  'gate-vectors.json',
  CORPUS.map((m) => {
    const r = gate(m.sender, m.body);
    return { sender: m.sender, body: m.body, admit: r.admit, reason: r.reason };
  }),
);
