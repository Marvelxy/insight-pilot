import type { PrismaService } from '../prisma/prisma.service';
import { UsageService } from './usage.service';

function mockPrisma(monthlyQueries: number): PrismaService {
  return {
    usageEvent: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ type: 'CHAT_QUERY', _sum: { quantity: monthlyQueries } }]),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue({ plan: 'FREE' }) },
  } as unknown as PrismaService;
}

describe('UsageService quota', () => {
  it('allows FREE under 50 queries', async () => {
    const svc = new UsageService(mockPrisma(10));
    await expect(svc.enforceQuota('org_1')).resolves.toBeUndefined();
  });

  it('blocks FREE over quota', async () => {
    const svc = new UsageService(mockPrisma(55));
    await expect(svc.enforceQuota('org_1')).rejects.toThrow('quota');
  });
});
