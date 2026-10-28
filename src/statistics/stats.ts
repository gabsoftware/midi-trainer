import type { AttemptRecord } from '../storage/records';
import { mean, median } from './basic';

/**
 * Statistiques d'un élève, calculées à partir de son historique.
 *
 * - Les notes jouées en mode assisté sont exclues (elles ne mesurent pas la lecture) et comptées à part.
 * - « Temps de reconnaissance » = temps de réponse des notes trouvées du premier coup.
 * - Les pauses et déconnexions MIDI sont déjà exclues des temps, à la mesure.
 */

export interface OverallStats {
  readonly notes: number;
  readonly sessions: number;
  /** Notes trouvées du premier coup. */
  readonly firstTryCorrect: number;
  /** Notes finalement trouvées après au moins une erreur. */
  readonly correctedAfterError: number;
  readonly firstTryRate: number | null;
  /** Total des mauvaises touches jouées. */
  readonly errors: number;
  readonly recognitionMedianMs: number | null;
  readonly recognitionMeanMs: number | null;
  /** Temps jusqu'à la bonne réponse, erreurs comprises. */
  readonly timeToCorrectMedianMs: number | null;
  /** Notes jouées en mode assisté, non comptées. */
  readonly assistedExcluded: number;
}

export interface NoteStats {
  readonly note: number;
  readonly attempts: number;
  readonly firstTryRate: number;
  readonly misses: number;
  readonly recognitionMedianMs: number | null;
  readonly recognitionMeanMs: number | null;
}

export interface SessionPoint {
  readonly sessionId: string;
  /** Date de la première note de la séance (ISO 8601). */
  readonly date: string;
  readonly levelId: string;
  readonly notes: number;
  readonly firstTryRate: number;
  readonly recognitionMedianMs: number | null;
}

export interface StudentStats {
  readonly overall: OverallStats;
  /** Par note, du grave à l'aigu. */
  readonly perNote: readonly NoteStats[];
  /** Notes les plus difficiles (au moins `MIN_ATTEMPTS_FOR_RANKING` tentatives), de la plus difficile à la moins difficile. */
  readonly hardest: readonly NoteStats[];
  /** Séances dans l'ordre chronologique (les `MAX_SESSION_POINTS` dernières). */
  readonly evolution: readonly SessionPoint[];
}

export const MIN_ATTEMPTS_FOR_RANKING = 3;
export const HARDEST_COUNT = 5;
export const MAX_SESSION_POINTS = 30;

type Attempt = Pick<
  AttemptRecord,
  | 'sessionId'
  | 'levelId'
  | 'createdAt'
  | 'expected'
  | 'firstTryCorrect'
  | 'errorCount'
  | 'firstResponseMs'
  | 'timeToCorrectMs'
  | 'assisted'
>;

function recognitionTimes(attempts: readonly Attempt[]): number[] {
  return attempts.filter((attempt) => attempt.firstTryCorrect).map((attempt) => attempt.firstResponseMs);
}

function rate(attempts: readonly Attempt[]): number {
  return attempts.filter((attempt) => attempt.firstTryCorrect).length / attempts.length;
}

/**
 * `attempts` : historique de l'élève, trié par date croissante.
 * `levelId` : restreint les statistiques à un niveau (`null` = tous les niveaux).
 */
export function computeStats(attempts: readonly Attempt[], levelId: string | null = null): StudentStats {
  const inScope = levelId === null ? attempts : attempts.filter((attempt) => attempt.levelId === levelId);
  const counted = inScope.filter((attempt) => !attempt.assisted);

  const firstTryCorrect = counted.filter((attempt) => attempt.firstTryCorrect).length;
  const times = recognitionTimes(counted);
  const bySession = groupBy(counted, (attempt) => attempt.sessionId);

  const overall: OverallStats = {
    notes: counted.length,
    sessions: bySession.size,
    firstTryCorrect,
    correctedAfterError: counted.length - firstTryCorrect,
    firstTryRate: counted.length === 0 ? null : firstTryCorrect / counted.length,
    errors: counted.reduce((sum, attempt) => sum + attempt.errorCount, 0),
    recognitionMedianMs: median(times),
    recognitionMeanMs: mean(times),
    timeToCorrectMedianMs: median(counted.map((attempt) => attempt.timeToCorrectMs)),
    assistedExcluded: inScope.length - counted.length,
  };

  const perNote = [...groupBy(counted, (attempt) => attempt.expected)]
    .map(([note, list]): NoteStats => {
      const noteTimes = recognitionTimes(list);
      return {
        note,
        attempts: list.length,
        firstTryRate: rate(list),
        misses: list.filter((attempt) => !attempt.firstTryCorrect).length,
        recognitionMedianMs: median(noteTimes),
        recognitionMeanMs: mean(noteTimes),
      };
    })
    .sort((a, b) => a.note - b.note);

  // Plus difficile : moins bien réussie du premier coup, puis la plus lente à reconnaître.
  const hardest = perNote
    .filter((stats) => stats.attempts >= MIN_ATTEMPTS_FOR_RANKING)
    .sort(
      (a, b) =>
        a.firstTryRate - b.firstTryRate ||
        (b.recognitionMedianMs ?? Infinity) - (a.recognitionMedianMs ?? Infinity) ||
        a.note - b.note,
    )
    .slice(0, HARDEST_COUNT);

  const evolution = [...bySession]
    .map(([sessionId, list]): SessionPoint => ({
      sessionId,
      date: list[0].createdAt,
      levelId: list[0].levelId,
      notes: list.length,
      firstTryRate: rate(list),
      recognitionMedianMs: median(recognitionTimes(list)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SESSION_POINTS);

  return { overall, perNote, hardest, evolution };
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    const list = groups.get(value);
    if (list) list.push(item);
    else groups.set(value, [item]);
  }
  return groups;
}
