/**
 * @finman/shared-contracts — the device<->server wire contract.
 *
 * zod schemas + inferred TS types for the v1 REST surface (doc 07 §5):
 *   /auth/google, /templates, /templates/induce, /entries, /settlements,
 *   /lines, /instruments, /payees, /tags, /discrepancies, /dashboard, /breakdown.
 *
 * Money crosses the wire as a STRING (e.g. "1234.50") and is parsed with decimal.js on
 * both sides — never as a JS number (doc 07 §1). Filled in alongside the API in later phases.
 */
export const CONTRACTS_VERSION = '0.1.0';
