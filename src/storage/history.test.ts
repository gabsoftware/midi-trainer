import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteAttempt } from '../exercises/singleNote';
import { HistoryService } from './HistoryService';
import { IndexedDbHistoryStore, MemoryHistoryStore, type HistoryStore, type StoredHistory } from './historyStore';
import { createAttemptRecord, createSessionRecord, isAttemptRecord, type ExerciseContext } from './records';

const CONTEXT: ExerciseContext = { levelId: 'prototype', mode: 'single', clef: 'treble' };

function attempt(expected: number, played: number[], firstResponseMs = 500, timeToCorrectMs = 500): NoteAttempt {
  return {
    expected,
    played,
    firstTryCorrect: played.length === 1,
    errorCount: played.length - 1,
    firstResponseMs,
    timeToCorrectMs,
    octaveMode: 'any',
  };
}

function sequentialIds(prefix = 'id'): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

/** Horloge qui avance d'une seconde à chaque lecture. */
function steppingClock(): () => Date {
  let time = Date.parse('2026-10-28T10:00:00.000Z');
  return () => new Date((time += 1000));
}

let dbCounter = 0;
const openStores: IndexedDbHistoryStore[] = [];
function freshDbName(): string {
  return `test-db-${++dbCounter}`;
}
function openStore(name: string): IndexedDbHistoryStore {
  const store = new IndexedDbHistoryStore(indexedDB, name);
  openStores.push(store);
  return store;
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.close();
});

describe('records', () => {
  it('copie le contexte de la séance dans chaque tentative', () => {
    const session = createSessionRecord('s1', CONTEXT, new Date('2026-10-28T10:00:00Z'));
    const record = createAttemptRecord('a1', session, attempt(64, [65, 64], 400, 900), new Date('2026-10-28T10:00:05Z'));
    expect(record).toMatchObject({
      sessionId: 's1',
      levelId: 'prototype',
      mode: 'single',
      clef: 'treble',
      createdAt: '2026-10-28T10:00:05.000Z',
      expected: 64,
      played: [65, 64],
      firstTryCorrect: false,
      errorCount: 1,
      firstResponseMs: 400,
      timeToCorrectMs: 900,
    });
    expect(isAttemptRecord(record)).toBe(true);
  });

  it('rejette les enregistrements incohérents', () => {
    const session = createSessionRecord('s1', CONTEXT, new Date());
    const valid = createAttemptRecord('a1', session, attempt(64, [64]), new Date());
    expect(isAttemptRecord({ ...valid, expected: 200 })).toBe(false);
    expect(isAttemptRecord({ ...valid, errorCount: 3 })).toBe(false);
    expect(isAttemptRecord({ ...valid, firstResponseMs: 900, timeToCorrectMs: 100 })).toBe(false);
    expect(isAttemptRecord({ ...valid, createdAt: 'hier' })).toBe(false);
    expect(isAttemptRecord({ ...valid, schema: 99 })).toBe(false);
    expect(isAttemptRecord(null)).toBe(false);
  });
});

describe('IndexedDbHistoryStore', () => {
  it('conserve les données après fermeture et réouverture (rechargement de page)', async () => {
    const name = freshDbName();
    const first = openStore(name);
    const session = createSessionRecord('s1', CONTEXT, new Date('2026-10-28T10:00:00Z'));
    await first.putSession(session);
    await first.putAttempt(createAttemptRecord('a1', session, attempt(64, [64]), new Date('2026-10-28T10:00:02Z')));
    await first.putAttempt(createAttemptRecord('a2', session, attempt(67, [65, 67]), new Date('2026-10-28T10:00:04Z')));
    first.close();

    const reloaded = await openStore(name).load();
    expect(reloaded.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(reloaded.attempts.map((a) => [a.id, a.expected, a.played])).toEqual([
      ['a1', 64, [64]],
      ['a2', 67, [65, 67]],
    ]);
    expect(reloaded.skipped).toBe(0);
  });

  it('trie les tentatives par date et remplace un enregistrement de même identifiant', async () => {
    const store = openStore(freshDbName());
    const session = createSessionRecord('s1', CONTEXT, new Date('2026-10-28T10:00:00Z'));
    await store.putAttempt(createAttemptRecord('late', session, attempt(64, [64]), new Date('2026-10-28T12:00:00Z')));
    await store.putAttempt(createAttemptRecord('early', session, attempt(65, [65]), new Date('2026-10-28T11:00:00Z')));
    await store.putSession(session);
    await store.putSession({ ...session, attemptCount: 2 });
    const loaded = await store.load();
    expect(loaded.attempts.map((a) => a.id)).toEqual(['early', 'late']);
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0].attemptCount).toBe(2);
  });

  it('efface tout', async () => {
    const store = openStore(freshDbName());
    const session = createSessionRecord('s1', CONTEXT, new Date());
    await store.putSession(session);
    await store.putAttempt(createAttemptRecord('a1', session, attempt(64, [64]), new Date()));
    await store.clear();
    expect(await store.load()).toEqual({ attempts: [], sessions: [], skipped: 0 });
  });
});

describe('HistoryService', () => {
  it('enregistre une séance complète et la retrouve après rechargement', async () => {
    const name = freshDbName();
    const service = new HistoryService(openStore(name), sequentialIds(), steppingClock());
    await service.load();
    const session = service.startSession(CONTEXT);
    service.recordAttempt(session.id, attempt(64, [64], 600, 600));
    service.recordAttempt(session.id, attempt(67, [65, 67], 700, 1500));
    await service.flush();

    const reloaded = new HistoryService(openStore(name));
    await reloaded.load();
    const snapshot = reloaded.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.attempts.map((a) => [a.expected, a.firstTryCorrect, a.timeToCorrectMs])).toEqual([
      [64, true, 600],
      [67, false, 1500],
    ]);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]).toMatchObject({ attemptCount: 2, lastActivityAt: snapshot.attempts[1].createdAt });
  });

  it('ne perd pas les tentatives enregistrées avant la fin du chargement', async () => {
    const store = new MemoryHistoryStore();
    const old = createSessionRecord('old', CONTEXT, new Date('2026-10-01T10:00:00Z'));
    await store.putSession(old);
    await store.putAttempt(createAttemptRecord('old-a', old, attempt(64, [64]), new Date('2026-10-01T10:00:01Z')));

    const service = new HistoryService(store, sequentialIds(), steppingClock());
    const loading = service.load();
    const session = service.startSession(CONTEXT);
    service.recordAttempt(session.id, attempt(65, [65]));
    await loading;

    expect(service.getSnapshot().attempts.map((a) => a.id)).toEqual(['old-a', 'id-2']);
    expect(service.getSnapshot().sessions.map((s) => s.id)).toEqual(['old', 'id-1']);
  });

  it('continue en mémoire et signale l’erreur si l’écriture échoue', async () => {
    const failing: HistoryStore = {
      load: (): Promise<StoredHistory> => Promise.resolve({ attempts: [], sessions: [], skipped: 0 }),
      putSession: () => Promise.reject(new Error('quota dépassé')),
      putAttempt: () => Promise.reject(new Error('quota dépassé')),
      clear: () => Promise.resolve(),
    };
    const service = new HistoryService(failing);
    await service.load();
    const session = service.startSession(CONTEXT);
    service.recordAttempt(session.id, attempt(64, [64]));
    await service.flush();
    expect(service.getSnapshot().attempts).toHaveLength(1);
    expect(service.getSnapshot().error).toMatch(/quota dépassé/);
  });

  it('fonctionne sans stockage, en le signalant', async () => {
    const service = new HistoryService(null);
    await service.load();
    const session = service.startSession(CONTEXT);
    service.recordAttempt(session.id, attempt(64, [64]));
    expect(service.getSnapshot()).toMatchObject({ status: 'unavailable' });
    expect(service.getSnapshot().attempts).toHaveLength(1);
  });

  it('signale les enregistrements illisibles sans bloquer le chargement', async () => {
    const store = new MemoryHistoryStore();
    const session = createSessionRecord('s1', CONTEXT, new Date());
    await store.putSession(session);
    await store.putAttempt({ ...createAttemptRecord('bad', session, attempt(64, [64]), new Date()), expected: -5 });
    const service = new HistoryService(store);
    await service.load();
    expect(service.getSnapshot().attempts).toHaveLength(0);
    expect(service.getSnapshot().error).toMatch(/1 enregistrement/);
  });

  it('ignore une tentative dont la séance a été effacée', async () => {
    const service = new HistoryService(new MemoryHistoryStore());
    await service.load();
    const session = service.startSession(CONTEXT);
    await service.clear();
    expect(service.recordAttempt(session.id, attempt(64, [64]))).toBeNull();
    expect(service.getSnapshot().attempts).toHaveLength(0);
  });
});
