import { describe, expect, it } from 'vitest';
import { keyboardLayout, OCTAVE_WIDTH } from './keyboardLayout';

const C4 = 60;
const B4 = 71;

describe('keyboardLayout', () => {
  const octave = keyboardLayout(C4, B4);
  const white = (note: number) => octave.whites.find((key) => key.note === note)!;
  const black = (note: number) => octave.blacks.find((key) => key.note === note)!;
  const center = (key: { x: number; width: number }) => key.x + key.width / 2;

  it('compte 7 touches blanches et 5 noires par octave, sur la largeur d’une octave', () => {
    expect(octave.whites).toHaveLength(7);
    expect(octave.blacks).toHaveLength(5);
    expect(octave.width).toBeCloseTo(OCTAVE_WIDTH);
  });

  it('rend Do, Ré, Mi plus étroites que Fa, Sol, La, Si, dans le rapport d’un vrai clavier', () => {
    const small = white(60).width;
    const large = white(65).width;
    expect(white(62).width).toBeCloseTo(small);
    expect(white(71).width).toBeCloseTo(large);
    // 22 mm / 23 mm mesurés sur une octave de 158 mm : rapport (5/3) / (7/4).
    expect(small / large).toBeCloseTo(20 / 21);
    expect((small / OCTAVE_WIDTH) * 158).toBeCloseTo(21.9, 1);
    expect((large / OCTAVE_WIDTH) * 158).toBeCloseTo(23.0, 1);
  });

  it('centre chaque touche noire sur son demi-ton : seul Sol♯ tombe entre deux blanches', () => {
    const semitone = OCTAVE_WIDTH / 12;
    for (const note of [61, 63, 66, 68, 70]) {
      expect(center(black(note))).toBeCloseTo((note - C4 + 0.5) * semitone);
    }
    expect(center(black(68))).toBeCloseTo(white(69).x); // Sol♯ : jonction Sol/La
    expect(center(black(61))).toBeLessThan(white(62).x); // Do♯ penche vers Do
    expect(center(black(63))).toBeGreaterThan(white(64).x); // Ré♯ penche vers Mi
  });

  it('enchaîne les touches blanches sans trou ni chevauchement sur plusieurs octaves', () => {
    const layout = keyboardLayout(36, 96);
    expect(layout.whites).toHaveLength(36);
    expect(layout.blacks).toHaveLength(25);
    for (let index = 1; index < layout.whites.length; index++) {
      const previous = layout.whites[index - 1];
      expect(layout.whites[index].x).toBeCloseTo(previous.x + previous.width);
    }
    expect(layout.whites[0].x).toBe(0);
    expect(layout.width).toBeCloseTo(5 * OCTAVE_WIDTH + layout.whites.at(-1)!.width);
  });
});
