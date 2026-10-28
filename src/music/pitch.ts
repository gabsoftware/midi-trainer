import type { Locale } from '../i18n/locale';

/**
 * Hauteurs musicales.
 *
 * La référence interne est toujours le numéro de note MIDI (0–127).
 * L'affichage utilise la notation scientifique : Do4 = do central = MIDI 60.
 * On ne dépend jamais de la numérotation d'octave d'un constructeur.
 */

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type Alter = -2 | -1 | 0 | 1 | 2;

export interface Pitch {
  readonly step: Step;
  readonly alter: Alter;
  readonly octave: number;
}

export const STEPS: readonly Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const FRENCH_STEP_NAMES: Record<Step, string> = {
  C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si',
};

const SHARP_SPELLING: readonly [Step, Alter][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];

const FLAT_SPELLING: readonly [Step, Alter][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];

export function isValidMidiNote(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 127;
}

/** Classe de hauteur (0 = Do … 11 = Si), indépendante de l'octave. */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function pitchToMidi(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + pitch.alter;
}

export function midiToPitch(midi: number, spelling: 'sharp' | 'flat' = 'sharp'): Pitch {
  if (!isValidMidiNote(midi)) {
    throw new RangeError(`Numéro de note MIDI invalide : ${midi}`);
  }
  const [step, alter] = (spelling === 'sharp' ? SHARP_SPELLING : FLAT_SPELLING)[pitchClass(midi)];
  // L'octave se déduit de la note naturelle, pour que Si♯ / Do♭ restent cohérents.
  const octave = Math.floor((midi - alter) / 12) - 1;
  return { step, alter, octave };
}

const PITCH_PATTERN = /^([A-G])(##|#|bb|b)?(-?\d+)$/;
const ALTER_BY_SUFFIX: Record<string, Alter> = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };

/** Analyse une hauteur écrite en notation anglo-saxonne : « E4 », « F#5 », « Bb3 ». */
export function parsePitch(text: string): Pitch {
  const match = PITCH_PATTERN.exec(text.trim());
  if (!match) {
    throw new Error(`Hauteur illisible : « ${text} »`);
  }
  const [, step, suffix = '', octave] = match;
  return { step: step as Step, alter: ALTER_BY_SUFFIX[suffix], octave: Number(octave) };
}

export function parseMidi(text: string): number {
  return pitchToMidi(parsePitch(text));
}

const ALTER_SIGNS: Record<Alter, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/**
 * Nom d'une note dans la langue de l'interface : « Sol♯4 » en français, « G♯4 » en anglais.
 * Le numéro d'octave suit la notation scientifique (4 = octave du do central) dans les deux langues.
 */
export function pitchName(pitch: Pitch, locale: Locale, options: { withOctave?: boolean } = {}): string {
  const step = locale === 'fr' ? FRENCH_STEP_NAMES[pitch.step] : pitch.step;
  const base = step + ALTER_SIGNS[pitch.alter];
  return options.withOctave ? `${base}${pitch.octave}` : base;
}

/** Clé VexFlow, par exemple « c#/4 ». */
export function toVexflowKey(pitch: Pitch): string {
  const accidental = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' }[pitch.alter];
  return `${pitch.step.toLowerCase()}${accidental}/${pitch.octave}`;
}

/** Position diatonique absolue (une unité = un degré, soit une ligne ou un interligne). */
export function diatonicIndex(pitch: Pitch): number {
  return pitch.octave * 7 + STEPS.indexOf(pitch.step);
}

/** Notes naturelles (sans altération) comprises entre deux hauteurs incluses. */
export function naturalNotesBetween(low: string, high: string): number[] {
  const from = diatonicIndex(parsePitch(low));
  const to = diatonicIndex(parsePitch(high));
  const notes: number[] = [];
  for (let index = from; index <= to; index++) {
    notes.push(pitchToMidi({ step: STEPS[index % 7], alter: 0, octave: Math.floor(index / 7) }));
  }
  return notes;
}
