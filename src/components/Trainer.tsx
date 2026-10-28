import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pause,
  pickNextNote,
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
import { findLevel, LEVELS, type LevelDefinition } from '../learning/levels';
import { evaluateLevel, recognitionMedian, recommendLevel } from '../learning/mastery';
import { OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, WHITE_KEY_CODES } from '../midi/computerKeyboard';
import type { NoteEvent } from '../midi/events';
import type { MidiSnapshot } from '../midi/MidiInputManager';
import type { OctaveMode } from '../music/validation';
import type { HistoryError } from '../storage/HistoryService';
import { loadPreferences, savePreferences, type Preferences } from '../storage/preferences';
import { LevelPicker } from './LevelPicker';
import { PianoKeys } from './PianoKeys';
import { StaffView } from './StaffView';

const ADVANCE_DELAY_MS = 600;
const WRONG_FLASH_MS = 700;

interface Session {
  /** Séance enregistrée dans l'historique, créée à la première note réussie. */
  readonly id: string | null;
  readonly exercise: SingleNoteState | null;
  readonly attempts: readonly NoteAttempt[];
}

const NO_SESSION: Session = { id: null, exercise: null, attempts: [] };

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
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

export function Trainer({ midi }: { readonly midi: MidiSnapshot }) {
  const { t, locale, text, noteName, seconds, percent } = useI18n();
  const keyLabel = useKeyLabels(locale);
  const history = useHistory();
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [session, setSession] = useState<Session>(NO_SESSION);
  // Reflet synchrone de `session` : les événements de note sont traités un par un,
  // et l'enregistrement d'une tentative (effet de bord) ne doit avoir lieu qu'une fois.
  const sessionRef = useRef<Session>(NO_SESSION);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set());
  /** Horodatage de la dernière mauvaise réponse dont le signal rouge est terminé. */
  const [flashEndedAt, setFlashEndedAt] = useState<number | null>(null);
  const { exercise, attempts } = session;

  const progress = useMemo(
    () => new Map(LEVELS.map((level) => [level.id, evaluateLevel(level, history.attempts)])),
    [history.attempts],
  );
  const recommended = recommendLevel(LEVELS, progress);
  const chosen = findLevel(preferences.levelId);
  const level = chosen?.available ? chosen : recommended;
  const octaveMode = effectiveOctaveMode(preferences, level);

  // Valeurs lues par les callbacks stables (événements MIDI, minuteries).
  const settingsRef = useRef({ level, octaveMode });
  useEffect(() => {
    settingsRef.current = { level, octaveMode };
  });

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const commitSession = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const updateExercise = useCallback(
    (update: (exercise: SingleNoteState) => SingleNoteState) => {
      const current = sessionRef.current;
      if (!current.exercise) return;
      const next = update(current.exercise);
      if (next === current.exercise) return;
      if (next.attempt === null || current.exercise.attempt !== null) {
        commitSession({ ...current, exercise: next });
        return;
      }
      // Une note vient d'être réussie : on l'enregistre dans l'historique.
      const { level: currentLevel } = settingsRef.current;
      const id =
        current.id ??
        historyService.startSession({ levelId: currentLevel.id, mode: 'single', clef: currentLevel.clef }).id;
      historyService.recordAttempt(id, next.attempt);
      commitSession({ id, exercise: next, attempts: [...current.attempts, next.attempt] });
    },
    [commitSession],
  );

  const nextNote = useCallback((previous: number | null): SingleNoteState => {
    const { level: currentLevel, octaveMode: mode } = settingsRef.current;
    return startNote(pickNextNote(currentLevel.notes, previous, Math.random), mode, performance.now());
  }, []);

  const start = useCallback(() => {
    // Le niveau conseillé est figé au démarrage, pour ne pas changer en cours de séance.
    updatePreferences({ levelId: settingsRef.current.level.id });
    commitSession({ id: null, exercise: nextNote(null), attempts: [] });
  }, [commitSession, nextNote, updatePreferences]);

  const selectLevel = useCallback(
    (levelId: string) => {
      updatePreferences({ levelId });
      commitSession(NO_SESSION);
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
        const next = new Set(current);
        if (event.type === 'noteon') next.add(event.note);
        else next.delete(event.note);
        return next;
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
  useEffect(() => {
    if (phase !== 'answered') return;
    const timer = setTimeout(() => {
      updateExercise((current) => (current.phase === 'answered' ? nextNote(current.expected) : current));
    }, ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, updateExercise, nextNote]);

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

  // Raccourcis : Entrée = démarrer / recommencer, Espace = pause / reprendre.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        start();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [start, togglePause]);

  const firstTryCount = attempts.filter((a) => a.firstTryCorrect).length;
  const sessionMedian = recognitionMedian(attempts);
  const lastAttempt = attempts.at(-1);

  let noteColor = '#111';
  if (exercise?.phase === 'answered') noteColor = '#15803d';
  else if (wrongFlash) noteColor = '#dc2626';

  const octaveModeName = (mode: OctaveMode) => (mode === 'any' ? t.octaveAny : t.octaveExact);

  return (
    <main className="trainer">
      <LevelPicker
        levels={LEVELS}
        progress={progress}
        selected={level}
        recommendedId={recommended.id}
        onSelect={selectLevel}
      />

      <div className="trainer-meta">
        <span>
          {t.levelNumber(level.number)} · {text(level.title)}
        </span>
        <span>
          {t.sessionNotes(attempts.length)}
          {attempts.length > 0 && ` · ${t.sessionFirstTry(percent(firstTryCount / attempts.length))}`}
          {sessionMedian !== null && ` · ${t.sessionMedian(seconds(sessionMedian))}`}
        </span>
      </div>

      <section className="staff-card">
        {exercise ? (
          <StaffView midi={exercise.expected} clef={level.clef} noteColor={noteColor} />
        ) : (
          <div className="staff-placeholder">
            <p>{t.startPrompt}</p>
            <button type="button" className="primary" onClick={start}>
              {t.start}
            </button>
            <p className="hint">{t.orPressEnter}</p>
          </div>
        )}

        {exercise?.phase === 'paused' && (
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
      </section>

      <div className="feedback" aria-live="polite">
        {exercise?.phase === 'answered' && lastAttempt ? (
          <span className="ok">
            {noteName(lastAttempt.expected)} · {seconds(lastAttempt.timeToCorrectMs)}
            {!lastAttempt.firstTryCorrect && ` · ${t.errorCount(lastAttempt.errorCount)}`}
          </span>
        ) : wrongFlash && lastAnswer ? (
          <span className="ko">{t.youPlayed(noteName(lastAnswer.played))}</span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>

      {exercise && (
        <div className="controls">
          <button type="button" onClick={togglePause}>
            {exercise.phase === 'paused' ? t.resume : t.pause} <kbd>{t.keySpace}</kbd>
          </button>
          <button type="button" onClick={start}>
            {t.restart} <kbd>{t.keyEnter}</kbd>
          </button>
        </div>
      )}

      <PianoKeys pressed={pressed} />

      <div className="options">
        <label>
          {t.octave}{' '}
          <select
            value={preferences.octaveMode}
            onChange={(event) => {
              updatePreferences({ octaveMode: event.target.value as Preferences['octaveMode'] });
              event.target.blur(); // rend la main aux raccourcis clavier
            }}
          >
            <option value="level">{t.octaveLevel(octaveModeName(level.defaultOctaveMode))}</option>
            <option value="any">{t.octaveAny}</option>
            <option value="exact">{t.octaveExact}</option>
          </select>
        </label>
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
      </div>

      <div className="history-summary">
        {history.status === 'loading'
          ? t.historyLoading
          : t.historySummary(history.attempts.length, history.sessions.length)}
        {history.error && <span className="history-error"> · {historyErrorText(history.error, t)}</span>}
      </div>

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
    </main>
  );
}
