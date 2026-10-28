import {
  isAttemptRecord,
  isProfileRecord,
  isSessionRecord,
  type AttemptRecord,
  type ProfileRecord,
  type SessionRecord,
} from './records';
import { RECORD_UPGRADES, upgradeRecord, type RecordUpgrade } from './upgrades';

/**
 * Sauvegarde de la progression dans un fichier JSON : seule protection contre
 * l'effacement des données du navigateur, et moyen de changer d'ordinateur.
 *
 * L'enveloppe (`format`, `version`) est versionnée séparément des enregistrements,
 * qui portent chacun leur `schema` et sont mis à niveau à l'import.
 */
export const BACKUP_FORMAT = 'midi-trainer-backup';
export const BACKUP_VERSION = 1;
/** Au-delà, le fichier n'est pas lu (protection contre un mauvais fichier). */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export interface StudentData {
  readonly profile: ProfileRecord;
  readonly sessions: readonly SessionRecord[];
  readonly attempts: readonly AttemptRecord[];
}

export interface Backup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  readonly exportedAt: string;
  readonly students: readonly StudentData[];
}

export function createBackup(students: readonly StudentData[], now: Date): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), students };
}

export type BackupError = 'too-large' | 'not-json' | 'not-backup' | 'newer-version' | 'empty';

export type ParsedBackup =
  | { readonly ok: true; readonly students: readonly StudentData[]; readonly skipped: number }
  | { readonly ok: false; readonly error: BackupError };

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Lit et valide une sauvegarde. Les enregistrements d'anciens schémas sont mis à niveau ;
 * les enregistrements invalides, ou rattachés à un autre élève, sont ignorés et comptés.
 */
export function parseBackup(text: string, upgrades: readonly RecordUpgrade[] = RECORD_UPGRADES): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-large' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'not-backup' };
  const envelope = data as Record<string, unknown>;
  if (envelope.format !== BACKUP_FORMAT || typeof envelope.version !== 'number') {
    return { ok: false, error: 'not-backup' };
  }
  if (envelope.version > BACKUP_VERSION) return { ok: false, error: 'newer-version' };

  let skipped = 0;
  const byProfile = new Map<string, StudentData>();
  for (const entry of asArray(envelope.students)) {
    const raw = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const profile = upgradeRecord('profile', raw.profile, upgrades);
    const rawSessions = asArray(raw.sessions);
    const rawAttempts = asArray(raw.attempts);
    if (!isProfileRecord(profile)) {
      skipped += 1 + rawSessions.length + rawAttempts.length;
      continue;
    }
    const belongs = (record: { profileId: string }) => record.profileId === profile.id;
    const sessions = rawSessions
      .map((value) => upgradeRecord('session', value, upgrades))
      .filter((value): value is SessionRecord => isSessionRecord(value) && belongs(value));
    const attempts = rawAttempts
      .map((value) => upgradeRecord('attempt', value, upgrades))
      .filter((value): value is AttemptRecord => isAttemptRecord(value) && belongs(value));
    skipped += rawSessions.length - sessions.length + rawAttempts.length - attempts.length;

    // Un même élève présent deux fois dans le fichier : on réunit ses données.
    const previous = byProfile.get(profile.id);
    byProfile.set(profile.id, {
      profile,
      sessions: [...(previous?.sessions ?? []), ...sessions],
      attempts: [...(previous?.attempts ?? []), ...attempts],
    });
  }
  if (byProfile.size === 0) return { ok: false, error: 'empty' };
  return { ok: true, students: [...byProfile.values()], skipped };
}

/** Nom de fichier : « midi-trainer-alice-2026-10-28.json » ou « midi-trainer-2026-10-28.json ». */
export function backupFileName(studentName: string | null, now: Date): string {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const slug = (studentName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `midi-trainer-${slug}-${date}.json` : `midi-trainer-${date}.json`;
}
