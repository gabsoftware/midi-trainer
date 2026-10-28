import type { AttemptRecord } from '../storage/records';

/**
 * Fréquence d'apparition des notes (V1 : règle simple, déterministe et testable).
 *
 * Pour chaque note, on part d'un poids de 1 et on applique ses dernières tentatives,
 * dans l'ordre chronologique :
 * - ratée au premier essai : poids augmenté ;
 * - réussie mais lentement : poids maintenu ;
 * - réussie rapidement : poids réduit.
 * Une note jamais jouée reçoit un poids un peu supérieur, pour être découverte vite.
 * Les bornes empêchent une note de disparaître ou d'envahir l'exercice.
 */
export interface AdaptiveParams {
  /** Nombre de dernières tentatives prises en compte pour chaque note. */
  readonly recentAttempts: number;
  readonly missFactor: number;
  readonly fastFactor: number;
  readonly unseenWeight: number;
  readonly minWeight: number;
  readonly maxWeight: number;
}

export const DEFAULT_ADAPTIVE_PARAMS: AdaptiveParams = {
  recentAttempts: 5,
  missFactor: 1.8,
  fastFactor: 0.7,
  unseenWeight: 1.5,
  minWeight: 0.25,
  maxWeight: 4,
};

type AttemptSummary = Pick<AttemptRecord, 'expected' | 'firstTryCorrect' | 'firstResponseMs'> & {
  readonly assisted?: boolean;
};

/**
 * Poids de chaque note de `notes`, d'après `history` (tentatives triées par date croissante).
 * `fastResponseMs` : seuil sous lequel une bonne réponse est rapide (propre au niveau).
 */
export function noteWeights(
  notes: readonly number[],
  history: readonly AttemptSummary[],
  fastResponseMs: number,
  params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS,
): Map<number, number> {
  const byNote = new Map<number, AttemptSummary[]>(notes.map((note) => [note, []]));
  for (const attempt of history) {
    // Nom de la note affiché : la réponse ne dit rien de la lecture.
    if (!attempt.assisted) byNote.get(attempt.expected)?.push(attempt);
  }
  const weights = new Map<number, number>();
  for (const [note, attempts] of byNote) {
    if (attempts.length === 0) {
      weights.set(note, params.unseenWeight);
      continue;
    }
    let weight = 1;
    for (const attempt of attempts.slice(-params.recentAttempts)) {
      if (!attempt.firstTryCorrect) weight *= params.missFactor;
      else if (attempt.firstResponseMs <= fastResponseMs) weight *= params.fastFactor;
    }
    weights.set(note, Math.min(params.maxWeight, Math.max(params.minWeight, weight)));
  }
  return weights;
}

/**
 * Tire une note selon les poids, sans jamais répéter `previous` (sauf s'il n'y a qu'une note).
 * `random` renvoie un nombre dans [0, 1[ : avec une source déterministe, le tirage l'est aussi.
 */
export function pickWeightedNote(
  notes: readonly number[],
  weights: ReadonlyMap<number, number>,
  previous: number | null,
  random: () => number,
): number {
  if (notes.length === 0) {
    throw new Error('No note available for the exercise.');
  }
  const candidates = notes.length > 1 && previous !== null ? notes.filter((note) => note !== previous) : notes;
  const total = candidates.reduce((sum, note) => sum + (weights.get(note) ?? 1), 0);
  let threshold = random() * total;
  for (const note of candidates) {
    threshold -= weights.get(note) ?? 1;
    if (threshold < 0) return note;
  }
  return candidates[candidates.length - 1];
}
