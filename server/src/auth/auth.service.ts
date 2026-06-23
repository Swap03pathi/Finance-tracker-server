import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TokenVerifier } from './token-verifier';

/** Verify a Google ID token, upsert the user by google_sub, and issue a session JWT (doc 07 §12). */
@Injectable()
export class AuthService {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(idToken: string): Promise<{ token: string; user: { id: string; email: string | null } }> {
    const identity = await this.verifier.verify(idToken);
    const user = await this.prisma.user.upsert({
      where: { googleSub: identity.sub },
      create: { googleSub: identity.sub, email: identity.email ?? null },
      update: { email: identity.email ?? undefined },
    });
    const token = this.jwt.sign({ sub: user.id });
    return { token, user: { id: user.id, email: user.email } };
  }
}
