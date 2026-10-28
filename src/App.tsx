import { useState } from 'react';
import { MidiStatus } from './components/MidiStatus';
import { ProfilePicker } from './components/ProfilePicker';
import { profileName } from './components/profileName';
import { Trainer } from './components/Trainer';
import { WelcomeName } from './components/WelcomeName';
import { historyService, useHistory } from './hooks/useHistory';
import { useMidi } from './hooks/useMidi';
import { useI18n } from './i18n/context';
import { isLocale, LOCALES } from './i18n/locale';

const LOCALE_NAMES = { fr: 'Français', en: 'English' } as const;

/**
 * `auto` : au lancement, l'écran « Qui joue ? » s'affiche s'il y a plusieurs élèves,
 * et le prénom est demandé si l'unique élève n'a pas encore de nom.
 */
type PickerState = 'auto' | 'open' | 'closed';

export default function App() {
  const midi = useMidi();
  const history = useHistory();
  const { t, locale, setLocale } = useI18n();
  const [picker, setPicker] = useState<PickerState>('auto');

  const { profiles, profileId } = history;
  const currentProfile = profiles.find((profile) => profile.id === profileId) ?? null;
  const showPicker = picker === 'open' || (picker === 'auto' && profiles.length > 1);
  const showWelcome = picker === 'auto' && profiles.length === 1 && currentProfile?.name === '';

  const chooseProfile = (id: string) => {
    void historyService.selectProfile(id);
    setPicker('closed');
  };

  let content;
  if (!currentProfile) {
    content = <p className="loading">{t.loading}</p>;
  } else if (showWelcome) {
    content = <WelcomeName profileId={currentProfile.id} onDone={() => setPicker('closed')} />;
  } else if (showPicker) {
    content = (
      <ProfilePicker
        profiles={profiles}
        currentId={profileId}
        onChoose={chooseProfile}
        onCancel={picker === 'open' ? () => setPicker('closed') : undefined}
      />
    );
  } else {
    // `key` : changer d'élève repart d'un écran d'entraînement neuf, avec ses réglages.
    content = <Trainer key={currentProfile.id} profileId={currentProfile.id} midi={midi} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.appTitle}</h1>
        <div className="header-tools">
          {currentProfile && !showPicker && !showWelcome && (
            <button type="button" className="student-button" title={t.switchStudent} onClick={() => setPicker('open')}>
              <span className="student-label">{t.student}</span> <strong>{profileName(currentProfile, profiles, t)}</strong>
            </button>
          )}
          <MidiStatus midi={midi} />
          <select
            aria-label={t.language}
            value={locale}
            onChange={(event) => {
              if (isLocale(event.target.value)) setLocale(event.target.value);
              event.target.blur(); // rend la main aux raccourcis clavier
            }}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_NAMES[code]}
              </option>
            ))}
          </select>
        </div>
      </header>
      {content}
    </div>
  );
}
