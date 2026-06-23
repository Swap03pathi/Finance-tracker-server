import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Google ID-token verification CONTRACT (doc 07 §12, doc 08 §X). The server must verify the ID token
 * against Google's certs on every /auth/google and NEVER trust a client-asserted identity.
 *
 * Here we model the contract deterministically with an HMAC signature standing in for Google's RS256
 * cert chain (a client cannot forge it without the key) so AUTH-01/02 are testable offline. The real
 * server swaps the HMAC check for Google's public-key (JWK) verification — same contract, real certs.
 */
export interface IdTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  exp: number; // epoch seconds
}

export class TokenVerificationError extends Error {}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Test/helper: mint a signed token (stands in for Google issuing one). */
export function signIdToken(payload: IdTokenPayload, certSecret: string): string {
  const body = b64(payload);
  const sig = createHmac('sha256', certSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export interface VerifiedIdentity {
  sub: string;
  email?: string;
}

export function verifyGoogleIdToken(
  token: string,
  opts: { clientId: string; certSecret: string; nowSec: number },
): VerifiedIdentity {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new TokenVerificationError('malformed token');

  const expected = createHmac('sha256', opts.certSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new TokenVerificationError('bad signature'); // forged / client-asserted identity → rejected
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as IdTokenPayload;
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new TokenVerificationError('bad issuer');
  }
  if (payload.aud !== opts.clientId) throw new TokenVerificationError('bad audience');
  if (payload.exp < opts.nowSec) throw new TokenVerificationError('expired');

  return { sub: payload.sub, email: payload.email };
}
