import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService) {}

  track(organizationId: string, type: 'CHAT_QUERY' | 'INGEST_CHUNKS' | 'API_CALL', quantity = 1) {
    return this.prisma.usageEvent.create({ data: { organizationId, type, quantity } });
  }

  async monthlyUsage(organizationId: string) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const rows = await this.prisma.usageEvent.groupBy({
      by: ['type'],
      where: { organizationId, createdAt: { gte: start } },
      _sum: { quantity: true },
    });
    return Object.fromEntries(rows.map((r) => [r.type, r._sum.quantity ?? 0]));
  }

  async enforceQuota(organizationId: string): Promise<void> {
    const usage = await this.monthlyUsage(organizationId);
    const sub = await this.prisma.subscription.findUnique({ where: { organizationId } });
    const plan = sub?.plan ?? 'FREE';
    const limit = plan === 'FREE' ? 50 : plan === 'PRO' ? 5000 : Number.MAX_SAFE_INTEGER;
    if ((usage['CHAT_QUERY'] ?? 0) >= limit) {
      throw new ForbiddenException(`Monthly query quota exceeded for ${plan} plan`);
    }
  }
}
