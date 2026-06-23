import { CorpusMessage } from './corpus.schema';

/**
 * SYNTHETIC labelled corpus (HDFC / SBI / ICICI / Paytm / Slice shapes). Development-only — these
 * are hand-written in the style of real Indian bank/UPI SMS, NOT real messages. Replace/augment
 * with a real dump in a gitignored corpus/private set (doc 07 §13). Field values are integer paise.
 */
export const CORPUS: CorpusMessage[] = [
  // ── HDFC bank debit (UPI) ──
  {
    id: 'hdfc-upi-debit-01',
    sender: 'VM-HDFCBK',
    body: 'Rs.450.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00',
    expect: {
      gate: 'pass',
      fingerprintGroup: 'hdfc-upi-debit',
      fields: { amountPaise: 45000, direction: 'EXPENSE', modality: 'actual', balanceAfterPaise: 1200000, last4: '1234', merchant: 'Zomato' },
    },
  },
  {
    id: 'hdfc-upi-debit-02',
    sender: 'IX-HDFCBK', // different operator prefix, SAME shape & merchant (shared fingerprint)
    body: 'Rs.1,200.00 spent at Zomato via UPI from a/c **1234 on 03-06-26. Avl Bal Rs.10,800.00',
    expect: {
      gate: 'pass',
      fingerprintGroup: 'hdfc-upi-debit',
      fields: { amountPaise: 120000, direction: 'EXPENSE', modality: 'actual', balanceAfterPaise: 1080000, last4: '1234', merchant: 'Zomato' },
    },
  },
  // ── SBI salary credit ──
  {
    id: 'sbi-salary-credit-01',
    sender: 'JD-SBIINB-S',
    body: 'Your a/c XX3456 credited with Rs.65,000.00 on 01-06-26 by salary. Avl Bal Rs.85,000.00',
    expect: {
      gate: 'pass',
      fingerprintGroup: 'sbi-credit',
      fields: { amountPaise: 6500000, direction: 'INCOME', modality: 'actual', balanceAfterPaise: 8500000, last4: '3456' },
    },
  },
  // ── ICICI card spend ──
  {
    id: 'icici-card-spend-01',
    sender: 'BZ-ICICIB-T',
    body: 'INR 2,300.00 spent on ICICI Card XX9012 at Flipkart on 04-06-26.',
    expect: {
      gate: 'pass',
      fingerprintGroup: 'icici-card-spend',
      fields: { amountPaise: 230000, direction: 'EXPENSE', modality: 'actual', last4: '9012', merchant: 'Flipkart' },
    },
  },
  // ── Paytm wallet load (transfer) ──
  {
    id: 'paytm-wallet-load-01',
    sender: 'VM-PAYTM',
    body: 'Rs 5,000 added to your Paytm Wallet from HDFC Bank a/c **1234.',
    expect: {
      gate: 'pass',
      fingerprintGroup: 'paytm-load',
      fields: { amountPaise: 500000, direction: 'TRANSFER', modality: 'actual' },
    },
  },
  // ── Slice future/SIP (tense trap) ──
  {
    id: 'sbi-sip-future-01',
    sender: 'JD-SBIINB',
    body: 'Rs.5,000.00 will be debited on 05-06-26 for your SIP via mandate.',
    expect: {
      gate: 'pass',
      fingerprintGroup: 'sbi-future',
      fields: { amountPaise: 500000, modality: 'future' },
    },
  },
  // ── declined (failed) ──
  {
    id: 'hdfc-declined-01',
    sender: 'VM-HDFCBK',
    body: 'Txn of Rs.1,200.00 on Card XX1234 was declined due to insufficient balance.',
    expect: { gate: 'pass', fields: { amountPaise: 120000, modality: 'failed' } },
  },
  // ── hold / pre-auth ──
  {
    id: 'hdfc-hold-01',
    sender: 'VM-HDFCBK',
    body: 'Rs.3,000.00 blocked on Card XX1234 for hotel booking pre-authorization.',
    expect: { gate: 'pass', fields: { amountPaise: 300000, modality: 'hold' } },
  },
  // ── payment request (conditional) ──
  {
    id: 'upi-collect-01',
    sender: 'VM-HDFCBK',
    body: 'Ramesh has requested Rs.500.00 via UPI. Approve in your app.',
    expect: { gate: 'pass', fields: { amountPaise: 50000, modality: 'conditional' } },
  },
  // ── mandate setup ──
  {
    id: 'netflix-mandate-01',
    sender: 'VM-HDFCBK',
    body: 'Mandate created for Rs.2,000.00/month at Netflix via UPI Autopay.',
    expect: { gate: 'pass', fields: { amountPaise: 200000, modality: 'mandate' } },
  },

  // ── DROPS ──
  {
    id: 'personal-01',
    sender: '+919876543210',
    body: 'Rs 500 sent, please confirm',
    expect: { gate: 'drop', dropReason: 'personal' },
  },
  {
    id: 'otp-01',
    sender: 'VM-HDFCBK',
    body: 'Your OTP is 432189, do not share with anyone.',
    expect: { gate: 'drop', dropReason: 'otp' },
  },
  {
    id: 'promo-01',
    sender: 'VM-HDFCBK',
    body: 'Flat 50% off! Shop now and pay Rs 999. Limited offer.',
    expect: { gate: 'drop', dropReason: 'promo' },
  },
  {
    id: 'promo-cashback-01',
    sender: 'VM-PAYTM',
    body: 'You won a cashback Rs 50 credited! Claim now.',
    expect: { gate: 'drop', dropReason: 'promo' },
  },
  {
    id: 'balance-only-01',
    sender: 'VM-HDFCBK',
    body: 'Balance is Rs 5,000 in your a/c XX1234.',
    expect: { gate: 'drop', dropReason: 'balance_only' },
  },
  {
    id: 'terse-spend-01',
    sender: 'VM-HDFCBK',
    body: 'Rs 450 spent at Zomato',
    expect: { gate: 'pass', fields: { amountPaise: 45000, direction: 'EXPENSE', modality: 'actual' } },
  },
];

/** Convenience: messages that share a structural shape (for fingerprint clustering tests). */
export function byFingerprintGroup(group: string): CorpusMessage[] {
  return CORPUS.filter((m) => m.expect.fingerprintGroup === group);
}
