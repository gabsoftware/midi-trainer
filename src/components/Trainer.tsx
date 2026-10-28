import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pause,
  playNote,
  resumeNote,
  startNote,
  type NoteAttempt,
  type SingleNoteState,
} from '../exercises/singleNote';
import { historyService, useHistory } from '../hooks/useHistory';
import { useKeyLabels } from '../hooks/useKeyLabels';
import { midiManager, useNoteEvents } from '../hooks/useMidi';
import { useI18n } from '../i18n/context';
import type { Messages } from '../i18n/messages';
import { noteWeights, pickWeightedNote } from '../learning/adaptive';
import { findLevel, LEVELS, type LevelDefinition } from '../learning/levels';
import { evaluateLevel, nextLevel, recommendLevel } from '../learning/mastery';
import { OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, WHITE_KEY_CODES } from '../midi/computerKeyboard';
import type { NoteEvent } from '../midi/events';
import type { MidiSnapshot } from '../midi/MidiInputManager';
import type { OctaveMode } from '../music/validation';
import type { HistoryError } from '../storage/HistoryService';
import { summarizeSession } from '../statistics/session';
import {
  ADVANCE_DELAYS_MS,
  loadPreferences,
  savePreferences,
  SESSION_LENGTHS,
  type Preferences,
} from '../storage/preferences';
import { LevelPicker } from './LevelPicker';
import { LiveTimer } from './LiveTimer';
import { PianoKeys } from './PianoKeys';
import { StaffView } from './StaffView';

const WRONG_FLASH_MS = 700;

/** Séance en cours. Le niveau et l'octave sont figés pour toute la séance. */
interface Session {
  /** Séance enregistrée dans l'historique, créée à la première note réussie. */
  readonly id: string | null;
  readonly level: LevelDefinition;
  readonly octaveMode: OctaveMode;
  /** Le niveau était-il déjà maîtrisé au démarrage ? (pour féliciter au bon moment) */
  readonly masteredAtStart: boolean;
  /** Mode assisté (nom des notes affiché), figé pour la séance. */
  readonly assisted: boolean;
  /** Nombre de notes prévu atteint : le bilan s'affiche, plus aucune note n'est jouée. */
  readonly finished: boolean;
  readonly exercise: SingleNoteState;
  readonly attempts: readonly NoteAttempt[];
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Note suivante, choisie selon les performances de l'élève : les notes ratées reviennent plus
 * souvent, les notes reconnues vite moins souvent. L'historique est relu à chaque tirage,
 * donc l'adaptation joue dès la note suivante. Toutes les tentatives de l'élève sur une note
 * comptent, quel que soit le niveau : reconnaître une note est la même compétence partout.
 */
function chooseNote(level: LevelDefinition, previous: number | null): number {
  const weights = noteWeights(level.notes, historyService.getSnapshot().attempts, level.fastResponseMs);
  return pickWeightedNote(level.notes, weights, previous, Math.random);
}

function effectiveOctaveMode(preferences: Preferences, level: LevelDefinition): OctaveMode {
  return preferences.octaveMode === 'level' ? level.defaultOctaveMode : preferences.octaveMode;
}

function historyErrorText(error: HistoryError, t: Messages): string {
  switch (error.code) {
    case 'no-storage':
      return t.historyNoStorage;
    case 'load-failed':
      return t.historyLoadFailed(error.detail);
    case 'write-failed':
      return t.historyWriteFailed(error.detail);
    case 'skipped-records':
      return t.historySkipped(error.count);
  }
}

interface TrainerProps {
  readonly profileId: string;
  readonly midi: MidiSnapshot;
}

export function Trainer({ profileId, midi }: TrainerProps) {
  const { t, locale, text, noteName, seconds, percent } = useI18n();
  const keyLabel = useKeyLabels(locale);
  const history = useHistory();
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences(profileId));
  const [session, setSession] = useState<Session | null>(null);
  // Reflet synchrone de `session` : les événements de note sont traités un par un,
  // et l'enregistrement d'une tentative (effet de bord) ne doit avoir lieu qu'une fois.
  const sessionRef = useRef<Session | null>(null);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set());
  /** Horodatage de la dernière mauvaise réponse dont le signal rouge est terminé. */
  const [flashEndedAt, setFlashEndedAt] = useState<number | null>(null);
  /** Niveau pour lequel l'élève a choisi de rester malgré le conseil d'avancer. */
  const [dismissedAdviceFor, setDismissedAdviceFor] = useState<string | null>(null);

  const progress = useMemo(
    () => new Map(LEVELS.map((level) => [level.id, evaluateLevel(level, history.attempts)])),
    [history.attempts],
  );
  const recommended = recommendLevel(LEVELS, progress);
  const chosen = findLevel(preferences.levelId);
  const selectedLevel = chosen?.available ? chosen : recommended;
  const level = session?.level ?? selectedLevel;
  const exercise = session?.exercise ?? null;
  const attempts = session?.attempts ?? [];

  // Conseil de passage au niveau suivant : jamais automatique, toujours au choix de l'élève.
  const mastered = progress.get(level.id)?.status === 'mastered';
  const next = mastered ? nextLevel(LEVELS, level, progress) : null;
  const justMastered = session !== null && mastered && !session.masteredAtStart;
  const adviceVisible = mastered && dismissedAdviceFor !== level.id && (session === null || justMastered);
  const advanceTarget = adviceVisible ? next : null;

  // Valeurs lues par les callbacks stables (événements clavier, minuteries).
  const latest = useRef({ selectedLevel, progress, preferences, advanceTarget, adviceVisible, level });
  useEffect(() => {
    latest.current = { selectedLevel, progress, preferences, advanceTarget, adviceVisible, level };
  });

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      setPreferences((current) => {
        const updated = { ...current, ...patch };
        savePreferences(profileId, updated);
        return updated;
      });
    },
    [profileId],
  );

  const commitSession = useCallback((nextSession: Session | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const updateExercise = useCallback(
    (update: (exercise: SingleNoteState) => SingleNoteState) => {
      const current = sessionRef.current;
      if (!current || current.finished) return;
      const updated = update(current.exercise);
      if (updated === current.exercise) return;
      if (updated.attempt === null || current.exercise.attempt !== null) {
        commitSession({ ...current, exercise: updated });
        return;
      }
      // Une note vient d'être réussie : on l'enregistre dans l'historique.
      const id =
        current.id ??
        historyService.startSession({
          levelId: current.level.id,
          mode: 'single',
          clef: current.level.clef,
          assisted: current.assisted,
        }).id;
      historyService.recordAttempt(id, updated.attempt);
      const attempts = [...current.attempts, updated.attempt];
      const total = latest.current.preferences.notesPerSession;
      const finished = total > 0 && attempts.length >= total;
      commitSession({ ...current, id, exercise: updated, attempts, finished });
    },
    [commitSession],
  );

  const startLevel = useCallback(
    (target: LevelDefinition) => {
      const { preferences: currentPreferences, progress: currentProgress } = latest.current;
      const octaveMode = effectiveOctaveMode(currentPreferences, target);
      // Le niveau joué devient le niveau choisi : il ne change plus en cours de route.
      updatePreferences({ levelId: target.id });
      setDismissedAdviceFor(null);
      commitSession({
        id: null,
        level: target,
        octaveMode,
        masteredAtStart: currentProgress.get(target.id)?.status === 'mastered',
        assisted: currentPreferences.showNoteNames,
        finished: false,
        exercise: startNote(chooseNote(target, null), octaveMode, performance.now()),
        attempts: [],
      });
    },
    [commitSession, updatePreferences],
  );

  /** Note suivante, après une bonne réponse (automatiquement ou avec Entrée). */
  const advance = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    updateExercise((state) =>
      state.phase === 'answered'
        ? startNote(chooseNote(current.level, state.expected), current.octaveMode, performance.now())
        : state,
    );
  }, [updateExercise]);

  /**
   * Entrée :
   * - niveau conseillé proposé : y passer ;
   * - aucune séance, ou séance terminée : nouvelle séance ;
   * - bonne réponse sans passage automatique : note suivante ;
   * - sinon rien (une séance en cours n'est jamais relancée par erreur).
   */
  const handleEnter = useCallback(() => {
    const { advanceTarget: target, level: current, preferences: currentPreferences } = latest.current;
    const running = sessionRef.current;
    if (target) {
      startLevel(target);
    } else if (!running || running.finished) {
      startLevel(current);
    } else if (running.exercise.phase === 'answered' && !currentPreferences.autoAdvance) {
      advance();
    }
  }, [advance, startLevel]);

  const stayOnLevel = useCallback(() => setDismissedAdviceFor(latest.current.level.id), []);

  const selectLevel = useCallback(
    (levelId: string) => {
      updatePreferences({ levelId });
      commitSession(null);
    },
    [commitSession, updatePreferences],
  );

  const togglePause = useCallback(() => {
    const now = performance.now();
    updateExercise((current) => (current.phase === 'paused' ? resumeNote(current, now) : pause(current, 'user', now)));
  }, [updateExercise]);

  const handleNote = useCallback(
    (event: NoteEvent) => {
      setPressed((current) => {
        const updated = new Set(current);
        if (event.type === 'noteon') updated.add(event.note);
        else updated.delete(event.note);
        return updated;
      });
      if (event.type === 'noteon') {
        updateExercise((current) => playNote(current, event.note, event.timestamp));
      }
    },
    [updateExercise],
  );

  const keyboardBaseNote = useNoteEvents(handleNote, preferences.computerKeyboard);

  // Bref signal rouge sur une mauvaise réponse.
  const lastAnswer = exercise?.lastAnswer ?? null;
  const wrongFlash = lastAnswer !== null && !lastAnswer.correct && flashEndedAt !== lastAnswer.at;
  useEffect(() => {
    if (!lastAnswer || lastAnswer.correct) return;
    const timer = setTimeout(() => setFlashEndedAt(lastAnswer.at), WRONG_FLASH_MS);
    return () => clearTimeout(timer);
  }, [lastAnswer]);

  // Passage automatique à la note suivante après une bonne réponse.
  const phase = exercise?.phase;
  const finished = session?.finished ?? false;
  const { autoAdvance, advanceDelayMs } = preferences;
  useEffect(() => {
    if (phase !== 'answered' || finished || !autoAdvance) return;
    const timer = setTimeout(advance, advanceDelayMs);
    return () => clearTimeout(timer);
  }, [phase, finished, autoAdvance, advanceDelayMs, advance]);

  // Une déconnexion du clavier MIDI choisi met l'exercice en pause.
  useEffect(() => {
    let wasListening = midiManager.getSnapshot().listening;
    return midiManager.subscribe(() => {
      const { listening, selectedId } = midiManager.getSnapshot();
      if (wasListening && !listening) {
        setPressed(new Set());
        if (selectedId) {
          const now = performance.now();
          updateExercise((current) => pause(current, 'midi-disconnected', now));
        }
      }
      wasListening = listening;
    });
  }, [updateExercise]);

  // Onglet masqué : pause, pour ne pas fausser les temps de réponse.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        const now = performance.now();
        updateExercise((current) => pause(current, 'user', now));
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [updateExercise]);

  // Raccourcis : Entrée = démarrer / niveau conseillé, Espace = pause / reprendre, Échap = rester sur ce niveau.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        handleEnter();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
      } else if (event.code === 'Escape' && latest.current.adviceVisible) {
        event.preventDefault();
        stayOnLevel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEnter, togglePause, stayOnLevel]);

  const summary = summarizeSession(attempts);
  const lastAttempt = attempts.at(-1);
  const timed = preferences.timed;
  const assisted = session?.assisted ?? preferences.showNoteNames;
  const waitingForEnter = exercise?.phase === 'answered' && !finished && !autoAdvance;

  let noteColor = '#111';
  if (exercise?.phase === 'answered') noteColor = '#15803d';
  else if (wrongFlash) noteColor = '#dc2626';

  const octaveModeName = (mode: OctaveMode) => (mode === 'any' ? t.octaveAny : t.octaveExact);
  /** Change un réglage figé pour la séance : la séance en cours est abandonnée. */
  const updateSessionSetting = (patch: Partial<Preferences>) => {
    updatePreferences(patch);
    commitSession(null);
  };
  const blur = (event: { target: HTMLElement }) => event.target.blur(); // rend la main aux raccourcis clavier

  return (
    <main className="trainer">
      <aside className="trainer-side">
        <LevelPicker
          levels={LEVELS}
          progress={progress}
          selected={level}
          recommendedId={recommended.id}
          onSelect={selectLevel}
        />

        <section className="options">
          <h3>{t.sessionSettings}</h3>
          <label>
            {t.notesPerSession}{' '}
            <select
              value={preferences.notesPerSession}
              onChange={(event) => {
                updatePreferences({ notesPerSession: Number(event.target.value) });
                blur(event);
              }}
            >
              {SESSION_LENGTHS.map((count) => (
                <option key={count} value={count}>
                  {count === 0 ? t.sessionUnlimited : count}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.trainingMode}{' '}
            <select
              value={timed ? 'timed' : 'training'}
              onChange={(event) => {
                updatePreferences({ timed: event.target.value === 'timed' });
                blur(event);
              }}
            >
              <option value="training">{t.modeTraining}</option>
              <option value="timed">{t.modeTimed}</option>
            </select>
          </label>
          <label>
            {t.octave}{' '}
            <select
              value={preferences.octaveMode}
              onChange={(event) => {
                updateSessionSetting({ octaveMode: event.target.value as Preferences['octaveMode'] });
                blur(event);
              }}
            >
              <option value="level">{t.octaveLevel(octaveModeName(level.defaultOctaveMode))}</option>
              <option value="any">{t.octaveAny}</option>
              <option value="exact">{t.octaveExact}</option>
            </select>
          </label>
          <div className="option-row">
            <label>
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(event) => updatePreferences({ autoAdvance: event.target.checked })}
              />{' '}
              {t.autoAdvance}
            </label>
            {autoAdvance && (
              <label>
                {t.advanceDelay}{' '}
                <select
                  value={advanceDelayMs}
                  onChange={(event) => {
                    updatePreferences({ advanceDelayMs: Number(event.target.value) });
                    blur(event);
                  }}
                >
                  {ADVANCE_DELAYS_MS.map((delay) => (
                    <option key={delay} value={delay}>
                      {seconds(delay).replace(/[.,]?0+ s$/, ' s')}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label>
            <input
              type="checkbox"
              checked={preferences.showNoteNames}
              onChange={(event) => updateSessionSetting({ showNoteNames: event.target.checked })}
            />{' '}
            {t.showNoteNames}
          </label>
          {preferences.showNoteNames && <span className="hint">{t.assistedHint}</span>}
          <label>
            <input
              type="checkbox"
              checked={preferences.computerKeyboard}
              onChange={(event) => updatePreferences({ computerKeyboard: event.target.checked })}
            />{' '}
            {t.computerKeyboard}
          </label>
          {preferences.computerKeyboard && (
            <span className="hint">
              {t.computerKeyboardHint(
                WHITE_KEY_CODES.map(keyLabel).join(' '),
                keyLabel(OCTAVE_DOWN_CODE),
                keyLabel(OCTAVE_UP_CODE),
                keyLabel(WHITE_KEY_CODES[0]),
                noteName(keyboardBaseNote, true),
              )}
            </span>
          )}
        </section>

        <div className="history-summary">
          {history.status === 'loading'
            ? t.historyLoading
            : t.historySummary(history.attempts.length, history.sessions.length)}
          {history.error && <span className="history-error"> · {historyErrorText(history.error, t)}</span>}
        </div>
      </aside>

      <section className="trainer-main">
        <div className="trainer-meta">
          <span>
            {t.levelNumber(level.number)} · {text(level.title)}
            {assisted && <span className="badge">{t.assistedBadge}</span>}
          </span>
          {session && !finished && (
            <span>
              {t.noteProgress(Math.min(attempts.length + 1, preferences.notesPerSession || Infinity), preferences.notesPerSession)}
              {summary.firstTryRate !== null && ` · ${t.sessionFirstTry(percent(summary.firstTryRate))}`}
              {timed && summary.medianMs !== null && ` · ${t.sessionMedian(seconds(summary.medianMs))}`}
            </span>
          )}
        </div>

        {adviceVisible && (
          <div className="advice" role="status">
            <p>
              <strong>{justMastered ? t.levelJustMastered(level.number) : t.levelAlreadyMastered(level.number)}</strong>{' '}
              {next ? t.nextLevelSuggestion(next.number, text(next.title)) : t.allLevelsMastered}
            </p>
            <div className="advice-actions">
              {next && (
                <button type="button" className="primary" onClick={() => startLevel(next)}>
                  {t.goToLevel(next.number)} <kbd>{t.keyEnter}</kbd>
                </button>
              )}
              <button type="button" onClick={stayOnLevel}>
                {t.stayOnLevel} <kbd>{t.keyEscape}</kbd>
              </button>
            </div>
          </div>
        )}

        <div className="staff-card">
          {finished ? (
            <div className="session-summary" role="status">
              <h3>{t.sessionFinished}</h3>
              <p>
                {t.summaryFirstTry(summary.firstTryCorrect, summary.notes, percent(summary.firstTryRate ?? 0))} ·{' '}
                {t.summaryErrors(summary.errors)}
                {timed && summary.medianMs !== null && ` · ${t.summaryMedian(seconds(summary.medianMs))}`}
              </p>
              <p>
                {summary.toReview.length === 0 ? (
                  t.summaryPerfect
                ) : (
                  <>
                    {t.summaryToReview}{' '}
                    {summary.toReview.map(({ note, misses }) => `${noteName(note, true)} (${misses})`).join(', ')}
                  </>
                )}
              </p>
              <button type="button" className={advanceTarget ? '' : 'primary'} onClick={() => startLevel(level)}>
                {t.newSession} {!advanceTarget && <kbd>{t.keyEnter}</kbd>}
              </button>
            </div>
          ) : exercise ? (
            <div className="staff-exercise">
              <StaffView midi={exercise.expected} clef={level.clef} noteColor={noteColor} />
              {assisted && exercise.phase !== 'answered' && (
                <p className="assisted-name">{noteName(exercise.expected)}</p>
              )}
            </div>
          ) : (
            <div className="staff-placeholder">
              <p>{t.startPrompt}</p>
              <button type="button" className={advanceTarget ? '' : 'primary'} onClick={() => startLevel(level)}>
                {t.start}
              </button>
              {!advanceTarget && <p className="hint">{t.orPressEnter}</p>}
            </div>
          )}

          {exercise?.phase === 'paused' && !finished && (
            <div className="pause-overlay" role="status">
              {exercise.pauseReason === 'midi-disconnected' ? (
                <>
                  <strong>{t.midiDisconnectedTitle}</strong>
                  <span>{midi.listening ? t.midiReconnected : t.midiReplug}</span>
                </>
              ) : (
                <>
                  <strong>{t.pausedTitle}</strong>
                  <span>{t.pressSpaceToResume}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="feedback" aria-live="polite">
          {exercise?.phase === 'answered' && lastAttempt && !finished ? (
            <span className="ok">
              {noteName(lastAttempt.expected)}
              {timed && ` · ${seconds(lastAttempt.timeToCorrectMs)}`}
              {!lastAttempt.firstTryCorrect && ` · ${t.errorCount(lastAttempt.errorCount)}`}
            </span>
          ) : wrongFlash && lastAnswer && !finished ? (
            <span className="ko">{t.youPlayed(noteName(lastAnswer.played))}</span>
          ) : timed && exercise && !finished && exercise.phase !== 'answered' ? (
            <LiveTimer stopwatch={exercise.stopwatch} />
          ) : (
            <span>&nbsp;</span>
          )}
        </div>

        {exercise && !finished && (
          <div className="controls">
            {waitingForEnter && (
              <button type="button" className="primary" onClick={advance}>
                {t.nextNote} <kbd>{t.keyEnter}</kbd>
              </button>
            )}
            <button type="button" onClick={togglePause}>
              {exercise.phase === 'paused' ? t.resume : t.pause} <kbd>{t.keySpace}</kbd>
            </button>
            <button type="button" onClick={() => startLevel(level)}>
              {t.restart}
            </button>
          </div>
        )}

        <PianoKeys pressed={pressed} onNote={handleNote} />

        {attempts.length > 0 && (
          <details className="journal">
            <summary>{t.journal}</summary>
            <table>
              <thead>
                <tr>
                  <th>{t.journalNote}</th>
                  <th>{t.journalPlayed}</th>
                  <th>{t.journalFirstResponse}</th>
                  <th>{t.journalCorrect}</th>
                </tr>
              </thead>
              <tbody>
                {attempts
                  .slice(-15)
                  .reverse()
                  .map((a, index) => (
                    <tr key={attempts.length - index} className={a.firstTryCorrect ? '' : 'missed'}>
                      <td>{noteName(a.expected, true)}</td>
                      <td>{a.played.map((n) => noteName(n, true)).join(', ')}</td>
                      <td>{seconds(a.firstResponseMs)}</td>
                      <td>{seconds(a.timeToCorrectMs)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </main>
  );
}
