import { useState, type FormEvent } from 'react';
import { useBackupImport } from '../hooks/useBackupImport';
import { historyService } from '../hooks/useHistory';
import { useI18n } from '../i18n/context';
import { BackupMessageView } from './BackupMessageView';
import { backupFileName } from '../storage/backup';
import { deletePreferences } from '../storage/preferences';
import { MAX_PROFILE_NAME_LENGTH, type ProfileRecord } from '../storage/records';
import { downloadJson } from './download';
import { profileName } from './profileName';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ProfilePickerProps {
  readonly profiles: readonly ProfileRecord[];
  readonly currentId: string | null;
  /** Élève choisi : on quitte l'écran. */
  readonly onChoose: (profileId: string) => void;
  /** Retour sans changer d'élève ; absent au lancement. */
  readonly onCancel?: () => void;
}

type Editing = { readonly mode: 'rename'; readonly id: string; readonly name: string } | { readonly mode: 'delete'; readonly id: string };

/**
 * Écran « Qui joue ? » : choisir, créer, renommer, supprimer, sauvegarder et restaurer
 * les élèves. Utilisable entièrement au clavier.
 */
export function ProfilePicker({ profiles, currentId, onChoose, onCancel }: ProfilePickerProps) {
  const { t } = useI18n();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const backupImport = useBackupImport();
  const setMessage = backupImport.setMessage;

  const exportBackup = async (profile: ProfileRecord | null) => {
    try {
      const backup = await historyService.exportBackup(profile ? [profile.id] : undefined);
      const name = profile ? profileName(profile, profiles, t) : null;
      downloadJson(backupFileName(name, new Date()), backup);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: 'error', text: t.exportFailed(describe(error)) });
    }
  };

  const addStudent = (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const profile = historyService.createProfile(newName);
    setNewName('');
    onChoose(profile.id);
  };

  const saveRename = (event: FormEvent) => {
    event.preventDefault();
    if (editing?.mode !== 'rename') return;
    historyService.renameProfile(editing.id, editing.name);
    setEditing(null);
  };

  const confirmDelete = (profileId: string) => {
    deletePreferences(profileId);
    void historyService.deleteProfile(profileId);
    setEditing(null);
  };

  return (
    <main className="profile-picker">
      <h2>{t.whoIsPlaying}</h2>
      <ul>
        {profiles.map((profile) => {
          const name = profileName(profile, profiles, t);
          if (editing?.mode === 'rename' && editing.id === profile.id) {
            return (
              <li key={profile.id}>
                <form className="profile-row" onSubmit={saveRename}>
                  <input
                    autoFocus
                    aria-label={t.rename}
                    maxLength={MAX_PROFILE_NAME_LENGTH}
                    value={editing.name}
                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                    onKeyDown={(event) => event.key === 'Escape' && setEditing(null)}
                  />
                  <button type="submit" className="primary">
                    {t.save}
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    {t.cancel}
                  </button>
                </form>
              </li>
            );
          }
          if (editing?.mode === 'delete' && editing.id === profile.id) {
            return (
              <li key={profile.id} className="profile-row confirm">
                <span>{t.deleteStudentConfirm(name)}</span>
                <button type="button" className="danger" onClick={() => confirmDelete(profile.id)}>
                  {t.delete}
                </button>
                <button type="button" autoFocus onClick={() => setEditing(null)}>
                  {t.cancel}
                </button>
              </li>
            );
          }
          return (
            <li key={profile.id} className="profile-row">
              <button
                type="button"
                className={profile.id === currentId ? 'profile-choice current' : 'profile-choice'}
                autoFocus={editing === null && profile.id === currentId}
                onClick={() => onChoose(profile.id)}
              >
                {name}
              </button>
              <button type="button" className="subtle" onClick={() => setEditing({ mode: 'rename', id: profile.id, name: profile.name })}>
                {t.rename}
              </button>
              <button type="button" className="subtle" onClick={() => void exportBackup(profile)}>
                {t.exportStudent}
              </button>
              <button type="button" className="subtle" onClick={() => setEditing({ mode: 'delete', id: profile.id })}>
                {t.delete}
              </button>
            </li>
          );
        })}
      </ul>

      <form className="profile-row new-profile" onSubmit={addStudent}>
        <input
          aria-label={t.newStudent}
          placeholder={t.studentNamePlaceholder}
          maxLength={MAX_PROFILE_NAME_LENGTH}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" disabled={!newName.trim()}>
          {t.add}
        </button>
      </form>

      <section className="backup">
        <h3>{t.backupTitle}</h3>
        <p className="hint">{t.backupHint}</p>
        <div className="profile-row">
          <button type="button" onClick={() => void exportBackup(null)}>
            {t.exportAll}
          </button>
          <button type="button" onClick={backupImport.open}>
            {t.importBackup}
          </button>
          {backupImport.input}
        </div>
        <BackupMessageView message={backupImport.message} />
      </section>

      {onCancel && (
        <button type="button" className="subtle back" onClick={onCancel}>
          {t.back}
        </button>
      )}
    </main>
  );
}
