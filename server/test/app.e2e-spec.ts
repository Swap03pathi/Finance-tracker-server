import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenVerifier, VerifiedIdentity } from '../src/auth/token-verifier';
import { PrismaService } from '../src/prisma/prisma.service';

/** Fake verifier — we can't mint real Google tokens locally; "fake:<sub>" → that sub. */
class FakeVerifier extends TokenVerifier {
  async verify(idToken: string): Promise<VerifiedIdentity> {
    if (!idToken.startsWith('fake:')) throw new Error('bad token');
    const sub = idToken.slice('fake:'.length);
    return { sub, email: `${sub}@example.com` };
  }
}

describe('Phase 1 server API (e2e, real embedded Postgres) 🔴', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenVerifier)
      .useClass(FakeVerifier)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
    prisma = app.get(PrismaService);
    // deterministic state
    await prisma.ledgerEntry.deleteMany();
    await prisma.instrument.deleteMany();
    await prisma.line.deleteMany();
    await prisma.template.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('AUTH-01 valid Google token → session JWT', async () => {
    const res = await http().post('/v1/auth/google').send({ idToken: 'fake:user-1' }).expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.id).toBeTruthy();
    token = res.body.token;
  });

  it('AUTH-02 unauthenticated request → 401', () => http().get('/v1/dashboard').expect(401));

  it('AUTH-02b forged/garbage token → 401', () =>
    http().get('/v1/dashboard').set('Authorization', 'Bearer not-a-jwt').expect(401));

  it('SYNC-03 same entry synced twice → exactly ONE row (idempotent)', async () => {
    const entry = {
      id: '11111111-1111-5111-8111-111111111111',
      hint: { issuer: 'HDFCBK', last4: '1234', instrumentKind: 'credit_card' as const },
      direction: 'EXPENSE' as const,
      modality: 'actual' as const,
      amountCaptured: '450.00',
      categoryId: 1,
      merchantText: 'Zomato',
      txnTime: '2026-06-02T10:00:00.000Z',
      source: 'sms' as const,
    };
    const auth = { Authorization: `Bearer ${token}` };
    await http().post('/v1/entries').set(auth).send({ entries: [entry] }).expect(201);
    await http().post('/v1/entries').set(auth).send({ entries: [entry] }).expect(201); // retry
    const list = await http().get('/v1/entries').set(auth).expect(200);
    expect(list.body.filter((e: any) => e.id === entry.id)).toHaveLength(1);
  });

  it('PRIV-03 induce with a surviving digit-run → 422 (server-side redaction reject)', () =>
    http()
      .post('/v1/templates/induce')
      .set('Authorization', `Bearer ${token}`)
      .send({ redactedSkeleton: 'rs 4500 debited at zomato', fingerprint: 'deadbeefcafe' })
      .expect(422));

  it('TMPL induce a clean skeleton → template trusted & retrievable', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const res = await http()
      .post('/v1/templates/induce')
      .set(auth)
      .send({ redactedSkeleton: '§AMT§ spent at §MERCHANT§ from a/c §ACCT§ on §DATE§. avl bal §AMT§', fingerprint: 'fp-hdfc-upi-debit', issuer: 'HDFCBK' })
      .expect(201);
    expect(res.body.trustState).toBe('trusted');
    const list = await http().get('/v1/templates').set(auth).expect(200);
    expect(list.body.some((t: any) => t.fingerprint === 'fp-hdfc-upi-debit')).toBe(true);
  });

  it('DASH-01/07 dashboard: savings == income − expenses; transfers excluded', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const entries = [
      { id: '22222222-2222-5222-8222-222222222222', hint: { issuer: 'SBIINB', last4: '3456', instrumentKind: 'netbanking' as const, lineKind: 'bank' as const }, direction: 'INCOME' as const, modality: 'actual' as const, amountCaptured: '65000.00', categoryId: 8, source: 'sms' as const },
      { id: '33333333-3333-5333-8333-333333333333', hint: { issuer: 'HDFCBK', last4: '1234', instrumentKind: 'credit_card' as const }, direction: 'EXPENSE' as const, modality: 'actual' as const, amountCaptured: '2000.00', categoryId: 3, source: 'sms' as const },
      { id: '44444444-4444-5444-8444-444444444444', hint: { issuer: 'PAYTM', vpa: null, instrumentKind: 'vpa' as const, lineKind: 'wallet' as const }, direction: 'TRANSFER' as const, modality: 'actual' as const, amountCaptured: '5000.00', source: 'sms' as const },
    ];
    await http().post('/v1/entries').set(auth).send({ entries }).expect(201);
    const dash = await http().get('/v1/dashboard').set(auth).expect(200);
    // income 65000, expense 450 (Zomato) + 2000 (rent) = 2450, transfer excluded
    expect(dash.body.income).toBe('65000.00');
    expect(dash.body.expenses).toBe('2450.00');
    expect(dash.body.savings).toBe('62550.00');
    expect(dash.body.period.label).toBe('since you installed');
  });

  it('DASH-05/06 by-category total == by-tag total (single-tag invariant over the API)', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const sum = (rows: any[]) => rows.reduce((a, r) => a + Math.round(parseFloat(r.amount) * 100), 0);
    const cat = await http().get('/v1/breakdown?by=category').set(auth).expect(200);
    const tag = await http().get('/v1/breakdown?by=tag').set(auth).expect(200);
    expect(sum(cat.body)).toBe(sum(tag.body));
  });
});
