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

/** Dedup window: two SMS within the same bucket for the same (line, direction, amount) = one event. */
export const DEDUP_WINDOW_SEC = 60;

export interface LogicalKeyParts {
  userId: string;
  lineKey: string; // issuer+last4/vpa resolving the line
  direction: string;
  amountPaise: number;
  /** epoch seconds of the txn; bucketed so near-simultaneous dual SMS collide */
  epochSec: number;
}

/** The id used for upsert: identical logical events (incl. dual-SMS) produce the same id. */
export function logicalEntryId(parts: LogicalKeyParts): string {
  const bucket = Math.floor(parts.epochSec / DEDUP_WINDOW_SEC);
  return uuidv5(
    `${parts.userId}|${parts.lineKey}|${parts.direction}|${parts.amountPaise}|${bucket}`,
  );
}
