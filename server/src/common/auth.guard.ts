import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Verifies the Bearer session JWT and attaches `userId` to the request (doc 07 §12). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('missing bearer token');
    try {
      req.userId = this.jwt.verify(header.slice(7)).sub;
      return true;
    } catch {
      throw new UnauthorizedException('invalid session token');
    }
  }
}
