import type { OctaveMode } from '../music/validation';
import {
  pause,
  playNote,
  resumeNote,
  startNote,
  type NoteAttempt,
  type PauseReason,
  type SingleNoteState,
} from './singleNote';

/**
 * Suite de notes à jouer dans l'ordre (mode B, utilisé par l'examen de validation).
 *
 * Chaque note est gérée par le moteur « note isolée » : même validation, même
 * chronomètre (pauses exclues). Le temps d'une note démarre quand la précédente
 * est trouvée. Une mauvaise note ne fait pas avancer.
 */
export interface SequenceState {
  readonly notes: readonly number[];
  /** Indice de la note attendue. */
  readonly position: number;
  /** État de la note en cours (la dernière, une fois la suite terminée). */
  readonly current: SingleNoteState;
  /** Résultat de chaque note déjà trouvée, dans l'ordre. */
  readonly attempts: readonly NoteAttempt[];
  readonly done: boolean;
}

export function startSequence(notes: readonly number[], octaveMode: OctaveMode, now: number): SequenceState {
  if (notes.length === 0) {
    throw new Error('Empty sequence.');
  }
  return { notes, position: 0, current: startNote(notes[0], octaveMode, now), attempts: [], done: false };
}

export function playSequence(state: SequenceState, note: number, now: number): SequenceState {
  if (state.done) return state;
  const current = playNote(state.current, note, now);
  if (current === state.current) return state;
  if (current.attempt === null) {
    return { ...state, current };
  }
  const attempts = [...state.attempts, current.attempt];
  const position = state.position + 1;
  if (position >= state.notes.length) {
    return { ...state, current, attempts, done: true };
  }
  return {
    ...state,
    position,
    current: startNote(state.notes[position], state.current.octaveMode, now),
    attempts,
  };
}

export function pauseSequence(state: SequenceState, reason: PauseReason, now: number): SequenceState {
  if (state.done) return state;
  const current = pause(state.current, reason, now);
  return current === state.current ? state : { ...state, current };
}

export function resumeSequence(state: SequenceState, now: number): SequenceState {
  const current = resumeNote(state.current, now);
  return current === state.current ? state : { ...state, current };
}
