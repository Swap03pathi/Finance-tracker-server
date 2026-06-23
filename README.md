# AI Personal CFO (Android MVP)

A single place to see *all* your money across every bank, card and wallet — built entirely from
transaction SMS, parsed **on-device**, with no bank credentials. Privacy-first, Android-first, India.

> Full specification lives in [`docs/`](./docs) (read `01`→`07` in order). Those docs are authoritative.

## Architecture in one line

The **device** decides *what a message means* (privately); the **server** is the *system of record* for
the structured result and does all cross-account math. Only two things ever leave the phone — the
**structured transaction** (real values, no raw text) and the **redacted skeleton** (no real values at all).
Raw SMS bodies are never persisted server-side (device-local + the user's own Google Drive).

## Resolved decisions (doc 07 §14)

| Decision | Choice |
|---|---|
| Money representation | `NUMERIC(14,2)` in Postgres + `decimal.js` on the app side — **never floats** |
| Mobile framework | Flutter (drift for local SQLite, native Android channel for SMS) |
| Dedup buffer window | 7 days |
| LLM induction | real-time, behind a swappable provider interface (OpenAI v1) |
| Backfill window | 14 days, per-user configurable |

## Monorepo layout

```
docs/                  # the authoritative spec (01–07)
packages/
  shared-contracts/    # zod schemas + TS types for the sync API
engine/                # framework-agnostic parsing core (gating, fingerprint, parseAmount, redaction)
  config/              # verbs, OTP/promo, PSP suffixes, DLT prefixes — DATA files, not code
  test/corpus/         # SMS dump corpus + golden fixtures (the spec for Phases 1–3)
server/                # NestJS backend + Prisma (the system of record)
  prisma/              # doc 04 schema, migrations (built first), seed
mobile/                # Flutter app (Phase 9)
```

Uses **npm workspaces** (pnpm not required).

## Getting started

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL etc.
npm run db:up                 # start Postgres 16 via docker compose
npm run prisma:migrate        # apply migrations
npm run seed                  # categories, own-node senders, merchant-VPA dictionary
```

No Docker? Point `DATABASE_URL` at any Postgres 15+ instance.

## Build order

Schema first (doc 04, as real migrations), then phase-by-phase per [`docs/06-task-list.md`](./docs/06-task-list.md).
**Critical path is Phases 1–4** (capture SMS into correct structured data). Each phase has an exit-test that
must pass before the next begins. Deferred features (AI advice, goals, Roast, auto self-transfer, AA/email/iOS)
are **not** built in v1.
