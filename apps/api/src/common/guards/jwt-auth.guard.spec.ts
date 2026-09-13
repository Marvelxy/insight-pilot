import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function mockReflector(isPublic: boolean) {
  return { getAllAndOverride: jest.fn().mockReturnValue(isPublic || undefined) } as unknown as import('@nestjs/core').Reflector;
}

function mockJwt(impl?: (token: string) => Promise<unknown>) {
  return {
    verifyAsync: jest.fn((t: string) => (impl ? impl(t) : Promise.resolve({ sub: 'user_1' }))),
  } as unknown as import('@nestjs/jwt').JwtService;
}

function ctxWith(headers: Record<string, string>) {
  const req: { headers: Record<string, string>; auth?: unknown } = { headers };
  return { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => req }) } as unknown as import('@nestjs/common').ExecutionContext;
}

describe('JwtAuthGuard global lock', () => {
  const env = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('lets @Public() through with no auth', async () => {
    const guard = new JwtAuthGuard(mockJwt(), mockReflector(true));
    await expect(guard.canActivate(ctxWith({}))).resolves.toBe(true);
  });

  it('accepts a valid Bearer token', async () => {
    const guard = new JwtAuthGuard(mockJwt(), mockReflector(false));
    const ctx = ctxWith({ authorization: 'Bearer good-token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().auth).toMatchObject({ userId: 'user_1' });
  });

  it('rejects an invalid Bearer token', async () => {
    const guard = new JwtAuthGuard(
      mockJwt(() => Promise.reject(new Error('bad'))),
      mockReflector(false),
    );
    await expect(guard.canActivate(ctxWith({ authorization: 'Bearer bad-token' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects missing auth in production', async () => {
    process.env.NODE_ENV = 'production';
    const guard = new JwtAuthGuard(mockJwt(), mockReflector(false));
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows x-user-id fallback outside production (local dev)', async () => {
    process.env.NODE_ENV = 'development';
    const guard = new JwtAuthGuard(mockJwt(), mockReflector(false));
    const ctx = ctxWith({ 'x-user-id': 'dev-user' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().auth).toMatchObject({ userId: 'dev-user' });
  });
});
