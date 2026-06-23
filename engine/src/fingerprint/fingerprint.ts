import { createHash } from 'crypto';
import { maskBody } from './mask';

/**
 * Structural fingerprint (doc 07 §7): sha256 of the masked skeleton. Sender-independent (operates
 * on the body shape only), so the same message shape yields the same fingerprint regardless of
 * routing (VM-/IX-). A changed bank wording is a different skeleton → a different fingerprint → a
 * new template (no versioning, doc 02 §2.2).
 */
export function fingerprint(body: string): string {
  return createHash('sha256').update(maskBody(body)).digest('hex');
}
