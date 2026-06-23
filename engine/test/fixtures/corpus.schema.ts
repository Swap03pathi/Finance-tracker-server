/**
 * Fixtures format — the corpus IS the spec (doc 07 §13). Drop REAL messages into corpus.ts (or a
 * gitignored corpus/private set) using this shape; the matrix asserts against `expect`.
 * The synthetic set below is for development; swap in real bank formats when available.
 */
export interface CorpusMessage {
  id: string;
  sender: string; // DLT header e.g. "VM-HDFCBK" or a phone number for personal
  body: string; // raw SMS text
  expect: {
    gate: 'pass' | 'drop';
    dropReason?: 'personal' | 'otp' | 'promo' | 'denylist' | 'balance_only' | 'empty';
    fingerprintGroup?: string; // messages sharing a structural shape share this label
    fields?: {
      amountPaise?: number;
      direction?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'TOPUP';
      modality?: 'actual' | 'future' | 'conditional' | 'failed' | 'hold' | 'mandate';
      balanceAfterPaise?: number;
      last4?: string;
      merchant?: string;
    };
  };
}
