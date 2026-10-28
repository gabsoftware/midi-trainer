import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteAttempt } from '../exercises/singleNote';
import { HistoryService } from './HistoryService';
import { IndexedDbHistoryStore, MemoryHistoryStore, type HistoryStore, type StoredHistory } from './historyStore';
import {
  createAttemptRecord,
  createProfileRecord,
  createSessionRecord,
  isAttemptRecord,
  normalizeProfileName,
  type ExerciseContext,
} from './records';

const CONTEXT: ExerciseContext = { levelId: 'level-3', mode: 'single', clef: 'treble' };

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
  it('copie l’élève et le contexte de la séance dans chaque tentative', () => {
    const session = createSessionRecord('s1', 'p1', CONTEXT, new Date('2026-10-28T10:00:00Z'));
    const record = createAttemptRecord('a1', session, attempt(64, [65, 64], 400, 900), new Date('2026-10-28T10:00:05Z'));
    expect(record).toMatchObject({
      profileId: 'p1',
      sessionId: 's1',
      levelId: 'level-3',
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
    const session = createSessionRecord('s1', 'p1', CONTEXT, new Date());
    const valid = createAttemptRecord('a1', session, attempt(64, [64]), new Date());
    expect(isAttemptRecord({ ...valid, expected: 200 })).toBe(false);
    expect(isAttemptRecord({ ...valid, errorCount: 3 })).toBe(false);
    expect(isAttemptRecord({ ...valid, firstResponseMs: 900, timeToCorrectMs: 100 })).toBe(false);
    expect(isAttemptRecord({ ...valid, createdAt: 'hier' })).toBe(false);
    expect(isAttemptRecord({ ...valid, profileId: '' })).toBe(false);
    expect(isAttemptRecord({ ...valid, schema: 99 })).toBe(false);
    expect(isAttemptRecord(null)).toBe(false);
  });

  it('normalise les noms d’élèves', () => {
    expect(normalizeProfileName('  Alice   Martin ')).toBe('Alice Martin');
    expect(normalizeProfileName('x'.repeat(100))).toHaveLength(40);
  });
});

describe('IndexedDbHistoryStore', () => {
  it('conserve les données après fermeture et réouverture (rechargement de page)', async () => {
    const name = freshDbName();
    const first = openStore(name);
    await first.putProfile(createProfileRecord('p1', 'Alice', new Date('2026-10-28T09:00:00Z')));
    const session = createSessionRecord('s1', 'p1', CONTEXT, new Date('2026-10-28T10:00:00Z'));
    await first.putSession(session);
    await first.putAttempt(createAttemptRecord('a1', session, attempt(64, [64]), new Date('2026-10-28T10:00:02Z')));
    await first.putAttempt(createAttemptRecord('a2', session, attempt(67, [65, 67]), new Date('2026-10-28T10:00:04Z')));
    first.close();

    const reopened = openStore(name);
    expect((await reopened.loadProfiles()).map((p) => p.name)).toEqual(['Alice']);
    const history = await reopened.load('p1');
    expect(history.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(history.attempts.map((a) => [a.id, a.expected, a.played])).toEqual([
      ['a1', 64, [64]],
      ['a2', 67, [65, 67]],
    ]);
  });

  it('sépare l’historique de chaque élève', async () => {
    const store = openStore(freshDbName());
    const alice = createSessionRecord('s-alice', 'alice', CONTEXT, new Date());
    const bob = createSessionRecord('s-bob', 'bob', CONTEXT, new Date());
    await store.putSession(alice);
    await store.putSession(bob);
    await store.putAttempt(createAttemptRecord('a-alice', alice, attempt(64, [64]), new Date()));
    await store.putAttempt(createAttemptRecord('a-bob', bob, attempt(65, [65]), new Date()));
    expect((await store.load('alice')).attempts.map((a) => a.id)).toEqual(['a-alice']);
    expect((await store.load('bob')).attempts.map((a) => a.id)).toEqual(['a-bob']);
  });

  it('supprime un élève avec tout son historique, sans toucher aux autres', async () => {
    const store = openStore(freshDbName());
    await store.putProfile(createProfileRecord('alice', 'Alice', new Date('2026-10-01T00:00:00Z')));
    await store.putProfile(createProfileRecord('bob', 'Bob', new Date('2026-10-02T00:00:00Z')));
    for (const profileId of ['alice', 'bob']) {
      const session = createSessionRecord(`s-${profileId}`, profileId, CONTEXT, new Date());
      await store.putSession(session);
      await store.putAttempt(createAttemptRecord(`a-${profileId}`, session, attempt(64, [64]), new Date()));
    }
    await store.deleteProfile('alice');
    expect((await store.loadProfiles()).map((p) => p.id)).toEqual(['bob']);
    expect(await store.load('alice')).toEqual({ attempts: [], sessions: [], skipped: 0 });
    expect((await store.load('bob')).attempts).toHaveLength(1);
  });

  it('efface l’historique d’un élève sans supprimer l’élève', async () => {
    const store = openStore(freshDbName());
    await store.putProfile(createProfileRecord('p1', 'Alice', new Date()));
    const session = createSessionRecord('s1', 'p1', CONTEXT, new Date());
    await store.putSession(session);
    await store.putAttempt(createAttemptRecord('a1', session, attempt(64, [64]), new Date()));
    await store.clear('p1');
    expect(await store.load('p1')).toEqual({ attempts: [], sessions: [], skipped: 0 });
    expect(await store.loadProfiles()).toHaveLength(1);
  });

  it('repart d’une base vide si elle a été créée par une version antérieure', async () => {
    const name = freshDbName();
    // Base au format de la version 1 (sans élèves), avec des données.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('attempts', { keyPath: 'id' }).put({ id: 'old', schema: 1 });
        db.createObjectStore('sessions', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const store = openStore(name);
    expect(await store.loadProfiles()).toEqual([]);
    const session = createSessionRecord('s1', 'p1', CONTEXT, new Date());
    await store.putSession(session);
    await store.putAttempt(createAttemptRecord('a1', session, attempt(64, [64]), new Date()));
    expect((await store.load('p1')).attempts.map((a) => a.id)).toEqual(['a1']);
  });
});

describe('HistoryService', () => {
  it('crée un premier élève sans nom au premier lancement', async () => {
    const service = new HistoryService(new MemoryHistoryStore(), sequentialIds());
    await service.load();
    const snapshot = service.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.profiles).toHaveLength(1);
    expect(snapshot.profiles[0].name).toBe('');
    expect(snapshot.profileId).toBe(snapshot.profiles[0].id);
  });

  it('enregistre une séance complète et la retrouve après rechargement', async () => {
    const name = freshDbName();
    const service = new HistoryService(openStore(name), sequentialIds(), steppingClock());
    await service.load();
    const profileId = service.getSnapshot().profileId;
    const session = service.startSession(CONTEXT);
    service.recordAttempt(session.id, attempt(64, [64], 600, 600));
    service.recordAttempt(session.id, attempt(67, [65, 67], 700, 1500));
    await service.flush();

    const reloaded = new HistoryService(openStore(name));
    await reloaded.load(profileId);
    const snapshot = reloaded.getSnapshot();
    expect(snapshot.profileId).toBe(profileId);
    expect(snapshot.attempts.map((a) => [a.expected, a.firstTryCorrect, a.timeToCorrectMs])).toEqual([
      [64, true, 600],
      [67, false, 1500],
    ]);
    expect(snapshot.sessions[0]).toMatchObject({ attemptCount: 2, lastActivityAt: snapshot.attempts[1].createdAt });
  });

  it('retrouve la progression de chaque élève', async () => {
    const service = new HistoryService(new MemoryHistoryStore(), sequentialIds(), steppingClock());
    await service.load();
    const alice = service.getSnapshot().profileId!;
    service.renameProfile(alice, 'Alice');
    service.recordAttempt(service.startSession(CONTEXT).id, attempt(64, [64]));

    const bob = service.createProfile('Bob');
    await service.selectProfile(bob.id);
    expect(service.getSnapshot().attempts).toHaveLength(0);
    service.recordAttempt(service.startSession(CONTEXT).id, attempt(65, [65]));
    service.recordAttempt(service.getSnapshot().sessions[0].id, attempt(67, [67]));

    await service.selectProfile(alice);
    expect(service.getSnapshot().attempts.map((a) => a.expected)).toEqual([64]);
    await service.selectProfile(bob.id);
    expect(service.getSnapshot().attempts.map((a) => a.expected)).toEqual([65, 67]);
    expect(service.getSnapshot().profiles.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  });

  it('ignore un chargement devenu obsolète après un changement rapide d’élève', async () => {
    const store = new MemoryHistoryStore();
    const service = new HistoryService(store, sequentialIds(), steppingClock());
    await service.load();
    const alice = service.getSnapshot().profileId!;
    service.recordAttempt(service.startSession(CONTEXT).id, attempt(64, [64]));
    const bob = service.createProfile('Bob');

    const toAlice = service.selectProfile(alice);
    const toBob = service.selectProfile(bob.id);
    await Promise.all([toAlice, toBob]);
    expect(service.getSnapshot().profileId).toBe(bob.id);
    expect(service.getSnapshot().attempts).toHaveLength(0);
  });

  it('supprime l’élève courant et passe au suivant ; recrée un élève s’il n’en reste aucun', async () => {
    const service = new HistoryService(new MemoryHistoryStore(), sequentialIds(), steppingClock());
    await service.load();
    const first = service.getSnapshot().profileId!;
    const second = service.createProfile('Bob');
    await service.deleteProfile(first);
    expect(service.getSnapshot().profileId).toBe(second.id);

    await service.deleteProfile(second.id);
    const { profiles, profileId } = service.getSnapshot();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).not.toBe(second.id);
    expect(profileId).toBe(profiles[0].id);
  });

  it('ne perd pas les tentatives enregistrées pendant le chargement', async () => {
    const store = new MemoryHistoryStore();
    await store.putProfile(createProfileRecord('p1', 'Alice', new Date('2026-10-01T00:00:00Z')));
    const old = createSessionRecord('old', 'p1', CONTEXT, new Date('2026-10-01T10:00:00Z'));
    await store.putSession(old);
    await store.putAttempt(createAttemptRecord('old-a', old, attempt(64, [64]), new Date('2026-10-01T10:00:01Z')));

    const service = new HistoryService(store, sequentialIds(), steppingClock());
    await service.load('p1');
    const loading = service.selectProfile('p1');
    service.recordAttempt(service.startSession(CONTEXT).id, attempt(65, [65]));
    await loading;
    expect(service.getSnapshot().attempts.map((a) => a.id)).toEqual(['old-a', 'id-2']);
  });

  it('continue en mémoire et signale l’erreur si l’écriture échoue', async () => {
    const failing: HistoryStore = {
      loadProfiles: () => Promise.resolve([createProfileRecord('p1', 'Alice', new Date())]),
      putProfile: () => Promise.reject(new Error('quota dépassé')),
      deleteProfile: () => Promise.resolve(),
      load: (): Promise<StoredHistory> => Promise.resolve({ attempts: [], sessions: [], skipped: 0 }),
      putSession: () => Promise.reject(new Error('quota dépassé')),
      putAttempt: () => Promise.reject(new Error('quota dépassé')),
      clear: () => Promise.resolve(),
    };
    const service = new HistoryService(failing);
    await service.load();
    service.recordAttempt(service.startSession(CONTEXT).id, attempt(64, [64]));
    await service.flush();
    expect(service.getSnapshot().attempts).toHaveLength(1);
    expect(service.getSnapshot().error).toEqual({ code: 'write-failed', detail: 'quota dépassé' });
  });

  it('fonctionne sans stockage, en le signalant', async () => {
    const service = new HistoryService(null);
    await service.load();
    service.recordAttempt(service.startSession(CONTEXT).id, attempt(64, [64]));
    expect(service.getSnapshot()).toMatchObject({ status: 'unavailable', error: { code: 'no-storage' } });
    expect(service.getSnapshot().attempts).toHaveLength(1);
  });

  it('signale les enregistrements illisibles sans bloquer le chargement', async () => {
    const store = new MemoryHistoryStore();
    await store.putProfile(createProfileRecord('p1', 'Alice', new Date()));
    const session = createSessionRecord('s1', 'p1', CONTEXT, new Date());
    await store.putSession(session);
    await store.putAttempt({ ...createAttemptRecord('bad', session, attempt(64, [64]), new Date()), expected: -5 });
    const service = new HistoryService(store);
    await service.load();
    expect(service.getSnapshot().attempts).toHaveLength(0);
    expect(service.getSnapshot().error).toEqual({ code: 'skipped-records', count: 1 });
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
