/**
 * @finman/shared-contracts — the device<->server wire contract (doc 07 §5).
 * zod schemas + inferred TS types for the Phase 1 surface. **Money crosses the wire as a STRING**
 * ("1234.50") and is converted with decimal.js on the server — never a JS number (doc 07 §1).
 */
import { z } from 'zod';

export const CONTRACTS_VERSION = '0.2.0';

/** Rupees as a fixed-point string, e.g. "1234.50" / "0.01". Server converts to paise. */
export const MoneyString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'money must be a rupee string like "1234.50"');

export const Direction = z.enum(['EXPENSE', 'INCOME', 'TRANSFER', 'TOPUP']);
export const Modality = z.enum(['actual', 'future', 'conditional', 'failed', 'hold', 'mandate']);
export const EntrySource = z.enum(['sms', 'cash', 'manual', 'aa', 'email', 'statement']);
export const InstrumentKind = z.enum(['credit_card', 'debit_card', 'vpa', 'netbanking']);

// ── auth ─────────────────────────────────────────────────────────────────────
export const AuthGoogleInput = z.object({ idToken: z.string().min(10) });
export type AuthGoogleInput = z.infer<typeof AuthGoogleInput>;

/** Pilot dev sign-in (doc 12 deviation, env-gated by ALLOW_DEV_AUTH) — replaced by Google in Phase 8. */
export const AuthDevInput = z.object({ deviceKey: z.string().min(8).max(128) });
export type AuthDevInput = z.infer<typeof AuthDevInput>;

// ── entries (idempotent upsert) ──────────────────────────────────────────────
/** How the device tells the server which line/instrument an entry belongs to (auto-discovery key). */
export const LineHint = z.object({
  issuer: z.string().nullable().optional(),
  last4: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  instrumentKind: InstrumentKind.optional(),
  lineKind: z.enum(['bank', 'credit_pool', 'wallet', 'loan']).optional(),
});
export type LineHint = z.infer<typeof LineHint>;

export const EntryInput = z.object({
  id: z.string().uuid(), // device-generated UUIDv5 — the idempotency key
  hint: LineHint,
  direction: Direction,
  modality: Modality,
  amountCaptured: MoneyString,
  amountEffective: MoneyString.optional(),
  balanceAfter: MoneyString.nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  tagId: z.string().uuid().nullable().optional(),
  merchantText: z.string().nullable().optional(),
  txnTime: z.string().datetime().nullable().optional(),
  receivedAt: z.string().datetime().nullable().optional(),
  source: EntrySource.default('sms'),
  messageId: z.string().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
});
export type EntryInput = z.infer<typeof EntryInput>;

export const EntriesUpsertInput = z.object({ entries: z.array(EntryInput).min(1).max(500) });
export type EntriesUpsertInput = z.infer<typeof EntriesUpsertInput>;

export const CorrectInput = z.object({
  amountEffective: MoneyString,
  reason: z.string().max(280).optional(),
});
export type CorrectInput = z.infer<typeof CorrectInput>;

// ── templates / induction ────────────────────────────────────────────────────
export const InduceInput = z.object({
  redactedSkeleton: z.string().min(1),
  fingerprint: z.string().min(8),
  issuer: z.string().nullable().optional(),
  examples: z.array(z.string()).optional(), // additional cluster skeletons for round-trip
});
export type InduceInput = z.infer<typeof InduceInput>;

// ── reads ────────────────────────────────────────────────────────────────────
export const DashboardQuery = z.object({ period: z.string().optional() });
export const BreakdownQuery = z.object({
  by: z.enum(['category', 'tag', 'line']),
  period: z.string().optional(),
});

export interface DashboardResponse {
  income: string;
  expenses: string;
  savings: string;
  balances: Array<{ lineId: string; balance: string | null }>;
  topCategory: { categoryId: number; amount: string } | null;
  biggestPayee: { payeeId: string; amount: string } | null;
  period: { label: string; isThin: boolean; days: number };
}
