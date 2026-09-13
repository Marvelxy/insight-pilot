import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, name: string) {
    const raw = `ip_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 12);
    const record = await this.prisma.apiKey.create({ data: { organizationId: orgId, name, keyHash: hash, keyPrefix: prefix } });
    // Return raw key ONCE — never store it
    return { ...record, key: raw };
  }

  async verify(raw: string) {
    const hash = createHash('sha256').update(raw).digest('hex');
    return this.prisma.apiKey.findFirst({ where: { keyHash: hash, revokedAt: null } });
  }

  revoke(id: string) {
    return this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}
