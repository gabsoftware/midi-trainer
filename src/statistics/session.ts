import { mean, median } from './basic';

type AttemptLike = {
  readonly expected: number;
  readonly firstTryCorrect: boolean;
  readonly errorCount: number;
  readonly firstResponseMs: number;
};

export interface NoteToReview {
  readonly note: number;
  /** Nombre de fois où la note a été ratée au premier essai. */
  readonly misses: number;
}

export interface SessionSummary {
  readonly notes: number;
  readonly firstTryCorrect: number;
  /** Réussite du premier coup (0–1), `null` sans note. */
  readonly firstTryRate: number | null;
  /** Total des mauvaises touches jouées. */
  readonly errors: number;
  /** Temps de reconnaissance (notes trouvées du premier coup). */
  readonly medianMs: number | null;
  readonly meanMs: number | null;
  /** Notes ratées au moins une fois, de la plus ratée à la moins ratée. */
  readonly toReview: readonly NoteToReview[];
}

export function summarizeSession(attempts: readonly AttemptLike[]): SessionSummary {
  const firstTry = attempts.filter((attempt) => attempt.firstTryCorrect);
  const times = firstTry.map((attempt) => attempt.firstResponseMs);
  const misses = new Map<number, number>();
  for (const attempt of attempts) {
    if (!attempt.firstTryCorrect) misses.set(attempt.expected, (misses.get(attempt.expected) ?? 0) + 1);
  }
  return {
    notes: attempts.length,
    firstTryCorrect: firstTry.length,
    firstTryRate: attempts.length === 0 ? null : firstTry.length / attempts.length,
    errors: attempts.reduce((sum, attempt) => sum + attempt.errorCount, 0),
    medianMs: median(times),
    meanMs: mean(times),
    toReview: [...misses]
      .map(([note, count]) => ({ note, misses: count }))
      .sort((a, b) => b.misses - a.misses || a.note - b.note),
  };
}
