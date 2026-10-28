import { describe, expect, it } from 'vitest';
import { DEFAULT_ADAPTIVE_PARAMS, noteWeights, pickWeightedNote } from './adaptive';

const E4 = 64;
const G4 = 67;
const B4 = 71;
const NOTES = [E4, G4, B4];
const FAST_MS = 1500;

function attempt(expected: number, firstTryCorrect: boolean, firstResponseMs = 1000) {
  return { expected, firstTryCorrect, firstResponseMs };
}

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

describe('noteWeights', () => {
  it('favorise un peu les notes jamais jouées', () => {
    expect(noteWeights(NOTES, [], FAST_MS).get(E4)).toBe(DEFAULT_ADAPTIVE_PARAMS.unseenWeight);
  });

  it('augmente la fréquence d’une note ratée', () => {
    expect(noteWeights(NOTES, [attempt(E4, false)], FAST_MS).get(E4)).toBeCloseTo(1.8);
  });

  it('maintient la fréquence d’une note réussie lentement', () => {
    expect(noteWeights(NOTES, [attempt(E4, true, 3000)], FAST_MS).get(E4)).toBe(1);
  });

  it('réduit la fréquence d’une note réussie rapidement', () => {
    expect(noteWeights(NOTES, [attempt(E4, true, 800)], FAST_MS).get(E4)).toBeCloseTo(0.7);
  });

  it('ne tient compte que des dernières tentatives de chaque note', () => {
    const history = [
      attempt(E4, false),
      attempt(E4, false),
      ...Array.from({ length: 5 }, () => attempt(E4, true, 3000)),
    ];
    expect(noteWeights(NOTES, history, FAST_MS).get(E4)).toBe(1);
  });

  it('reste dans des bornes, pour qu’aucune note ne disparaisse ni n’envahisse', () => {
    const misses = Array.from({ length: 5 }, () => attempt(E4, false));
    const fast = Array.from({ length: 5 }, () => attempt(G4, true, 100));
    const weights = noteWeights(NOTES, [...misses, ...fast], FAST_MS);
    expect(weights.get(E4)).toBe(DEFAULT_ADAPTIVE_PARAMS.maxWeight);
    expect(weights.get(G4)).toBe(DEFAULT_ADAPTIVE_PARAMS.minWeight);
  });

  it('ignore les tentatives en mode assisté', () => {
    expect(noteWeights(NOTES, [{ ...attempt(E4, false), assisted: true }], FAST_MS).get(E4)).toBe(
      DEFAULT_ADAPTIVE_PARAMS.unseenWeight,
    );
  });

  it('ignore les tentatives sur des notes hors du niveau', () => {
    const weights = noteWeights(NOTES, [attempt(60, false)], FAST_MS);
    expect([...weights.keys()]).toEqual(NOTES);
  });
});

describe('pickWeightedNote', () => {
  it('ne répète jamais la note précédente', () => {
    const weights = new Map([
      [E4, 4],
      [G4, 0.25],
      [B4, 0.25],
    ]);
    const random = seeded(1);
    for (let i = 0; i < 200; i++) {
      expect(pickWeightedNote(NOTES, weights, E4, random)).not.toBe(E4);
    }
  });

  it('est déterministe pour une source aléatoire donnée', () => {
    const weights = noteWeights(NOTES, [attempt(E4, false)], FAST_MS);
    const draw = (seed: number) => {
      const random = seeded(seed);
      let previous: number | null = null;
      return Array.from({ length: 20 }, () => (previous = pickWeightedNote(NOTES, weights, previous, random)));
    };
    expect(draw(42)).toEqual(draw(42));
  });

  it('tire les notes en proportion de leur poids', () => {
    const weights = new Map([
      [E4, 3],
      [G4, 1],
    ]);
    const random = seeded(7);
    let e4 = 0;
    const draws = 4000;
    for (let i = 0; i < draws; i++) {
      if (pickWeightedNote([E4, G4], weights, null, random) === E4) e4++;
    }
    expect(e4 / draws).toBeGreaterThan(0.72);
    expect(e4 / draws).toBeLessThan(0.78);
  });

  it('fait apparaître plus souvent une note difficile', () => {
    const history = [attempt(E4, false), attempt(E4, false), attempt(G4, true, 500), attempt(B4, true, 500)];
    const weights = noteWeights(NOTES, history, FAST_MS);
    const random = seeded(3);
    const counts = new Map(NOTES.map((note) => [note, 0]));
    let previous: number | null = null;
    for (let i = 0; i < 3000; i++) {
      previous = pickWeightedNote(NOTES, weights, previous, random);
      counts.set(previous, counts.get(previous)! + 1);
    }
    expect(counts.get(E4)!).toBeGreaterThan(counts.get(G4)!);
    expect(counts.get(E4)!).toBeGreaterThan(counts.get(B4)!);
  });

  it('accepte une seule note et refuse un ensemble vide', () => {
    expect(pickWeightedNote([E4], new Map(), E4, () => 0.5)).toBe(E4);
    expect(() => pickWeightedNote([], new Map(), null, () => 0)).toThrow();
  });

  it('traite une note sans poids comme un poids de 1', () => {
    expect(pickWeightedNote([E4, G4], new Map(), null, () => 0.75)).toBe(G4);
  });
});
