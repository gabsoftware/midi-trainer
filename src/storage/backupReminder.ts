/**
 * Rappel de sauvegarde : la progression n'existe que dans ce navigateur. Après quelques séances
 * sans sauvegarde, l'accueil propose d'en faire une ; « Plus tard » repousse le rappel d'autant.
 */
const STORAGE_KEY = 'midi-trainer:backup-reminder';

/** Séances terminées depuis la dernière sauvegarde (ou le dernier « Plus tard ») avant de rappeler. */
export const REMIND_AFTER_SESSIONS = 10;

interface ReminderState {
  /** Dernière sauvegarde ou dernier report (ms depuis l'époque Unix). */
  readonly since: number;
}

function readState(): ReminderState | null {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as ReminderState | null;
    return typeof state?.since === 'number' ? state : null;
  } catch {
    return null;
  }
}

/** Vrai si `REMIND_AFTER_SESSIONS` séances ont commencé après `since` (`null` : jamais sauvegardé). */
export function shouldRemindBackup(sessionStarts: readonly string[], since: number | null): boolean {
  const recent = since === null ? sessionStarts : sessionStarts.filter((start) => Date.parse(start) > since);
  return recent.length >= REMIND_AFTER_SESSIONS;
}

export function backupReminderDue(sessionStarts: readonly string[]): boolean {
  return shouldRemindBackup(sessionStarts, readState()?.since ?? null);
}

/** Sauvegarde faite, ou rappel reporté : on recompte à partir de maintenant. */
export function resetBackupReminder(now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ since: now } satisfies ReminderState));
  } catch {
    // Stockage indisponible (navigation privée…) : le rappel reviendra, sans autre conséquence.
  }
}
