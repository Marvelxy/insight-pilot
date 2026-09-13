import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('ingestion') private ingestion: Pick<Queue, 'add' | 'getJobs'>,
    private storage: Pick<StorageService, 'remove'>,
  ) {}

  async createFromUpload(orgId: string, userId: string, input: { filename: string; mimeType: string; size: number; storageKey: string }) {
    const doc = await this.prisma.document.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        storageKey: input.storageKey,
        status: 'PENDING',
      },
    });
    await this.ingestion.add('ingest-document', { documentId: doc.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
    });
    return doc;
  }

  list(orgId: string) {
    return this.prisma.document.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' } });
  }

  getStatus(id: string) {
    return this.prisma.document.findUniqueOrThrow({
      where: { id },
      select: { id: true, filename: true, status: true, chunkCount: true },
    });
  }

  getStatusForOrg(orgId: string, id: string) {
    return this.prisma.document.findFirstOrThrow({
      where: { id, organizationId: orgId },
      select: { id: true, filename: true, status: true, chunkCount: true },
    });
  }

  /**
   * Delete a document owned by the given org.
   * Enforces org isolation: a doc from another org reads as NotFound.
   * Removes DB rows (chunks cascade), the file on disk, and audit-logs it.
   */
  async remove(orgId: string, docId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc || doc.organizationId !== orgId) {
      throw new NotFoundException('Document not found');
    }

    // Best-effort: drop pending ingestion jobs for this doc so the
    // worker doesn't flip a deleted row to FAILED after we remove it.
    try {
      const jobs = await this.ingestion.getJobs();
      await Promise.all(
        jobs
          .filter((j: Job) => (j.data?.documentId) === docId)
          .map((j: Job) => j.remove?.().catch(() => undefined)),
      );
    } catch {
      // Queue unavailable in tests / dev without Redis — DB + disk cleanup still proceeds.
    }

    await this.prisma.document.delete({ where: { id: docId } });

    await this.storage.remove(doc.storageKey).catch(() => undefined);

    await this.prisma.auditLog
      .create({
        data: {
          organizationId: orgId,
          userId,
          action: 'document.deleted',
          metadata: { documentId: docId, filename: doc.filename },
        },
      })
      .catch(() => undefined);

    return { id: docId, deleted: true };
  }
}
