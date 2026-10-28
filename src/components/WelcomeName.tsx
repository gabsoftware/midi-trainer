import { useState, type FormEvent } from 'react';
import { historyService } from '../hooks/useHistory';
import { useI18n } from '../i18n/context';
import { MAX_PROFILE_NAME_LENGTH } from '../storage/records';

interface WelcomeNameProps {
  readonly profileId: string;
  /** Nom saisi ou question reportée : on passe à l'entraînement. */
  readonly onDone: () => void;
}

/** Premier lancement : demande le prénom de l'élève (sans nom pour l'instant). */
export function WelcomeName({ profileId, onDone }: WelcomeNameProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');

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
      <button type="button" className="subtle back" onClick={onDone}>
        {t.later}
      </button>
    </main>
  );
}
