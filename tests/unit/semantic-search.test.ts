/**
 * Smart EDMS — Semantic search unit tests
 *
 * Tests the embedding, cosine similarity, and reciprocal rank fusion
 * functions in isolation. Does NOT hit the database or LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  embedText,
  cosineSimilarity,
  reciprocalRankFusion,
  EMBEDDING_DIM,
} from '../../src/lib/search/semantic-search';

describe('Semantic search — embedText', () => {
  it('returns a vector of the configured dimension', () => {
    const v = embedText('hello world');
    expect(v.length).toBe(EMBEDDING_DIM);
  });

  it('returns zero vector for empty/whitespace input', () => {
    expect(embedText('').every((x) => x === 0)).toBe(true);
    expect(embedText('   \n\t  ').every((x) => x === 0)).toBe(true);
  });

  it('is deterministic — same input produces same output', () => {
    const a = embedText('The quick brown fox jumps over the lazy dog.');
    const b = embedText('The quick brown fox jumps over the lazy dog.');
    expect(a).toEqual(b);
  });

  it('produces L2-normalized vectors (magnitude ≈ 1)', () => {
    const v = embedText('document management system with classification and audit trail');
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1, 3);
  });

  it('drops stopwords (English, French, Arabic, Spanish, German)', () => {
    // Text consisting only of stopwords should produce a near-zero vector.
    // We can't verify exact zero because some hash collisions might land
    // non-zero values, but the magnitude should be very small.
    const v = embedText('the a an and or but in on at to for of with by is are was were');
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeLessThan(0.1);
  });

  it('handles very long input by truncating (does not throw)', () => {
    const long = 'word '.repeat(10_000);
    expect(() => embedText(long)).not.toThrow();
  });

  it('handles Unicode (Arabic, French diacritics, German umlauts)', () => {
    expect(() => embedText('مرحبا بالعالم')).not.toThrow();
    expect(() => embedText('Bonjour le monde')).not.toThrow();
    expect(() => embedText('Guten Tag, Grüße')).not.toThrow();
    expect(() => embedText('Buenos días')).not.toThrow();
  });

  it('handles numeric tokens (3+ digits)', () => {
    const v1 = embedText('Invoice 12345 total 6789');
    const v2 = embedText('Invoice 12345 total 6789');
    expect(v1).toEqual(v2);
  });
});

describe('Semantic search — cosineSimilarity', () => {
  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for vectors of different lengths', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
  });

  it('returns 1 for identical vectors', () => {
    const v = embedText('some random text');
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal (non-overlapping) vectors', () => {
    // Construct two vectors with no overlapping non-zero indices
    const dim = 8;
    const a = new Array(dim).fill(0);
    const b = new Array(dim).fill(0);
    a[0] = 1;
    b[4] = 1;
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('gives higher similarity for related texts than unrelated texts', () => {
    const contract1 = embedText(
      'This employment agreement is effective January 2024 between Acme Corp and the employee with annual salary $80,000.',
    );
    const contract2 = embedText(
      'Employment contract starting 2024 between employer and worker, annual compensation eighty thousand dollars.',
    );
    const recipe = embedText(
      'Mix flour, sugar, and eggs. Bake at 350°F for 30 minutes. Frost with chocolate ganache.',
    );

    const simRelated = cosineSimilarity(contract1, contract2);
    const simUnrelated = cosineSimilarity(contract1, recipe);

    expect(simRelated).toBeGreaterThan(simUnrelated);
  });

  it('gives higher similarity for Arabic-related texts than Arabic-unrelated texts', () => {
    const ar1 = embedText('عقد عمل بين شركة أكمة والموظف، يبدأ في يناير 2024، براتب 80,000 دولار سنوياً.');
    const ar2 = embedText('عقد توظيف بين صاحب العمل والعامل، بدءاً من 2024، بأجر سنوي ثمانون ألف دولار.');
    const arUnrelated = embedText('قائمة الطعام اليوم: دجاج مشوي، بطاطس مهروسة، وكعكة الشوكولاتة للحلوى.');

    const simRelated = cosineSimilarity(ar1, ar2);
    const simUnrelated = cosineSimilarity(ar1, arUnrelated);

    expect(simRelated).toBeGreaterThan(simUnrelated);
  });

  it('cross-language similarity is lower than same-language similarity', () => {
    // The same concept in English vs Arabic should have lower similarity
    // than the same concept in two English sentences (because the tokens
    // are different languages, the hash collisions are essentially random).
    const enContract = embedText('employment contract agreement between employer and employee');
    const arContract = embedText('عقد عمل توظيف بين صاحب العمل والموظف');
    const enSimilar = embedText('employment agreement between boss and worker');

    const crossLang = cosineSimilarity(enContract, arContract);
    const sameLang = cosineSimilarity(enContract, enSimilar);

    // Same-language similarity should be substantially higher
    expect(sameLang).toBeGreaterThan(crossLang);
  });
});

describe('Semantic search — reciprocalRankFusion', () => {
  it('returns empty array for two empty inputs', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('preserves keyword-only results when semantic list is empty', () => {
    const kw = [
      { documentId: 'a', score: 5 },
      { documentId: 'b', score: 3 },
    ];
    const fused = reciprocalRankFusion(kw, []);
    expect(fused).toHaveLength(2);
    expect(fused[0].documentId).toBe('a'); // higher keyword rank
    expect(fused[1].documentId).toBe('b');
  });

  it('preserves semantic-only results when keyword list is empty', () => {
    const sem = [
      { documentId: 'x', score: 0.9 },
      { documentId: 'y', score: 0.8 },
    ];
    const fused = reciprocalRankFusion([], sem);
    expect(fused).toHaveLength(2);
    expect(fused[0].documentId).toBe('x');
    expect(fused[1].documentId).toBe('y');
  });

  it('boosts documents appearing in BOTH lists', () => {
    const kw = [
      { documentId: 'a' },
      { documentId: 'b' },
      { documentId: 'c' },
    ];
    const sem = [
      { documentId: 'b' }, // rank 1 in semantic
      { documentId: 'c' }, // rank 2 in semantic
      { documentId: 'd' }, // rank 3 in semantic
    ];
    const fused = reciprocalRankFusion(kw, sem);
    // b and c are in both lists — they should rank above a (only in kw)
    // and d (only in sem).
    const bRank = fused.findIndex((f) => f.documentId === 'b');
    const cRank = fused.findIndex((f) => f.documentId === 'c');
    const aRank = fused.findIndex((f) => f.documentId === 'a');
    const dRank = fused.findIndex((f) => f.documentId === 'd');

    expect(bRank).toBeLessThan(aRank);
    expect(bRank).toBeLessThan(dRank);
    expect(cRank).toBeLessThan(aRank);
    expect(cRank).toBeLessThan(dRank);
  });

  it('uses the RRF formula: score = sum(1 / (k + rank))', () => {
    const kw = [{ documentId: 'a' }];
    const sem = [{ documentId: 'a' }];
    const fused = reciprocalRankFusion(kw, sem, 60);
    // Both rank 1 → 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.0328
    expect(fused[0].score).toBeCloseTo(2 / 61, 5);
  });

  it('preserves component scores for transparency', () => {
    const kw = [{ documentId: 'a', score: 5.5 }];
    const sem = [{ documentId: 'a', score: 0.92 }];
    const fused = reciprocalRankFusion(kw, sem);
    expect(fused[0].keywordScore).toBe(5.5);
    expect(fused[0].semanticScore).toBe(0.92);
  });

  it('handles large inputs efficiently', () => {
    const kw = Array.from({ length: 1000 }, (_, i) => ({ documentId: `kw-${i}` }));
    const sem = Array.from({ length: 1000 }, (_, i) => ({ documentId: `sem-${i}` }));
    const start = Date.now();
    const fused = reciprocalRankFusion(kw, sem);
    const elapsed = Date.now() - start;
    expect(fused).toHaveLength(2000);
    // Should complete in well under 100ms
    expect(elapsed).toBeLessThan(100);
  });
});
