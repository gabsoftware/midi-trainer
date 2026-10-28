import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, backupFileName, createBackup, MAX_BACKUP_BYTES, parseBackup } from './backup';
import { createAttemptRecord, createProfileRecord, createSessionRecord, type ExerciseContext } from './records';
import type { RecordUpgrade } from './upgrades';

const CONTEXT: ExerciseContext = { levelId: 'level-1', mode: 'single', clef: 'treble' };
const NOW = new Date('2026-10-28T10:00:00Z');

function student(profileId: string, name: string, notes = 2) {
  const profile = createProfileRecord(profileId, name, NOW);
  const session = createSessionRecord(`s-${profileId}`, profileId, CONTEXT, NOW);
  const attempts = Array.from({ length: notes }, (_, index) =>
    createAttemptRecord(
      `a-${profileId}-${index}`,
      session,
      {
        expected: 64,
        played: [64],
        firstTryCorrect: true,
        errorCount: 0,
        firstResponseMs: 500,
        timeToCorrectMs: 500,
        octaveMode: 'any',
      },
      NOW,
    ),
  );
  return { profile, sessions: [session], attempts };
}

describe('parseBackup', () => {
  it('relit une sauvegarde exportée', () => {
    const backup = createBackup([student('p1', 'Alice'), student('p2', 'Bob', 3)], NOW);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed).toEqual({ ok: true, students: backup.students, skipped: 0 });
  });

  it('refuse ce qui n’est pas une sauvegarde', () => {
    expect(parseBackup('pas du json')).toEqual({ ok: false, error: 'not-json' });
    expect(parseBackup('[]')).toEqual({ ok: false, error: 'not-backup' });
    expect(parseBackup('{"format":"autre","version":1}')).toEqual({ ok: false, error: 'not-backup' });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, students: [] }))).toEqual({
      ok: false,
      error: 'empty',
    });
  });

  it('refuse une sauvegarde d’une version plus récente de l’application', () => {
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, students: [] }))).toEqual({
      ok: false,
      error: 'newer-version',
    });
  });

  it('refuse un fichier trop volumineux sans l’analyser', () => {
    expect(parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toEqual({ ok: false, error: 'too-large' });
  });

  it('ignore et compte les enregistrements invalides ou rattachés à un autre élève', () => {
    const alice = student('p1', 'Alice');
    const bobAttempt = student('p2', 'Bob').attempts[0];
    const backup = {
      ...createBackup([alice], NOW),
      students: [
        {
          ...alice,
          attempts: [...alice.attempts, { ...alice.attempts[0], id: 'bad', expected: 999 }, bobAttempt],
        },
        { profile: { id: 'sans-schema' }, sessions: [{}], attempts: [] },
      ],
    };
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.students).toHaveLength(1);
    expect(parsed.students[0].attempts).toHaveLength(2);
    expect(parsed.skipped).toBe(4); // 2 tentatives + 1 élève invalide + 1 séance de cet élève
  });

  it('rejette les enregistrements d’un schéma plus récent que l’application', () => {
    const alice = student('p1', 'Alice');
    const future = { ...alice, attempts: alice.attempts.map((a) => ({ ...a, schema: 2 })) };
    const parsed = parseBackup(JSON.stringify(createBackup([future as never], NOW)));
    expect(parsed.ok && parsed.students[0].attempts).toEqual([]);
    expect(parsed.ok && parsed.skipped).toBe(2);
  });

  it('applique les étapes de mise à niveau aux enregistrements lus', () => {
    // Une étape qui ne change pas le schéma final est impossible ; on vérifie ici que
    // parseBackup passe bien chaque enregistrement par les étapes fournies.
    const seen: string[] = [];
    const spy: RecordUpgrade[] = [{ toSchema: 1, upgrade: (kind, record) => (seen.push(kind), { ...record }) }];
    const alice = student('p1', 'Alice', 1);
    const old = {
      profile: { ...alice.profile, schema: 0 },
      sessions: alice.sessions.map((s) => ({ ...s, schema: 0 })),
      attempts: alice.attempts.map((a) => ({ ...a, schema: 0 })),
    };
    const parsed = parseBackup(JSON.stringify(createBackup([old as never], NOW)), spy);
    expect(seen.sort()).toEqual(['attempt', 'profile', 'session']);
    expect(parsed.ok && parsed.students[0].attempts).toHaveLength(1);
  });

  it('réunit un élève présent deux fois dans le fichier', () => {
    const first = student('p1', 'Alice', 1);
    const second = { ...student('p1', 'Alice', 0), attempts: [{ ...first.attempts[0], id: 'autre' }] };
    const parsed = parseBackup(JSON.stringify(createBackup([first, second], NOW)));
    expect(parsed.ok && parsed.students.map((s) => s.attempts.length)).toEqual([2]);
  });
});

describe('backupFileName', () => {
  it('inclut le nom de l’élève sans accents ni espaces', () => {
    const date = new Date(2026, 9, 28);
    expect(backupFileName('Élodie Müller', date)).toBe('midi-trainer-elodie-muller-2026-10-28.json');
    expect(backupFileName(null, date)).toBe('midi-trainer-2026-10-28.json');
    expect(backupFileName('!!!', date)).toBe('midi-trainer-2026-10-28.json');
  });
});
