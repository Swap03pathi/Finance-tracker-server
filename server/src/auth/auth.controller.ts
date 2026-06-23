import { Body, Controller, Post } from '@nestjs/common';
import { AuthGoogleInput } from '@finman/shared-contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /v1/auth/google { idToken } → { token, user } */
  @Post('google')
  async google(@Body(new ZodValidationPipe(AuthGoogleInput)) body: AuthGoogleInput) {
    return this.auth.authenticate(body.idToken);
  }
}
