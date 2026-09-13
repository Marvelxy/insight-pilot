import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing?.passwordHash) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(password, 12);
    let user = existing;
    if (!user) {
      user = await this.prisma.user.create({ data: { email: normalized, name, passwordHash } });
    } else {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash, ...(name ? { name } : {}) } });
    }
    // Auto-provision a personal org so the account is usable immediately.
    const slugBase = normalized.split('@')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
    const slug = `${slugBase}-${user.id.slice(-6).toLowerCase()}`;
    let membership = await this.prisma.membership.findFirst({ where: { userId: user.id } });
    let orgId = membership?.organizationId;
    if (!membership) {
      const org = await this.prisma.organization.create({
        data: { name: `${name ?? normalized}'s workspace`, slug, memberships: { create: { userId: user.id, role: 'OWNER' } } },
      });
      await this.prisma.subscription.create({ data: { organizationId: org.id, plan: 'FREE', status: 'ACTIVE' } }).catch(() => undefined);
      orgId = org.id;
      membership = await this.prisma.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      });
    }
    const token = await this.jwt.signAsync({ sub: user.id, orgId, role: membership?.role ?? 'OWNER' });
    return { access_token: token, user: { id: user.id, email: user.email, name: user.name }, orgId };
  }

  async login(email: string, password: string, orgId?: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    let membership = orgId
      ? await this.prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: orgId } } })
      : await this.prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    if (!membership) throw new ForbiddenException('No organization membership — ask an OWNER to invite you');
    const token = await this.jwt.signAsync({ sub: user.id, orgId: membership.organizationId, role: membership.role });
    return {
      access_token: token,
      user: { id: user.id, email: user.email, name: user.name },
      orgId: membership.organizationId,
      role: membership.role,
    };
  }
}
