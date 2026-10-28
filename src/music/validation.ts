import { pitchClass } from './pitch';

/**
 * - `any` : n'importe quelle octave est acceptée (mode débutant, par défaut).
 * - `exact` : la touche doit correspondre exactement à la note écrite.
 */
export type OctaveMode = 'any' | 'exact';

/**
 * Compare la note jouée à la note attendue, en numéros MIDI.
 * Les enharmoniques (Fa♯ / Sol♭) sont donc considérées comme identiques.
 */
export function isNoteMatch(expectedMidi: number, playedMidi: number, octaveMode: OctaveMode): boolean {
  if (octaveMode === 'exact') {
    return expectedMidi === playedMidi;
  }
  return pitchClass(expectedMidi) === pitchClass(playedMidi);
}
