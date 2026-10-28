import type { KeyboardShape } from '../components/keyboardLayout';
import type { OctaveMode } from '../music/validation';

export interface Preferences {
  /** Niveau choisi ; `null` = niveau conseillé. */
  readonly levelId: string | null;
  /** `level` : octave exigée par le niveau (indifférente au début, exacte avec les lignes supplémentaires). */
  readonly octaveMode: 'level' | OctaveMode;
  readonly computerKeyboard: boolean;
  /** Notes par séance ; 0 = séance libre, sans fin. */
  readonly notesPerSession: number;
  /** Mode chronométré : temps affichés. Sinon, mode entraînement sans pression (temps mesurés mais cachés). */
  readonly timed: boolean;
  /** Passage automatique à la note suivante ; sinon, Entrée. */
  readonly autoAdvance: boolean;
  readonly advanceDelayMs: number;
  /** Mode assisté : nom de la note affiché avant la réponse. */
  readonly showNoteNames: boolean;
  /** Forme du clavier affiché, pour ressembler au clavier de l'élève. */
  readonly keyboardShape: KeyboardShape;
  /** Son de piano pour le clavier affiché et le clavier de l'ordinateur (un vrai clavier a déjà le sien). */
  readonly sound: boolean;
}

export const SESSION_LENGTHS = [10, 20, 30, 50, 0] as const;
export const ADVANCE_DELAYS_MS = [300, 450, 600, 800, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000] as const;

export const DEFAULT_PREFERENCES: Preferences = {
  levelId: null,
  octaveMode: 'level',
  computerKeyboard: true,
  notesPerSession: 20,
  timed: false,
  autoAdvance: true,
  advanceDelayMs: 600,
  showNoteNames: false,
  keyboardShape: 'piano',
  sound: true,
};

export const KEYBOARD_SHAPES: readonly KeyboardShape[] = ['piano', 'equal-semitones'];

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Réglages propres à chaque élève. */
function storageKey(profileId: string): string {
  return `midi-trainer:preferences:${profileId}`;
}

/** Relit les préférences en ignorant toute valeur invalide. */
export function parsePreferences(raw: string | null): Preferences {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) value = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_PREFERENCES;
  }
  return {
    levelId: typeof value.levelId === 'string' ? value.levelId : DEFAULT_PREFERENCES.levelId,
    octaveMode:
      value.octaveMode === 'level' || value.octaveMode === 'any' || value.octaveMode === 'exact'
        ? value.octaveMode
        : DEFAULT_PREFERENCES.octaveMode,
    computerKeyboard: booleanOr(value.computerKeyboard, DEFAULT_PREFERENCES.computerKeyboard),
    notesPerSession: oneOf<number>(value.notesPerSession, SESSION_LENGTHS, DEFAULT_PREFERENCES.notesPerSession),
    timed: booleanOr(value.timed, DEFAULT_PREFERENCES.timed),
    autoAdvance: booleanOr(value.autoAdvance, DEFAULT_PREFERENCES.autoAdvance),
    advanceDelayMs: oneOf<number>(value.advanceDelayMs, ADVANCE_DELAYS_MS, DEFAULT_PREFERENCES.advanceDelayMs),
    showNoteNames: booleanOr(value.showNoteNames, DEFAULT_PREFERENCES.showNoteNames),
    keyboardShape: oneOf(value.keyboardShape, KEYBOARD_SHAPES, DEFAULT_PREFERENCES.keyboardShape),
    sound: booleanOr(value.sound, DEFAULT_PREFERENCES.sound),
  };
}

export function loadPreferences(profileId: string): Preferences {
  try {
    return parsePreferences(localStorage.getItem(storageKey(profileId)));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function deletePreferences(profileId: string): void {
  try {
    localStorage.removeItem(storageKey(profileId));
  } catch {
    // rien à nettoyer
  }
}

export function savePreferences(profileId: string, preferences: Preferences): void {
  try {
    localStorage.setItem(storageKey(profileId), JSON.stringify(preferences));
  } catch {
    // préférences non conservées, sans conséquence pour la séance
  }
}
