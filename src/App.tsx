import { lazy, Suspense, useEffect, useState } from 'react';
import { AboutView, AppFooter } from './components/AboutView';
import { HomeView } from './components/HomeView';
import { SettingsView } from './components/SettingsView';
import { MidiStatus } from './components/MidiStatus';
import { ProfilePicker } from './components/ProfilePicker';
import { StatsView } from './components/StatsView';
import { profileName } from './components/profileName';
import { WelcomeName } from './components/WelcomeName';
import { historyService, useHistory } from './hooks/useHistory';
import { useMidi } from './hooks/useMidi';
import { useI18n } from './i18n/context';
import { isLocale, LOCALES } from './i18n/locale';
import { linkProps, usePage, type Page } from './router';
import { loadPreferences, savePreferences, type Preferences } from './storage/preferences';

/**
 * L'entraînement embarque le moteur de partition et sa police musicale (l'essentiel du poids) :
 * il est chargé à part, pour que l'accueil s'affiche vite.
 */
const loadTrainer = () => import('./components/Trainer');
const Trainer = lazy(() => loadTrainer().then((module) => ({ default: module.Trainer })));

const LOCALE_NAMES = { fr: 'Français', en: 'English' } as const;

/** Pages qui travaillent avec l'élève courant : son prénom est demandé au premier lancement. */
const STUDENT_PAGES: readonly Page[] = ['practice', 'stats', 'settings'];

export default function App() {
  const midi = useMidi();
  const history = useHistory();
  const { t, locale, setLocale } = useI18n();
  const [page, navigate] = usePage();
  /** Prénom demandé puis reporté (« Plus tard ») : on ne le redemande pas pendant la visite. */
  const [nameSkipped, setNameSkipped] = useState(false);
  /** Réglages par élève, lus une fois puis gardés en mémoire. */
  const [preferencesByProfile, setPreferencesByProfile] = useState<Readonly<Record<string, Preferences>>>({});

  // Une fois la page affichée, l'entraînement se charge en arrière-plan : il sera prêt au clic.
  useEffect(() => {
    const timer = setTimeout(() => void loadTrainer(), 1500);
    return () => clearTimeout(timer);
  }, []);

  const { profiles, profileId } = history;
  const currentProfile = profiles.find((profile) => profile.id === profileId) ?? null;
  const preferences = currentProfile
    ? (preferencesByProfile[currentProfile.id] ?? loadPreferences(currentProfile.id))
    : null;
  const studentName = currentProfile ? profileName(currentProfile, profiles, t) : '';
  /** Premier lancement : un seul élève, sans nom. */
  const firstVisit = profiles.length === 1 && currentProfile?.name === '';

  const updatePreferences = (patch: Partial<Preferences>) => {
    if (!currentProfile || !preferences) return;
    const updated = { ...preferences, ...patch };
    savePreferences(currentProfile.id, updated);
    setPreferencesByProfile((current) => ({ ...current, [currentProfile.id]: updated }));
  };

  const chooseProfile = (id: string) => {
    void historyService.selectProfile(id);
    navigate('practice');
  };

  let content;
  if (page === 'about') {
    content = <AboutView onBack={() => navigate('home')} />;
  } else if (!currentProfile || !preferences) {
    content = <p className="loading">{t.loading}</p>;
  } else if (page === 'home') {
    content = (
      <HomeView studentName={firstVisit ? null : studentName} preferences={preferences} onNavigate={navigate} />
    );
  } else if (page === 'students') {
    content = (
      <ProfilePicker profiles={profiles} currentId={profileId} onChoose={chooseProfile} onCancel={() => navigate('home')} />
    );
  } else if (firstVisit && !nameSkipped && STUDENT_PAGES.includes(page)) {
    content = <WelcomeName profileId={currentProfile.id} onDone={() => setNameSkipped(true)} />;
  } else if (page === 'stats') {
    content = <StatsView studentName={studentName} />;
  } else if (page === 'settings') {
    content = <SettingsView studentName={studentName} preferences={preferences} onChange={updatePreferences} />;
  } else {
    // `key` : changer d'élève repart d'un écran d'entraînement neuf.
    content = (
      <Suspense fallback={<p className="loading">{t.loading}</p>}>
        <Trainer key={currentProfile.id} midi={midi} preferences={preferences} onPreferencesChange={updatePreferences} />
      </Suspense>
    );
  }
  const showNav = currentProfile !== null && !firstVisit;
  const navLink = (target: Page, label: string) => (
    <a {...linkProps(target)} className={page === target ? 'current' : undefined} aria-current={page === target ? 'page' : undefined}>
      {label}
    </a>
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <a {...linkProps('home')} className="brand" title={t.homeLink}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
            {t.appTitle}
          </a>
        </h1>
        {showNav && (
          <nav className="main-nav">
            {navLink('practice', t.navTraining)}
            {navLink('stats', t.navStats)}
          </nav>
        )}
        <div className="header-tools">
          {currentProfile && showNav && (
            <div className="student-tools">
              <button type="button" className="student-button" title={t.switchStudent} onClick={() => navigate('students')}>
                <span className="student-label">{t.student}</span> <strong>{studentName}</strong>
              </button>
              <button
                type="button"
                className={page === 'settings' ? 'icon-button current' : 'icon-button'}
                aria-label={t.settingsButton(studentName)}
                aria-current={page === 'settings' ? 'page' : undefined}
                title={t.settingsButton(studentName)}
                onClick={() => navigate(page === 'settings' ? 'practice' : 'settings')}
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
      {content}
      <AppFooter />
    </div>
  );
}
