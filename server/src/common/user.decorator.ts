import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the authenticated `userId` (set by AuthGuard) into a handler param. */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().userId;
});
