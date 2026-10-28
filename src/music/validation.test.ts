import { describe, expect, it } from 'vitest';
import { isNoteMatch } from './validation';

describe('isNoteMatch', () => {
  it('accepte la note exacte dans les deux modes', () => {
    expect(isNoteMatch(64, 64, 'exact')).toBe(true);
    expect(isNoteMatch(64, 64, 'any')).toBe(true);
  });

  it('accepte une autre octave uniquement en mode « any »', () => {
    expect(isNoteMatch(64, 76, 'any')).toBe(true);
    expect(isNoteMatch(64, 52, 'any')).toBe(true);
    expect(isNoteMatch(64, 76, 'exact')).toBe(false);
  });

  it('rejette une note différente', () => {
    expect(isNoteMatch(64, 65, 'any')).toBe(false);
    expect(isNoteMatch(64, 63, 'exact')).toBe(false);
  });

  it('considère les enharmoniques comme identiques', () => {
    // Fa♯4 et Sol♭4 sont la même touche (MIDI 66).
    expect(isNoteMatch(66, 66, 'exact')).toBe(true);
  });
});
