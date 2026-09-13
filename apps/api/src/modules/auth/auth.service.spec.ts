import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    membership: { findFirst: jest.fn(), findUnique: jest.fn() },
    organization: { create: jest.fn() },
    subscription: { create: jest.fn() },
    ...overrides,
  } as unknown as import('../prisma/prisma.service').PrismaService;
}

function mockJwt() {
  return { signAsync: jest.fn().mockResolvedValue('jwt-token') } as unknown as import('@nestjs/jwt').JwtService;
}

describe('AuthService password auth', () => {
  it('register hashes password and provisions personal org', async () => {
    const prisma = mockPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockImplementation(({ data }: { data: { email: string } }) =>
      Promise.resolve({ id: 'user_abc123', email: data.email, name: undefined }),
    );
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organization.create as jest.Mock).mockResolvedValue({ id: 'org_1' });
    (prisma.membership.findUnique as jest.Mock).mockResolvedValue({ role: 'OWNER', organizationId: 'org_1' });
    (prisma.subscription.create as jest.Mock).mockResolvedValue({});

    const svc = new AuthService(prisma, mockJwt());
    const res = await svc.register('New@Example.com', 'password123', 'New');

    expect(res.access_token).toBe('jwt-token');
    expect(res.orgId).toBe('org_1');
    const created = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
    expect(created.email).toBe('new@example.com');
    expect(created.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', created.passwordHash)).toBe(true);
  });

  it('register conflicts when email already has password', async () => {
    const prisma = mockPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', passwordHash: 'hash' });
    const svc = new AuthService(prisma, mockJwt());
    await expect(svc.register('a@b.c', 'password123')).rejects.toBeInstanceOf(ConflictException);
  });

  it('login rejects wrong password', async () => {
    const prisma = mockPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      passwordHash: await bcrypt.hash('correct-horse', 4),
    });
    const svc = new AuthService(prisma, mockJwt());
    await expect(svc.login('a@b.c', 'wrong-pass')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login returns token + org on success', async () => {
    const prisma = mockPrisma();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: null,
      passwordHash: await bcrypt.hash('secret123', 4),
    });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({ organizationId: 'org_9', role: 'ADMIN' });
    const svc = new AuthService(prisma, mockJwt());
    const res = await svc.login('a@b.c', 'secret123');
    expect(res.access_token).toBe('jwt-token');
    expect(res.orgId).toBe('org_9');
  });
});
