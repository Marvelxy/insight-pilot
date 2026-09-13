/** Cosine similarity between two vectors. Returns 0 on dim mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/**
 * Deterministic dev-mode embedding (no API costs, no key needed).
 * MUST match between ingest-time and query-time — AiService uses this on
 * both sides whenever no provider key is configured.
 */
export function stubEmbedding(text: string, dim = 1536): number[] {
  if (!text.length) return new Array(dim).fill(0);
  return new Array(dim)
    .fill(0)
    .map((_, i) => ((text.charCodeAt(i % text.length) * (i + 1)) % 100) / 100);
}
