import { describe, expect, it } from 'vitest';
import { mean, median } from './basic';
import { summarizeSession } from './session';

function attempt(expected: number, errorCount: number, firstResponseMs: number) {
  return { expected, firstTryCorrect: errorCount === 0, errorCount, firstResponseMs };
}

describe('median / mean', () => {
  it('calculent la médiane et la moyenne', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mean([1, 2, 6])).toBe(3);
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
  });
});

describe('summarizeSession', () => {
  it('résume une séance vide', () => {
    expect(summarizeSession([])).toEqual({
      notes: 0,
      firstTryCorrect: 0,
      firstTryRate: null,
      errors: 0,
      medianMs: null,
      meanMs: null,
      toReview: [],
    });
  });

  it('distingue réussite du premier coup et réponses finalement correctes', () => {
    const summary = summarizeSession([
      attempt(64, 0, 800),
      attempt(67, 2, 1500),
      attempt(71, 0, 1200),
      attempt(64, 1, 900),
    ]);
    expect(summary.notes).toBe(4);
    expect(summary.firstTryCorrect).toBe(2);
    expect(summary.firstTryRate).toBe(0.5);
    expect(summary.errors).toBe(3);
  });

  it('ne mesure la reconnaissance que sur les notes trouvées du premier coup', () => {
    const summary = summarizeSession([attempt(64, 0, 800), attempt(67, 1, 9000), attempt(71, 0, 1200)]);
    expect(summary.medianMs).toBe(1000);
    expect(summary.meanMs).toBe(1000);
  });

  it('liste les notes à revoir, les plus ratées d’abord', () => {
    const summary = summarizeSession([
      attempt(67, 1, 0),
      attempt(64, 1, 0),
      attempt(64, 3, 0),
      attempt(71, 0, 0),
    ]);
    expect(summary.toReview).toEqual([
      { note: 64, misses: 2 },
      { note: 67, misses: 1 },
    ]);
  });
});
