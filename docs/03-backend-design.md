# Backend Design — AI Personal CFO (Android MVP)

> Concrete component design and data flows. Strategy/sequencing is in `02-backend-planning.md`; schema is in `04-database-design.md`.

---

## 1. System context

```mermaid
flowchart TB
    subgraph Device["📱 Android Device (private)"]
        SMS[SMS Inbox] --> ING[Ingestion + Gating]
        ING --> FP[Fingerprint Engine]
        FP --> TM[Local Template Cache]
        TM --> PARSE[On-device Parser]
        PARSE --> RAW[(Raw store - local)]
        RAW --> DRIVE[User's Google Drive backup]
    end

    subgraph Server["☁️ Backend (system of record)"]
        API[Sync / Read API]
        LIB[Shared Template Library]
        LLM_SVC[LLM Induction Service<br/>+ redaction + trust gate]
        LEDGER[Ledger Service]
        RECON[Reconciliation Engine]
        LINK[Settlement / Linking Engine]
        AGG[Aggregation Service]
        DB[(PostgreSQL)]
    end

    subgraph Ext["External"]
        OPENAI[OpenAI API]
        GAUTH[Google Sign-In]
    end

    PARSE -->|structured txn, real-time| API
    FP -->|redacted skeleton, on miss| LLM_SVC
    TM <-->|fetch trusted templates| LIB
    LLM_SVC --> OPENAI
    LLM_SVC --> LIB
    API --> LEDGER
    LEDGER --> DB
    LEDGER --> RECON
    LEDGER --> LINK
    RECON --> DB
    LINK --> DB
    AGG --> DB
    API --> AGG
    Device -.->|login| GAUTH
    API -.->|verify| GAUTH

    style Device fill:#1e2a1e,color:#fff
    style Server fill:#1e2533,color:#fff
    style RAW fill:#3a2c2c,color:#fff
    style LLM_SVC fill:#4a2c2c,color:#fff
```

**Read this as:** raw stays left (device); only the two arrows crossing into the server carry data off the phone — the structured transaction (real values, but no raw text) and the redacted skeleton (no real values at all).

---

## 2. The ingestion pipeline (per SMS)

```mermaid
flowchart TD
    A[Incoming SMS] --> B{Sender shape}
    B -->|10-digit numeric| X1[DROP: personal]
    B -->|Alphanumeric DLT header| C{User denylist?}
    C -->|Yes| X2[DROP: muted]
    C -->|No| D[Normalise sender<br/>strip VM-/IX-/-S → HDFCBK]
    D --> E{Cheap gate:<br/>amount token + txn verb<br/>+ NOT OTP/promo/failed}
    E -->|Fail| F{OTP / refund-notice?}
    F -->|OTP| G[Buffer briefly for dedup<br/>then discard]
    F -->|Refund notice| H[Create PENDING settlement]
    F -->|Neither| X3[DROP: noise, never templated]
    E -->|Pass| I[Compute structural fingerprint<br/>amounts/dates/nums/tails → slots]
    I --> J{Template for fingerprint?}
    J -->|Local cache| K[Parse locally - ZERO cost]
    J -->|Shared library| K
    J -->|MISS| L[Redact → batch → LLM induction]
    L --> M[Synthesise regex + named groups]
    M --> N{Round-trip validate<br/>vs buffered cluster}
    N -->|Pass| O[Add as PROVISIONAL to library]
    N -->|Fail| P[Flag low-confidence, queue]
    O --> K
    K --> Q[Modality + money-type classify]
    Q --> R{Modality?}
    R -->|actual| S[Dedup + link checks]
    R -->|future/hold/mandate/<br/>conditional/failed| T[Record in own state<br/>NOT counted]
    S --> U[(Persist structured entry → server)]
    S --> V[(Keep raw body → device + Drive)]

    style L fill:#4a2c2c,color:#fff
    style K fill:#1e3a2e,color:#fff
    style X1 fill:#3a3a1e,color:#fff
    style X3 fill:#3a3a1e,color:#fff
```

---

## 3. Template lifecycle (shared library + trust gate)

```mermaid
flowchart TD
    A[Novel fingerprint, no template] --> B[Redact representative skeleton]
    B --> C[LLM: identify slots<br/>amount/merchant/date/balance/last4/ref/type]
    C --> D[Synthesise regex template]
    D --> E[Round-trip validate vs all<br/>buffered msgs in cluster]
    E -->|Fail| F[Discard / queue for review]
    E -->|Pass| G[Store as PROVISIONAL<br/>shared library]
    G --> H[Internal trust gate:<br/>5-6 runs comparing regex extraction<br/>vs fresh LLM extraction on real examples]
    H -->|Agree| I[Promote to TRUSTED<br/>parses silently for ALL users]
    H -->|Disagree| J[Flag template, re-test]
    J --> H
    I -.bank changes format = new fingerprint.-> A

    style C fill:#4a2c2c,color:#fff
    style I fill:#1e3a2e,color:#fff
    style H fill:#2c3a4a,color:#fff
```

No versioning: a changed bank format is a new fingerprint and a fresh template. An existing working template is reused for its shape indefinitely.

---

## 4. The money model — lines & instruments

```mermaid
flowchart TD
    subgraph Resolution["Every entry resolves to a LINE"]
        direction TB
        E[Ledger entry<br/>records the INSTRUMENT used] --> RES[Resolve instrument → line]
    end

    subgraph HDFC["Auto-discovered from SMS"]
        P1[Credit Line P1<br/>limit 2L · available reconciles here]
        P2[Credit Line P2<br/>limit 1L · separate]
        BL[Bank Line · balance]
    end

    C1[Card ••1234] --> P1
    C2[Card ••5678] --> P1
    C3[Card ••9012] --> P2
    DC[Debit ••3456] --> BL
    UPI[VPA user@okhdfc] --> BL

    P1 -.spend on either card draws same pool.-> NOTE[Phantom limit drop on unused<br/>card = EXPECTED, not a discrepancy]

    style P1 fill:#4a2c2c,color:#fff
    style BL fill:#1e3a2e,color:#fff
    style NOTE fill:#2c3a4a,color:#fff
```

- Instruments are **auto-materialised** on first `(issuer, last4)` sighting.
- **Shared-limit detection:** two same-issuer credit instruments whose available-limits track each other → suggest a shared pool; **default to separate** until confirmed (under-merge is detectable & fixable; over-merge corrupts silently).
- **Missing last-4** → attribute to an "unattributed at \<issuer\>" bucket, never a guessed card.
- Strict **one-instrument-to-one-line**; EMI/loan is its own line the instrument references.

---

## 5. Money classification (the boundary)

```mermaid
flowchart LR
    Bank[Bank Line] -->|TRANSFER| Paytm[Paytm Wallet]
    Paytm -->|TRANSFER| Swiggy[Swiggy Wallet]
    Swiggy -->|EXPENSE - the only one| Order[Swiggy Order ·EXTERNAL]
    GC[Gift card ·external] -->|TOPUP - not income| Amazon[Amazon Pay]
    Amazon -->|EXPENSE| Buy[Purchase ·EXTERNAL]
    Employer[Employer ·external] -->|INCOME| Bank

    style Order fill:#4a2c2c,color:#fff
    style Buy fill:#4a2c2c,color:#fff
    style Bank fill:#1e3a2e,color:#fff
```

Only `EXPENSE` and `INCOME` touch the headline numbers. `TRANSFER` and `TOPUP` move balances without affecting income/expense. Counterparty is resolved against the **own-node registry** (seeded for major wallets, learned via self-transfer/top-up linking).

---

## 6. Settlement / linking engine

```mermaid
flowchart TD
    OUT[Outflow ₹5,000 dinner] --> SPLIT[Mark split · your share ₹1,000]
    SPLIT --> EXP[Effective spend = base − Σ settlements]
    IN1[Inbound ₹1,000 friend A] -->|suggest link · user confirms| EXP
    IN2[Inbound ₹1,000 friend B] -->|suggest link| EXP
    CASH[Manual cash ₹1,000 friend C] -->|user adds + links| EXP
    EXP --> PEND{Friend D unpaid}
    PEND -->|stays YOUR expense - realized| DASH[Spend reflects only settled]
    PEND --> CHOICE{User choice}
    CHOICE -->|Forgive| WO[Write-off → re-adds to YOUR expense]
    CHOICE -->|Keep tracking| REC[Receivable owed to you]

    REF[Refund SMS] -->|link to original| NET[Aggregate nets to true amount]
    SELF[Debit+Credit own accounts] -->|user links| OWN[Register own-node · both drop out]

    style EXP fill:#4a2c2c,color:#fff
    style DASH fill:#1e3a2e,color:#fff
    style NET fill:#1e3a2e,color:#fff
```

Same engine, four entry points (refund / reimbursement / split / self-transfer). **Suggest-confirm-edit**; never silent when ambiguous. Aggregate view nets; ledger view keeps entries distinct.

---

## 7. Reconciliation engine

```mermaid
flowchart TD
    A[Entries with balance, per line] --> B[Sort by balance-implied order]
    B --> C{closing[n] == closing[n-1] ± amt?}
    C -->|Yes| OK[Chain holds · confidence up]
    C -->|No| D{Classify gap}
    D -->|Balance down, no debit| MO[MISSING_OUTFLOW]
    D -->|Balance up, no credit| MI{Interest-mode line?}
    MI -->|Yes & matches balance×rate| ABS[Absorb as interest income · silent]
    MI -->|No, or magnitude off| FLAG[Flag · ask user once]
    FLAG -->|User: it's interest| LEARN[Learn rate · enable interest-mode]
    D -->|Limit drop then monthly recover| EMI[SUSPECTED_EMI · offer liability]
    D -->|Same amt, tight window| DUP[SUSPECTED_DUPLICATE · offer merge]
    D -->|Credit after debit, same merchant| RF[SUSPECTED_REFUND · offer net]
    MO --> RES[User: label / add manual / ignore]
    RES --> DONE[(Resolution stored · confidence recomputed)]
    ABS --> DONE
    LEARN --> DONE

    style FLAG fill:#4a2c2c,color:#fff
    style ABS fill:#1e3a2e,color:#fff
    style DONE fill:#1e3a2e,color:#fff
```

Holds get a dip-then-recover state (not a missed txn). Card lines use inverted logic. Anchoring is forward-only from the first balance-bearing SMS, no opening-balance prompt.

---

## 8. Sync & continuity

```mermaid
sequenceDiagram
    participant D as Device
    participant G as Google
    participant API as Backend API
    participant DB as PostgreSQL
    participant Drive as User's Drive

    D->>G: Sign in
    G-->>D: identity token
    D->>API: authenticate(token)
    API->>G: verify
    API-->>D: session

    Note over D: parse SMS on-device
    D->>API: POST structured txn (real-time)
    API->>DB: persist entry → ledger/recon/link
    D->>Drive: backup raw body (confirmed txns)

    Note over D: new device later
    D->>API: GET structured history
    API-->>D: full ledger (from server)
    D->>Drive: restore raw bodies (from user's Drive)
```

Structured data is the server's responsibility (survives device loss); raw bodies are the user's (in their Drive). The two never mix.

---

## 9. Service responsibilities (summary)

| Service | Owns | Notes |
|---|---|---|
| **Sync/Read API** | Auth, ingest of structured txns, read endpoints | Real-time write; verifies Google identity. |
| **Template Library** | Shared fingerprint→template store, trust state | Provisional → trusted promotion. |
| **LLM Induction** | Redacted skeleton → slot map → regex; trust-gate runs | Only path off-device for derived data; OpenAI behind abstraction. |
| **Ledger** | Lines, instruments, entries; auto-discovery; classification | System of record for structured money. |
| **Reconciliation** | Balance chains, discrepancies, holds, interest-mode | Per-line confidence signal. |
| **Settlement/Linking** | Refund/reimburse/split/self-transfer links, effective amounts | Suggest-confirm-edit; write-off flips to expense. |
| **Aggregation** | The 3 numbers + breakdowns by category/tag/line | Nets linked entries; respects period-honesty. |

---

## 10. Failure & edge handling (design-level)

- **Redaction bug** → privacy breach: dual enforcement (device + server), highest test coverage.
- **Poisoned shared template** → provisional-until-corroborated trust gate.
- **Out-of-order SMS** → reconcile by balance-implied order, not receipt time.
- **Wallet-internal spend with no SMS** → wallet balances marked soft/estimated; flag stale top-ups.
- **Cross-source dedup** (future AA/email): `source_priority` so authoritative sources supersede inferred ones. Not in v1 but the entry carries a `source` discriminator now.
- **Cache-clear / device-switch** → structured restores from server, raw from user's Drive.
