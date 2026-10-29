import { describe, expect, it } from 'vitest';
import { keyboardLayout, keyboardRange, OCTAVE_WIDTH, type KeyboardShape } from './keyboardLayout';

const C4 = 60;
const B4 = 71;
const center = (key: { x: number; width: number }) => key.x + key.width / 2;

function octave(shape: KeyboardShape) {
  const layout = keyboardLayout(C4, B4, shape);
  return {
    layout,
    white: (note: number) => layout.whites.find((key) => key.note === note)!,
    black: (note: number) => layout.blacks.find((key) => key.note === note)!,
  };
}

describe.each<KeyboardShape>(['piano', 'equal-semitones'])('clavier %s', (shape) => {
  it('compte 7 touches blanches et 5 noires par octave, sur la largeur d’une octave', () => {
    const { layout } = octave(shape);
    expect(layout.whites).toHaveLength(7);
    expect(layout.blacks).toHaveLength(5);
    expect(layout.width).toBeCloseTo(OCTAVE_WIDTH);
  });

  it('enchaîne les touches blanches sans trou ni chevauchement sur plusieurs octaves', () => {
    const layout = keyboardLayout(36, 96, shape);
    expect(layout.whites).toHaveLength(36);
    expect(layout.blacks).toHaveLength(25);
    expect(layout.whites[0].x).toBe(0);
    for (let index = 1; index < layout.whites.length; index++) {
      const previous = layout.whites[index - 1];
      expect(layout.whites[index].x).toBeCloseTo(previous.x + previous.width);
    }
  });

  it('place Sol♯ exactement entre Sol et La, Do♯ vers Do et Ré♯ vers Mi', () => {
    const { white, black } = octave(shape);
    expect(center(black(68))).toBeCloseTo(white(69).x);
    expect(center(black(61))).toBeLessThan(white(62).x);
    expect(center(black(63))).toBeGreaterThan(white(64).x);
    expect(center(black(66))).toBeLessThan(white(67).x);
    expect(center(black(70))).toBeGreaterThan(white(71).x);
  });

  it('garde chaque touche noire entre ses deux touches blanches', () => {
    const { white, black } = octave(shape);
    for (const [note, below, above] of [
      [61, 60, 62],
      [63, 62, 64],
      [66, 65, 67],
      [68, 67, 69],
      [70, 69, 71],
    ]) {
      expect(black(note).x).toBeGreaterThan(white(below).x);
      expect(black(note).x + black(note).width).toBeLessThan(white(above).x + white(above).width);
    }
  });
});

describe('proportions', () => {
  it('donne aux touches noires environ 60 % de la largeur d’une touche blanche de piano', () => {
    for (const shape of ['piano', 'equal-semitones'] as const) {
      const { layout } = octave(shape);
      for (const key of layout.blacks) expect(key.width / (OCTAVE_WIDTH / 7)).toBeCloseTo(0.6);
    }
  });
});

describe('clavier piano', () => {
  it('a des touches blanches toutes égales et des touches noires symétriques dans chaque groupe', () => {
    const { layout, white, black } = octave('piano');
    for (const key of layout.whites) expect(key.width).toBeCloseTo(OCTAVE_WIDTH / 7);
    // Do♯/Ré♯ symétriques autour de Ré ; Fa♯/La♯ autour de Sol♯.
    expect(white(62).x - center(black(61))).toBeCloseTo(center(black(63)) - white(64).x);
    expect(white(67).x - center(black(66))).toBeCloseTo(center(black(70)) - white(71).x);
  });
});

describe('clavier à demi-tons égaux', () => {
  it('rend Do, Ré, Mi plus étroites que Fa, Sol, La, Si, comme mesuré (22 mm / 23 mm sur 158 mm)', () => {
    const { white } = octave('equal-semitones');
    expect((white(60).width / OCTAVE_WIDTH) * 158).toBeCloseTo(21.9, 1);
    expect((white(65).width / OCTAVE_WIDTH) * 158).toBeCloseTo(23.0, 1);
  });

  it('centre chaque touche noire sur son demi-ton', () => {
    const { black } = octave('equal-semitones');
    for (const note of [61, 63, 66, 68, 70]) {
      expect(center(black(note))).toBeCloseTo(((note - C4 + 0.5) * OCTAVE_WIDTH) / 12);
    }
  });
});

describe('keyboardRange', () => {
  it('arrondit aux octaves entières, de Do à Si', () => {
    // Mi2 à Sol5 : Do2 à Si5, quatre octaves.
    expect(keyboardRange([40, 50, 79])).toEqual({ low: 36, high: 83 });
  });

  it('montre au moins deux octaves, complétées vers l’aigu', () => {
    // Mi4, Sol4, Si4 : une seule octave, on ajoute celle du dessus.
    expect(keyboardRange([64, 67, 71])).toEqual({ low: C4, high: 83 });
    expect(keyboardRange([64, 67, 71], 1)).toEqual({ low: C4, high: B4 });
  });

  it('commence et finit sur une touche blanche', () => {
    const { low, high } = keyboardRange([61, 75]);
    const layout = keyboardLayout(low, high);
    expect(layout.whites[0].note).toBe(low);
    expect(layout.whites.at(-1)?.note).toBe(high);
  });
});
