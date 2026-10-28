import type { OctaveMode } from '../music/validation';

export interface Preferences {
  /** Niveau choisi ; `null` = niveau conseillé. */
  readonly levelId: string | null;
  /** `level` : octave exigée par le niveau (indifférente au début, exacte avec les lignes supplémentaires). */
  readonly octaveMode: 'level' | OctaveMode;
  readonly computerKeyboard: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { levelId: null, octaveMode: 'level', computerKeyboard: true };

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
    computerKeyboard:
      typeof value.computerKeyboard === 'boolean' ? value.computerKeyboard : DEFAULT_PREFERENCES.computerKeyboard,
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
