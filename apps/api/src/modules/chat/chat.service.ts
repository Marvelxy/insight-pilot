import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { AiService } from '../ai/ai.service';
import { cosineSimilarity } from '../ai/embeddings.util';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private usage: UsageService,
    private ai: AiService,
  ) {}

  async retrieve(orgId: string, query: string, k = 6) {
    // 1. Embed the query with the same provider used at ingest time
    let queryEmbedding: number[] | null = null;
    try {
      const [emb] = await this.ai.embedBatch([query]);
      queryEmbedding = emb ?? null;
    } catch (e) {
      this.logger.warn(`Query embedding failed, falling back to lexical: ${e}`);
    }

    // 2. Get all chunks for this org
    const allChunks = await this.prisma.documentChunk.findMany({
      where: { organizationId: orgId },
      orderBy: { chunkIndex: 'asc' },
    });

    if (allChunks.length === 0) return [];

    // 3. Cosine similarity in app code — but only over chunks whose
    // embedding dim matches the query (dims differ per provider/model,
    // e.g. HF MiniLM 384 vs OpenAI 1536 vs stub 1536).
    if (queryEmbedding) {
      let skipped = 0;
      const scored = allChunks
        .map((c) => {
          const emb = c.embedding as unknown as number[] | null;
          if (!emb || emb.length !== queryEmbedding!.length) {
            skipped++;
            return null;
          }
          return {
            documentId: c.documentId,
            chunkIndex: c.chunkIndex,
            content: c.content,
            score: cosineSimilarity(queryEmbedding!, emb),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
      if (skipped > 0) {
        this.logger.warn(
          `${skipped} chunks skipped (embedding dim mismatch) — re-upload documents after switching AI providers`,
        );
      }
      if (scored.length > 0) {
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, k);
      }
      this.logger.warn('No dim-compatible chunks, falling back to lexical');
    }

    // 4. Fallback: lexical search (match first meaningful word)
    const words = query.split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) return allChunks.slice(0, k).map((c) => ({
      documentId: c.documentId, chunkIndex: c.chunkIndex, content: c.content, score: 0.5,
    }));

    const pattern = words.join('|');
    const regex = new RegExp(pattern, 'i');
    return allChunks
      .filter((c) => regex.test(c.content))
      .slice(0, k)
      .map((c) => ({ documentId: c.documentId, chunkIndex: c.chunkIndex, content: c.content, score: 0.5 }));
  }

  async *streamAnswer(orgId: string, userId: string, conversationId: string | undefined, question: string) {
    const contexts = await this.retrieve(orgId, question);
    const contextBlock = contexts.map((c, i) => `[${i + 1}] doc=${c.documentId}#${c.chunkIndex} ${c.content.slice(0, 800)}`).join('\n');

    let conv = conversationId
      ? await this.prisma.conversation.findFirstOrThrow({ where: { id: conversationId, organizationId: orgId } })
      : await this.prisma.conversation.create({ data: { organizationId: orgId, userId, title: question.slice(0, 60) } });

    await this.prisma.message.create({ data: { conversationId: conv.id, role: 'user', content: question } });
    const system = `You answer using ONLY the provided context. Cite sources like [1], [2]. If unsure, say you don't know.`;
    const userPrompt = `Context:\n${contextBlock}\n\nQuestion: ${question}`;

    let full = '';
    if (this.ai.provider !== 'stub') {
      try {
        for await (const delta of this.ai.generate(system, userPrompt)) {
          full += delta;
          yield `data: ${JSON.stringify({ delta, sources: contexts, conversationId: conv.id })}\n\n`;
        }
      } catch (e) {
        this.logger.warn(`AI generation failed, using extractive fallback: ${e}`);
        full = '';
      }
    }
    if (!full) {
      // No API answer (stub provider, or generation failed): return the
      // retrieved passages directly instead of a 500. Still grounded, still cited.
      const fallback =
        contexts.length > 0
          ? `Based on your documents:\n\n${contexts
              .map((c, i) => `[${i + 1}] ${c.content.slice(0, 600)}`)
              .join('\n\n')}`
          : `No relevant passages found. Upload documents first, then ask. (Set HF_TOKEN or OPENAI_API_KEY for AI-written answers.)`;
      for (const word of fallback.split(' ')) {
        full += word + ' ';
        yield `data: ${JSON.stringify({ delta: word + ' ', sources: contexts, conversationId: conv.id })}\n\n`;
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    const assistant = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        content: full,
        citations: contexts as unknown as Prisma.InputJsonValue,
      },
    });
    await this.usage.track(orgId, 'CHAT_QUERY', 1);
    yield `data: ${JSON.stringify({ done: true, messageId: assistant.id, conversationId: conv.id })}\n\n`;
  }
}
