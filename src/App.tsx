import { useState } from 'react';
import { SettingsView } from './components/SettingsView';
import { MidiStatus } from './components/MidiStatus';
import { ProfilePicker } from './components/ProfilePicker';
import { StatsView } from './components/StatsView';
import { profileName } from './components/profileName';
import { Trainer } from './components/Trainer';
import { WelcomeName } from './components/WelcomeName';
import { historyService, useHistory } from './hooks/useHistory';
import { useMidi } from './hooks/useMidi';
import { useI18n } from './i18n/context';
import { isLocale, LOCALES } from './i18n/locale';
import { loadPreferences, savePreferences, type Preferences } from './storage/preferences';

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
  const [view, setView] = useState<'training' | 'stats' | 'settings'>('training');
  /** Réglages par élève, lus une fois puis gardés en mémoire. */
  const [preferencesByProfile, setPreferencesByProfile] = useState<Readonly<Record<string, Preferences>>>({});

  const { profiles, profileId } = history;
  const currentProfile = profiles.find((profile) => profile.id === profileId) ?? null;
  const preferences = currentProfile
    ? (preferencesByProfile[currentProfile.id] ?? loadPreferences(currentProfile.id))
    : null;

  const updatePreferences = (patch: Partial<Preferences>) => {
    if (!currentProfile || !preferences) return;
    const updated = { ...preferences, ...patch };
    savePreferences(currentProfile.id, updated);
    setPreferencesByProfile((current) => ({ ...current, [currentProfile.id]: updated }));
  };
  const showPicker = picker === 'open' || (picker === 'auto' && profiles.length > 1);
  const showWelcome = picker === 'auto' && profiles.length === 1 && currentProfile?.name === '';

  const chooseProfile = (id: string) => {
    void historyService.selectProfile(id);
    setPicker('closed');
  };

  let content;
  if (!currentProfile || !preferences) {
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
  } else if (view === 'stats') {
    content = <StatsView studentName={profileName(currentProfile, profiles, t)} />;
  } else if (view === 'settings') {
    content = (
      <SettingsView
        studentName={profileName(currentProfile, profiles, t)}
        preferences={preferences}
        onChange={updatePreferences}
      />
    );
  } else {
    // `key` : changer d'élève repart d'un écran d'entraînement neuf.
    content = (
      <Trainer key={currentProfile.id} midi={midi} preferences={preferences} onPreferencesChange={updatePreferences} />
    );
  }
  const showNav = currentProfile !== null && !showPicker && !showWelcome;

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.appTitle}</h1>
        {showNav && (
          <nav className="main-nav">
            <button
              type="button"
              className={view === 'training' ? 'current' : ''}
              aria-current={view === 'training' ? 'page' : undefined}
              onClick={() => setView('training')}
            >
              {t.navTraining}
            </button>
            <button
              type="button"
              className={view === 'stats' ? 'current' : ''}
              aria-current={view === 'stats' ? 'page' : undefined}
              onClick={() => setView('stats')}
            >
              {t.navStats}
            </button>
          </nav>
        )}
        <div className="header-tools">
          {currentProfile && showNav && (
            <div className="student-tools">
              <button type="button" className="student-button" title={t.switchStudent} onClick={() => setPicker('open')}>
                <span className="student-label">{t.student}</span> <strong>{profileName(currentProfile, profiles, t)}</strong>
              </button>
              <button
                type="button"
                className={view === 'settings' ? 'icon-button current' : 'icon-button'}
                aria-label={t.settingsButton(profileName(currentProfile, profiles, t))}
                aria-current={view === 'settings' ? 'page' : undefined}
                title={t.settingsButton(profileName(currentProfile, profiles, t))}
                onClick={() => setView(view === 'settings' ? 'training' : 'settings')}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
                  />
                </svg>
              </button>
            </div>
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
      {(midi.access === 'unsupported' || midi.access === 'denied') && (
        <div className="browser-notice" role="alert">
          <strong>{midi.access === 'unsupported' ? t.browserUnsupportedTitle : t.midiDeniedTitle}</strong>{' '}
          {midi.access === 'unsupported' ? t.browserUnsupportedText : t.midiDeniedText}
        </div>
      )}
      {content}
    </div>
  );
}
