import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface VerifiedIdentity {
  sub: string;
  email?: string;
}

/** DI token for ID-token verification — overridden by a fake in e2e tests (can't mint real Google tokens). */
export abstract class TokenVerifier {
  abstract verify(idToken: string): Promise<VerifiedIdentity>;
}

/** Production verifier: validates the Google ID token against Google's certs (doc 07 §12). */
@Injectable()
export class GoogleTokenVerifier extends TokenVerifier {
  private readonly client = new OAuth2Client();

  async verify(idToken: string): Promise<VerifiedIdentity> {
    const ticket = await this.client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new UnauthorizedException('invalid Google ID token');
    return { sub: payload.sub, email: payload.email };
  }
}
