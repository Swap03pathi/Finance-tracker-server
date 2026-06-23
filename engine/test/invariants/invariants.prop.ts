import * as fc from 'fast-check';
import { headline, byCategory, byTag, sumMap } from '../../src/aggregation/aggregate';
import { computeIsCounted } from '../../src/ledger/counted';
import { LedgerStore } from '../../src/ledger/store';
import { maskBody } from '../../src/fingerprint/mask';
import { assertRedacted } from '../../src/redaction/redact';
import { Direction, Modality, LedgerEntry } from '../../src/types';
import { makeEntry } from '../fixtures/factory';

/**
 * Invariants as PROPERTY tests (doc 04 §6, doc 07 §13) — must hold for ALL inputs, not just examples.
 */
const DIRECTIONS: Direction[] = ['EXPENSE', 'INCOME', 'TRANSFER', 'TOPUP'];
const MODALITIES: Modality[] = ['actual', 'future', 'conditional', 'failed', 'hold', 'mandate'];

const arbEntry = fc.record({
  direction: fc.constantFrom<Direction>(...DIRECTIONS),
  modality: fc.constantFrom<Modality>(...MODALITIES),
  amountCapturedPaise: fc.integer({ min: 1, max: 5_000_00 }),
  categoryId: fc.integer({ min: 1, max: 12 }),
  tagId: fc.option(fc.constantFrom('t1', 't2', 't3', 't4'), { nil: null }),
}).map((p) =>
  makeEntry({ ...p, amountEffectivePaise: p.amountCapturedPaise }),
);

describe('Invariants (property tests) 🔴', () => {
  it('INV: by-tag total == by-category total == grand expense total (single-tag)', () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 200 }), (entries) => {
        const cat = sumMap(byCategory({ entries }));
        const tag = sumMap(byTag({ entries }));
        const grand = headline({ entries }).expensePaise;
        return cat === tag && tag === grand;
      }),
    );
  });

  it('INV: TRANSFER/TOPUP and non-actual modalities are NEVER counted', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Direction>(...DIRECTIONS),
        fc.constantFrom<Modality>(...MODALITIES),
        (direction, modality) => {
          const counted = computeIsCounted(direction, modality);
          if (direction === 'TRANSFER' || direction === 'TOPUP') return counted === false;
          if (modality !== 'actual') return counted === false;
          return counted === true;
        },
      ),
    );
  });

  it('INV: amount_captured is immutable across corrections; effective may change', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000_00 }),
        fc.integer({ min: 1, max: 5_000_00 }),
        (captured, corrected) => {
          const s = new LedgerStore();
          const e: LedgerEntry = s.upsertEntry(makeEntry({ id: 'x', amountCapturedPaise: captured, amountEffectivePaise: captured }));
          s.applyCorrection('x', corrected);
          return e.amountCapturedPaise === captured && e.amountEffectivePaise === corrected;
        },
      ),
    );
  });

  it('INV: savings == income − expenses, always', () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 200 }), (entries) => {
        const h = headline({ entries });
        return h.savingsPaise === h.incomePaise - h.expensePaise;
      }),
    );
  });

  it('INV: the redaction/mask path leaks zero amount-like values, for ANY currency notation', () => {
    const notations = ['Rs ', 'Rs.', 'INR ', '₹', 'Rupees ', ''];
    const suffixes = ['', 'k', 'L', 'Cr', '/-', '.00', '.50'];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_99_99_999 }),
        fc.constantFrom(...notations),
        fc.constantFrom(...suffixes),
        (n, cur, suf) => {
          const body = `${cur}${n.toLocaleString('en-IN')}${suf} debited from a/c XX1234`;
          const skeleton = maskBody(body);
          // must not throw, and no 3+ digit run survives
          assertRedacted(skeleton);
          return !/\d{3,}/.test(skeleton);
        },
      ),
    );
  });
});
