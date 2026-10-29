import { pitchClass } from '../music/pitch';

/**
 * Géométrie du clavier affiché, selon deux conceptions réelles :
 *
 * - `piano` (pianos acoustiques, la plupart des claviers) : touches blanches toutes égales.
 *   Dans chaque groupe (Do–Mi : 2 noires ; Fa–Si : 3 noires), les touches noires sont
 *   régulièrement espacées, avec des intervalles égaux entre elles et jusqu'aux bords du
 *   groupe : Do♯ et Fa♯ penchent à gauche, Ré♯ et La♯ à droite, Sol♯ est centré.
 *
 * - `equal-semitones` (certains claviers numériques et contrôleurs) : les 12 demi-tons de
 *   l'octave sont régulièrement espacés. Chaque touche noire est centrée sur son demi-ton ;
 *   Do, Ré, Mi (5 demi-tons pour 3 touches) sont un peu plus étroites que Fa, Sol, La, Si
 *   (7 demi-tons pour 4 touches) : environ 22 mm contre 23 mm sur une octave de 158 mm.
 */
export type KeyboardShape = 'piano' | 'equal-semitones';

export const OCTAVE_WIDTH = 84;
const SEMITONE = OCTAVE_WIDTH / 12;
const PIANO_WHITE = OCTAVE_WIDTH / 7;
/**
 * Largeur d'une touche noire : environ 0,6 touche blanche, comme sur un vrai clavier vu de dessus.
 * Même largeur dans les deux formes, pour que seule la répartition change.
 */
const BLACK_WIDTH = PIANO_WHITE * 0.6;

const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

interface KeyGeometry {
  readonly left: number;
  readonly width: number;
}

/** Bord gauche et largeur de chaque touche (blanche ou noire) dans l'octave, par classe de hauteur. */
function octaveGeometry(shape: KeyboardShape): ReadonlyMap<number, KeyGeometry> {
  const keys = new Map<number, KeyGeometry>();
  if (shape === 'equal-semitones') {
    const small = (5 * SEMITONE) / 3;
    const large = (7 * SEMITONE) / 4;
    WHITE_PITCH_CLASSES.forEach((pc, index) => {
      const left = index < 3 ? index * small : 3 * small + (index - 3) * large;
      keys.set(pc, { left, width: index < 3 ? small : large });
    });
    for (const pc of [1, 3, 6, 8, 10]) {
      keys.set(pc, { left: (pc + 0.5) * SEMITONE - BLACK_WIDTH / 2, width: BLACK_WIDTH });
    }
    return keys;
  }
  WHITE_PITCH_CLASSES.forEach((pc, index) => keys.set(pc, { left: index * PIANO_WHITE, width: PIANO_WHITE }));
  const groups = [
    { start: 0, whites: 3, blacks: [1, 3] },
    { start: 3 * PIANO_WHITE, whites: 4, blacks: [6, 8, 10] },
  ];
  for (const { start, whites, blacks } of groups) {
    const gap = (whites * PIANO_WHITE - blacks.length * BLACK_WIDTH) / (blacks.length + 1);
    blacks.forEach((pc, index) =>
      keys.set(pc, { left: start + gap * (index + 1) + BLACK_WIDTH * index, width: BLACK_WIDTH }),
    );
  }
  return keys;
}

const GEOMETRY: Readonly<Record<KeyboardShape, ReadonlyMap<number, KeyGeometry>>> = {
  piano: octaveGeometry('piano'),
  'equal-semitones': octaveGeometry('equal-semitones'),
};

export interface KeyRect {
  readonly note: number;
  readonly x: number;
  readonly width: number;
}

export interface KeyboardLayout {
  readonly whites: readonly KeyRect[];
  readonly blacks: readonly KeyRect[];
  readonly width: number;
}

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

/** Touches de `low` à `high` (numéros MIDI, `low` et `high` étant des touches blanches). */
export function keyboardLayout(low: number, high: number, shape: KeyboardShape = 'piano'): KeyboardLayout {
  const geometry = GEOMETRY[shape];
  const position = (note: number) => Math.floor(note / 12) * OCTAVE_WIDTH + geometry.get(pitchClass(note))!.left;
  const start = position(low);
  const whites: KeyRect[] = [];
  const blacks: KeyRect[] = [];
  let end = 0;
  for (let note = low; note <= high; note++) {
    const rect = { note, x: position(note) - start, width: geometry.get(pitchClass(note))!.width };
    if (BLACK_PITCH_CLASSES.has(pitchClass(note))) {
      blacks.push(rect);
    } else {
      whites.push(rect);
      end = rect.x + rect.width;
    }
  }
  return { whites, blacks, width: end };
}

/**
 * Étendue d'un clavier réduit aux notes jouées : octaves entières (de Do à Si), au moins
 * `minOctaves`, complétées vers l'aigu. Sert sur petit écran, pour des touches plus larges.
 */
export function keyboardRange(notes: readonly number[], minOctaves = 2): { low: number; high: number } {
  const low = Math.min(...notes) - pitchClass(Math.min(...notes));
  const lastOctave = Math.max(...notes) - pitchClass(Math.max(...notes));
  const octaves = Math.max(minOctaves, (lastOctave - low) / 12 + 1);
  return { low, high: low + octaves * 12 - 1 };
}
