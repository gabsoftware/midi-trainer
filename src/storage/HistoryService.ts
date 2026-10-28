import type { NoteAttempt } from '../exercises/singleNote';
import type { HistoryStore } from './historyStore';
import {
  createAttemptRecord,
  createSessionRecord,
  type AttemptRecord,
  type ExerciseContext,
  type SessionRecord,
} from './records';

export type HistoryStatus = 'loading' | 'ready' | 'unavailable';

export interface HistorySnapshot {
  readonly status: HistoryStatus;
  readonly attempts: readonly AttemptRecord[];
  readonly sessions: readonly SessionRecord[];
  /** Dernier problème de lecture ou d'écriture, affiché discrètement. */
  readonly error: string | null;
}

const INITIAL_SNAPSHOT: HistorySnapshot = { status: 'loading', attempts: [], sessions: [], error: null };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeById<T extends { id: string }>(stored: readonly T[], local: readonly T[]): T[] {
  const storedIds = new Set(stored.map((item) => item.id));
  return [...stored, ...local.filter((item) => !storedIds.has(item.id))];
}

/**
 * Historique des séances et des tentatives.
 *
 * - Les données sont disponibles immédiatement en mémoire ; la persistance est
 *   asynchrone, dans l'ordre des appels (file d'écriture).
 * - Une tentative enregistrée avant la fin du chargement initial n'est pas perdue.
 * - Si le stockage échoue ou est indisponible, l'application continue en mémoire
 *   et l'erreur est exposée dans l'instantané.
 */
export class HistoryService {
  private snapshot: HistorySnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly store: HistoryStore | null;
  private readonly newId: () => string;
  private readonly clock: () => Date;

  constructor(store: HistoryStore | null, newId: () => string = () => crypto.randomUUID(), clock = () => new Date()) {
    this.store = store;
    this.newId = newId;
    this.clock = clock;
  }

  getSnapshot = (): HistorySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  load(): Promise<void> {
    this.loadPromise ??= this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    if (!this.store) {
      this.update({ status: 'unavailable', error: 'Stockage local indisponible : l’historique ne sera pas conservé.' });
      return;
    }
    try {
      const stored = await this.store.load();
      this.update({
        status: 'ready',
        attempts: mergeById(stored.attempts, this.snapshot.attempts),
        sessions: mergeById(stored.sessions, this.snapshot.sessions),
        error: stored.skipped > 0 ? `${stored.skipped} enregistrement(s) illisible(s) ignoré(s).` : this.snapshot.error,
      });
    } catch (error) {
      this.update({ status: 'unavailable', error: `Historique illisible : ${describe(error)}` });
    }
  }

  startSession(context: ExerciseContext): SessionRecord {
    const session = createSessionRecord(this.newId(), context, this.clock());
    this.update({ sessions: [...this.snapshot.sessions, session] });
    this.persist((store) => store.putSession(session));
    return session;
  }

  /** Enregistre une note réussie. Retourne `null` si la séance est inconnue (historique effacé entre-temps). */
  recordAttempt(sessionId: string, attempt: NoteAttempt): AttemptRecord | null {
    const session = this.snapshot.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return null;
    }
    const now = this.clock();
    const record = createAttemptRecord(this.newId(), session, attempt, now);
    const updatedSession: SessionRecord = {
      ...session,
      attemptCount: session.attemptCount + 1,
      lastActivityAt: now.toISOString(),
    };
    this.update({
      attempts: [...this.snapshot.attempts, record],
      sessions: this.snapshot.sessions.map((item) => (item.id === sessionId ? updatedSession : item)),
    });
    this.persist(async (store) => {
      await store.putAttempt(record);
      await store.putSession(updatedSession);
    });
    return record;
  }

  clear(): Promise<void> {
    this.update({ attempts: [], sessions: [], error: null });
    this.persist((store) => store.clear());
    return this.flush();
  }

  /** Attend la fin des écritures en cours. */
  flush(): Promise<void> {
    return this.writeQueue;
  }

  private persist(write: (store: HistoryStore) => Promise<void>): void {
    const store = this.store;
    if (!store) return;
    this.writeQueue = this.writeQueue
      .then(() => write(store))
      .catch((error: unknown) => this.update({ error: `L’historique n’a pas pu être enregistré : ${describe(error)}` }));
  }

  private update(patch: Partial<HistorySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
