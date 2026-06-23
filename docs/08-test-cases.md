# Test Cases — AI Personal CFO (Android MVP)

> Comprehensive test matrix mapped to docs 01–07. Each case: an **ID**, the **input/scenario**, the **expected result** (tied to a locked decision), and what it **guards**.
>
> **Priority legend:** 🔴 corrupts totals if wrong (run first, re-run on every change) · 🟠 functional · 🟡 polish/UX.
>
> Sample SMS are **illustrative** — replace with strings from your real corpus. The corpus *is* the spec; these cases are the shape of what to assert.

---

## A. Sender filtering & gating  🔴

| ID | Input | Expected | Guards |
|---|---|---|---|
| GATE-01 | Sender `+919876543210`, body "Rs 500 sent" | **Dropped** — personal numeric sender, never processed | Personal-number rule |
| GATE-02 | Sender `VM-HDFCBK`, txn body | Candidate → proceeds | Alphanumeric DLT header accepted |
| GATE-03 | Same bank via `VX-HDFCBK`, `IX-HDFCBK` | All normalise to `HDFCBK`; same handling | Operator-prefix normalisation |
| GATE-04 | `BZ-HDFCBK-S` (with trailing suffix) | Normalises to `HDFCBK` | Suffix stripping |
| GATE-05 | Body: "Your OTP is 432189, do not share" | **Dropped** (buffered for dedup, then discarded) | OTP reject |
| GATE-06 | Body: "Flat 50% off! Shop now Rs 999" | **Dropped** — promo, no real txn | Promo reject; no template created |
| GATE-07 | Body: "Rs 450 spent at Zomato" (no balance) | **Passes** — terse but real | Lenient gate (amount+verb enough) |
| GATE-08 | Muted sender in denylist | **Dropped** | Per-user denylist |
| GATE-09 | Body with amount but no verb ("Balance is Rs 5,000") | Edge — balance enquiry, not a txn → **not counted** | Verb requirement; balance-only handling |
| GATE-10 | Promo containing "cashback Rs 50 credited" | Should NOT count as income (promotional) | Promo-vs-txn disambiguation |
| GATE-11 | Empty body / corrupted encoding | Dropped gracefully, no crash | Robustness |

---

## B. Amount parsing (Indian notation)  🔴

| ID | Input substring | Expected (paise) | Guards |
|---|---|---|---|
| AMT-01 | `Rs 450` | 45000 | Basic |
| AMT-02 | `Rs.1,234.50` | 123450 | Western grouping + decimals |
| AMT-03 | `INR 1,23,456.78` | 12345678 | Indian grouping (3 then 2s) |
| AMT-04 | `₹1.2L` / `Rs 1.2 lakh` | 12000000 | Lakh notation |
| AMT-05 | `2.5Cr` / `2.5 crore` | 2500000000 | Crore notation |
| AMT-06 | `Rs 1.2k` | 120000 | k notation |
| AMT-07 | `Rs450` (no space) | 45000 | No-space variant |
| AMT-08 | `Rs 0.50` | 50 | Sub-rupee |
| AMT-09 | `Rs 1,00,000` (no decimals) | 10000000 | No-decimal large |
| AMT-10 | Amount in float-prone case: ₹0.10 + ₹0.20 across two txns | Sum == ₹0.30 exactly | **No float drift** |
| AMT-11 | Two amounts in one SMS (txn + balance) | Correct one chosen as amount, other as balance | Slot disambiguation |
| AMT-12 | Garbled `Rs 4,5O.00` (letter O for zero) | Flagged/low-confidence, not silently mis-parsed | Defensive parsing |

---

## C. Date / time parsing  🟠

| ID | Input | Expected | Guards |
|---|---|---|---|
| DATE-01 | `05-03-2026` | 5 Mar 2026 (DD-MM default) | Indian convention |
| DATE-02 | `05-03` (no year) | Year inferred from receipt date | Missing-year handling |
| DATE-03 | `05 Mar 26` / `5-Mar-2026` | Parsed correctly | Month-name variants |
| DATE-04 | txn_time differs from received_at | Both stored; reconcile by balance order | Out-of-order handling |
| DATE-05 | SMS received in IST near midnight | Stored UTC, displayed IST, correct day | Timezone correctness |

---

## D. Fingerprinting & templates  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| TMPL-01 | Same bank, same shape, two different amounts | Identical fingerprint | Slot masking |
| TMPL-02 | Same shape via `VM-` and `IX-` | Identical fingerprint | Sender-independent keying |
| TMPL-03 | Bank changes wording (A/B test) | New fingerprint → new template (no versioning) | No-versioning decision |
| TMPL-04 | Novel format, no template | Redacted skeleton → LLM induction → regex → validated | Induction path |
| TMPL-05 | Induced regex fails round-trip on cluster | Template **not** trusted; flagged | Validation gate |
| TMPL-06 | New template, 5–6 trust-gate runs agree | Promoted to trusted, parses silently | Trust gate |
| TMPL-07 | Trust-gate runs disagree | Stays flagged, re-tested, not used | Poison protection |
| TMPL-08 | 50 unmatched msgs, 4 distinct shapes | Exactly 4 induction calls (one per cluster) | Clustering / batching |
| TMPL-09 | Known trusted template arrives again | Parsed locally, **zero LLM calls** | Cache hit / cost |
| TMPL-10 | Two issuers, same last-4, similar shape | Kept distinct by issuer in key | Match correctness |

---

## E. Multipart / malformed SMS  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| MULTI-01 | Long SMS split into 2 parts | Reassembled before gating/fingerprint | Concatenation handling |
| MULTI-02 | Parts arrive out of order | Reassembled correctly by ref id | Ordering |
| MULTI-03 | One part missing | Handled gracefully, flagged, no half-parse | Robustness |

---

## F. Modality classification  🔴

| ID | Sample SMS | Expected modality | Counted? | Guards |
|---|---|---|---|---|
| MOD-01 | "Rs 1,200 debited for purchase at Amazon" | actual | ✅ | Real spend |
| MOD-02 | "Rs 5,000 will be debited on 5th for SIP" | future | ❌ | Tense trap |
| MOD-03 | "Ramesh has requested Rs 500" | conditional | ❌ | Payment request |
| MOD-04 | "Txn of Rs 1,200 declined / could not be processed" | failed | ❌ | Phantom debit |
| MOD-05 | "Rs 3,000 blocked for hotel booking" | hold | ❌ (until settle) | Pre-auth hold |
| MOD-06 | "Mandate created for Rs 2,000/month at Netflix" | mandate | ❌ | Autopay setup, no money moved |
| MOD-07 | Future debit SMS, then the actual debit days later | Future NOT counted; actual counted once | No double-book |
| MOD-08 | Hold SMS then settlement at different amount (fuel) | Hold resolves to settled amount | Hold→settle |
| MOD-09 | Hold that releases entirely (never settles) | No expense recorded | Hold release |
| MOD-10 | "Rs 1,200 transaction reversed" right after a debit | Treated as reversal/refund, nets | Instant reversal |

---

## G. Money-type classification (the boundary)  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| TYPE-01 | Salary "Rs 65,000 credited" from employer | INCOME, counted | Income |
| TYPE-02 | "Rs 450 spent at Zomato" | EXPENSE, counted | Expense |
| TYPE-03 | Bank → Paytm wallet load Rs 5,000 | TRANSFER, **not** counted | Wallet load not expense |
| TYPE-04 | Gift card → Amazon balance Rs 1,000 | TOPUP, **not** income, **not** expense | External value, not earnings |
| TYPE-05 | **Full chain:** Bank→Paytm→Swiggy wallet→Swiggy order Rs 500 | Exactly **ONE** ₹500 expense | 🔴 Quadruple-count prevention |
| TYPE-06 | Spend ₹600 of gift-card Amazon balance | ₹600 expense; ₹400 wallet remains; bank untouched; never income | Gift-card end-to-end |
| TYPE-07 | Self FD transfer Rs 10,000 (own account) | TRANSFER, neither in/out (v1: via user link) | Self-transfer not spend |
| TYPE-08 | Bank charges / min-balance penalty Rs 25 | EXPENSE, category = Loans/Fees, not merchant spend | Fee categorisation |

---

## H. Double-counting (dedup)  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| DUP-01 | One UPI payment → bank debit SMS **and** UPI-app SMS | Counted **once** | Dual-SMS dedup |
| DUP-02 | OTP SMS + "Rs 450 spent" with matching amount/time | One expense; OTP linked, not counted | OTP linkage |
| DUP-03 | Wallet load then wallet spend | Load = transfer; spend = expense; not both as spend | Wallet double-count |
| DUP-04 | Card spend + later card-bill payment | Spend counted once; bill payment = transfer, not new expense | Card-bill double-count |
| DUP-05 | Same txn synced twice (retry) | Idempotent — one row | Sync idempotency |
| DUP-06 | Identical amount, same merchant, 90s apart | Suggested duplicate → confirm (not auto-merged unless near-certain) | Dedup window |
| DUP-07 | Identical amount, same merchant, but genuinely two purchases | NOT auto-merged; both kept | False-positive guard |

---

## I. Lines & instruments  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| LINE-01 | First SMS from new card ••1234 | Instrument + provisional line auto-created | Auto-discovery |
| LINE-02 | Two HDFC cards ••1234 & ••5678 sharing limit | Two instruments → **one** credit pool | Shared-limit model |
| LINE-03 | Spend on ••5678, then ••1234's SMS shows lower available limit | **Not** a discrepancy — expected pool draw | 🔴 Phantom-limit-drop |
| LINE-04 | Third HDFC card ••9012, separate limit | Separate line | Independent pool |
| LINE-05 | Debit card + UPI VPA on same account | Both instruments on one bank line; no double-count | Instrument-on-line |
| LINE-06 | Add-on/family card on same pool | Extra instrument; holder tag user-assigned | Add-on handling |
| LINE-07 | SMS with no last-4 | "Unattributed at \<issuer\>" bucket, not a guessed card | Missing-last4 |
| LINE-08 | Two issuers share a last-4 (1234) | Kept distinct by (issuer,last4,kind) | Last-4 not unique |
| LINE-09 | Shared-pool detection: limits track each other | Suggests "share a limit?"; default separate until confirmed | Conservative merge |
| LINE-10 | Pooled cards — per-card "available limit" view | Shows pool-level only (per-card available is meaningless) | Pool semantics |

---

## J. UPI payee identity & tagging  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| PAYEE-01 | New VPA `9876543210@ybl` | Payee auto-created, provisional | Identity |
| PAYEE-02 | Same person via `name@paytm` and `9876543210@okaxis` | Mapped to one payee (PSP-stripped key) | Normalisation |
| PAYEE-03 | Label a payee once ("Ramesh stall", Snacks) | All 14 past txns retroactively tagged | Learn-once retroactive |
| PAYEE-04 | Next payment to that VPA | Auto-tagged, no prompt | Auto-apply |
| PAYEE-05 | Rename wallet/payee later | Reflects across **all** history (label on entity, not txn) | 🔴 Label-on-entity |
| PAYEE-06 | Create tag "smoke", later "smoking", "ciggarette" | Fuzzy-match suggests existing on creation | Tag fragmentation |
| PAYEE-07 | Override one txn's tag (charger at cig stall) | Only that txn changes; payee default unchanged | Per-txn override |
| PAYEE-08 | Delete a tag with 14 txns | Forces reassign, never orphans | Stable historical totals |
| PAYEE-09 | by-tag total vs by-category total | **Equal** (single-tag invariant) | 🔴 No tag double-count |
| PAYEE-10 | Bare phone-VPA, user ignores prompt | Stays **unclassified**, not silently counted as spend | P2P-vs-spend safety |

---

## K. P2P vs P2M & person-reason routing  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| P2P-01 | Phone-number VPA, no merchant string | Cold-start = "person/unclassified", needs one tap | Ambiguity honesty |
| P2P-02 | `q`/merchant-string VPA | Lean P2M (merchant), category hint | Merchant detection |
| P2P-03 | Pay friend, reason "my share of dinner" | EXPENSE (Food) | Share = real spend |
| P2P-04 | Pay friend, reason "lending" | Receivable, **not** spend | Loan-out |
| P2P-05 | Pay friend, reason "repaying borrow" | Debt repayment, **not** spend now | Repayment |
| P2P-06 | Rent to landlord's personal VPA | User can mark as Rent expense (not transfer) | P2P-as-spend |

---

## L. Refunds  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| REF-01 | ₹200 Swiggy spend + ₹200 Swiggy refund | Ledger: 2 entries; **Aggregate: both vanish (net 0)** | 🔴 Refund netting |
| REF-02 | ₹200 spend, ₹50 partial refund (missing item) | Aggregate nets to ₹150 | Partial refund |
| REF-03 | Refund announced now, credited 7 days later | Pending settlement created, auto-matched on arrival | Refund aging |
| REF-04 | Refund lands in wallet, not the paying bank | Linked across lines correctly | Cross-line refund |
| REF-05 | Refund SMS, no matching original found | Stands alone flagged "no match", **not** income | No-match safety |
| REF-06 | Ambiguous refund (amount differs) | Suggest-confirm, not silent | Confirm gate |
| REF-07 | 30-day-delayed refund | Still matched; aging tracked | Long-delay |

---

## M. Reimbursement linking (1:1, v1)  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| REIMB-01 | ₹3,000 Amazon for friend, friend sends ₹3,000 | Inbound shown as money-in, NOT auto-tagged | No auto-link |
| REIMB-02 | User links inbound to the ₹3,000 expense | Your net spend on Amazon = ₹0 | Netting |
| REIMB-03 | Linked inbound | Suppressed from **income** total | Not-income |
| REIMB-04 | Unrelated ₹3,000 credit from same friend | Only suggested, user must confirm | Match ambiguity |

---

## N. Split linking (1:many)  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| SPLIT-01 | ₹5,000 dinner, your share ₹1,000, 4 friends | Outflow ₹5,000 stays; expected ₹1,000×4 | Split setup |
| SPLIT-02 | 3 friends pay ₹1,000 via UPI | Each links; effective spend reflects only realized | Realized accounting |
| SPLIT-03 | 4th friend pays ₹1,000 in **cash** | User adds cash settlement, links it | Cash settlement |
| SPLIT-04 | Only 3 of 4 pay, 1 never does | Your spend shows ₹2,000 (your 1k + unpaid 1k) | Unpaid stays your expense |
| SPLIT-05 | User **forgives** the unpaid ₹1,000 | Re-added to **your** expense (you really spent it) | 🔴 Write-off→spend |
| SPLIT-06 | User keeps tracking the unpaid ₹1,000 | Stays a receivable | Keep-tracking |
| SPLIT-07 | Annotate "₹1,000 my share, ₹1,000 bad loan" | Both tracked per comment | Annotation |
| SPLIT-08 | All settled fully | Effective spend == your share == ₹1,000 | Full settlement |

---

## O. Self-transfer  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| SELF-01 | Transfer own A→B fires debit + credit | App suggests "self-transfer?" shows both | Detection prompt |
| SELF-02 | User links the pair | Both drop out of spend AND income | Net-zero |
| SELF-03 | After linking | That account/VPA registered as own-node | Learn own-node |
| SELF-04 | Next self-transfer to same account | Auto-classified | Auto after learn |
| SELF-05 | Not linked (user ignores) | Appears as spend+income (v1 caveat) — documented | Known v1 gap |

---

## P. Cash entries  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| CASH-01 | ATM withdrawal ₹10,000 | Single Misc outflow; counts toward spend + balance chain | Cash spend bucket |
| CASH-02 | User not forced to itemise the ₹10,000 | No nagging; itemise is optional (v2) | No-friction |
| CASH-03 | Friend repays ₹1,000 in cash (settlement) | First-class linkable manual entry | Cash settlement |
| CASH-04 | Manual cash spend added | Counts toward totals, tagged source=cash | Manual entry |
| CASH-05 | Cash entries in reconciliation | Counts toward spend but **outside** balance chain (can't break it) | Recon exemption |

---

## Q. Reconciliation & balance chain  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| RECON-01 | closing[n] == closing[n-1] − debit[n] | Chain holds, confidence up | Basic chain |
| RECON-02 | Balance drops with no debit SMS | MISSING_OUTFLOW discrepancy | Gap detection |
| RECON-03 | Balance rises with no credit SMS (not interest line) | MISSING_INFLOW discrepancy | Gap detection |
| RECON-04 | First in-window SMS sets anchor | Reconcile forward only; no opening-balance prompt | Anchoring |
| RECON-05 | SMS out of order vs balance | Reconcile by balance-implied order | Ordering |
| RECON-06 | A misread amount breaks the chain | Chain break surfaces the parse error | Self-detection |
| RECON-07 | Discrepancy with "ignore/it's cash" path | User can dismiss; acknowledged gap | Resolution paths |
| RECON-08 | Credit card payment raises available limit | Inverted logic handled (not a discrepancy) | Card inversion |
| RECON-09 | Hold dips balance then recovers | Not flagged as missed txn | Hold state |

---

## R. Daily-interest accounts (Slice/neobank)  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| INT-01 | ₹8 appears on ₹2L, no SMS, first time | Asks once "is this interest?" | Detection |
| INT-02 | User confirms interest | Learns rate (8/200000), not the amount | Rate learning |
| INT-03 | Balance drops to ₹1L, next credit ₹4 (no SMS) | **Absorbed silently** — matches balance×rate | 🔴 Proportional, not fixed |
| INT-04 | Absorbed interest | Logged as interest **income** ("earned ₹312") | Interest as income |
| INT-05 | Sudden ₹8,000 appears (way off expected ₹4) | Re-flagged as real discrepancy | Magnitude check |
| INT-06 | Bank changes rate | Off-magnitude → re-flag → re-learn | Rate change |
| INT-07 | First 2–3 days before pattern learned | May flag once, self-corrects after confirm | Cold-start tolerance |

---

## S. Liabilities (loans & card EMI)  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| LIAB-01 | Standalone loan with unique number | Its own line, reconciles independently | Loan-as-line |
| LIAB-02 | ₹60,000 purchase converted to card EMI | Original counted once; EMIs are repayment, not new expense | 🔴 EMI double-count |
| LIAB-03 | Limit drops ₹60k at conversion, recovers ~₹10k/mo | Read as scheduled principal restoration, not mystery credit | Limit recovery |
| LIAB-04 | EMI posting + monthly bill total | Counted once (bill includes EMI) | Bill-vs-EMI |
| LIAB-05 | No SMS for interest split | Not invented; user-declared liability assists | No-fabrication |
| LIAB-06 | EMI-payment SMS matches declared liability | Suggest → confirm once → auto-apply future | Suggest-then-auto |
| LIAB-07 | Statement/bill generation SMS | Informational only, not a transaction | Statement handling |

---

## T. Personal debt  🟡

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| DEBT-01 | Lend ₹2,000 to friend | Receivable (they_owe_me), not spend | Direction |
| DEBT-02 | Friend repays | Incoming matches, closes receivable | Settlement |
| DEBT-03 | Partial repayment | Remaining decremented | Partial |
| DEBT-04 | Forgive a receivable | Status forgiven; reflects in spend per rules | Forgive |

---

## U. Parse-correction vs split (the critical distinction)  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| EDIT-01 | SMS said ₹4,000, parsed ₹5,000 (parse error) | "Amount is wrong" → overwrite effective; **captured retained** | Correction path |
| EDIT-02 | ₹5,000 really left, ₹1,000 wasn't yours | "Part wasn't mine" → **split**, ₹5,000 stays, ₹1,000 linked | 🔴 Not an overwrite |
| EDIT-03 | After a correction | Balance chain reconciles with corrected value | Correction heals chain |
| EDIT-04 | After a split (overwrite avoided) | Balance chain still sees ₹5,000 (no false discrepancy) | 🔴 Split preserves chain |
| EDIT-05 | Any edit | Both `amount_captured` and `amount_effective` stored | Original immutable |

---

## V. Sync, idempotency & offline  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| SYNC-01 | Parse while offline | Stored locally, queued in outbox | Offline-first |
| SYNC-02 | Network returns | Outbox drains, entries synced | Queue drain |
| SYNC-03 | Same entry synced twice (retry) | Upsert on device-generated id → one row | 🔴 Idempotency |
| SYNC-04 | Real-time sync of new txn | Appears server-side promptly | Real-time |
| SYNC-05 | Concurrent edits | Last-write-wins, no corruption | Concurrency |

---

## W. Privacy & redaction  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| PRIV-01 | Novel template induction | Only **redacted skeleton** sent; zero real amounts/names/balances | 🔴 Redaction |
| PRIV-02 | Adversarial: amount in unusual notation | Still masked before send | Leak prevention |
| PRIV-03 | Server receives a skeleton | Rejects if any amount-like digit-run survives | Server-side enforcement |
| PRIV-04 | Any sync payload | Contains **no raw SMS body** | No-raw-server |
| PRIV-05 | Raw body storage | Device-local + user's Google Drive only | Raw locality |
| PRIV-06 | OTP/promo messages | Discarded, never persisted | Minimisation |
| PRIV-07 | Confirmed txn raw body | Retained (for refund/audit/re-parse) on device | Selective retention |

---

## X. Auth, backup & device switch  🟠

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| AUTH-01 | Google Sign-In | Server verifies ID token against Google certs | Token verification |
| AUTH-02 | Client-asserted identity (forged) | Rejected | Security |
| CONT-01 | Clear app data / cache | Dashboard fully restores from server (structured) | Cache-clear survival |
| CONT-02 | New device, sign in | Structured history present from server | Device switch |
| CONT-03 | New device | Raw bodies restore from **user's** Drive | Drive restore |
| CONT-04 | Raw not on new device before Drive restore | Structured still works; raw is power-feature only | Graceful degradation |

---

## Y. Dashboard & aggregation  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| DASH-01 | Income/Expenses/Savings | Savings == Income − Expenses | Headline math |
| DASH-02 | Refund pair in period | Excluded from totals (net 0) | 🔴 Netting in aggregate |
| DASH-03 | Same refund pair in ledger view | Both visible | Ledger honesty |
| DASH-04 | Fresh mid-cycle install, no salary yet | Income near-zero, labelled "since you installed" | 🔴 Period honesty |
| DASH-05 | by-category sum vs grand total | Equal | Roll-up integrity |
| DASH-06 | by-tag sum vs by-category sum | Equal (single-tag) | Tag integrity |
| DASH-07 | Transfers/top-ups | Excluded from income & expense | Boundary |
| DASH-08 | Current balance per line | From latest balance-bearing SMS | Balance display |

---

## Z. Numeric integrity & robustness  🔴

| ID | Scenario | Expected | Guards |
|---|---|---|---|
| NUM-01 | 1,000 small txns summed | No float drift; exact total | 🔴 Paise integer math |
| NUM-02 | ₹0.01 values | Handled exactly | Sub-rupee |
| NUM-03 | Very large (₹2.5Cr) | No overflow (bigint) | Large values |
| ROBUST-01 | Malformed/unparseable txn SMS | Flagged low-confidence, not silently wrong, no crash | Defensive |
| ROBUST-02 | Unknown bank, no template, LLM unavailable | Queued, retried; not lost | Failure handling |
| ROBUST-03 | Duplicate template induction race | One template wins, idempotent | Library concurrency |

---

## AA. End-to-end scenarios (integration)  🔴

| ID | Scenario | Expected |
|---|---|---|
| E2E-01 | Install → grant SMS → 2-week backfill → dashboard | 3 numbers + top category + biggest payee, period-honest, < 60s feel |
| E2E-02 | Salary in, rent out, 20 UPI spends, 1 refund, 1 wallet load | Income/expense/savings all correct; refund netted; wallet load not counted |
| E2E-03 | Split dinner ₹5,000, 3 UPI + 1 cash settle | Effective spend == your share; unpaid handled per choice |
| E2E-04 | Two HDFC pooled cards + one separate, mixed spends | Pool reconciles; no phantom-drop flags; per-line breakdown correct |
| E2E-05 | Slice account daily interest over a week | One confirm, then silent absorption; interest income shown |
| E2E-06 | Card purchase → EMI conversion → 2 monthly EMIs | Purchase counted once; EMIs not re-counted; limit recovery clean |
| E2E-07 | Bank→Paytm→Swiggy→order | Exactly ONE expense end-to-end |
| E2E-08 | Clear data → reinstall → restore | Full structured restore from server; raw from Drive |

---

## How to use this file

1. **Run the 🔴 set on every change** — these are the totals-corrupting cases; a regression here silently lies to users.
2. **Back each row with a real corpus SMS** where one applies; the illustrative strings are placeholders.
3. **Turn the invariants into property tests** (doc 04 §6, doc 07 §13): by-tag == by-category == grand total; transfers never counted; captured immutable; LLM sees zero real values.
4. **Track the known v1 gaps** (SELF-05 unlinked self-transfer inflation; CASH-01 cash granularity) so they're *accepted*, not *bugs*.
