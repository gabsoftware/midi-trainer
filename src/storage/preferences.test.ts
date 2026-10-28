import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences } from './preferences';

describe('parsePreferences', () => {
  it('donne les valeurs par défaut sans données', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('pas du json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('42')).toEqual(DEFAULT_PREFERENCES);
  });

  it('relit des préférences valides', () => {
    const prefs = {
      levelId: 'level-4',
      octaveMode: 'exact',
      computerKeyboard: false,
      notesPerSession: 0,
      timed: true,
      autoAdvance: false,
      advanceDelayMs: 1500,
      showNoteNames: true,
      keyboardShape: 'equal-semitones',
    };
    expect(parsePreferences(JSON.stringify(prefs))).toEqual(prefs);
  });

  it('remplace chaque valeur invalide par sa valeur par défaut', () => {
    const invalid = {
      levelId: 3,
      octaveMode: 'parfois',
      computerKeyboard: 'oui',
      notesPerSession: 7,
      timed: 1,
      autoAdvance: null,
      advanceDelayMs: 50,
      showNoteNames: 'non',
      keyboardShape: 'harpe',
    };
    expect(parsePreferences(JSON.stringify(invalid))).toEqual(DEFAULT_PREFERENCES);
  });

  it('complète des préférences d’une version antérieure avec les valeurs par défaut', () => {
    expect(parsePreferences(JSON.stringify({ levelId: 'level-2', octaveMode: 'any', computerKeyboard: false }))).toEqual({
      ...DEFAULT_PREFERENCES,
      levelId: 'level-2',
      octaveMode: 'any',
      computerKeyboard: false,
    });
  });
});
