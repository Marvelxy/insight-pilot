import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
// Minimal job interface to avoid BullMQ typing issues
interface MinimalJob {
  data: { documentId: string };
  updateProgress(pct: number): Promise<void>;
}
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';

// pdf-parse v2 is CJS-compatible via named export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

function chunkText(text: string, size = 800, overlap = 120): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    const chunk = words.slice(i, i + size).join(' ').trim();
    if (chunk.length > 20) chunks.push(chunk);
  }
  return chunks;
}

@Processor('ingestion')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private ai: AiService,
  ) {
    super();
  }

  async process(job: MinimalJob) {
    const { documentId } = job.data;
    this.logger.log(`Processing document ${documentId}`);

    await this.prisma.document.update({ where: { id: documentId }, data: { status: 'PROCESSING' } });

    try {
      const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });

      // 1. Read the file from disk
      const fileBuffer = await this.storage.read(doc.storageKey);
      this.logger.log(`Read ${fileBuffer.length} bytes for doc=${documentId}`);

      // 2. Parse PDF text (pdf-parse v2 API)
      let rawText: string;
      if (doc.mimeType === 'application/pdf' || doc.filename.toLowerCase().endsWith('.pdf')) {
        const parser = new PDFParse({ data: fileBuffer });
        try {
          const pdfData = await parser.getText();
          rawText = pdfData.text;
          this.logger.log(`Parsed PDF: ${pdfData.total} pages, ${rawText.length} chars`);
        } finally {
          await parser.destroy();
        }
      } else if (doc.mimeType.startsWith('text/') || doc.filename.endsWith('.txt') || doc.filename.endsWith('.md')) {
        rawText = fileBuffer.toString('utf-8');
      } else {
        rawText = fileBuffer.toString('utf-8');
      }

      if (!rawText || rawText.trim().length < 10) {
        throw new Error('Document contains no extractable text');
      }

      // 3. Chunk
      const chunks = chunkText(rawText);
      this.logger.log(`Split into ${chunks.length} chunks for doc=${documentId}`);
      await job.updateProgress(40);

      // 4. Embed via shared AI gateway (HF → OpenAI → stub)
      const embeddings = await this.ai.embedBatch(chunks);
      this.logger.log(`Embedded ${embeddings.length} chunks via ${this.ai.provider}`);
      await job.updateProgress(80);

      // 5. Store chunks — embeddings as JSON (cosine similarity in app code)
      await this.prisma.$transaction([
        this.prisma.documentChunk.deleteMany({ where: { documentId } }),
        this.prisma.documentChunk.createMany({
          data: chunks.map((content, idx) => ({
            documentId,
            organizationId: doc.organizationId,
            chunkIndex: idx,
            content,
            embedding: embeddings[idx] as unknown as Prisma.InputJsonValue,
          })),
        }),
        this.prisma.document.update({ where: { id: documentId }, data: { status: 'READY', chunkCount: chunks.length } }),
      ]);

      await this.prisma.usageEvent.create({
        data: { organizationId: doc.organizationId, type: 'INGEST_CHUNKS', quantity: chunks.length },
      });
      await job.updateProgress(100);

      this.logger.log(`Done: doc=${documentId} chunks=${chunks.length}`);
      return { chunks: chunks.length, chars: rawText.length };

    } catch (e) {
      this.logger.error(`Failed doc=${documentId}: ${e}`);
      await this.prisma.document.update({ where: { id: documentId }, data: { status: 'FAILED' } });
      throw e;
    }
  }
}
