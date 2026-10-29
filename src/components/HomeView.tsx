import { useEffect, useMemo } from 'react';
import { useHistory } from '../hooks/useHistory';
import { useI18n } from '../i18n/context';
import { findLevel, LEVELS } from '../learning/levels';
import { evaluateLevel, recommendLevel, type LevelStatus } from '../learning/mastery';
import type { Page } from '../router';
import type { Preferences } from '../storage/preferences';
import { HeroArt } from './HeroArt';

interface HomeViewProps {
  /** Nom de l'élève courant ; `null` : premier lancement, élève pas encore nommé. */
  readonly studentName: string | null;
  readonly preferences: Preferences | null;
  readonly onNavigate: (page: Page) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
}

/**
 * Accueil : à quoi sert l'application, l'élève courant et où il en est, le parcours.
 * Entrée lance l'action principale (continuer, ou commencer au premier lancement).
 */
export function HomeView({ studentName, preferences, onNavigate }: HomeViewProps) {
  const { t, text } = useI18n();
  const history = useHistory();

  const progress = useMemo(
    () => new Map(LEVELS.map((level) => [level.id, evaluateLevel(level, history.attempts, history.sessions)])),
    [history.attempts, history.sessions],
  );
  const chosen = findLevel(preferences?.levelId);
  const level = chosen?.available ? chosen : recommendLevel(LEVELS, progress);
  const status: LevelStatus = progress.get(level.id)?.status ?? 'new';
  const playable = LEVELS.filter((item) => item.available);
  const mastered = playable.filter((item) => progress.get(item.id)?.status === 'mastered').length;
  const statusLabel = { mastered: t.statusMastered, ready: t.statusReady, learning: t.statusLearning, new: t.statusNew }[
    status
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      if (event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      onNavigate('practice');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onNavigate]);

  return (
    <main className="home">
      <section className="home-hero">
        <div>
          <h2>{t.homeHeadline}</h2>
          <p>{t.homeIntro}</p>
          <ul className="home-tags">
            {t.homeTags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </div>
        <HeroArt />
      </section>

      <section className="home-student">
        {studentName === null ? (
          <>
            <h3>{t.homeFirstVisitTitle}</h3>
            <p>{t.homeFirstVisit}</p>
            <div className="advice-actions">
              <button type="button" className="primary" onClick={() => onNavigate('practice')}>
                {t.start} <kbd>{t.keyEnter}</kbd>
              </button>
              <button type="button" onClick={() => onNavigate('students')}>
                {t.homeChooseStudent}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="home-eyebrow">{t.student}</p>
            <h3>{studentName}</h3>
            <p>
              {t.levelNumber(level.number)} · {text(level.title)} <span className="badge">{statusLabel}</span>
            </p>
            <p className="hint">{t.homeMastered(mastered, playable.length)}</p>
            <div className="advice-actions">
              <button type="button" className="primary" onClick={() => onNavigate('practice')}>
                {t.homeContinue} <kbd>{t.keyEnter}</kbd>
              </button>
              <button type="button" onClick={() => onNavigate('stats')}>
                {t.navStats}
              </button>
              <button type="button" onClick={() => onNavigate('students')}>
                {t.switchStudent}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="home-how">
        <h3>{t.homeHowTitle}</h3>
        <ol>
          {t.homeSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="home-path">
        <h3>{t.homePathTitle}</h3>
        <p className="hint">{t.homePathIntro}</p>
        <ol>
          {LEVELS.map((item) => (
            <li key={item.id} className={item.available ? '' : 'unavailable'}>
              <strong>{text(item.title)}</strong> — {text(item.description)}
              {!item.available && <span className="badge">{t.statusUnavailable}</span>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
