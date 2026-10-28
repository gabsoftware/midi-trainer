import { median } from '../statistics/basic';
import type { AttemptRecord, SessionRecord } from '../storage/records';
import type { LevelDefinition } from './levels';

/**
 * - `new` : jamais joué ;
 * - `learning` : en cours ;
 * - `ready` : critères de maîtrise remplis, examen de validation à passer ;
 * - `mastered` : examen réussi. Un niveau validé le reste.
 */
export type LevelStatus = 'new' | 'learning' | 'ready' | 'mastered';

export interface Criterion<T> {
  readonly current: T;
  readonly target: T;
  readonly met: boolean;
}

export interface LevelProgress {
  readonly levelId: string;
  readonly status: LevelStatus;
  /** Critères de maîtrise remplis (volume, précision, vitesse, régularité ou voie express). */
  readonly criteriaMet: boolean;
  /** Examen de validation réussi au moins une fois. */
  readonly examPassed: boolean;
  /** Notes prises en compte pour ce niveau. */
  readonly attemptCount: number;
  readonly volume: Criterion<number>;
  /** Réussite du premier coup sur la fenêtre récente (0–1). */
  readonly accuracy: Criterion<number | null>;
  /** Temps de reconnaissance médian sur la fenêtre récente (ms) ; réussi si inférieur ou égal à la cible. */
  readonly speed: Criterion<number | null>;
  /** Dernières séances réussies d'affilée, et nombre de jours différents qu'elles couvrent. */
  readonly regularity: {
    readonly sessions: number;
    readonly targetSessions: number;
    readonly days: number;
    readonly targetDays: number;
    readonly met: boolean;
  };
  /** Voie express : précision et vitesse exceptionnelles, qui dispensent de la régularité. */
  readonly fastTrack: {
    readonly accuracyTarget: number;
    readonly speedTargetMs: number;
    readonly met: boolean;
  };
}

/**
 * Tentatives qui comptent pour un niveau : même niveau, même type d'exercice, sans
 * le nom de la note affiché (mode assisté), et, si le niveau exige l'octave exacte,
 * seulement celles jouées en octave exacte.
 */
export function attemptsForLevel(level: LevelDefinition, attempts: readonly AttemptRecord[]): AttemptRecord[] {
  return attempts.filter(
    (attempt) =>
      attempt.levelId === level.id &&
      attempt.mode === level.exercise &&
      !attempt.assisted &&
      (level.defaultOctaveMode === 'any' || attempt.octaveMode === 'exact'),
  );
}

function localDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function firstTryAccuracy(attempts: readonly AttemptRecord[]): number | null {
  if (attempts.length === 0) return null;
  return attempts.filter((attempt) => attempt.firstTryCorrect).length / attempts.length;
}

/** Temps de reconnaissance : temps de réponse des notes trouvées du premier coup. */
export function recognitionMedian(
  attempts: readonly Pick<AttemptRecord, 'firstTryCorrect' | 'firstResponseMs'>[],
): number | null {
  return median(attempts.filter((attempt) => attempt.firstTryCorrect).map((attempt) => attempt.firstResponseMs));
}

/** `attempts` : historique complet, trié par date croissante. */
/**
 * `attempts` : historique complet de l'élève, trié par date croissante.
 * `sessions` : ses séances, pour retrouver les examens réussis.
 */
export function evaluateLevel(
  level: LevelDefinition,
  attempts: readonly AttemptRecord[],
  sessions: readonly Pick<SessionRecord, 'levelId' | 'mode' | 'exam'>[] = [],
): LevelProgress {
  const criteria = level.mastery;
  const relevant = attemptsForLevel(level, attempts);
  const recent = relevant.slice(-criteria.window);

  const volume = {
    current: relevant.length,
    target: criteria.minAttempts,
    met: relevant.length >= criteria.minAttempts,
  };

  const accuracyValue = firstTryAccuracy(recent);
  const accuracy = {
    current: accuracyValue,
    target: criteria.minFirstTryAccuracy,
    met: accuracyValue !== null && accuracyValue >= criteria.minFirstTryAccuracy,
  };

  const speedValue = recognitionMedian(recent);
  const speed = {
    current: speedValue,
    target: criteria.maxMedianMs,
    met: speedValue !== null && speedValue <= criteria.maxMedianMs,
  };

  // Séances suffisamment longues, dans l'ordre chronologique.
  const bySession = new Map<string, AttemptRecord[]>();
  for (const attempt of relevant) {
    const list = bySession.get(attempt.sessionId) ?? [];
    list.push(attempt);
    bySession.set(attempt.sessionId, list);
  }
  const qualifying = [...bySession.values()].filter((list) => list.length >= criteria.minSessionAttempts);
  // Nombre de dernières séances réussies d'affilée (une séance ratée remet le compteur à zéro).
  const streak: AttemptRecord[][] = [];
  for (let index = qualifying.length - 1; index >= 0; index--) {
    if ((firstTryAccuracy(qualifying[index]) ?? 0) < criteria.minSessionAccuracy) break;
    streak.push(qualifying[index]);
  }
  const counted = streak.slice(0, criteria.minSessions);
  const days = new Set(counted.flat().map((attempt) => localDay(attempt.createdAt))).size;
  const regularity = {
    sessions: counted.length,
    targetSessions: criteria.minSessions,
    days,
    targetDays: criteria.minDays,
    met: counted.length >= criteria.minSessions && days >= criteria.minDays,
  };

  const fastTrackSpeedMs = criteria.maxMedianMs * criteria.fastTrack.maxMedianRatio;
  const fastTrack = {
    accuracyTarget: criteria.fastTrack.minFirstTryAccuracy,
    speedTargetMs: fastTrackSpeedMs,
    met:
      volume.met &&
      accuracyValue !== null &&
      accuracyValue >= criteria.fastTrack.minFirstTryAccuracy &&
      speedValue !== null &&
      speedValue <= fastTrackSpeedMs,
  };

  const criteriaMet = volume.met && accuracy.met && speed.met && (regularity.met || fastTrack.met);
  const examPassed = sessions.some(
    (session) => session.levelId === level.id && session.mode === 'exam' && session.exam?.passed === true,
  );
  let status: LevelStatus = relevant.length === 0 ? 'new' : 'learning';
  if (examPassed) status = 'mastered';
  else if (criteriaMet) status = 'ready';
  return {
    levelId: level.id,
    status,
    criteriaMet,
    examPassed,
    attemptCount: relevant.length,
    volume,
    accuracy,
    speed,
    regularity,
    fastTrack,
  };
}

/**
 * Niveau vers lequel avancer une fois `current` maîtrisé : le premier niveau jouable
 * suivant qui n'est pas encore maîtrisé, ou `null` s'il n'y en a plus.
 */
export function nextLevel(
  levels: readonly LevelDefinition[],
  current: LevelDefinition,
  progress: ReadonlyMap<string, LevelProgress>,
): LevelDefinition | null {
  return (
    levels.find(
      (level) => level.available && level.number > current.number && progress.get(level.id)?.status !== 'mastered',
    ) ?? null
  );
}

/** Niveau conseillé : le premier niveau jouable qui n'est pas encore maîtrisé. */
export function recommendLevel(
  levels: readonly LevelDefinition[],
  progress: ReadonlyMap<string, LevelProgress>,
): LevelDefinition {
  const playable = levels.filter((level) => level.available);
  return playable.find((level) => progress.get(level.id)?.status !== 'mastered') ?? playable[playable.length - 1];
}
