import { isNoteMatch, type OctaveMode } from '../music/validation';

/**
 * Exercice « note isolée » (mode A), sous forme de machine à états pure.
 *
 * Toutes les fonctions reçoivent l'instant `now` (horloge monotone,
 * `performance.now()` ou horodatage d'un événement MIDI) : aucune lecture
 * d'horloge cachée, ce qui rend la logique déterministe et testable.
 *
 * Les durées de pause (pause manuelle, déconnexion MIDI) sont exclues des
 * temps de réponse.
 */

export type PauseReason = 'user' | 'midi-disconnected';

export interface Stopwatch {
  /** Temps actif accumulé avant la dernière reprise (ms). */
  readonly accumulated: number;
  /** Instant de la dernière reprise, `null` si arrêté. */
  readonly runningSince: number | null;
}

export function elapsed(stopwatch: Stopwatch, now: number): number {
  return stopwatch.accumulated + (stopwatch.runningSince === null ? 0 : Math.max(0, now - stopwatch.runningSince));
}

function stop(stopwatch: Stopwatch, now: number): Stopwatch {
  return { accumulated: elapsed(stopwatch, now), runningSince: null };
}

function resume(stopwatch: Stopwatch, now: number): Stopwatch {
  return stopwatch.runningSince === null ? { ...stopwatch, runningSince: now } : stopwatch;
}

/** Résultat d'une note, une fois la bonne touche trouvée. */
export interface NoteAttempt {
  readonly expected: number;
  /** Toutes les notes jouées, dans l'ordre, jusqu'à la bonne. */
  readonly played: readonly number[];
  readonly firstTryCorrect: boolean;
  readonly errorCount: number;
  /** Temps actif jusqu'à la première touche jouée (ms). */
  readonly firstResponseMs: number;
  /** Temps actif jusqu'à la bonne touche (ms). */
  readonly timeToCorrectMs: number;
  readonly octaveMode: OctaveMode;
}

export interface LastAnswer {
  readonly played: number;
  readonly correct: boolean;
  readonly at: number;
}

export interface SingleNoteState {
  /**
   * - `waiting` : une note est affichée, on attend la réponse ;
   * - `answered` : bonne réponse, on attend le passage à la note suivante ;
   * - `paused` : chronomètre arrêté, entrées ignorées.
   */
  readonly phase: 'waiting' | 'answered' | 'paused';
  readonly pauseReason: PauseReason | null;
  /** Phase à restaurer à la reprise. */
  readonly resumePhase: 'waiting' | 'answered';
  readonly expected: number;
  readonly octaveMode: OctaveMode;
  readonly stopwatch: Stopwatch;
  readonly played: readonly number[];
  readonly firstResponseMs: number | null;
  readonly lastAnswer: LastAnswer | null;
  readonly attempt: NoteAttempt | null;
}

export function startNote(expected: number, octaveMode: OctaveMode, now: number): SingleNoteState {
  return {
    phase: 'waiting',
    pauseReason: null,
    resumePhase: 'waiting',
    expected,
    octaveMode,
    stopwatch: { accumulated: 0, runningSince: now },
    played: [],
    firstResponseMs: null,
    lastAnswer: null,
    attempt: null,
  };
}

/** Traite un Note On. Ne fait rien hors de la phase `waiting`. */
export function playNote(state: SingleNoteState, note: number, now: number): SingleNoteState {
  if (state.phase !== 'waiting') {
    return state;
  }
  // Touche enfoncée avant l'affichage de la note (événement en retard dans la file) : ignorée.
  if (state.stopwatch.runningSince !== null && now < state.stopwatch.runningSince) {
    return state;
  }
  const time = elapsed(state.stopwatch, now);
  const played = [...state.played, note];
  const firstResponseMs = state.firstResponseMs ?? time;
  const correct = isNoteMatch(state.expected, note, state.octaveMode);
  const lastAnswer = { played: note, correct, at: now };

  if (!correct) {
    return { ...state, played, firstResponseMs, lastAnswer };
  }
  return {
    ...state,
    phase: 'answered',
    resumePhase: 'answered',
    stopwatch: stop(state.stopwatch, now),
    played,
    firstResponseMs,
    lastAnswer,
    attempt: {
      expected: state.expected,
      played,
      firstTryCorrect: played.length === 1,
      errorCount: played.length - 1,
      firstResponseMs,
      timeToCorrectMs: time,
      octaveMode: state.octaveMode,
    },
  };
}

export function pause(state: SingleNoteState, reason: PauseReason, now: number): SingleNoteState {
  if (state.phase === 'paused') {
    // Une déconnexion pendant une pause manuelle doit rester visible.
    return reason === 'midi-disconnected' ? { ...state, pauseReason: reason } : state;
  }
  return {
    ...state,
    phase: 'paused',
    pauseReason: reason,
    resumePhase: state.phase,
    stopwatch: state.phase === 'waiting' ? stop(state.stopwatch, now) : state.stopwatch,
  };
}

export function resumeNote(state: SingleNoteState, now: number): SingleNoteState {
  if (state.phase !== 'paused') {
    return state;
  }
  return {
    ...state,
    phase: state.resumePhase,
    pauseReason: null,
    stopwatch: state.resumePhase === 'waiting' ? resume(state.stopwatch, now) : state.stopwatch,
  };
}
