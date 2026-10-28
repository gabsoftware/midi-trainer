import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../storage/records';
import { LEVELS, type LevelDefinition } from './levels';
import { evaluateLevel, nextLevel, recommendLevel, type LevelProgress } from './mastery';

const LEVEL: LevelDefinition = {
  ...LEVELS[0],
  mastery: {
    minAttempts: 20,
    window: 20,
    minFirstTryAccuracy: 0.9,
    maxMedianMs: 2000,
    minSessions: 2,
    minSessionAttempts: 10,
    minSessionAccuracy: 0.85,
    minDays: 2,
    fastTrack: { minFirstTryAccuracy: 0.98, maxMedianRatio: 0.25 },
  },
};

let counter = 0;

interface SessionSpec {
  day: string;
  count: number;
  misses?: number;
  timeMs?: number;
  levelId?: string;
  octaveMode?: 'any' | 'exact';
  assisted?: boolean;
}

/** Génère une séance de `count` notes, dont `misses` ratées au premier essai. */
function session({
  day,
  count,
  misses = 0,
  timeMs = 1000,
  levelId = LEVEL.id,
  octaveMode = 'any',
  assisted = false,
}: SessionSpec): AttemptRecord[] {
  const sessionId = `s-${++counter}`;
  return Array.from({ length: count }, (_, index) => {
    const missed = index < misses;
    return {
      schema: 2,
      id: `a-${++counter}`,
      profileId: 'p1',
      sessionId,
      levelId,
      mode: 'single',
      clef: 'treble',
      assisted,
      createdAt: `${day}T10:${String(index).padStart(2, '0')}:00.000Z`,
      expected: 64,
      played: missed ? [65, 64] : [64],
      firstTryCorrect: !missed,
      errorCount: missed ? 1 : 0,
      firstResponseMs: timeMs,
      timeToCorrectMs: missed ? timeMs * 2 : timeMs,
      octaveMode,
    };
  });
}

describe('evaluateLevel', () => {
  it('marque un niveau jamais joué comme nouveau', () => {
    const progress = evaluateLevel(LEVEL, []);
    expect(progress.status).toBe('new');
    expect(progress.accuracy.current).toBeNull();
    expect(progress.speed.current).toBeNull();
  });

  it('valide un niveau réussi sur deux séances, deux jours différents', () => {
    const attempts = [...session({ day: '2026-10-20', count: 10 }), ...session({ day: '2026-10-21', count: 10 })];
    const progress = evaluateLevel(LEVEL, attempts);
    expect(progress.status).toBe('ready');
    expect(progress.accuracy.current).toBe(1);
    expect(progress.speed.current).toBe(1000);
    expect(progress.regularity).toMatchObject({ sessions: 2, days: 2, met: true });
  });

  it('ne valide pas sur un score ponctuel, même parfait, en une seule séance', () => {
    const progress = evaluateLevel(LEVEL, session({ day: '2026-10-20', count: 50, timeMs: 1000 }));
    expect(progress.fastTrack.met).toBe(false); // 1 s > 2 000 ms × 0,25
    expect(progress.accuracy.met).toBe(true);
    expect(progress.volume.met).toBe(true);
    expect(progress.regularity.met).toBe(false);
    expect(progress.status).toBe('learning');
  });

  it('exige des jours différents, pas seulement des séances différentes', () => {
    const attempts = [...session({ day: '2026-10-20', count: 10 }), ...session({ day: '2026-10-20', count: 10 })];
    const progress = evaluateLevel(LEVEL, attempts);
    expect(progress.regularity).toMatchObject({ sessions: 2, days: 1, met: false });
  });

  it('ne valide pas des réponses justes mais trop lentes', () => {
    const attempts = [
      ...session({ day: '2026-10-20', count: 10, timeMs: 3000 }),
      ...session({ day: '2026-10-21', count: 10, timeMs: 3000 }),
    ];
    const progress = evaluateLevel(LEVEL, attempts);
    expect(progress.speed).toMatchObject({ current: 3000, met: false });
    expect(progress.status).toBe('learning');
  });

  it('une séance récente ratée interrompt la régularité', () => {
    const attempts = [
      ...session({ day: '2026-10-18', count: 10 }),
      ...session({ day: '2026-10-19', count: 10 }),
      ...session({ day: '2026-10-20', count: 10, misses: 4 }),
    ];
    const progress = evaluateLevel(LEVEL, attempts);
    expect(progress.regularity).toMatchObject({ sessions: 0, met: false });
  });

  it('ignore les séances trop courtes pour la régularité', () => {
    const attempts = [
      ...session({ day: '2026-10-19', count: 10 }),
      ...session({ day: '2026-10-20', count: 10 }),
      ...session({ day: '2026-10-21', count: 3, misses: 3 }),
    ];
    expect(evaluateLevel(LEVEL, attempts).regularity.met).toBe(true);
  });

  it('mesure précision et vitesse sur les dernières notes seulement', () => {
    const attempts = [
      ...session({ day: '2026-10-19', count: 20, misses: 20, timeMs: 5000 }),
      ...session({ day: '2026-10-20', count: 10 }),
      ...session({ day: '2026-10-21', count: 10 }),
    ];
    const progress = evaluateLevel(LEVEL, attempts);
    expect(progress.attemptCount).toBe(40);
    expect(progress.accuracy.current).toBe(1);
    expect(progress.status).toBe('ready');
  });

  it('ne compte pas les tentatives en mode assisté', () => {
    const attempts = [
      ...session({ day: '2026-10-20', count: 10, assisted: true }),
      ...session({ day: '2026-10-21', count: 10, assisted: true }),
    ];
    const progress = evaluateLevel(LEVEL, attempts);
    expect(progress.attemptCount).toBe(0);
    expect(progress.status).toBe('new');
  });

  it('ne compte que les tentatives du niveau', () => {
    const progress = evaluateLevel(LEVEL, session({ day: '2026-10-20', count: 10, levelId: 'level-2' }));
    expect(progress.attemptCount).toBe(0);
  });

  it('ignore les tentatives en octave libre pour un niveau à octave exacte', () => {
    const exactLevel: LevelDefinition = { ...LEVEL, defaultOctaveMode: 'exact' };
    const attempts = [
      ...session({ day: '2026-10-20', count: 10, octaveMode: 'any' }),
      ...session({ day: '2026-10-21', count: 4, octaveMode: 'exact' }),
    ];
    expect(evaluateLevel(exactLevel, attempts).attemptCount).toBe(4);
  });
});

describe('examen de validation', () => {
  const ready = () => [...session({ day: '2026-10-20', count: 10 }), ...session({ day: '2026-10-21', count: 10 })];
  const examSession = (passed: boolean, levelId = LEVEL.id) => ({
    levelId,
    mode: 'exam' as const,
    exam: { passed, notes: 25, firstTryRate: passed ? 0.96 : 0.8 },
  });

  it('les critères remplis rendent le niveau prêt pour l’examen, pas encore maîtrisé', () => {
    const progress = evaluateLevel(LEVEL, ready());
    expect(progress).toMatchObject({ status: 'ready', criteriaMet: true, examPassed: false });
  });

  it('un examen réussi valide le niveau', () => {
    expect(evaluateLevel(LEVEL, ready(), [examSession(true)]).status).toBe('mastered');
  });

  it('un examen raté laisse le niveau prêt pour une nouvelle tentative', () => {
    expect(evaluateLevel(LEVEL, ready(), [examSession(false)]).status).toBe('ready');
  });

  it('ne tient compte que des examens de ce niveau', () => {
    expect(evaluateLevel(LEVEL, ready(), [examSession(true, 'level-2')]).status).toBe('ready');
  });

  it('un niveau validé le reste, même si les résultats récents baissent', () => {
    const later = session({ day: '2026-10-25', count: 40, misses: 20 });
    const progress = evaluateLevel(LEVEL, [...ready(), ...later], [examSession(true)]);
    expect(progress.criteriaMet).toBe(false);
    expect(progress.status).toBe('mastered');
  });

  it('les notes jouées pendant un examen ne comptent pas pour les critères des séances', () => {
    const examNotes = session({ day: '2026-10-20', count: 30 }).map((a) => ({ ...a, mode: 'exam' as const }));
    expect(evaluateLevel(LEVEL, examNotes).attemptCount).toBe(0);
  });
});

describe('voie express', () => {
  it('valide en une seule séance une performance exceptionnelle', () => {
    const progress = evaluateLevel(LEVEL, session({ day: '2026-10-20', count: 25, timeMs: 450 }));
    expect(progress.regularity.met).toBe(false);
    expect(progress.fastTrack).toEqual({ accuracyTarget: 0.98, speedTargetMs: 500, met: true });
    expect(progress.status).toBe('ready');
  });

  it('exige quand même le volume minimal', () => {
    const progress = evaluateLevel(LEVEL, session({ day: '2026-10-20', count: 15, timeMs: 300 }));
    expect(progress.fastTrack.met).toBe(false);
    expect(progress.status).toBe('learning');
  });

  it('ne s’applique pas en dessous de 98 % de réussite', () => {
    // 1 erreur sur 20 notes = 95 %, au-dessus de l'objectif normal mais pas de la voie express.
    const progress = evaluateLevel(LEVEL, session({ day: '2026-10-20', count: 20, misses: 1, timeMs: 300 }));
    expect(progress.accuracy.met).toBe(true);
    expect(progress.fastTrack.met).toBe(false);
    expect(progress.status).toBe('learning');
  });

  it('ne s’applique pas si le temps médian dépasse le seuil express', () => {
    const progress = evaluateLevel(LEVEL, session({ day: '2026-10-20', count: 30, timeMs: 501 }));
    expect(progress.speed.met).toBe(true);
    expect(progress.fastTrack.met).toBe(false);
  });
});

describe('recommendLevel', () => {
  const progressOf = (statuses: Record<string, LevelProgress['status']>) =>
    new Map(Object.entries(statuses).map(([id, status]) => [id, { status } as LevelProgress]));

  it('conseille le premier niveau jouable non maîtrisé', () => {
    expect(recommendLevel(LEVELS, progressOf({})).id).toBe('level-1');
    expect(recommendLevel(LEVELS, progressOf({ 'level-1': 'mastered', 'level-2': 'learning' })).id).toBe('level-2');
  });

  it('saute les niveaux pas encore disponibles', () => {
    const mastered = Object.fromEntries(
      ['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7', 'level-8'].map((id) => [
        id,
        'mastered' as const,
      ]),
    );
    // Niveaux 9 et 10 pas encore jouables : on reste sur le dernier niveau jouable.
    expect(recommendLevel(LEVELS, progressOf(mastered)).id).toBe('level-8');
  });
});

describe('nextLevel', () => {
  const progressOf = (statuses: Record<string, LevelProgress['status']>) =>
    new Map(Object.entries(statuses).map(([id, status]) => [id, { status } as LevelProgress]));
  const level = (id: string) => LEVELS.find((item) => item.id === id)!;

  it('propose le niveau suivant, même si un niveau précédent n’est pas maîtrisé', () => {
    expect(nextLevel(LEVELS, level('level-3'), progressOf({ 'level-3': 'mastered' }))?.id).toBe('level-4');
  });

  it('saute les niveaux déjà maîtrisés ou indisponibles', () => {
    const progress = progressOf({ 'level-5': 'mastered', 'level-6': 'mastered', 'level-7': 'mastered' });
    expect(nextLevel(LEVELS, level('level-4'), progress)?.id).toBe('level-8');
  });

  it('ne propose rien après le dernier niveau jouable', () => {
    expect(nextLevel(LEVELS, level('level-8'), progressOf({}))).toBeNull();
  });
});
