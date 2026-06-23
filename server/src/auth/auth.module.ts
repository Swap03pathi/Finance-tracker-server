import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/auth.guard';
import { TokenVerifier, GoogleTokenVerifier } from './token-verifier';

/**
 * Global so AuthGuard + JwtModule are available everywhere. The TokenVerifier provider is overridden
 * by a fake in e2e tests. JWT secret comes from env (server-side only).
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, { provide: TokenVerifier, useClass: GoogleTokenVerifier }],
  exports: [AuthGuard, JwtModule, AuthService],
})
export class AuthModule {}
