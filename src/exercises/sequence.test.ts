import { describe, expect, it } from 'vitest';
import { diatonicIndex, midiToPitch, naturalNotesBetween } from '../music/pitch';
import { generateLine } from './lineGenerator';
import { pauseSequence, playSequence, resumeSequence, startSequence } from './sequence';

const E4 = 64;
const F4 = 65;
const G4 = 67;

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('séquence de notes', () => {
  it('avance note par note et se termine après la dernière', () => {
    let state = startSequence([E4, G4, F4], 'exact', 0);
    state = playSequence(state, E4, 500);
    expect(state.position).toBe(1);
    state = playSequence(state, G4, 1200);
    state = playSequence(state, F4, 2000);
    expect(state.done).toBe(true);
    expect(state.attempts.map((a) => [a.expected, a.timeToCorrectMs])).toEqual([
      [E4, 500],
      [G4, 700],
      [F4, 800],
    ]);
  });

  it('une mauvaise note ne fait pas avancer et compte comme erreur', () => {
    let state = startSequence([E4, G4], 'exact', 0);
    state = playSequence(state, F4, 300);
    expect(state.position).toBe(0);
    state = playSequence(state, E4, 600);
    expect(state.position).toBe(1);
    expect(state.attempts[0]).toMatchObject({ firstTryCorrect: false, errorCount: 1, played: [F4, E4] });
  });

  it('exclut les pauses du temps de la note en cours', () => {
    let state = startSequence([E4, G4], 'exact', 0);
    state = playSequence(state, E4, 400);
    state = pauseSequence(state, 'midi-disconnected', 500);
    expect(playSequence(state, G4, 5000)).toBe(state); // ignorée pendant la pause
    state = resumeSequence(state, 20_000);
    state = playSequence(state, G4, 20_300);
    expect(state.attempts[1].timeToCorrectMs).toBe(400);
  });

  it('ignore les notes une fois terminée', () => {
    const done = playSequence(startSequence([E4], 'any', 0), E4, 100);
    expect(done.done).toBe(true);
    expect(playSequence(done, G4, 200)).toBe(done);
  });

  it('refuse une séquence vide', () => {
    expect(() => startSequence([], 'any', 0)).toThrow();
  });
});

describe('generateLine', () => {
  const pool = naturalNotesBetween('E4', 'D5');
  const degree = (midi: number) => diatonicIndex(midiToPitch(midi));
  const options = { minLength: 4, maxLength: 6, maxLeap: 4, previous: null, used: new Set<number>() };

  it('respecte la longueur, les intervalles, et ne répète jamais une note', () => {
    const random = seeded(11);
    let previous: number | null = null;
    for (let line = 0; line < 200; line++) {
      const notes = generateLine(pool, { ...options, previous, random });
      expect(notes.length).toBeGreaterThanOrEqual(4);
      expect(notes.length).toBeLessThanOrEqual(6);
      expect(notes.every((note) => pool.includes(note))).toBe(true);
      expect(notes[0]).not.toBe(previous);
      for (let index = 1; index < notes.length; index++) {
        expect(notes[index]).not.toBe(notes[index - 1]);
        expect(Math.abs(degree(notes[index]) - degree(notes[index - 1]))).toBeLessThanOrEqual(4);
      }
      previous = notes.at(-1)!;
    }
  });

  it('couvre toutes les notes du niveau au fil d’un examen', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = seeded(seed);
      const used = new Set<number>();
      let previous: number | null = null;
      for (let line = 0; line < 5; line++) {
        const notes = generateLine(pool, { ...options, previous, used, random });
        notes.forEach((note) => used.add(note));
        previous = notes.at(-1)!;
      }
      expect(used.size, `graine ${seed}`).toBe(pool.length);
    }
  });

  it('est déterministe pour une source aléatoire donnée', () => {
    expect(generateLine(pool, { ...options, random: seeded(5) })).toEqual(
      generateLine(pool, { ...options, random: seeded(5) }),
    );
  });

  it('fait revenir plus souvent les notes de poids élevé (entraînement adaptatif)', () => {
    const hard = pool[3];
    const weights = new Map(pool.map((note) => [note, note === hard ? 4 : 0.25]));
    const random = seeded(3);
    const counts = new Map<number, number>();
    for (let line = 0; line < 100; line++) {
      for (const note of generateLine(pool, { ...options, weights, random })) {
        counts.set(note, (counts.get(note) ?? 0) + 1);
      }
    }
    const others = pool.filter((note) => note !== hard).map((note) => counts.get(note) ?? 0);
    expect(counts.get(hard)).toBeGreaterThan(Math.max(...others));
  });

  it('fonctionne avec seulement deux notes', () => {
    const notes = generateLine([E4, G4], { ...options, random: seeded(2) });
    for (let index = 1; index < notes.length; index++) expect(notes[index]).not.toBe(notes[index - 1]);
  });
});
