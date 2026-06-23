# CLAUDE.md — AI Personal CFO (server side)

This monorepo is the **server side** of the AI Personal CFO: the TypeScript reference engine
(`@finman/engine`), the NestJS + Prisma server, and the Postgres schema. The Flutter/Dart device app
is a **separate repo** that ports the engine's parsing logic and mirrors this repo's golden vectors.

> Authoritative spec: `docs/01`–`docs/10`. Where doc 10 conflicts with an earlier doc on a *decision*,
> doc 10 wins (it post-dates them). Read docs 04 (schema), 07 (constraints), 08 (tests), 10 (plan)
> before changing logic.

## Stack
- TypeScript / Node 24 · NestJS 10 · Prisma 5 · PostgreSQL 16
- `@finman/engine`: framework-free parsing/ledger logic (the reference spec for the Dart port)
- Jest + ts-jest · fast-check (invariant property tests)
- Infra: AWS EC2 + PM2 + RDS Postgres (no ECS/k8s)

## Non-negotiable constraints (doc 07 §15)
- **Money is `NUMERIC(14,2)` at rest, integer paise in compute. NEVER a float.**
- **No unmasked message content** ever goes to the LLM or any server. Redaction is enforced
  device-side AND server-side; the fingerprint masker and the redactor are the SAME code path.
- **Raw SMS bodies are never persisted server-side** (device-local + the user's Google Drive only).
- `amount_captured` is immutable; corrections write `amount_effective`; both retained.
- TRANSFER / TOPUP / future / hold / mandate / failed never count toward income or expense.
- by-tag totals must always reconcile to by-category totals (single-tag invariant).
- Period-honest UI: never imply a full month when only ~2 weeks of data exist.
- Do NOT build deferred features (AI advice, goals, Money Roast, auto self-transfer, AA/email/iOS).

## Two-language lockstep (doc 10 §3)
Parsing lives in BOTH this TS engine (reference) and the Dart device port. They must never drift:
- Engine test cases are extracted to language-neutral **`/golden-vectors/*.json`** (input → expected
  fingerprint / fields / redacted skeleton / gate outcome).
- Any change to parsing logic MUST regenerate the vectors and pass in BOTH languages.
- The **redaction vectors are the highest priority** — a Dart redaction bug is a privacy breach the
  server cannot catch.

## Workflow
- **One phase = one branch = one PR.** Current branch: `phase-0-fixes-infra`.
- **Fail-first for bug fixes:** write the regression test, watch it RED, then fix. NEVER edit a test
  to make it pass.
- `git push` and any `prisma migrate` against a real DB / AWS deploy are **manual** (ask first).
- **STOP at the end of Phase 4 and dogfood on the real inbox** before building Phases 5–9. This is the
  most important sequencing rule — until Phase 4, all green tests are self-consistency, not correctness.

## Build order (doc 10 §4)
Phase 0 (fixes + infra) → 1 (server API) ∥ 2 (Dart port) → 3 (device core) → 4 (E2E + DOGFOOD · STOP)
→ 5 (payee/tag) ∥ 6 (recon) → 7 (settlement) → 8 (liabilities/debt) → 9 (hardening).
Critical path is 0–4. Do not jump ahead.

## Commands
```bash
cd engine && npx jest            # full matrix + invariants
npx jest test/golden             # golden-vector lockstep
cd server && npx prisma validate # schema check
```
