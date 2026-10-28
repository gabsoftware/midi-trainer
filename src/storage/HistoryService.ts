import type { NoteAttempt } from '../exercises/singleNote';
import { createBackup, type Backup, type StudentData } from './backup';
import type { HistoryStore } from './historyStore';
import {
  createAttemptRecord,
  createProfileRecord,
  createSessionRecord,
  normalizeProfileName,
  type AttemptRecord,
  type ExamResult,
  type ExerciseContext,
  type ProfileRecord,
  type SessionRecord,
} from './records';

export type HistoryStatus = 'loading' | 'ready' | 'unavailable';

export interface HistorySnapshot {
  readonly status: HistoryStatus;
  /** Élèves, par date de création. */
  readonly profiles: readonly ProfileRecord[];
  /** Élève courant ; `null` tant que les élèves ne sont pas chargés. */
  readonly profileId: string | null;
  /** Historique de l'élève courant. */
  readonly attempts: readonly AttemptRecord[];
  readonly sessions: readonly SessionRecord[];
  /** Dernier problème de lecture ou d'écriture, affiché discrètement. */
  readonly error: HistoryError | null;
}

/**
 * Erreur d'historique sous forme de code ; le texte est produit par l'interface.
 * `detail` est le message technique d'origine (souvent en anglais, fourni par le navigateur).
 */
export type HistoryError =
  | { readonly code: 'no-storage' }
  | { readonly code: 'load-failed'; readonly detail: string }
  | { readonly code: 'write-failed'; readonly detail: string }
  | { readonly code: 'skipped-records'; readonly count: number };

const INITIAL_SNAPSHOT: HistorySnapshot = {
  status: 'loading',
  profiles: [],
  profileId: null,
  attempts: [],
  sessions: [],
  error: null,
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeById<T extends { id: string }>(stored: readonly T[], local: readonly T[]): T[] {
  const storedIds = new Set(stored.map((item) => item.id));
  return [...stored, ...local.filter((item) => !storedIds.has(item.id))];
}

/**
 * Élèves et historique de l'élève courant.
 *
 * - Les données sont disponibles immédiatement en mémoire ; la persistance est
 *   asynchrone, dans l'ordre des appels (file d'écriture unique).
 * - Une tentative enregistrée avant la fin d'un chargement n'est pas perdue.
 * - Changer d'élève recharge son historique ; un chargement devenu obsolète
 *   (changement rapide d'élève) est ignoré.
 * - Il existe toujours au moins un élève : s'il n'y en a aucun, un élève sans nom est créé.
 * - Si le stockage échoue ou est indisponible, l'application continue en mémoire
 *   et l'erreur est exposée dans l'instantané.
 */
export class HistoryService {
  private snapshot: HistorySnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;
  private loadGeneration = 0;
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

  /**
   * Charge les élèves puis l'historique de `preferredProfileId` (ou du premier élève).
   * Une seule fois : les appels suivants réutilisent la même promesse.
   */
  load(preferredProfileId?: string | null): Promise<void> {
    this.initPromise ??= this.doLoad(preferredProfileId ?? null);
    return this.initPromise;
  }

  private async doLoad(preferredProfileId: string | null): Promise<void> {
    if (!this.store) {
      const profile = createProfileRecord(this.newId(), '', this.clock());
      this.update({ status: 'unavailable', profiles: [profile], profileId: profile.id, error: { code: 'no-storage' } });
      return;
    }
    let profiles: ProfileRecord[];
    try {
      profiles = await this.store.loadProfiles();
    } catch (error) {
      const profile = createProfileRecord(this.newId(), '', this.clock());
      this.update({
        status: 'unavailable',
        profiles: [profile],
        profileId: profile.id,
        error: { code: 'load-failed', detail: describe(error) },
      });
      return;
    }
    if (profiles.length === 0) {
      const profile = createProfileRecord(this.newId(), '', this.clock());
      profiles = [profile];
      this.persist((store) => store.putProfile(profile));
    }
    const current = profiles.find((profile) => profile.id === preferredProfileId) ?? profiles[0];
    this.update({ profiles });
    await this.selectProfile(current.id);
  }

  /** Change d'élève et charge son historique. */
  async selectProfile(profileId: string): Promise<void> {
    if (!this.snapshot.profiles.some((profile) => profile.id === profileId)) return;
    const generation = ++this.loadGeneration;
    this.update({ status: 'loading', profileId, attempts: [], sessions: [], error: null });
    if (!this.store) {
      this.update({ status: 'unavailable', error: { code: 'no-storage' } });
      return;
    }
    try {
      // Les écritures en attente (séance de l'élève précédent…) passent avant la lecture.
      await this.writeQueue;
      const stored = await this.store.load(profileId);
      if (generation !== this.loadGeneration) return; // un autre élève a été choisi entre-temps
      this.update({
        status: 'ready',
        attempts: mergeById(stored.attempts, this.snapshot.attempts),
        sessions: mergeById(stored.sessions, this.snapshot.sessions),
        error: stored.skipped > 0 ? { code: 'skipped-records', count: stored.skipped } : this.snapshot.error,
      });
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.update({ status: 'unavailable', error: { code: 'load-failed', detail: describe(error) } });
    }
  }

  createProfile(name: string): ProfileRecord {
    const profile = createProfileRecord(this.newId(), name, this.clock());
    this.update({ profiles: [...this.snapshot.profiles, profile] });
    this.persist((store) => store.putProfile(profile));
    return profile;
  }

  renameProfile(profileId: string, name: string): void {
    const profile = this.snapshot.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const renamed = { ...profile, name: normalizeProfileName(name) };
    this.update({ profiles: this.snapshot.profiles.map((item) => (item.id === profileId ? renamed : item)) });
    this.persist((store) => store.putProfile(renamed));
  }

  /** Supprime un élève et son historique. Si c'était l'élève courant, on passe à un autre. */
  async deleteProfile(profileId: string): Promise<void> {
    let profiles = this.snapshot.profiles.filter((profile) => profile.id !== profileId);
    if (profiles.length === this.snapshot.profiles.length) return;
    if (profiles.length === 0) {
      const replacement = createProfileRecord(this.newId(), '', this.clock());
      profiles = [replacement];
      this.persist((store) => store.putProfile(replacement));
    }
    this.update({ profiles });
    this.persist((store) => store.deleteProfile(profileId));
    if (this.snapshot.profileId === profileId) {
      await this.selectProfile(profiles[0].id);
    }
    await this.flush();
  }

  startSession(context: ExerciseContext): SessionRecord {
    const profileId = this.snapshot.profileId;
    if (!profileId) {
      throw new Error('No student selected.');
    }
    const session = createSessionRecord(this.newId(), profileId, context, this.clock());
    this.update({ sessions: [...this.snapshot.sessions, session] });
    this.persist((store) => store.putSession(session));
    return session;
  }

  /**
   * Enregistre une note réussie. Retourne `null` si la séance n'appartient pas
   * à l'élève courant (historique effacé ou élève changé entre-temps).
   */
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

  /**
   * Sauvegarde de la progression des élèves demandés (tous par défaut).
   * Attend la fin des écritures en cours, pour que la sauvegarde soit complète.
   */
  async exportBackup(profileIds?: readonly string[]): Promise<Backup> {
    await this.flush();
    const wanted = this.snapshot.profiles.filter((profile) => !profileIds || profileIds.includes(profile.id));
    const students: StudentData[] = [];
    for (const profile of wanted) {
      if (this.store) {
        const { sessions, attempts } = await this.store.load(profile.id);
        students.push({ profile, sessions, attempts });
      } else if (profile.id === this.snapshot.profileId) {
        // Sans stockage, seul l'élève courant a des données (en mémoire).
        students.push({ profile, sessions: this.snapshot.sessions, attempts: this.snapshot.attempts });
      } else {
        students.push({ profile, sessions: [], attempts: [] });
      }
    }
    return createBackup(students, this.clock());
  }

  /**
   * Importe une sauvegarde déjà validée (voir `parseBackup`), par fusion : rien n'est
   * supprimé et réimporter le même fichier ne crée pas de doublon. Recharge ensuite la liste
   * des élèves et l'historique de l'élève courant.
   */
  async importBackup(students: readonly StudentData[]): Promise<void> {
    const store = this.store;
    if (!store) {
      throw new Error('Local storage unavailable.');
    }
    await this.flush();
    for (const student of students) {
      await store.importStudent(student);
    }
    const profiles = await store.loadProfiles();
    this.update({ profiles });
    const current = this.snapshot.profileId;
    await this.selectProfile(current && profiles.some((p) => p.id === current) ? current : profiles[0].id);
  }

  /** Enregistre le résultat d'un examen terminé sur sa séance. */
  completeExam(sessionId: string, result: ExamResult): void {
    const session = this.snapshot.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const completed: SessionRecord = { ...session, exam: result };
    this.update({ sessions: this.snapshot.sessions.map((item) => (item.id === sessionId ? completed : item)) });
    this.persist((store) => store.putSession(completed));
  }

  /** Efface l'historique de l'élève courant. */
  clear(): Promise<void> {
    const profileId = this.snapshot.profileId;
    if (!profileId) return Promise.resolve();
    this.update({ attempts: [], sessions: [], error: null });
    this.persist((store) => store.clear(profileId));
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
      .catch((error: unknown) => this.update({ error: { code: 'write-failed', detail: describe(error) } }));
  }

  private update(patch: Partial<HistorySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
