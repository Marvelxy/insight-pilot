import { cosineSimilarity, stubEmbedding } from './embeddings.util';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 on dim mismatch', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('stubEmbedding', () => {
  it('is deterministic and matches the requested dim', () => {
    expect(stubEmbedding('hello', 8)).toEqual(stubEmbedding('hello', 8));
    expect(stubEmbedding('hello', 8)).toHaveLength(8);
  });

  it('returns zeros for empty input', () => {
    expect(stubEmbedding('', 4)).toEqual([0, 0, 0, 0]);
  });

  it('differs across different texts', () => {
    expect(stubEmbedding('hello')).not.toEqual(stubEmbedding('world'));
  });
});
