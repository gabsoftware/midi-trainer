import { useState, type FormEvent } from 'react';
import { useBackupImport } from '../hooks/useBackupImport';
import { historyService } from '../hooks/useHistory';
import { useI18n } from '../i18n/context';
import { BackupMessageView } from './BackupMessageView';
import { deletePreferences } from '../storage/preferences';
import { MAX_PROFILE_NAME_LENGTH } from '../storage/records';

interface WelcomeNameProps {
  readonly profileId: string;
  /** Nom saisi ou question reportée : on passe à l'entraînement. */
  readonly onDone: () => void;
}

/**
 * Premier lancement : demande le prénom de l'élève (sans nom pour l'instant),
 * ou propose de restaurer une sauvegarde.
 */
export function WelcomeName({ profileId, onDone }: WelcomeNameProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');

  // Après un import, l'élève vide créé automatiquement au premier lancement ne sert plus.
  const backupImport = useBackupImport(async () => {
    const { profiles, attempts, profileId: currentId } = historyService.getSnapshot();
    const placeholder = profiles.find((profile) => profile.id === profileId);
    if (placeholder?.name === '' && currentId === profileId && attempts.length === 0 && profiles.length > 1) {
      deletePreferences(profileId);
      await historyService.deleteProfile(profileId);
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    historyService.renameProfile(profileId, name);
    onDone();
  };

  return (
    <main className="profile-picker">
      <h2>{t.welcomeTitle}</h2>
      <form className="welcome" onSubmit={submit}>
        <label htmlFor="welcome-name">{t.welcomeQuestion}</label>
        <div className="profile-row">
          <input
            id="welcome-name"
            autoFocus
            placeholder={t.studentNamePlaceholder}
            maxLength={MAX_PROFILE_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="primary" disabled={!name.trim()}>
            {t.continue}
          </button>
        </div>
        <p className="hint">{t.welcomeHint}</p>
      </form>
      <section className="backup">
        <p className="hint">{t.welcomeHasBackup}</p>
        <div className="profile-row">
          <button type="button" onClick={backupImport.open}>
            {t.importBackup}
          </button>
          {backupImport.input}
        </div>
        <BackupMessageView message={backupImport.message} />
      </section>
      <button type="button" className="subtle back" onClick={onDone}>
        {t.later}
      </button>
    </main>
  );
}
