import { UnauthorizedException, createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthContext {
  userId: string;
  orgId?: string;
  role?: string;
}

/**
 * Returns the auth context attached by the global JwtAuthGuard.
 * Dev fallback (x-user-id headers) applies only outside production.
 */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest();
    if (req.auth?.userId) return req.auth as AuthContext;
    if (process.env.NODE_ENV !== 'production' && req.headers?.['x-user-id']) {
      return {
        userId: req.headers['x-user-id'],
        orgId: req.headers['x-org-id'],
        role: req.headers['x-org-role'],
      };
    }
    throw new UnauthorizedException('Authentication required');
  },
);
