# SMS corpus

**The corpus is the spec** (doc 07 §13). Every gate rule, fingerprint, and template is validated
against a hand-labelled dump of real transaction SMS with expected extractions.

## Layout

- `public/` — synthetic / fully-anonymised sample messages safe to commit (golden fixtures).
- `private/` — real volunteer-device dumps. **Git-ignored. May contain PII. Never commit.**

Each labelled fixture is `{ sender, body, expected: { gate, fingerprint?, fields? } }`.

## How it's used

- Phase 1: run the gate over the corpus; measure false-pass / false-drop; iterate rules.
- Phase 2: hand-seeded templates must extract their bank's fields correctly across the corpus.
- Phase 3: redaction adversarial suite asserts zero real values survive into any skeleton.
