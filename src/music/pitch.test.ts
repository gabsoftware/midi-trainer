import { describe, expect, it } from 'vitest';
import {
  diatonicIndex,
  isValidMidiNote,
  midiToPitch,
  naturalNotesBetween,
  parseMidi,
  parsePitch,
  pitchClass,
  pitchName,
  pitchToMidi,
  toVexflowKey,
} from './pitch';

describe('pitchToMidi / midiToPitch', () => {
  it('place le do central à 60 et le La 440 à 69', () => {
    expect(pitchToMidi({ step: 'C', alter: 0, octave: 4 })).toBe(60);
    expect(pitchToMidi({ step: 'A', alter: 0, octave: 4 })).toBe(69);
  });

  it('couvre les bornes de la plage MIDI', () => {
    expect(midiToPitch(0)).toEqual({ step: 'C', alter: 0, octave: -1 });
    expect(midiToPitch(127)).toEqual({ step: 'G', alter: 0, octave: 9 });
  });

  it('est réversible pour toutes les notes MIDI, en dièses comme en bémols', () => {
    for (let midi = 0; midi <= 127; midi++) {
      expect(pitchToMidi(midiToPitch(midi, 'sharp'))).toBe(midi);
      expect(pitchToMidi(midiToPitch(midi, 'flat'))).toBe(midi);
    }
  });

  it('épelle les touches noires selon la préférence', () => {
    expect(midiToPitch(61, 'sharp')).toEqual({ step: 'C', alter: 1, octave: 4 });
    expect(midiToPitch(61, 'flat')).toEqual({ step: 'D', alter: -1, octave: 4 });
  });

  it('gère les altérations qui franchissent une octave', () => {
    expect(pitchToMidi({ step: 'B', alter: 1, octave: 3 })).toBe(60);
    expect(pitchToMidi({ step: 'C', alter: -1, octave: 4 })).toBe(59);
  });

  it('refuse les numéros hors plage', () => {
    expect(() => midiToPitch(128)).toThrow(RangeError);
    expect(() => midiToPitch(-1)).toThrow(RangeError);
    expect(() => midiToPitch(60.5)).toThrow(RangeError);
  });
});

describe('isValidMidiNote', () => {
  it('accepte uniquement les entiers de 0 à 127', () => {
    expect(isValidMidiNote(0)).toBe(true);
    expect(isValidMidiNote(127)).toBe(true);
    expect(isValidMidiNote(128)).toBe(false);
    expect(isValidMidiNote(-1)).toBe(false);
    expect(isValidMidiNote(1.5)).toBe(false);
  });
});

describe('pitchClass', () => {
  it('ignore l’octave', () => {
    expect(pitchClass(60)).toBe(0);
    expect(pitchClass(64)).toBe(4);
    expect(pitchClass(76)).toBe(4);
    expect(pitchClass(-1)).toBe(11);
  });
});

describe('parsePitch', () => {
  it('lit les notes naturelles et altérées', () => {
    expect(parsePitch('E4')).toEqual({ step: 'E', alter: 0, octave: 4 });
    expect(parsePitch('F#5')).toEqual({ step: 'F', alter: 1, octave: 5 });
    expect(parsePitch('Bb3')).toEqual({ step: 'B', alter: -1, octave: 3 });
    expect(parsePitch('C-1')).toEqual({ step: 'C', alter: 0, octave: -1 });
    expect(parseMidi('D5')).toBe(74);
  });

  it('rejette les textes invalides', () => {
    expect(() => parsePitch('H4')).toThrow();
    expect(() => parsePitch('C')).toThrow();
    expect(() => parsePitch('e4')).toThrow();
  });
});

describe('affichage', () => {
  it('donne les noms français', () => {
    expect(pitchName(midiToPitch(67), 'fr')).toBe('Sol');
    expect(pitchName(midiToPitch(62), 'fr', { withOctave: true })).toBe('Ré4');
    expect(pitchName(midiToPitch(66), 'fr')).toBe('Fa♯');
    expect(pitchName(midiToPitch(70, 'flat'), 'fr')).toBe('Si♭');
  });

  it('donne les noms anglais', () => {
    expect(pitchName(midiToPitch(67), 'en')).toBe('G');
    expect(pitchName(midiToPitch(62), 'en', { withOctave: true })).toBe('D4');
    expect(pitchName(midiToPitch(66), 'en')).toBe('F♯');
    expect(pitchName(midiToPitch(70, 'flat'), 'en', { withOctave: true })).toBe('B♭4');
  });

  it('produit les clés VexFlow', () => {
    expect(toVexflowKey(parsePitch('E4'))).toBe('e/4');
    expect(toVexflowKey(parsePitch('F#5'))).toBe('f#/5');
    expect(toVexflowKey(parsePitch('Bb3'))).toBe('bb/3');
  });
});

describe('positions diatoniques', () => {
  it('compte les degrés entre deux notes', () => {
    expect(diatonicIndex(parsePitch('G4')) - diatonicIndex(parsePitch('E4'))).toBe(2);
    expect(diatonicIndex(parsePitch('C5')) - diatonicIndex(parsePitch('B4'))).toBe(1);
  });

  it('liste les notes naturelles de Mi4 à Ré5', () => {
    expect(naturalNotesBetween('E4', 'D5')).toEqual([64, 65, 67, 69, 71, 72, 74]);
  });
});
