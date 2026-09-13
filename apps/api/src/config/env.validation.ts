import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  STORAGE_DIR: z.string().default('./storage'),
  OPENAI_API_KEY: z.string().optional(),
  HF_TOKEN: z.string().optional(),
  HF_EMBEDDING_MODEL: z.string().default('sentence-transformers/all-MiniLM-L6-v2'),
  HF_CHAT_MODEL: z.string().default('HuggingFaceTB/SmolLM2-1.7B-Instruct'),
});

export type Env = z.infer<typeof envSchema>;
