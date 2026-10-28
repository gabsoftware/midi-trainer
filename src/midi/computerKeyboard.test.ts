import { describe, expect, it } from 'vitest';
import { codeToMidi, DEFAULT_BASE_NOTE, shiftBaseNote } from './computerKeyboard';

describe('codeToMidi', () => {
  it('place le do central sur la touche A (Q en AZERTY)', () => {
    expect(codeToMidi('KeyA', DEFAULT_BASE_NOTE)).toBe(60);
  });

  it('suit la disposition d’un clavier de piano', () => {
    expect(codeToMidi('KeyD', 60)).toBe(64); // Mi
    expect(codeToMidi('KeyG', 60)).toBe(67); // Sol
    expect(codeToMidi('KeyW', 60)).toBe(61); // Do♯
    expect(codeToMidi('KeyK', 60)).toBe(72); // Do5
  });

  it('ignore les touches hors clavier', () => {
    expect(codeToMidi('Space', 60)).toBeNull();
    expect(codeToMidi('Enter', 60)).toBeNull();
    expect(codeToMidi('KeyZ', 60)).toBeNull();
  });
});

describe('shiftBaseNote', () => {
  it('décale par octaves dans une plage bornée', () => {
    expect(shiftBaseNote(60, 1)).toBe(72);
    expect(shiftBaseNote(60, -1)).toBe(48);
    expect(shiftBaseNote(24, -1)).toBe(24);
    expect(shiftBaseNote(96, 1)).toBe(96);
  });
});
