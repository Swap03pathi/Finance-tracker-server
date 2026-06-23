/**
 * @finman/engine — framework-agnostic SMS parsing core.
 *
 * Built phase-by-phase per docs/06-task-list.md (critical path: Phases 1–4):
 *   - Phase 1: gating (sender normalisation, cheap rule gate, dedup buffer)
 *   - Phase 2: fingerprint (structural masker; SAME code path as the redactor)
 *   - Phase 3: redaction (zero real values leave the device) + induction client
 *   - shared: parseAmount(str) -> Decimal (Indian + Western notation)
 *
 * Rule/config lists live in ../config as DATA, not code (doc 07 §6), so they update without a release.
 * Nothing here yet — this is the schema-stage scaffold.
 */
export const ENGINE_VERSION = '0.1.0';
