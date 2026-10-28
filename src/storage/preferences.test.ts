import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences } from './preferences';

describe('parsePreferences', () => {
  it('donne les valeurs par défaut sans données', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('pas du json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('42')).toEqual(DEFAULT_PREFERENCES);
  });

  it('relit des préférences valides', () => {
    const prefs = { levelId: 'level-4', octaveMode: 'exact', computerKeyboard: false };
    expect(parsePreferences(JSON.stringify(prefs))).toEqual(prefs);
  });

  it('remplace chaque valeur invalide par sa valeur par défaut', () => {
    expect(parsePreferences(JSON.stringify({ levelId: 3, octaveMode: 'parfois', computerKeyboard: 'oui' }))).toEqual(
      DEFAULT_PREFERENCES,
    );
  });
});
