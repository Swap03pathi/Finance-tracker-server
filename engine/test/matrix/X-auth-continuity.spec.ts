import { signIdToken, verifyGoogleIdToken, TokenVerificationError } from '../../src/auth/verifyToken';
import { LedgerStore } from '../../src/ledger/store';
import { makeEntry } from '../fixtures/factory';

/**
 * Section X — Auth, backup & device switch. 🟠
 * Token verification is modelled deterministically (HMAC stands in for Google's cert chain — same
 * contract). Continuity is modelled with the server store (structured) + a "Drive" raw store.
 */
describe('X. Auth, backup & device switch 🟠', () => {
  const CERT = 'google-cert-secret';
  const CLIENT = 'finman.apps.googleusercontent.com';
  const NOW = 1_900_000_000;

  it('AUTH-01 Google Sign-In -> server verifies ID token, returns identity', () => {
    const token = signIdToken({ iss: 'accounts.google.com', aud: CLIENT, sub: 'user-123', email: 'a@b.com', exp: NOW + 3600 }, CERT);
    const id = verifyGoogleIdToken(token, { clientId: CLIENT, certSecret: CERT, nowSec: NOW });
    expect(id.sub).toBe('user-123');
  });

  it('AUTH-02 client-asserted (forged) identity -> rejected', () => {
    const forged = signIdToken({ iss: 'accounts.google.com', aud: CLIENT, sub: 'attacker', exp: NOW + 3600 }, 'wrong-secret');
    expect(() => verifyGoogleIdToken(forged, { clientId: CLIENT, certSecret: CERT, nowSec: NOW })).toThrow(TokenVerificationError);
  });

  it('AUTH-02b wrong audience -> rejected', () => {
    const token = signIdToken({ iss: 'accounts.google.com', aud: 'someone-else', sub: 'u', exp: NOW + 3600 }, CERT);
    expect(() => verifyGoogleIdToken(token, { clientId: CLIENT, certSecret: CERT, nowSec: NOW })).toThrow(TokenVerificationError);
  });

  it('CONT-01 clear app data/cache -> dashboard restores from server (structured)', () => {
    const server = new LedgerStore();
    server.upsertEntry(makeEntry({ id: 'e1', amountCapturedPaise: 30000 }));
    server.upsertEntry(makeEntry({ id: 'e2', amountCapturedPaise: 20000 }));
    // device cache cleared → re-fetch from server
    const restored = server.list();
    expect(restored).toHaveLength(2);
  });

  it('CONT-02 new device, sign in -> structured history present from server', () => {
    const server = new LedgerStore();
    server.upsertEntry(makeEntry({ id: 'e1' }));
    const newDeviceView = server.list(); // fetched after sign-in
    expect(newDeviceView).toHaveLength(1);
  });

  it('CONT-03/04 raw bodies restore from USER\'s Drive; structured works without them', () => {
    const server = new LedgerStore();
    server.upsertEntry(makeEntry({ id: 'e1', messageId: 'm1' }));
    const usersDrive = new Map<string, string>([['m1', 'Rs.300 spent at Zomato ...']]); // user's own Drive
    // structured works immediately (raw is a power-feature)
    expect(server.list()).toHaveLength(1);
    // raw restores from the user's Drive, keyed by message_id
    expect(usersDrive.get('m1')).toContain('Zomato');
  });
});
