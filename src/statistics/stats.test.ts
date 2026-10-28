import { describe, expect, it } from 'vitest';
import { computeStats, HARDEST_COUNT, MAX_SESSION_POINTS } from './stats';

let counter = 0;

interface Spec {
  note: number;
  errors?: number;
  timeMs?: number;
  session?: string;
  level?: string;
  assisted?: boolean;
  day?: string;
}

function attempt({ note, errors = 0, timeMs = 1000, session = 's1', level = 'level-1', assisted = false, day = '2026-10-20' }: Spec) {
  counter += 1;
  return {
    sessionId: session,
    levelId: level,
    createdAt: `${day}T10:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    expected: note,
    firstTryCorrect: errors === 0,
    errorCount: errors,
    firstResponseMs: timeMs,
    timeToCorrectMs: timeMs * (errors + 1),
    assisted,
  };
}

describe('computeStats', () => {
  it('donne des statistiques vides sans historique', () => {
    const stats = computeStats([]);
    expect(stats.overall).toMatchObject({ notes: 0, sessions: 0, firstTryRate: null, recognitionMedianMs: null });
    expect(stats.perNote).toEqual([]);
    expect(stats.hardest).toEqual([]);
    expect(stats.evolution).toEqual([]);
  });

  it('distingue les réussites du premier coup des réponses corrigées après erreur', () => {
    const stats = computeStats([
      attempt({ note: 64 }),
      attempt({ note: 67, errors: 2 }),
      attempt({ note: 71 }),
      attempt({ note: 64, errors: 1 }),
    ]);
    expect(stats.overall).toMatchObject({
      notes: 4,
      firstTryCorrect: 2,
      correctedAfterError: 2,
      firstTryRate: 0.5,
      errors: 3,
    });
  });

  it('mesure la reconnaissance sur les notes trouvées du premier coup', () => {
    const stats = computeStats([
      attempt({ note: 64, timeMs: 800 }),
      attempt({ note: 64, timeMs: 1200 }),
      attempt({ note: 67, errors: 1, timeMs: 9000 }),
    ]);
    expect(stats.overall.recognitionMedianMs).toBe(1000);
    expect(stats.overall.recognitionMeanMs).toBe(1000);
    expect(stats.overall.timeToCorrectMedianMs).toBe(1200);
  });

  it('exclut le mode assisté et le signale', () => {
    const stats = computeStats([attempt({ note: 64 }), attempt({ note: 64, errors: 3, assisted: true })]);
    expect(stats.overall.notes).toBe(1);
    expect(stats.overall.firstTryRate).toBe(1);
    expect(stats.overall.assistedExcluded).toBe(1);
  });

  it('filtre par niveau', () => {
    const stats = computeStats(
      [attempt({ note: 64, level: 'level-1' }), attempt({ note: 48, level: 'level-5', errors: 1 })],
      'level-5',
    );
    expect(stats.overall.notes).toBe(1);
    expect(stats.perNote.map((n) => n.note)).toEqual([48]);
  });

  it('détaille chaque note, du grave à l’aigu', () => {
    const stats = computeStats([
      attempt({ note: 71, timeMs: 500 }),
      attempt({ note: 64, errors: 1, timeMs: 700 }),
      attempt({ note: 64, timeMs: 900 }),
    ]);
    expect(stats.perNote).toEqual([
      { note: 64, attempts: 2, firstTryRate: 0.5, misses: 1, recognitionMedianMs: 900, recognitionMeanMs: 900 },
      { note: 71, attempts: 1, firstTryRate: 1, misses: 0, recognitionMedianMs: 500, recognitionMeanMs: 500 },
    ]);
  });

  it('classe les notes difficiles par réussite, puis par lenteur, avec assez de tentatives', () => {
    const many = (note: number, errorsEach: number[], timeMs = 1000) =>
      errorsEach.map((errors) => attempt({ note, errors, timeMs }));
    const stats = computeStats([
      ...many(64, [0, 0, 0], 2000), // parfaite mais lente
      ...many(67, [1, 0, 0]), // 67 % de réussite
      ...many(71, [0, 0, 0], 500), // parfaite et rapide
      ...many(72, [1, 1]), // trop peu de tentatives pour être classée
    ]);
    expect(stats.hardest.map((n) => n.note)).toEqual([67, 64, 71]);
    expect(stats.hardest.length).toBeLessThanOrEqual(HARDEST_COUNT);
  });

  it('retrace l’évolution séance par séance, dans l’ordre chronologique', () => {
    const stats = computeStats([
      attempt({ note: 64, session: 'b', day: '2026-10-21', errors: 1 }),
      attempt({ note: 64, session: 'b', day: '2026-10-21' }),
      attempt({ note: 64, session: 'a', day: '2026-10-20', timeMs: 1500 }),
    ]);
    expect(stats.overall.sessions).toBe(2);
    expect(stats.evolution.map((p) => [p.sessionId, p.notes, p.firstTryRate, p.recognitionMedianMs])).toEqual([
      ['a', 1, 1, 1500],
      ['b', 2, 0.5, 1000],
    ]);
  });

  it('limite l’évolution aux séances les plus récentes', () => {
    const attempts = Array.from({ length: MAX_SESSION_POINTS + 5 }, (_, index) =>
      attempt({ note: 64, session: `s${index}`, day: `2026-0${1 + Math.floor(index / 28)}-${String((index % 28) + 1).padStart(2, '0')}` }),
    );
    const stats = computeStats(attempts);
    expect(stats.evolution).toHaveLength(MAX_SESSION_POINTS);
    expect(stats.evolution.at(-1)?.sessionId).toBe(`s${MAX_SESSION_POINTS + 4}`);
  });
});
