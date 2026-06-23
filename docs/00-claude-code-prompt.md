# Claude Code — Kickoff Prompt

Paste the block below into Claude Code (terminal) from the directory containing the `docs/` folder (files 01–07).

---

You are building the MVP for an AI Personal CFO — an Android-first personal finance app for India that constructs a complete cross-account financial picture purely from transaction SMS, parsed on-device, with no bank credentials.

Before writing any code, read all of these in order — they are the complete, agreed specification:

- docs/01-product-description.md      — what we're building and why
- docs/02-backend-planning.md         — strategy, device/server split, build sequence
- docs/03-backend-design.md           — components and data flows (mermaid)
- docs/04-database-design.md          — full PostgreSQL schema
- docs/05-frontend-screens.md         — screens and flows
- docs/06-task-list.md                — phased, checkboxed plan with exit-tests
- docs/07-implementation-notes-and-gaps.md — coding-level specifics & hard constraints

These docs are the product of a long, deliberate design process. Treat them as authoritative. Where 07 conflicts with another doc on a *decision*, the other doc wins; where 07 adds concrete *detail*, follow it.

## How I want you to work

1. **Plan first, confirm, then build.** Start by reading everything and producing: (a) a short confirmation of the architecture as you understand it, (b) the concrete tech-stack choices you propose (resolve the open decisions in doc 07 §14 with a recommendation + reasoning), and (c) the repo/folder structure. Stop and let me approve before scaffolding.
2. **Follow the phase order in doc 06.** The critical path is Phases 1–4 (capture SMS into correct structured data). Do not jump ahead to analysis or deferred features.
3. **Build the schema first** (doc 04) as real migrations, then work phase by phase. After each phase, run its exit-test from doc 06 and report results before moving on.
4. **Ask me at decision points**, don't silently default — especially the open decisions in doc 07 §14.

## Hard constraints (from doc 07 §15 — do not violate)

- Money is integer paise (or NUMERIC) — never floats.
- No unmasked message content ever goes to the LLM or any server; redaction enforced device-side AND server-side.
- Raw SMS bodies are never persisted server-side (device-local + user's Google Drive only).
- Do not build deferred features: AI advice/suggestions, goals, Money Roast, automatic self-transfer detection, Account Aggregator / email / iOS.
- amount_captured is immutable; corrections write amount_effective; both retained.
- TRANSFER / TOPUP / future / hold / mandate / failed entries never count toward income or expense.
- by-tag totals must always reconcile to by-category totals (single-tag invariant).
- Period-honest UI: never imply a full month when only ~2 weeks of data exist.

## First task

Read all seven docs, then give me: the architecture confirmation, your proposed stack with the open decisions resolved, and the folder structure. Do not write implementation code yet — wait for my go-ahead.
