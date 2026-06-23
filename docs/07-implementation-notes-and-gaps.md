# Implementation Notes & Gaps — AI Personal CFO (Android MVP)

> Companion to docs 01–06. These are **coding-level specifics** the planning docs left implicit. Read this alongside them before writing code. Where a doc and this file conflict on a *decision*, the docs win; where this file adds *concrete detail*, it governs.

---

## 1. Money & numeric handling — NON-NEGOTIABLE

**Never use floating-point for money.** Floats silently corrupt totals (₹0.1 + ₹0.2 ≠ ₹0.3), and this app's entire value is correct totals.

- Store **all monetary values as integer paise** (`bigint`), e.g. ₹1,234.50 → `123450`. Or use Postgres `NUMERIC(14,2)` with a decimal library on the app side — pick one, never JS `number` for money.
- On the device/TypeScript side use a decimal library (e.g. `decimal.js` / `big.js`) or integer paise end-to-end. No `parseFloat` arithmetic on amounts.
- Format to ₹ only at the presentation layer.

**Indian number parsing** — the parser must handle all of:
- `1,23,456.78` (Indian grouping: last 3 then 2s) and `1,234.56` (Western).
- `1.2L` / `1.2 lakh` → 120000.00; `2.5Cr` / `2.5 crore` → 25000000.00; `1.2k` → 1200.00.
- `Rs`, `Rs.`, `INR`, `₹`, `Rs ` with/without spaces.
- Amounts with no decimals (`Rs 450`) and with (`Rs 450.00`).
Write this as a single well-tested `parseAmount(str) → paise` function with a big fixture table from the real SMS corpus.

---

## 2. Tech stack — concretes to pick (recommendations, not mandates)

| Layer | Recommendation | Why |
|---|---|---|
| Backend framework | **NestJS** (or Fastify) on Node + TS | Structured modules map cleanly to the services in doc 03. |
| ORM / migrations | **Prisma** (or Drizzle) | Typed schema, first-class migrations matching doc 04. |
| Validation | **zod** | Validate every synced payload at the boundary. |
| DB | **PostgreSQL 15+** | Per spec. |
| Mobile | **Flutter** — *decide now* | SMS reading needs native platform channels either way; Flutter gives one codebase + good native-channel ergonomics. RN is fine if the team prefers it. |
| On-device store | **SQLite** (drift/sqflite for Flutter) | Device needs its own local DB — see §3. |
| Background SMS | Native Android `BroadcastReceiver` + a foreground/work job | Real-time capture + periodic backfill sweep. |
| LLM | **OpenAI** behind a provider interface | Swappable; rare calls. |
| Auth | **Google Sign-In** + backend ID-token verification | Identity + Drive scope. |

> **Decision still open:** Flutter vs RN. Everything below is framework-agnostic; only the SMS-reading and SQLite plumbing differ.

---

## 3. On-device architecture (the docs describe the server; the device needs its own design)

The phone is not a thin client — it parses, stores raw, queues, and syncs. It needs a **local SQLite store**:

- `local_raw_messages` — raw body, sender, sms timestamp, message_id, processed flag. **Never synced.** Backed up to user's Google Drive.
- `local_template_cache` — trusted templates pulled from the shared library + any awaiting server confirmation.
- `local_outbox` — structured entries pending sync (offline-first queue).
- `local_state` — last-sync cursor, backfill checkpoint, own-node registry mirror.

**Offline-first is mandatory** (mobile networks drop). Parse and store locally always; sync is a separate, retryable step that drains the outbox.

---

## 4. ID generation & sync idempotency — easy to get wrong

Real-time sync + retries = **duplicate-insert risk**. Defend against it:

- Generate the `ledger_entries.id` as a **UUID on the device**, deterministically where possible (e.g. `uuidv5(namespace, message_id + line_key + amount + direction)`), so a retried sync of the same transaction collides instead of duplicating.
- Backend upserts on that id (idempotent `INSERT ... ON CONFLICT DO NOTHING/UPDATE`).
- This also dedups the SMS-level double-count (bank SMS + UPI-app SMS for one payment) when they resolve to the same logical event — combine with the time-window dedup from doc 03.
- `message_id` is device-local; the **structured entry id** is the cross-device key.

---

## 5. API surface — concrete endpoints (doc 03 named services, not routes)

Minimal v1 REST surface (all under `/v1`, all require a verified Google session):

```
POST   /auth/google            { idToken } → session
GET    /templates?since=...    → trusted templates for local cache
POST   /templates/induce       { redactedSkeleton, fingerprint, issuer } → template | provisional
POST   /entries                { entry[] }  (idempotent upsert, batched ok)
PATCH  /entries/:id            { tag_id?, category_id?, amount_effective?, ... }
POST   /entries/:id/correct    { amount_effective, reason }  (keeps amount_captured)
GET    /entries?from&to&line   → ledger view
POST   /settlements            { base_entry_id, settle_entry_id?, kind, expected_amount? }
PATCH  /settlements/:id        { status, settled_amount, note }
GET    /lines | /instruments | /payees | /tags   (CRUD where user-editable)
PATCH  /lines/:id              { display_name?, accrues_daily_interest?, ... }
POST   /payees/:id/confirm     { display_name, default_category_id, default_tag_id }
GET    /discrepancies?status=open
PATCH  /discrepancies/:id      { status, resolution }
GET    /dashboard?period       → { income, expenses, savings, balances, top_category, biggest_payee }
GET    /breakdown?by=category|tag|line&period
```

**The induce endpoint is the only one that receives message-derived structure** — and it must receive *only* a redacted skeleton, validated server-side (reject if any digit-run that looks like an amount/balance survives).

---

## 6. Concrete rule lists (seed these; expand from the corpus)

These are starting lists — the **living rule-set** (doc 02) grows them against real dumps.

- **Transaction verbs (gate pass):** debited, credited, spent, withdrawn, transferred, paid, received, sent, purchase, deducted, debit, credit.
- **OTP/promo/failed (gate reject):** OTP, one time password, do not share, do NOT share, code is, offer, sale, win, won, cashback (when promotional), discount, expires, click, claim, declined, failed, could not, unsuccessful, reversed (context-dependent — reversal of a *txn* is a refund signal, not always a reject).
- **Future/scheduled:** will be debited, scheduled, due on, autopay, e-mandate, standing instruction, EMI due.
- **Conditional:** has requested, requesting, collect request, payment request.
- **Hold:** blocked, on hold, hold of, pre-auth, authorization.
- **Mandate:** mandate created, mandate registered, autopay set up.
- **Refund:** refund, refunded, reversal of, credited back, returned.
- **PSP suffixes (strip to find local-part for payee key):** @ybl, @okhdfcbank, @okaxis, @okicici, @oksbi, @paytm, @ibl, @axl, @upi, @apl, @yapl, @ptyes, @pthdfc — list is long; maintain as data, not code.
- **DLT operator prefixes (strip):** leading 2-char + hyphen (`VM-`, `VX-`, `IX-`, `JD-`, `AX-`, `BP-`, `CP-`, `JM-`, `TX-`...) and trailing category suffix (`-S`, `-T`, `-P`, `-G`). Normalise to the middle entity token.

> Maintain all of these as **config/data files**, not hardcoded constants, so they update without a release.

---

## 7. Fingerprint algorithm (doc described intent; here's the spec)

```
fingerprint(body):
  s = body.lower().strip()
  s = replace_amounts(s, "§AMT§")        # any Rs/₹/INR + number, incl L/Cr/k notation
  s = replace_dates(s, "§DATE§")         # dd-mm-yy, dd/mm/yyyy, dd Mon, etc.
  s = replace_acct_tails(s, "§ACCT§")    # XX1234, a/c ...3456, ending 1234
  s = replace_long_nums(s, "§NUM§")      # ref numbers, UPI ref, txn id
  s = replace_vpa(s, "§VPA§")            # something@psp
  s = collapse_whitespace(s)
  return sha256(s)
```

Order matters (amounts before generic numbers). The masked string is also the **redacted skeleton** sent for induction — so the masker and the redactor are the *same code path*, which guarantees the LLM never sees real values.

---

## 8. LLM induction prompt + redaction (doc 03 referenced; here's the substance)

**Redaction guarantee:** the skeleton passed to the LLM has already been through the fingerprint masker (§7). Add a final assertion: reject/abort if the skeleton still matches any amount/balance/long-number pattern. Enforce this **on device before send AND on server before storing a contribution.**

**Induction prompt (system):**
> You are given the structural skeleton of an Indian bank/UPI SMS where all real values are masked as tokens (§AMT§, §DATE§, §ACCT§, §NUM§, §VPA§). Identify, for each token and surrounding text, which financial field it represents. Return ONLY JSON, no prose: `{ "txn_type": "debit|credit|...", "slots": [{ "token": "§AMT§", "role": "amount|balance|merchant|date|account_tail|ref|none" }], "merchant_span": "<the literal substring that names the merchant, or null>" }`.

Then synthesise a regex with named groups from the slot roles and validate round-trip (doc 03). Never send a raw, unmasked message.

---

## 9. Seed data

- **Categories (system, fixed):** Food, Shopping, Rent, Utilities, Travel, Healthcare, Entertainment, Investments, Education, Loans, Insurance, Miscellaneous.
- **Known wallet/own-node senders (seed own-node registry):** PAYTM, AMZNPe / AmazonPay, PhonePe, Mobikwik, Freecharge, SLICE, Jupiter, Fi, etc. — used to classify TOPUP/TRANSFER vs EXPENSE.
- **Known merchant VPA dictionary (cold-start category hints):** seed the big aggregators (Zomato, Swiggy, Uber, Ola, BigBasket, etc.). Maintain as data.

---

## 10. Date, time & timezone

- All timestamps stored **UTC**; display in **IST (Asia/Kolkata)**.
- SMS dates are often ambiguous (`05-03` could be 5 Mar or 3 May). Default to **DD-MM** (Indian convention); when a year is missing, infer from SMS receipt date.
- `txn_time` (from SMS body) and `received_at` (SMS delivery) can differ — store both; reconcile by **balance-implied order** when they conflict (doc 03 §7).

---

## 11. Multipart / split SMS

Long SMS arrive as multiple parts. Reassemble by the multipart reference id **before** gating/fingerprinting, or you'll fingerprint half a message. Android's SMS APIs expose the concatenation headers — handle them at ingestion.

---

## 12. Security specifics

- Verify the Google **ID token** server-side against Google's certs on every `/auth/google`; never trust a client-asserted identity.
- Encrypt sensitive columns at rest where the platform doesn't already (the DB holds amounts, merchant strings, balances — treat as sensitive PII under DPDP).
- TLS everywhere; no transaction payload over plaintext.
- Device-local SQLite holding raw bodies should use SQLCipher / encrypted storage.
- The Drive backup is in the **user's** Drive (their encryption/ownership) — we never hold raw centrally.
- Rate-limit `/templates/induce` per user (defends cost + abuse).

---

## 13. Testing strategy

- **The SMS corpus is the spec.** Every gate rule, fingerprint, and template is validated against a hand-labelled dump corpus with expected extractions.
- **Golden-file tests** for `parseAmount`, fingerprinting, and each template's extraction.
- **Redaction adversarial suite** — the highest-priority tests; attempt to leak values through every notation.
- **Double-count regression suite** — wallet chains, card-bill, refund pairs, self-transfers, shared-limit pools all assert ONE logical expense.
- **Reconciliation property tests** — random balance chains must reconcile; interest-mode must absorb proportional drift and re-flag outliers.

---

## 14. Decisions still genuinely open (flag, don't silently default)

- Flutter vs React Native (§2).
- Dedup buffer retention window (default ~7 days).
- LLM induction real-time vs batched (start real-time if cheap).
- Backfill window (start 14 days; revisit at volume).
- Paise-integer vs `NUMERIC` for money (pick one and apply everywhere).

---

## 15. Hard "do not" reminders for the coding agent

- Do **not** use floats for money.
- Do **not** send any unmasked message content to the LLM or any server.
- Do **not** persist raw SMS bodies server-side.
- Do **not** build deferred features (AI advice, goals, roast, auto self-transfer detection, AA/email/iOS).
- Do **not** overwrite `amount_captured` for attribution (that's a split, not a correction).
- Do **not** count TRANSFER / TOPUP / future / hold / mandate / failed entries toward income or expense.
- Do **not** let by-tag totals diverge from by-category totals (single-tag invariant).
- Do **not** imply a full month of data when only 2 weeks exist.
