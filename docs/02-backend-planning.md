# Backend Planning — AI Personal CFO (Android MVP)

> This document covers *how we approach building the backend*: the split between device and server, the processing philosophy, the build sequence and the open knobs. The concrete component design and data flow live in `03-backend-design.md`; the schema lives in `04-database-design.md`.

---

## 1. The fundamental split: on-device vs server

The single most important architecture decision. It is settled as a **hybrid**:

| Concern | Where it runs | Why |
|---|---|---|
| Raw SMS reading | **Device only** | Privacy; raw text must never leave the phone. |
| Gating (rule-based) | **Device** | Microsecond regex; no reason to involve the network. |
| Structural fingerprinting | **Device** | Cheap; produces the privacy-safe skeleton. |
| Template *matching* (apply a known template) | **Device** | Zero-cost local parse for known formats. |
| Template *induction* (novel format) | **Server → LLM** | Rare; needs the model; sends only redacted skeleton. |
| Shared template library | **Server** | One template serves all users; the moat. |
| Ledger, linking, reconciliation, aggregation | **Server** | Survives cache-clear / device-switch; powers cross-account analytics. |
| Raw message body (confirmed txns only) | **Device + user's Google Drive** | Audit/re-parse without handing us PII. |

**Rule of thumb:** the device decides *what a message means* (privately); the server is the *system of record* for the structured result and does all the cross-account math.

---

## 2. Processing philosophy

### 2.1 The funnel (cheap rejects first, LLM last)

Every incoming SMS runs a funnel that gets more expensive at each stage, so the expensive stages almost never fire:

1. **Sender shape** — 10-digit numeric → personal → drop. Alphanumeric DLT header → candidate.
2. **User denylist** — muted sender → drop.
3. **Cheap gate (rules)** — must contain an amount token *and* a transaction verb, and *not* match OTP/promo/failed intent. Microseconds, no model. **Gate before you template** — this is what keeps the template population small, because promo (infinite variety) never gets fingerprinted.
4. **Fingerprint** — replace amounts/dates/numbers/account-tails with slot tokens; hash the skeleton.
5. **Template match** — local cache → shared server library → (miss) LLM induction.
6. **Modality classify** — tag as `actual / future / conditional / failed / hold / transfer / topup`. Only `actual` (and settled holds) become real ledger entries.
7. **Dedup / link** — collapse duplicate SMS for one event; link OTP/refund/settlement.
8. **Persist** — structured entry to server; raw body to device + Drive (confirmed txns only).

The rule set is **living**: we update the gate rules as we test against real message dumps. This is expected and planned, not a failure.

### 2.2 Templates, not per-message parsing

The LLM is a **template author**, never a per-message parser. India's DLT regime means transactional SMS bodies are **pre-registered templates** — fixed scaffolding with variable slots — so structure-matching is robust, not fragile guessing.

- Templates are keyed by **structural fingerprint**, *not* by sender. Operator prefixes (`VM-`, `VX-`, `IX-`) are stripped to the registered entity (`HDFCBK`); the same message shape yields the same fingerprint regardless of routing. **A template is fundamentally "a message shape → how to extract fields," independent of sender.**
- Induction clusters unmatched messages by fingerprint, sends **one redacted representative per cluster** to the LLM (batched), gets back a slot map, synthesises a regex with named groups, and **round-trip validates** against all buffered messages in the cluster before trusting it.
- **No versioning.** Fintechs A/B-test templates constantly; we don't chase versions. A new shape is simply a new fingerprint → a new template. Once we have a working template for a shape, we keep using it for that shape.

### 2.3 Shared template library + trust gate

A template induced for one user serves **all** users (HDFC's format is identical for everyone). To stop a bad induction from poisoning everyone:

- A new template ships as **provisional**.
- Validation is an **internal backend process** (not a user prompt): run **5–6 extraction passes** comparing the template's regex extraction against a fresh LLM extraction on real examples. If they **agree**, promote to **trusted**. If they **disagree**, flag the template and re-test rather than asking the user.
- Trusted templates parse silently on-device thereafter.

### 2.4 Strict redaction (the one privacy-critical path)

The induction call is the *only* moment anything derived from a message leaves the device. The skeleton sent must carry **zero real values** — amounts, names, account tails, balances all masked to slot tokens. This path gets the strongest test coverage in the codebase; a bug here is a privacy breach, not a parsing error. Redaction is enforced **both** on-device (before send) and server-side (before the library stores a contribution).

---

## 3. Modality & money-type classification

Beyond "is this a transaction," the engine must classify *what kind*:

- **Modality:** `actual` (real, past) · `future` (will be debited / scheduled) · `conditional` (collect/payment request) · `failed` (declined/reversed) · `hold` (pre-auth/blocked) · `mandate` (autopay setup, no money moved).
- **Direction/kind:** `EXPENSE` (→ external merchant) · `INCOME` (← external source) · `TRANSFER` (own ↔ own) · `TOPUP` (external value into a wallet, not income).

Only `actual` + `EXPENSE/INCOME` hit the headline numbers. `future` feeds recurring detection, `hold` feeds reconciliation, `mandate`/`conditional`/`failed` are recorded but never counted. This classification is what stops phantom transactions (declined payments, payment requests, scheduled-but-not-yet debits) from corrupting totals.

The discriminator the rule engine needs alongside amount+verb is therefore **tense, modality and direction**.

---

## 4. Reconciliation engine

Runs per line over entries that carry a balance:

- Chain check: `closing[n] = closing[n-1] ± amount[n]`; break → typed discrepancy.
- Order by **balance-implied order** when SMS receipt time conflicts with it.
- **Credit cards invert** (available limit rises on payment, resets on cycle); EMI conversion blocks the full principal then restores ~monthly — model as scheduled principal restoration, not mystery credit.
- **Holds** dip then recover — a hold/settlement state, not a missed transaction.
- **Daily-interest mode:** proportional (rate-based) absorption, confirmed once, magnitude-checked periodically (see product doc §10).
- Anchor: first balance-bearing SMS per line = current balance; reconcile **forward only**; earlier in-window entries are recorded but outside the integrity chain. **No opening-balance prompt.**

Reconciliation confidence is a per-line signal that later gates how strongly comparative claims are presented (the claims themselves are deferred to post-MVP).

---

## 5. The linking/settlement engine

One engine for refunds, reimbursements, splits and self-transfers (see product doc §8). Backend responsibilities:

- Maintain `settlement` links (outflow ↔ N inflows), compute **effective amount = base − Σ settlements**.
- **Realized accounting:** unsettled remainder stays as the user's expense.
- **Suggest, never silent-link** when ambiguous; user confirms; user can always edit, and can add a manual/cash settlement that has no SMS.
- Aggregate view nets linked entries; ledger view keeps them distinct.
- Write-off of a receivable **flips it back into the user's expense**.
- Self-transfer linking **registers an own-node** for future auto-classification.

---

## 6. Build sequence (backend)

Ordered so each stage is testable against real SMS dumps before the next is built.

1. **Ingestion contract & gating** — sender normalisation, the rule-based gate, the dedup buffer. Test against message dumps; iterate rules.
2. **Fingerprint + template store** — local + shared library schema, matching logic. *No LLM yet — hand-seed a few templates.*
3. **LLM induction + redaction + trust gate** — the novel-format path, batched, with the 5–6-pass validation. Heavy test coverage on redaction.
4. **Ledger core** — lines, instruments, entries; auto-discovery of accounts/cards/wallets; modality & money-type classification.
5. **Payee + tag** — identity normalisation, learn-once labelling, single-tag taxonomy.
6. **Reconciliation** — balance chains, discrepancies, holds, daily-interest mode.
7. **Settlement/linking** — refunds → reimbursements → splits → self-transfers.
8. **Sync + auth + Drive backup** — Google login, real-time structured sync, raw-to-Drive.
9. **Aggregation/read API** — the three numbers + breakdowns the dashboard needs.

The **critical path** is stages 1–4: get the data captured correctly. Everything else is analysis on top of correct data; if capture is wrong, nothing downstream can be right.

---

## 7. Cost model

- **LLM** is the only real variable cost, and it is **bounded by novel template shapes** — a few dozen across all Indian banks/fintechs — not by message volume. The shared library makes it amortise toward zero. Induction may be **batched/periodic** to cut per-call overhead further.
- **Storage** of structured entries is tiny; templates are tens of bytes each. Storage is not the constraint.
- **Match cost** is kept O(few) by keying templates by normalised sender so a message only checks that sender's handful of shapes, not the global set.

---

## 8. Open knobs (deliberately deferred)

- **2-week backfill window** — chosen under storage/throughput uncertainty; revisit with real volume.
- **LLM batching cadence** — start real-time if cheap; move to periodic batches if not.
- **Raw-retention policy** — config seam; may change with a future privacy-policy update.
- **Provider** — OpenAI API for v1 behind a swappable abstraction; rare usage means cost/latency are not v1 concerns.
- **Account Aggregator / email ingestion** — the v2 path to iOS and to cleaner data; the ingestion layer is built as an adapter so a new source is a new adapter, not a new product.
