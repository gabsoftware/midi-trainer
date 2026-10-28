import { MidiStatus } from './components/MidiStatus';
import { Trainer } from './components/Trainer';
import { useMidi } from './hooks/useMidi';
import { useI18n } from './i18n/context';
import { isLocale, LOCALES } from './i18n/locale';

const LOCALE_NAMES = { fr: 'Français', en: 'English' } as const;

export default function App() {
  const midi = useMidi();
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.appTitle}</h1>
        <div className="header-tools">
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
      <Trainer midi={midi} />
    </div>
  );
}
