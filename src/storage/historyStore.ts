import {
  isAttemptRecord,
  isProfileRecord,
  isSessionRecord,
  type AttemptRecord,
  type ProfileRecord,
  type SessionRecord,
} from './records';
import type { StudentData } from './backup';
import { upgradeRecord } from './upgrades';

export interface StoredHistory {
  /** Tentatives triées par date croissante. */
  readonly attempts: readonly AttemptRecord[];
  /** Séances triées par date de début croissante. */
  readonly sessions: readonly SessionRecord[];
  /** Nombre d'enregistrements illisibles ignorés au chargement. */
  readonly skipped: number;
}

/** Persistance brute des élèves et de leur historique, indépendante de React. */
export interface HistoryStore {
  /** Élèves triés par date de création croissante. */
  loadProfiles(): Promise<ProfileRecord[]>;
  putProfile(profile: ProfileRecord): Promise<void>;
  /** Supprime l'élève et tout son historique, en une seule transaction. */
  deleteProfile(profileId: string): Promise<void>;
  load(profileId: string): Promise<StoredHistory>;
  putSession(session: SessionRecord): Promise<void>;
  putAttempt(attempt: AttemptRecord): Promise<void>;
  /** Efface l'historique d'un élève, sans supprimer l'élève. */
  clear(profileId: string): Promise<void>;
  /**
   * Fusionne les données d'un élève (import de sauvegarde), en une seule transaction.
   * Ne supprime rien : un élève déjà présent garde son nom ; une séance déjà présente
   * n'est remplacée que par une version plus récente ; les tentatives, immuables,
   * sont ajoutées si elles manquent. Réimporter le même fichier ne change donc rien.
   */
  importStudent(data: StudentData): Promise<void>;
}

/** Une séance remplace celle de même identifiant seulement si elle est plus récente. */
export function shouldReplaceSession(existing: SessionRecord | undefined, incoming: SessionRecord): boolean {
  return !existing || incoming.lastActivityAt > existing.lastActivityAt;
}

/** Met à niveau les enregistrements d'anciens schémas, puis écarte ceux qui sont invalides. */
function sortHistory(attempts: unknown[], sessions: unknown[]): StoredHistory {
  const validAttempts = attempts.map((value) => upgradeRecord('attempt', value)).filter(isAttemptRecord);
  const validSessions = sessions.map((value) => upgradeRecord('session', value)).filter(isSessionRecord);
  return {
    attempts: validAttempts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    sessions: validSessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    skipped: attempts.length - validAttempts.length + sessions.length - validSessions.length,
  };
}

function sortProfiles(profiles: unknown[]): ProfileRecord[] {
  return profiles
    .map((value) => upgradeRecord('profile', value))
    .filter(isProfileRecord)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// --- IndexedDB ---

const DB_NAME = 'midi-trainer';
const ATTEMPTS = 'attempts';
const SESSIONS = 'sessions';
const PROFILES = 'profiles';
const BY_PROFILE = 'byProfile';

/**
 * Structure de la base à la première publication (version `BASELINE_DB_VERSION`).
 * Une base plus ancienne vient du développement : elle est recréée vide.
 */
export const BASELINE_DB_VERSION = 2;

function createBaseline(db: IDBDatabase): void {
  for (const storeName of Array.from(db.objectStoreNames)) {
    db.deleteObjectStore(storeName);
  }
  db.createObjectStore(PROFILES, { keyPath: 'id' });
  const attempts = db.createObjectStore(ATTEMPTS, { keyPath: 'id' });
  attempts.createIndex(BY_PROFILE, 'profileId');
  attempts.createIndex('bySession', 'sessionId');
  db.createObjectStore(SESSIONS, { keyPath: 'id' }).createIndex(BY_PROFILE, 'profileId');
}

/**
 * Migration de structure : passe la base de la version `index + BASELINE_DB_VERSION`
 * à la suivante, dans la transaction de mise à niveau. Si elle échoue, la transaction
 * est annulée et la base reste intacte dans son ancienne version.
 */
export type DbMigration = (db: IDBDatabase, transaction: IDBTransaction) => void;

/**
 * Migrations de structure (magasins, index), dans l'ordre. Pour un changement de
 * format des enregistrements eux-mêmes, voir `RECORD_UPGRADES` (upgrades.ts).
 */
export const DB_MIGRATIONS: readonly DbMigration[] = [];

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
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function openDatabase(factory: IDBFactory, name: string, migrations: readonly DbMigration[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, BASELINE_DB_VERSION + migrations.length);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction!;
      if (event.oldVersion < BASELINE_DB_VERSION) {
        createBaseline(db);
      }
      for (let version = Math.max(event.oldVersion, BASELINE_DB_VERSION); version < db.version; version++) {
        migrations[version - BASELINE_DB_VERSION](db, transaction);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Une autre fenêtre ouvre une version plus récente : on libère la base.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database blocked by another tab.'));
  });
}

/** Supprime, dans une transaction ouverte, les enregistrements d'un élève. */
function deleteByProfile(transaction: IDBTransaction, storeName: string, profileId: string): void {
  const request = transaction.objectStore(storeName).index(BY_PROFILE).openCursor(IDBKeyRange.only(profileId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
}

export class IndexedDbHistoryStore implements HistoryStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;
  private readonly name: string;

  private readonly migrations: readonly DbMigration[];

  constructor(factory: IDBFactory, name = DB_NAME, migrations: readonly DbMigration[] = DB_MIGRATIONS) {
    this.factory = factory;
    this.name = name;
    this.migrations = migrations;
  }

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= openDatabase(this.factory, this.name, this.migrations).catch((error: unknown) => {
      this.dbPromise = null; // nouvel essai au prochain appel
      throw error;
    });
    return this.dbPromise;
  }

  async loadProfiles(): Promise<ProfileRecord[]> {
    const db = await this.db();
    const profiles = await promisify<unknown[]>(db.transaction(PROFILES, 'readonly').objectStore(PROFILES).getAll());
    return sortProfiles(profiles);
  }

  putProfile(profile: ProfileRecord): Promise<void> {
    return this.write([PROFILES], (transaction) => transaction.objectStore(PROFILES).put(profile));
  }

  deleteProfile(profileId: string): Promise<void> {
    return this.write([PROFILES, ATTEMPTS, SESSIONS], (transaction) => {
      transaction.objectStore(PROFILES).delete(profileId);
      deleteByProfile(transaction, ATTEMPTS, profileId);
      deleteByProfile(transaction, SESSIONS, profileId);
    });
  }

  async load(profileId: string): Promise<StoredHistory> {
    const db = await this.db();
    const transaction = db.transaction([ATTEMPTS, SESSIONS], 'readonly');
    const range = IDBKeyRange.only(profileId);
    const [attempts, sessions] = await Promise.all([
      promisify<unknown[]>(transaction.objectStore(ATTEMPTS).index(BY_PROFILE).getAll(range)),
      promisify<unknown[]>(transaction.objectStore(SESSIONS).index(BY_PROFILE).getAll(range)),
    ]);
    return sortHistory(attempts, sessions);
  }

  putSession(session: SessionRecord): Promise<void> {
    return this.write([SESSIONS], (transaction) => transaction.objectStore(SESSIONS).put(session));
  }

  putAttempt(attempt: AttemptRecord): Promise<void> {
    return this.write([ATTEMPTS], (transaction) => transaction.objectStore(ATTEMPTS).put(attempt));
  }

  clear(profileId: string): Promise<void> {
    return this.write([ATTEMPTS, SESSIONS], (transaction) => {
      deleteByProfile(transaction, ATTEMPTS, profileId);
      deleteByProfile(transaction, SESSIONS, profileId);
    });
  }

  importStudent({ profile, sessions, attempts }: StudentData): Promise<void> {
    return this.write([PROFILES, SESSIONS, ATTEMPTS], (transaction) => {
      const profiles = transaction.objectStore(PROFILES);
      const profileRequest = profiles.get(profile.id);
      profileRequest.onsuccess = () => {
        if (profileRequest.result === undefined) profiles.put(profile);
      };
      const sessionStore = transaction.objectStore(SESSIONS);
      for (const session of sessions) {
        const request = sessionStore.get(session.id);
        request.onsuccess = () => {
          if (shouldReplaceSession(request.result as SessionRecord | undefined, session)) sessionStore.put(session);
        };
      }
      const attemptStore = transaction.objectStore(ATTEMPTS);
      for (const attempt of attempts) {
        attemptStore.put(attempt);
      }
    });
  }

  close(): void {
    void this.dbPromise?.then((db) => db.close());
    this.dbPromise = null;
  }

  private async write(storeNames: string[], operation: (transaction: IDBTransaction) => void): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction(storeNames, 'readwrite');
    operation(transaction);
    // On attend la validation de la transaction : la donnée est alors durable.
    await transactionDone(transaction);
  }
}

// --- Mémoire (tests, ou repli si IndexedDB est indisponible) ---

export class MemoryHistoryStore implements HistoryStore {
  private readonly profiles = new Map<string, ProfileRecord>();
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  loadProfiles(): Promise<ProfileRecord[]> {
    return Promise.resolve(sortProfiles([...this.profiles.values()]));
  }

  putProfile(profile: ProfileRecord): Promise<void> {
    this.profiles.set(profile.id, profile);
    return Promise.resolve();
  }

  async deleteProfile(profileId: string): Promise<void> {
    this.profiles.delete(profileId);
    await this.clear(profileId);
  }

  load(profileId: string): Promise<StoredHistory> {
    const mine = <T extends { profileId: string }>(records: Map<string, T>) =>
      [...records.values()].filter((record) => record.profileId === profileId);
    return Promise.resolve(sortHistory(mine(this.attempts), mine(this.sessions)));
  }

  putSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  putAttempt(attempt: AttemptRecord): Promise<void> {
    this.attempts.set(attempt.id, attempt);
    return Promise.resolve();
  }

  importStudent({ profile, sessions, attempts }: StudentData): Promise<void> {
    if (!this.profiles.has(profile.id)) this.profiles.set(profile.id, profile);
    for (const session of sessions) {
      if (shouldReplaceSession(this.sessions.get(session.id), session)) this.sessions.set(session.id, session);
    }
    for (const attempt of attempts) this.attempts.set(attempt.id, attempt);
    return Promise.resolve();
  }

  clear(profileId: string): Promise<void> {
    for (const records of [this.attempts, this.sessions] as Map<string, { profileId: string }>[]) {
      for (const [id, record] of records) {
        if (record.profileId === profileId) records.delete(id);
      }
    }
    return Promise.resolve();
  }
}
