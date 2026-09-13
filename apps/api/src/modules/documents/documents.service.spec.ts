import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

function mockPrisma(doc: { id: string; organizationId: string; filename: string; storageKey: string } | null) {
  return {
    document: {
      findUnique: jest.fn().mockResolvedValue(doc),
      delete: jest.fn().mockResolvedValue(doc),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as import('../prisma/prisma.service').PrismaService;
}

function mockQueue() {
  return { getJobs: jest.fn().mockResolvedValue([]) } as unknown as import('bullmq').Queue;
}

import type { StorageService } from '../storage/storage.service';

function mockStorage() {
  return { remove: jest.fn().mockResolvedValue(undefined) } as unknown as StorageService;
}

describe('DocumentsService.remove org isolation', () => {
  it('deletes own-org file (db + disk + audit)', async () => {
    const doc = { id: 'doc_1', organizationId: 'org_1', filename: 'a.pdf', storageKey: 'orgs/org_1/a.pdf' };
    const prisma = mockPrisma(doc);
    const storage = mockStorage();
    const svc = new DocumentsService(prisma, mockQueue(), storage);

    await expect(svc.remove('org_1', 'doc_1', 'user_1')).resolves.toEqual({ id: 'doc_1', deleted: true });
    expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc_1' } });
    expect(storage.remove).toHaveBeenCalledWith('orgs/org_1/a.pdf');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('404s on other-org file (no delete, no disk touch)', async () => {
    const doc = { id: 'doc_1', organizationId: 'org_1', filename: 'a.pdf', storageKey: 'orgs/org_1/a.pdf' };
    const prisma = mockPrisma(doc);
    const storage = mockStorage();
    const svc = new DocumentsService(prisma, mockQueue(), storage);

    await expect(svc.remove('org_2', 'doc_1', 'user_2')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.delete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('404s on missing doc', async () => {
    const prisma = mockPrisma(null);
    const svc = new DocumentsService(prisma, mockQueue(), mockStorage());
    await expect(svc.remove('org_1', 'missing', 'user_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
