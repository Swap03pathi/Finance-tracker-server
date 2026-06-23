import { createHash } from 'crypto';

/**
 * Deterministic UUIDv5 for sync idempotency + cross-SMS dedup (doc 07 §4). A retried sync of the
 * same transaction, OR two SMS for one logical event (bank debit + UPI-app SMS), collide on the
 * same id instead of duplicating. Implemented with node:crypto (no ESM dep).
 */
const NAMESPACE = 'b9f8a4e2-1c3d-4f5a-9b6e-7d8c9a0b1c2d'; // fixed finman namespace

function parseUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function formatUuid(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function uuidv5(name: string, namespace: string = NAMESPACE): string {
  const hash = createHash('sha1').update(Buffer.concat([parseUuid(namespace), Buffer.from(name, 'utf8')])).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  return formatUuid(bytes);
}

/**
 * Fallback dedup window (doc 10 §2.2): used ONLY when the SMS carries no bank reference. Kept SMALL
 * so two genuine same-amount purchases seconds apart stay distinct, while a co-arriving dual-SMS pair
 * (same event reported twice within a few seconds) still collapses. Reference-based dedup is primary.
 */
export const DEDUP_FALLBACK_WINDOW_SEC = 10;

/** Extract the bank's own transaction reference (UPI ref / RRN / UTR / txn id) when present. */
export function extractReference(body: string): string | null {
  // the captured ref must contain a digit ((?=[a-z0-9]*\d)) so a word like "reference" can't be
  // mis-split into "ref" + "erence". Real UPI refs / RRN / UTR / txn ids always carry digits.
  const m = body.match(
    /(?:upi(?:\s*ref(?:erence)?(?:\s*no\.?)?)?|ref(?:erence)?(?:\s*(?:no|id|num)\.?)?|rrn|utr|txn\s*id|transaction\s*id)[:#.\s-]*((?=[a-z0-9]*\d)[a-z0-9]{6,})/i,
  );
  return m ? m[1].toUpperCase() : null;
}

export interface LogicalKeyParts {
  userId: string;
  lineKey: string; // issuer+last4/vpa resolving the line
  direction: string;
  amountPaise: number;
  /** epoch seconds of the txn; used only for the no-reference fallback bucket */
  epochSec: number;
  /** the bank's transaction reference (UPI ref / RRN / txn id) — exact dedup key when present */
  reference?: string | null;
}

/**
 * The id used for upsert. PRIMARY: when a bank reference exists, key on (user|line|reference) — exact,
 * so dual-SMS + retries of the SAME event collapse and two genuinely-distinct txns never do. FALLBACK:
 * with no reference, key on (user|line|dir|amount|small-bucket).
 */
export function logicalEntryId(parts: LogicalKeyParts): string {
  if (parts.reference) {
    return uuidv5(`${parts.userId}|${parts.lineKey}|ref:${parts.reference}`);
  }
  const bucket = Math.floor(parts.epochSec / DEDUP_FALLBACK_WINDOW_SEC);
  return uuidv5(
    `${parts.userId}|${parts.lineKey}|${parts.direction}|${parts.amountPaise}|${bucket}`,
  );
}
