import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InferenceClient } from '@huggingface/inference';
import OpenAI from 'openai';
import { stubEmbedding } from './embeddings.util';

export type AIProvider = 'huggingface' | 'openai' | 'stub';

/**
 * Shared AI gateway. Provider tiers: HF_TOKEN → OPENAI_API_KEY → stub.
 * Ingestion and chat both go through here so chunk and query embeddings
 * always live in the same vector space.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  readonly provider: AIProvider;
  private hf?: InferenceClient;
  private openai?: OpenAI;
  private readonly embeddingModel: string;
  private readonly chatModel: string;

  constructor(config: ConfigService) {
    const hfToken = config.get<string>('HF_TOKEN');
    const openaiKey = config.get<string>('OPENAI_API_KEY');
    this.embeddingModel =
      config.get<string>('HF_EMBEDDING_MODEL') ?? 'sentence-transformers/all-MiniLM-L6-v2';
    this.chatModel =
      config.get<string>('HF_CHAT_MODEL') ?? 'Qwen/Qwen2.5-72B-Instruct';
    if (hfToken) {
      this.hf = new InferenceClient(hfToken);
      this.provider = 'huggingface';
    } else if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.provider = 'openai';
    } else {
      this.provider = 'stub';
    }
    this.logger.log(`AI provider: ${this.provider} (embeddings: ${this.embeddingModel})`);
  }

  /** Embed a batch of texts. Always returns one vector per input, in order. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.provider === 'huggingface') {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 20) {
        const res = await this.hf!.featureExtraction({
          model: this.embeddingModel,
          inputs: texts.slice(i, i + 20),
        });
        for (const e of res) {
          const arr = e as unknown as number[] | number[][];
          out.push(
            Array.isArray(arr[0]) ? (arr as unknown as number[][])[0] : (arr as number[]),
          );
        }
      }
      return out;
    }
    if (this.provider === 'openai') {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 50) {
        const r = await this.openai!.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts.slice(i, i + 50),
        });
        out.push(...r.data.map((d) => d.embedding));
      }
      return out;
    }
    return texts.map((t) => stubEmbedding(t));
  }

  /** Generate an answer. Yields text chunks (streams for OpenAI). */
  async *generate(system: string, userPrompt: string): AsyncGenerator<string> {
    if (this.provider === 'huggingface') {
      const stream = this.hf!.chatCompletionStream({
        model: this.chatModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 512,
        temperature: 0.2,
      });
      for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content ?? '';
      }
      return;
    }
    const stream = await this.openai!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: 0.2,
    });
    for await (const part of stream) {
      yield part.choices[0]?.delta?.content ?? '';
    }
  }
}
