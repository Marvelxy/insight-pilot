import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';

export const ROLES_KEY = 'roles';

/**
 * OrgGuard: ensures the (already JWT-authenticated) request is a member
 * of the target org. Pair with @Roles('OWNER','ADMIN') for RBAC.
 * Runs after the global JwtAuthGuard, so req.auth is normally set.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const orgId: string | undefined = req.params?.orgId ?? req.body?.orgId ?? req.headers['x-org-id'];
    if (!orgId) return true; // global routes

    let userId: string | undefined = req.auth?.userId;
    if (!userId && process.env.NODE_ENV !== 'production') {
      userId = req.headers['x-user-id'];
    }
    if (!userId) throw new UnauthorizedException('Authentication required');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this organization');

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !required.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    req.auth = { userId, orgId, role: membership.role };
    return true;
  }
}
