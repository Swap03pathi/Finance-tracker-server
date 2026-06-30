import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/auth.guard';
import { TokenVerifier, GoogleTokenVerifier } from './token-verifier';

/**
 * The session-JWT signing secret. FAIL-CLOSED: a missing or weak secret means anyone could forge a
 * token for any user id (full account takeover / IDOR), so we refuse to boot instead of silently
 * falling back to a known default. Tests set JWT_SECRET in test/setup-env.ts.
 */
function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16 || secret === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a strong (>=16 char) value before starting the server');
  }
  return secret;
}

/**
 * Global so AuthGuard + JwtModule are available everywhere. The TokenVerifier provider is overridden
 * by a fake in e2e tests. JWT secret comes from env (server-side only).
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, { provide: TokenVerifier, useClass: GoogleTokenVerifier }],
  exports: [AuthGuard, JwtModule, AuthService],
})
export class AuthModule {}
