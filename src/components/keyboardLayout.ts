import { pitchClass } from '../music/pitch';

/**
 * Géométrie d'un clavier dont les 12 demi-tons d'une octave sont régulièrement espacés,
 * comme sur de nombreux claviers numériques :
 * - chaque touche noire est centrée sur son demi-ton ;
 * - les touches blanches se partagent le reste : Do, Ré, Mi (5 demi-tons pour 3 touches) sont
 *   un peu plus étroites que Fa, Sol, La, Si (7 demi-tons pour 4 touches), environ 22 mm
 *   contre 23 mm sur une octave de 158 mm ;
 * - seul Sol♯ tombe exactement entre deux touches blanches.
 */
export const OCTAVE_WIDTH = 84;
const SEMITONE = OCTAVE_WIDTH / 12;
/** Largeur d'une touche noire, en fraction de demi-ton (≈ 9,5 mm pour 13,2 mm). */
const BLACK_RATIO = 0.72;

const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const SMALL_WHITE = (5 * SEMITONE) / 3; // Do, Ré, Mi
const LARGE_WHITE = (7 * SEMITONE) / 4; // Fa, Sol, La, Si

/** Bord gauche et largeur de chaque touche blanche dans l'octave. */
const WHITE_GEOMETRY = new Map<number, { readonly left: number; readonly width: number }>(
  WHITE_PITCH_CLASSES.map((pc, index) => {
    const left = index < 3 ? index * SMALL_WHITE : 3 * SMALL_WHITE + (index - 3) * LARGE_WHITE;
    return [pc, { left, width: index < 3 ? SMALL_WHITE : LARGE_WHITE }];
  }),
);

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

function octaveOrigin(note: number): number {
  return Math.floor(note / 12) * OCTAVE_WIDTH;
}

/** Touches de `low` à `high` (numéros MIDI, `low` et `high` étant des touches blanches). */
export function keyboardLayout(low: number, high: number): KeyboardLayout {
  const start = octaveOrigin(low) + (WHITE_GEOMETRY.get(pitchClass(low))?.left ?? 0);
  const whites: KeyRect[] = [];
  const blacks: KeyRect[] = [];
  let end = start;
  for (let note = low; note <= high; note++) {
    const white = WHITE_GEOMETRY.get(pitchClass(note));
    if (white) {
      const x = octaveOrigin(note) + white.left - start;
      whites.push({ note, x, width: white.width });
      end = x + white.width;
    } else {
      const width = SEMITONE * BLACK_RATIO;
      const center = octaveOrigin(note) + (pitchClass(note) + 0.5) * SEMITONE - start;
      blacks.push({ note, x: center - width / 2, width });
    }
  }
  return { whites, blacks, width: end };
}
