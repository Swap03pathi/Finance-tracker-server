import {
  normalizeVpaKey,
  classifyCounterparty,
  effectiveCategoryId,
  effectiveTagId,
  fuzzyMatchTag,
} from '../../src/payee/payee';
import { Payee } from '../../src/types';
import { makeEntry } from '../fixtures/factory';

/**
 * Section J — UPI payee identity & tagging. 🟠 (PAYEE-05/09 are 🔴).
 */
describe('J. UPI payee identity & tagging', () => {
  const payee = (over: Partial<Payee> = {}): Payee => ({
    id: 'p1',
    userId: 'u1',
    normalizedKey: '9876543210',
    rawVpas: ['9876543210@ybl'],
    counterpartyType: 'person',
    isUserConfirmed: false,
    ...over,
  });

  it('PAYEE-01 new VPA -> payee auto-created (provisional)', () => {
    const p = payee();
    expect(p.isUserConfirmed).toBe(false);
    expect(p.normalizedKey).toBe('9876543210');
  });

  it('PAYEE-02 name@paytm and 9876543210@okaxis -> normalised local-parts', () => {
    expect(normalizeVpaKey('ramesh@paytm')).toBe('ramesh');
    expect(normalizeVpaKey('9876543210@okaxis')).toBe('9876543210');
  });

  it('PAYEE-03 label once -> all 14 past txns retroactively tagged (label on entity)', () => {
    const labelled = payee({ defaultCategoryId: 1, defaultTagId: 'tag-snacks', isUserConfirmed: true });
    const past = Array.from({ length: 14 }, (_, i) => makeEntry({ id: `e${i}`, payeeId: 'p1', categoryId: null, tagId: null }));
    // entries reference the payee; effective tag resolves from the entity → all 14 tagged at once
    for (const e of past) {
      expect(effectiveTagId(e, labelled)).toBe('tag-snacks');
      expect(effectiveCategoryId(e, labelled)).toBe(1);
    }
  });

  it('PAYEE-04 next payment to that VPA -> auto-tagged from payee default', () => {
    const labelled = payee({ defaultTagId: 'tag-snacks' });
    const next = makeEntry({ payeeId: 'p1', tagId: null });
    expect(effectiveTagId(next, labelled)).toBe('tag-snacks');
  });

  it('PAYEE-05 🔴 rename/re-tag later -> reflects across ALL history (label on entity, not txn)', () => {
    const p = payee({ defaultTagId: 'tag-old' });
    const e = makeEntry({ payeeId: 'p1', tagId: null });
    expect(effectiveTagId(e, p)).toBe('tag-old');
    p.defaultTagId = 'tag-new'; // re-tag the entity
    expect(effectiveTagId(e, p)).toBe('tag-new'); // historical entry reflects it, no per-txn copy
  });

  it('PAYEE-06 create "smoke", later "smoking" -> fuzzy-match suggests existing', () => {
    expect(fuzzyMatchTag('smoking', ['smoke', 'tea', 'juice'])).toBe('smoke');
    expect(fuzzyMatchTag('ciggarette', ['cigarette'])).toBe('cigarette');
    expect(fuzzyMatchTag('rent', ['smoke', 'tea'])).toBeNull();
  });

  it('PAYEE-07 override one txn\'s tag -> only that txn changes; payee default unchanged', () => {
    const p = payee({ defaultTagId: 'tag-snacks' });
    const overridden = makeEntry({ payeeId: 'p1', tagId: 'tag-charger' }); // per-txn override
    expect(effectiveTagId(overridden, p)).toBe('tag-charger'); // this txn
    expect(p.defaultTagId).toBe('tag-snacks'); // payee default untouched
  });

  it('PAYEE-10 bare phone-VPA, user ignores prompt -> stays unclassified, NOT silently counted', () => {
    const p = payee({ counterpartyType: 'unknown', isUserConfirmed: false });
    const unresolved = makeEntry({ payeeId: 'p1', isCounted: false }); // not counted until resolved
    expect(p.isUserConfirmed).toBe(false);
    expect(unresolved.isCounted).toBe(false);
  });

  it('classifyCounterparty: phone-VPA -> person; merchant-string -> merchant', () => {
    expect(classifyCounterparty('9876543210@ybl')).toBe('person');
    expect(classifyCounterparty('zomato@hdfcbank', 'Zomato')).toBe('merchant');
  });
});
