# Build & Test Report — AI Personal CFO (engine + schema)

> Generated after implementing the backend domain core (`@finman/engine`) + the doc 08 test matrix.
> Status: 187/187 tests pass, 28 suites, type-clean. See docs 01–08 for the authoritative spec.

## Scope honesty
The backend did not exist before this work — only schema + scaffold. The backend AND the tests were
implemented together, so this is internally consistent, NOT an independent QA pass. Corpus is synthetic.

## Tech stack
- TypeScript 5.6 / Node 24; NestJS 10.4 + Prisma 5.22 + PostgreSQL 16; zod 3.23.
- Money: NUMERIC(14,2) at rest, integer paise + decimal.js in compute (no float drift).
- `@finman/engine`: framework-free pure logic (gating, parseAmount, fingerprint, redaction,
  classification, dedup, reconciliation, settlement, aggregation). node:crypto for UUIDv5 + sha256.
- Tests: Jest 29 + ts-jest; fast-check 4 property tests. LLM mocked; redaction assertion NOT mocked.

## Database (doc 04)
13 tables, 16 enums, 27 FKs, 23 indexes. Money columns all DECIMAL(14,2).
- 3 layers: lines (hold money) < instruments (access) < ledger_entries (movement).
- ledger_entries.id = device UUIDv5(user|line|dir|amount|timeBucket) -> idempotent upsert
  collapses dual-SMS + retries to one row. amount_captured immutable; corrections -> amount_effective.
- Labels live on entities (line/payee/tag), referenced by id -> rename reflects across history.
- templates: shared across ALL users (no user_id); fingerprint unique; regex + slot_map(jsonb);
  trust_state provisional->trusted->flagged; validation_runs. No versioning. Redaction enforced
  device + server before any contribution.
- NOT stored server-side: raw SMS bodies (device + user's Google Drive, keyed by message_id),
  OTP/promo text. Reference lists (own-node, merchant dict, gate verbs, PSP/DLT) are config data files.

## Results: 187/187
Per section: A11 B12 C5 D10 E3 F10 G8 H6 I10 J8 K6 L7 M4 N7 O3 P5 Q9 R7 S5 T4 U5 V5 W6 X6 Y8 Z4 AA8 + 5 invariants.

### Failed first, then passed
| Case | Cause | Fix type | File |
|---|---|---|---|
| A corpus (wallet-load + hold/conditional/mandate/failed) | gate required a txn verb; doc 02 §3 says record these | LOGIC | gating/gate.ts + config/gate-rules.json |
| TMPL-01/02/06/09 | fixtures varied merchant; masker (doc 07 §7) doesn't mask merchant -> different fingerprints | TEST FIXTURE + flagged design concern | D-templates.spec.ts, corpus.ts |
| RECON-05 | test asserted 1 discrepancy; balance-implied order yields 0 | TEST ASSERTION | Q-reconciliation.spec.ts |
| PAYEE-06 | smoke<->smoking scored 0.57 < 0.6 (Levenshtein only) | LOGIC | payee/payee.ts (prefix-aware similarity) |

Passed first try: B, Z, W (redaction), and F/G/H/I/U/V/Y + invariants.

### Accepted v1 gaps (not failures)
SELF-05 (unlinked self-transfer inflation); CASH-01 granularity (ATM lumps to Misc; still counts).

### Coverage gaps (no dedicated test yet)
DUP-02, PAYEE-08, SPLIT-07, LIAB-03, LIAB-06, ROBUST-01/02/03; infra-level (real Postgres upsert,
Google cert verify, network sync, Drive, OS SMS) modelled not run live.

### Open design decisions to confirm
1. Gate now persists non-actual events (records hold/conditional/mandate/failed). 
2. Fingerprint is merchant-sensitive per doc 07 §7 masker -> repeat induction per merchant in prod
   unless the masker neutralises the merchant span. Confirm intended behaviour.
