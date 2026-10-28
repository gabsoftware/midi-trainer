import { describe, expect, it } from 'vitest';
import { isValidMidiNote, parseMidi } from '../music/pitch';
import { findLevel, LEVELS, staffForNote } from './levels';

/** Notes contenues dans la portée, sans ligne supplémentaire. */
const STAFF_RANGE = {
  treble: [parseMidi('E4'), parseMidi('F5')],
  bass: [parseMidi('G2'), parseMidi('A3')],
} as const;

describe('LEVELS', () => {
  it('a des identifiants uniques et une numérotation continue de 1 à 10', () => {
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length);
    expect(LEVELS.map((level) => level.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('décrit des notes valides, triées et sans doublon', () => {
    for (const level of LEVELS) {
      expect(level.notes.length, level.id).toBeGreaterThan(1);
      expect(level.notes.every(isValidMidiNote), level.id).toBe(true);
      expect([...level.notes].sort((a, b) => a - b), level.id).toEqual(level.notes);
      expect(new Set(level.notes).size, level.id).toBe(level.notes.length);
    }
  });

  it('exige l’octave exacte dès qu’il y a des lignes supplémentaires', () => {
    for (const level of LEVELS) {
      const ledger = level.notes.some((note) => {
        const [low, high] = STAFF_RANGE[staffForNote(level.clef, note)];
        return note < low || note > high;
      });
      if (ledger) expect(level.defaultOctaveMode, level.id).toBe('exact');
    }
  });

  it('a des critères de maîtrise cohérents', () => {
    for (const { id, mastery } of LEVELS) {
      expect(mastery.window, id).toBeLessThanOrEqual(mastery.minAttempts);
      expect(mastery.minFirstTryAccuracy, id).toBeGreaterThan(0);
      expect(mastery.minFirstTryAccuracy, id).toBeLessThanOrEqual(1);
      expect(mastery.minSessions, id).toBeGreaterThanOrEqual(2);
      expect(mastery.minDays, id).toBeLessThanOrEqual(mastery.minSessions);
      // La voie express doit être plus exigeante que la maîtrise normale.
      expect(mastery.fastTrack.maxErrors / mastery.window, id).toBeLessThan(1 - mastery.minFirstTryAccuracy);
      expect(mastery.fastTrack.maxMedianRatio, id).toBeGreaterThan(0);
      expect(mastery.fastTrack.maxMedianRatio, id).toBeLessThan(1);
    }
  });

  it('propose un examen dont la taille augmente avec le niveau', () => {
    const playable = LEVELS.filter((level) => level.available);
    const averageNotes = playable.map(({ exam }) => (exam.lines * (exam.notesPerLine.min + exam.notesPerLine.max)) / 2);
    for (let index = 1; index < averageNotes.length; index++) {
      expect(averageNotes[index], playable[index].id).toBeGreaterThan(averageNotes[index - 1]);
    }
    expect(LEVELS[0].exam).toMatchObject({ lines: 5, notesPerLine: { min: 4, max: 6 } });
  });

  it('a des examens cohérents (3 à 8 notes par ligne, seuil de réussite de 90 %)', () => {
    for (const { id, exam, notes } of LEVELS) {
      expect(exam.notesPerLine.min, id).toBeGreaterThanOrEqual(3);
      expect(exam.notesPerLine.max, id).toBeLessThanOrEqual(8);
      expect(exam.notesPerLine.min, id).toBeLessThanOrEqual(exam.notesPerLine.max);
      expect(exam.maxLeap, id).toBeGreaterThanOrEqual(2);
      expect(exam.passAccuracy, id).toBe(0.9);
      expect(notes.length, id).toBeGreaterThan(1);
    }
  });

  it('donne une taille de ligne à chaque niveau de suites de notes, et seulement à eux', () => {
    for (const { id, exercise, line } of LEVELS) {
      if (exercise === 'single') {
        expect(line, id).toBeUndefined();
        continue;
      }
      expect(line, id).toBeDefined();
      expect(line!.min, id).toBeGreaterThanOrEqual(3);
      expect(line!.max, id).toBeLessThanOrEqual(8);
      expect(line!.min, id).toBeLessThanOrEqual(line!.max);
      expect(line!.maxLeap, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('reprend les notes du cahier des charges pour les premiers niveaux', () => {
    expect(findLevel('level-1')?.notes).toEqual([64, 67, 71]); // Mi, Sol, Si
    expect(findLevel('level-2')?.notes).toEqual([64, 65, 67, 69, 71]); // + Fa, La
    expect(findLevel('level-3')?.notes).toEqual([64, 65, 67, 69, 71, 72, 74]); // + Do, Ré
  });
});

describe('staffForNote', () => {
  it('répartit le grand système autour du do central', () => {
    expect(staffForNote('grand', 60)).toBe('treble');
    expect(staffForNote('grand', 59)).toBe('bass');
    expect(staffForNote('bass', 72)).toBe('bass');
  });
});
