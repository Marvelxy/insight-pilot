import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global guard (APP_GUARD): every route needs a valid Bearer JWT,
 * except handlers/classes marked @Public().
 *
 * Dev convenience: with no Bearer header and NODE_ENV !== 'production',
 * `x-user-id` is accepted so local curl / seed flows keep working.
 * In production that fallback is closed — missing/invalid token → 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7);
      if (!token) throw new UnauthorizedException('Malformed authorization header');
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; orgId?: string; role?: string }>(token);
        req.auth = { userId: payload.sub, orgId: payload.orgId, role: payload.role };
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      const devUser: string | undefined = req.headers?.['x-user-id'];
      if (devUser) {
        req.auth = { userId: devUser, orgId: req.headers?.['x-org-id'], role: req.headers?.['x-org-role'] };
        return true;
      }
    }
    throw new UnauthorizedException('Authentication required');
  }
}
