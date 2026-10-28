import { isAttemptRecord, isSessionRecord, type AttemptRecord, type SessionRecord } from './records';

export interface StoredHistory {
  /** Tentatives triées par date croissante. */
  readonly attempts: readonly AttemptRecord[];
  /** Séances triées par date de début croissante. */
  readonly sessions: readonly SessionRecord[];
  /** Nombre d'enregistrements illisibles ignorés au chargement. */
  readonly skipped: number;
}

/** Persistance brute de l'historique, indépendante de React. */
export interface HistoryStore {
  load(): Promise<StoredHistory>;
  putSession(session: SessionRecord): Promise<void>;
  putAttempt(attempt: AttemptRecord): Promise<void>;
  clear(): Promise<void>;
}

function sortHistory(attempts: unknown[], sessions: unknown[]): StoredHistory {
  const validAttempts = attempts.filter(isAttemptRecord);
  const validSessions = sessions.filter(isSessionRecord);
  return {
    attempts: validAttempts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    sessions: validSessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    skipped: attempts.length - validAttempts.length + sessions.length - validSessions.length,
  };
}

// --- IndexedDB ---

const DB_NAME = 'midi-trainer';
const DB_VERSION = 1;
const ATTEMPTS = 'attempts';
const SESSIONS = 'sessions';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction IndexedDB annulée.'));
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTEMPTS)) {
        const attempts = db.createObjectStore(ATTEMPTS, { keyPath: 'id' });
        attempts.createIndex('bySession', 'sessionId');
        attempts.createIndex('byCreatedAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Une autre fenêtre ouvre une version plus récente : on libère la base.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet.'));
  });
}

export class IndexedDbHistoryStore implements HistoryStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;
  private readonly name: string;

  constructor(factory: IDBFactory, name = DB_NAME) {
    this.factory = factory;
    this.name = name;
  }

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= openDatabase(this.factory, this.name).catch((error: unknown) => {
      this.dbPromise = null; // nouvel essai au prochain appel
      throw error;
    });
    return this.dbPromise;
  }

  async load(): Promise<StoredHistory> {
    const db = await this.db();
    const transaction = db.transaction([ATTEMPTS, SESSIONS], 'readonly');
    const [attempts, sessions] = await Promise.all([
      promisify<unknown[]>(transaction.objectStore(ATTEMPTS).getAll()),
      promisify<unknown[]>(transaction.objectStore(SESSIONS).getAll()),
    ]);
    return sortHistory(attempts, sessions);
  }

  putSession(session: SessionRecord): Promise<void> {
    return this.write(SESSIONS, (store) => store.put(session));
  }

  putAttempt(attempt: AttemptRecord): Promise<void> {
    return this.write(ATTEMPTS, (store) => store.put(attempt));
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction([ATTEMPTS, SESSIONS], 'readwrite');
    transaction.objectStore(ATTEMPTS).clear();
    transaction.objectStore(SESSIONS).clear();
    await transactionDone(transaction);
  }

  close(): void {
    void this.dbPromise?.then((db) => db.close());
    this.dbPromise = null;
  }

  private async write(storeName: string, operation: (store: IDBObjectStore) => void): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction(storeName, 'readwrite');
    operation(transaction.objectStore(storeName));
    // On attend la validation de la transaction : la donnée est alors durable.
    await transactionDone(transaction);
  }
}

// --- Mémoire (tests, ou repli si IndexedDB est indisponible) ---

export class MemoryHistoryStore implements HistoryStore {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  load(): Promise<StoredHistory> {
    return Promise.resolve(sortHistory([...this.attempts.values()], [...this.sessions.values()]));
  }

  putSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  putAttempt(attempt: AttemptRecord): Promise<void> {
    this.attempts.set(attempt.id, attempt);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.attempts.clear();
    this.sessions.clear();
    return Promise.resolve();
  }
}
