import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './events';

describe('parseMidiMessage', () => {
  it('décode un Note On', () => {
    expect(parseMidiMessage([0x90, 60, 100], 12.5)).toEqual({
      type: 'noteon', note: 60, velocity: 100, channel: 0, timestamp: 12.5, source: 'midi',
    });
  });

  it('décode un Note Off', () => {
    expect(parseMidiMessage([0x80, 64, 40], 0)?.type).toBe('noteoff');
  });

  it('traite un Note On de vélocité 0 comme un Note Off', () => {
    const event = parseMidiMessage([0x90, 64, 0], 0);
    expect(event?.type).toBe('noteoff');
    expect(event?.note).toBe(64);
  });

  it('accepte tous les canaux', () => {
    for (let channel = 0; channel < 16; channel++) {
      const event = parseMidiMessage([0x90 | channel, 60, 1], 0);
      expect(event?.type).toBe('noteon');
      expect(event?.channel).toBe(channel);
    }
    expect(parseMidiMessage([0x8f, 60, 0], 0)?.channel).toBe(15);
  });

  it('ignore les autres messages', () => {
    expect(parseMidiMessage([0xb0, 64, 127], 0)).toBeNull(); // pédale de sustain
    expect(parseMidiMessage([0xe0, 0, 64], 0)).toBeNull(); // pitch bend
    expect(parseMidiMessage([0xfe], 0)).toBeNull(); // active sensing
    expect(parseMidiMessage([0xf8], 0)).toBeNull(); // horloge
    expect(parseMidiMessage([0xf0, 0x7e, 0x7f, 0xf7], 0)).toBeNull(); // SysEx
  });

  it('rejette les messages tronqués ou invalides', () => {
    expect(parseMidiMessage(null, 0)).toBeNull();
    expect(parseMidiMessage([], 0)).toBeNull();
    expect(parseMidiMessage([0x90, 60], 0)).toBeNull();
    expect(parseMidiMessage([0x40, 60, 100], 0)).toBeNull(); // pas d'octet de statut
    expect(parseMidiMessage([0x90, 200, 100], 0)).toBeNull();
    expect(parseMidiMessage([0x90, 60, 200], 0)).toBeNull();
  });

  it('accepte un Uint8Array comme fourni par Web MIDI', () => {
    expect(parseMidiMessage(new Uint8Array([0x93, 67, 80]), 1)?.note).toBe(67);
  });
});
