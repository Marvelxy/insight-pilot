import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../prisma/prisma.service';

export const GOLDEN_SET = [
  { question: 'What is the refund policy?', expected: 'refund within 30 days' },
  { question: 'How do I invite teammates?', expected: 'settings > members > invite' },
];

@Injectable()
export class EvalsService {
  private readonly logger = new Logger(EvalsService.name);
  constructor(
    private prisma: PrismaService,
    private chat: ChatService,
  ) {}

  // Nightly cron in prod. For portfolio: POST /evals/run shows citation hit-rate.
  async run(orgId: string) {
    let passed = 0;
    const details: { question: string; citationHit: boolean; chunks: number }[] = [];
    for (const g of GOLDEN_SET) {
      const ctx = await this.chat.retrieve(orgId, g.question, 4);
      const haystack = ctx.map((c) => c.content.toLowerCase()).join(' ');
      const hit = g.expected.toLowerCase().split(' ').some((w) => w.length > 3 && haystack.includes(w));
      if (hit) passed++;
      details.push({ question: g.question, citationHit: hit, chunks: ctx.length });
    }
    const score = GOLDEN_SET.length ? passed / GOLDEN_SET.length : 0;
    const run = await this.prisma.evalRun.create({
      data: {
        organizationId: orgId,
        score,
        details: details as unknown as Prisma.InputJsonValue,
      },
    });
    this.logger.log(`eval org=${orgId} score=${score}`);
    return run;
  }

  list(orgId: string) {
    return this.prisma.evalRun.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 20 });
  }
}
