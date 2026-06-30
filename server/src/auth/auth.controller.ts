import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGoogleInput, AuthDevInput } from '@finman/shared-contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

// Tighter than the global 200/min: the auth surface is the highest-value target, and no honest client
// needs more than a handful of sign-ins a minute.
@Throttle({ default: { ttl: 60_000, limit: 30 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /v1/auth/google { idToken } → { token, user } */
  @Post('google')
  async google(@Body(new ZodValidationPipe(AuthGoogleInput)) body: AuthGoogleInput) {
    return this.auth.authenticate(body.idToken);
  }

  /** POST /v1/auth/dev { deviceKey } → { token, user } — pilot only, env-gated (404 when disabled). */
  @Post('dev')
  async dev(@Body(new ZodValidationPipe(AuthDevInput)) body: AuthDevInput) {
    if (process.env.ALLOW_DEV_AUTH !== 'true') throw new NotFoundException();
    return this.auth.authenticateDev(body.deviceKey);
  }
}
