# Product Description — AI Personal CFO (Android MVP)

> **One line:** A single place to see *all* your money across every bank, card and wallet — built entirely from transaction SMS, no bank credentials, no UPI PIN, privacy-first.

---

## 1. What this is (and is not)

This is **not** a budgeting app, and it is **not** another per-account statement viewer.

Every Indian bank app, card app and UPI app already shows you *that account's* transactions. What none of them show is **the whole picture across all of them at once** — your HDFC card spend, your SBI salary, your Paytm wallet, your Slice balance, and the money you sent a friend, reconciled into one honest view of where your money actually went.

That cross-account, cross-instrument view — and the linking logic that makes it *truthful* (so a ₹5,000 dinner you split 5 ways doesn't read as ₹5,000 of your spending) — is the product.

**Core promise:** *"See all your accounts in one place, and understand what you actually spent."*

---

## 2. The source constraint (this shapes everything)

The **only** data source is transactional SMS, read **on-device**.

- No bank login, no UPI PIN, no Account Aggregator (deferred — see Out of Scope).
- Android only. iOS cannot read the SMS inbox and is explicitly out of scope for the MVP.
- Raw SMS is **parsed on the device** and **never leaves it**. Only structured, derived transaction data is synced to our backend.

This is a deliberate privacy posture *and* the cheapest possible wedge into the market. Everything downstream — the schema, the reconciliation logic, the trust model — is a consequence of "we only know what the SMS told us."

**Guiding principle:** *The system reports what it can see, flags what it can't, and lets the user fill the gaps. It never invents a number that the SMS did not contain.*

---

## 3. Target users

- Salaried professionals juggling 2–3 cards and multiple accounts.
- Young adults and first-time earners living on UPI.
- Middle-class families running on EMIs, shared cards and informal lending.
- Small business owners mixing personal and business spend.

The common thread: **multiple money sources**, heavy UPI usage, and no single place that shows the truth.

---

## 4. MVP scope — what v1 actually ships

v1 is **tracking, done correctly**. No AI advice, no suggestions, no roast, no goals. We are not generating insights until we have seen real data and a real feedback loop.

**In scope for v1:**

1. **On-device SMS ingestion** — rule-based gating, structural-fingerprint templating, shared template library, strict-redaction LLM fallback for novel formats.
2. **Unified ledger across all accounts/cards/wallets** — lines, instruments, and entries.
3. **The three headline numbers** — income, expenses, savings — across everything.
4. **Spend breakdown** — by system category, by user's personal tags, by account/card/wallet.
5. **Payee identity + personal tagging** — learn a UPI payee once, auto-tag every future payment; user's own free-form single-tag taxonomy.
6. **Transaction linking** — refunds, reimbursements, split payments and self-transfers all handled by one settlement engine.
7. **Balance reconciliation** — per-line balance-chain integrity, with discrepancy detection and the daily-interest accrual mode.
8. **Manual & cash entries** — user can add cash spends and cash settlements that the SMS never captured.
9. **Cross-device continuity** — Google login; structured data on our server; raw messages backed up to the user's *own* Google Drive (WhatsApp-style).

**Explicitly deferred (v1.x / v2):**

- AI insights, suggestions, financial advice, monthly AI review, financial health score.
- Money Roast (cut entirely for now).
- Financial goal tracking.
- Automatic self-transfer detection (v1 does it via user-confirmed linking instead).
- Itemising cash withdrawals into named expenses (v1 lumps to Miscellaneous).
- Account Aggregator integration and iOS (the long-term cross-platform backbone).
- Deep personal-debt analytics (schema is built; UI stays minimal in v1).

---

## 5. The headline numbers

Only three numbers matter on the dashboard:

| Number | Definition |
|---|---|
| **Income** | Money entering the system from outside (salary, real inbound), net of linked settlements that are not income. |
| **Expenses** | Money leaving the system to an external party, net of refunds/reimbursements/splits linked back to it. |
| **Savings** | Income − Expenses, over the period. |

Plus the **current balance** per line (from the latest balance-bearing SMS) and a roll-up net position.

**Period honesty:** the MVP backfills **2 weeks** of SMS on install. The dashboard must label the period as *"since you installed"* — never imply a full month — because a fresh mid-cycle install may show little or no salary credit and an income near zero is otherwise confusing.

---

## 6. The money model in plain language

Money has a **boundary**: your accounts, cards and wallets are *inside*; merchants and other people are *outside*.

- **Expense** = money crosses the boundary *outward* to a merchant.
- **Income** = money crosses the boundary *inward* from outside (salary, interest).
- **Transfer** = money moves between two things you own (bank → wallet, account → account). Counts as neither.
- **Top-up** = external value enters a wallet without being income (gift card). Increases balance, is not earnings.

This single distinction is what prevents the classic quadruple-count: `Bank → Paytm → Swiggy wallet → Swiggy order` is **one** ₹500 expense (the final hop), not four.

### Instruments vs lines

A **card is not an account.** It is an *access instrument* pointing at a financial **line** (a balance or a credit pool). This is what makes Indian multi-card reality tractable:

- Two HDFC cards sharing a credit limit are two instruments on **one** credit line — so a spend on either correctly draws the shared pool, and the "phantom limit drop" on the unused card is *expected*, not a discrepancy.
- A third HDFC card with its own limit is a separate line.
- A debit card and a UPI VPA on the same bank account are both instruments on **one** bank line — never double-counted.
- Add-on / family cards are extra instruments on the same pool, optionally tagged with a holder.

Everything (accounts, cards, wallets) is **auto-discovered from SMS** — the user is never asked to add accounts manually.

---

## 7. UPI payee identity & personal tagging

A UPI VPA (`9876543210@ybl`) is a globally stable identity, but its **meaning is personal**: the same stall is "smoke break" for one user and "tea break" for another. Three layers:

1. **Payee identity (auto):** normalise the VPA, treat it as a stable counterparty, learn it once.
2. **User label (personal):** the user names it and assigns a category — once — and it sticks to every future payment to that payee.
3. **Personal tag (the differentiator):** the user's own free-form taxonomy (smoke / tea / juice / general) nested under a system category for roll-up.

**One tag per transaction, always.** Multiple tags would let two tags claim the same rupee and double-count in the by-tag view. Single-tag keeps every rupee in exactly one bucket, so tag totals always reconcile to category totals to the grand total.

- The **payee carries one default tag**; a **transaction inherits it** but can be overridden to a different single tag for that one payment, without changing the payee's default.
- Tags are a small reusable per-user list (fuzzy-matched on creation to avoid "smoke / smoking / ciggarette" fragmentation).
- Labels live on the **payee/line, never hard-copied onto the transaction** — so renaming a wallet or re-tagging a payee reflects across all historical transactions.

---

## 8. Transaction linking — the truth engine

Refunds, reimbursements, splits and self-transfers are **one mechanism**: an outflow (or inflow) with one-or-more **linked settlements** that adjust the true figure. Nothing is auto-linked silently when ambiguous — the app **suggests**, the user **confirms**, and the user can always **edit**.

- **Refund:** a credit linked to an original spend. Shown as two separate entries in the ledger (honest/auditable); **netted to the true amount in the aggregate view** (a ₹200 spend + ₹200 refund disappears from totals; a partial ₹50 refund nets to ₹150). Refunds can be **pending** (announced now, credited in 5–30 days) and auto-matched when they land; the refund may arrive in a *different* line (e.g. back to the wallet, not the bank).
- **Reimbursement:** you fronted money, a friend pays you back. The inbound is **not auto-tagged**; it shows as incoming money, and the user can **link** it to the original expense so it nets out of your spend (and is suppressed from income).
- **Split:** you paid ₹5,000, your share is ₹1,000, friends owe the rest. Each repayment (UPI **or cash**) links to the expense. **Realized, not optimistic:** your spend reflects only what's actually settled; the unsettled remainder stays as **your** expense until resolved. A friend who never pays becomes a receivable the user can **forgive** (write-off **re-adds** it to your spend, because you really did spend it) or **keep tracking**.
- **Self-transfer:** a transfer between your own accounts fires both a debit and a credit. The app suggests "is this a self-transfer?", shows both, the user links them, and **linking registers that account/VPA as an own-node** so future ones auto-classify. Both legs drop out of spend and income. (Same mechanism as wallets; full auto-detection is v2.)

**One critical distinction the UI must enforce:** correcting a *parse error* (the SMS said ₹4,000, we misread ₹5,000) is **different** from a *split* (₹5,000 really left, but ₹1,000 wasn't yours). The first overwrites the amount; the second keeps ₹5,000 and links a settlement. Overwriting for attribution would break the balance chain. Both actions **store the original captured value** alongside the edited one.

---

## 9. Cash

Two different things, modelled separately:

- **Cash as settlement** (a friend repays their share in notes): a first-class **linkable** manual entry — it settles an expense and reduces your effective spend.
- **Cash as untracked spending** (₹10,000 from an ATM, spent in dribs): a single known outflow with an unknown breakdown. It **counts toward the spend total and the balance chain** (the money genuinely left), but lands in **Miscellaneous** and the user is **never forced** to itemise it. Optional itemisation is a v2 nicety.

---

## 10. Balance reconciliation & trust

Per line, the balance chain must hold: `closing[n] = closing[n-1] ± amount[n]`. When it breaks, we create a **discrepancy** (with a type, a magnitude, and a user-resolvable path) rather than silently swallowing or mis-counting it.

Discrepancy types include: missing outflow, missing inflow, suspected EMI (limit drop-and-recover), suspected duplicate, suspected refund. Every discrepancy has an **"ignore / it's cash / add manual entry"** path — the goal is *acknowledged* gaps, not *zero* gaps, because cash is permanently invisible. Reconciliation confidence gates how strongly we present comparative claims later.

**Daily-interest accounts (Slice/neobank/sweep-FD):** these credit interest **with no SMS**, so the balance creeps up unexplained and would trip a false "missing inflow" every day. Handled by **proportionality**: the first time it happens we ask the user once ("₹8 appeared with no message — is this daily interest?"). On confirmation we learn the **rate** (`credit ÷ balance`), not the amount — so when the balance halves after a big purchase and the next credit also halves, it still matches. Future same-rate drips are **absorbed silently as logged interest income**; an uptick wildly off the expected magnitude re-surfaces as a real discrepancy (catches both a genuine missed inflow and a changed rate). Generalises to any no-SMS rate-based accrual.

---

## 11. Privacy posture (a feature, not a footnote)

- Raw SMS is parsed **on-device** and **never sent to our servers**.
- Only **structured transaction data** is synced to our backend (the working copy that powers the cross-account view).
- **Raw message bodies** are retained **only for confirmed transactions** (needed for refund-linking, dispute/audit and re-parse) and live **device-local + backed up to the user's own Google Drive** (WhatsApp-style) — so a device switch restores them from *the user's* Drive, not ours.
- Non-transactional SMS (OTP, promo, the short-lived dedup buffer) is **discarded** — only the structured result is kept where relevant.
- The LLM is touched **only** for inducing a template for a never-before-seen message format, and **only a redacted skeleton** (zero real amounts, names, account tails, balances) is sent. This is the single place anything leaves the device, so it carries the strongest redaction guarantee in the system.
- Raw-retention is a **backend config seam**, so a future privacy-policy change can adjust it without re-architecting.

---

## 12. Auth & continuity

- **Google Sign-In only** for v1 (no phone-OTP yet) — it is both the identity and the gateway to Google Drive backup, and keeps the login surface minimal.
- Structured data syncs **in real-time** per transaction to our backend, keyed to the Google identity, so the dashboard survives a cache-clear or device switch.
- The **LLM template-induction** path may be **batched/periodic** (it's rare and cost-insensitive); transaction sync stays real-time.

---

## 13. Why this is defensible

- **The shared template library is a moat.** A bank sends the *same* SMS format to every user, so a template induced once (and validated) serves everyone. LLM cost asymptotes toward zero as coverage grows; accuracy improves with every user.
- **The cross-account truth engine is the value.** Per-account views are commodity; the honest, linked, all-in-one-place view is not.
- **Privacy-first is a differentiator** in a market scarred by SMS-scraping lending apps.

---

## 14. Known constraints & honest caveats

- **Google Play `READ_SMS` policy** is the existential risk — Google restricts the permission, and this is the policy that purged finance apps in 2019. On-device parsing is mandatory partly to satisfy it. Must be validated before launch.
- **Android-only** caps TAM; iOS needs a different source (AA/email) entirely.
- **Wallet-internal spends often emit no bank SMS**, so wallet balances are *soft/estimated*, not authoritative like reconciled bank lines.
- **Balance is not always in the SMS** — reconciliation is best-effort over the subset that carries balances.
- **Last-4 is not globally unique** and is sometimes absent — attribute to `(issuer + last4 + type)`, and keep an "unattributed at <bank>" bucket rather than guessing a card.
- **2-week backfill** is a starting point chosen for backend load and storage uncertainty; revisit once real data volume is understood.
