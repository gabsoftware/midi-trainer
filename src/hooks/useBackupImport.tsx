import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { useI18n } from '../i18n/context';
import { MAX_BACKUP_BYTES, parseBackup } from '../storage/backup';
import { historyService } from './useHistory';

export interface BackupMessage {
  readonly tone: 'ok' | 'error';
  readonly text: string;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Import d'une sauvegarde : `open()` ouvre le sélecteur de fichier, `input` est l'élément
 * (invisible) à placer dans la page, `message` le résultat à afficher.
 * `onImported` est appelé après un import réussi.
 */
export function useBackupImport(onImported?: () => Promise<void> | void): {
  readonly open: () => void;
  readonly input: ReactElement;
  readonly message: BackupMessage | null;
  readonly setMessage: (message: BackupMessage | null) => void;
} {
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<BackupMessage | null>(null);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de réimporter le même fichier
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage({ tone: 'error', text: t.importError['too-large'] });
      return;
    }
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        setMessage({ tone: 'error', text: t.importError[parsed.error] });
        return;
      }
      await historyService.importBackup(parsed.students);
      const notes = parsed.students.reduce((sum, student) => sum + student.attempts.length, 0);
      const done = t.importDone(parsed.students.length, notes);
      setMessage({ tone: 'ok', text: parsed.skipped > 0 ? `${done} ${t.historySkipped(parsed.skipped)}` : done });
      await onImported?.();
    } catch (error) {
      setMessage({ tone: 'error', text: t.importFailed(describe(error)) });
    }
  };

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(event) => void importFile(event)}
    />
  );

  return { open: () => fileInput.current?.click(), input, message, setMessage };
}

