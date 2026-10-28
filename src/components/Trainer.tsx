import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pause,
  playNote,
  resumeNote,
  startNote,
  type NoteAttempt,
  type PauseReason,
  type SingleNoteState,
} from '../exercises/singleNote';
import { useExam } from '../hooks/useExam';
import { historyService, useHistory } from '../hooks/useHistory';
import { useKeyLabels } from '../hooks/useKeyLabels';
import { midiManager, useNoteEvents } from '../hooks/useMidi';
import { useI18n } from '../i18n/context';
import type { Messages } from '../i18n/messages';
import { noteWeights, pickWeightedNote } from '../learning/adaptive';
import { findLevel, LEVELS, type LevelDefinition } from '../learning/levels';
import { evaluateLevel, nextLevel, recommendLevel, type LevelStatus } from '../learning/mastery';
import { OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, WHITE_KEY_CODES } from '../midi/computerKeyboard';
import type { NoteEvent } from '../midi/events';
import type { MidiSnapshot } from '../midi/MidiInputManager';
import type { OctaveMode } from '../music/validation';
import { summarizeSession } from '../statistics/session';
import type { HistoryError } from '../storage/HistoryService';
import type { Preferences } from '../storage/preferences';
import { LevelPicker } from './LevelPicker';
import { LiveTimer } from './LiveTimer';
import { PianoKeys } from './PianoKeys';
import { StaffView, type StaffNote } from './StaffView';

const WRONG_FLASH_MS = 700;

const COLORS = {
  pending: '#111',
  current: '#2f5bd3',
  correct: '#15803d',
  missed: '#c2410c',
  wrong: '#dc2626',
} as const;

/** Séance d'entraînement en cours. Le niveau, l'octave et le mode assisté sont figés pour toute la séance. */
interface Session {
  /** Séance enregistrée dans l'historique, créée à la première note réussie. */
  readonly id: string | null;
  readonly level: LevelDefinition;
  readonly octaveMode: OctaveMode;
  /** État du niveau au démarrage, pour signaler au bon moment qu'il devient prêt pour l'examen. */
  readonly statusAtStart: LevelStatus;
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

/** L'examen n'est jamais plus facile que ce que le niveau exige. */
function examOctaveMode(preferences: Preferences, level: LevelDefinition): OctaveMode {
  return level.defaultOctaveMode === 'exact' ? 'exact' : effectiveOctaveMode(preferences, level);
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
  readonly midi: MidiSnapshot;
  /** Réglages de l'élève courant (modifiables sur l'écran des réglages). */
  readonly preferences: Preferences;
  readonly onPreferencesChange: (patch: Partial<Preferences>) => void;
}

export function Trainer({ midi, preferences, onPreferencesChange }: TrainerProps) {
  const { t, locale, text, noteName, seconds, percent } = useI18n();
  const keyLabel = useKeyLabels(locale);
  const history = useHistory();
  const examApi = useExam();
  const { exam, examRef } = examApi;
  const [session, setSession] = useState<Session | null>(null);
  // Reflet synchrone de `session` : les événements de note sont traités un par un,
  // et l'enregistrement d'une tentative (effet de bord) ne doit avoir lieu qu'une fois.
  const sessionRef = useRef<Session | null>(null);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set());
  /** Horodatage de la dernière mauvaise réponse dont le signal rouge est terminé. */
  const [flashEndedAt, setFlashEndedAt] = useState<number | null>(null);
  /** Niveau pour lequel l'élève a reporté le conseil (examen ou niveau suivant). */
  const [dismissedAdviceFor, setDismissedAdviceFor] = useState<string | null>(null);

  const progress = useMemo(
    () => new Map(LEVELS.map((level) => [level.id, evaluateLevel(level, history.attempts, history.sessions)])),
    [history.attempts, history.sessions],
  );
  const recommended = recommendLevel(LEVELS, progress);
  const chosen = findLevel(preferences.levelId);
  const selectedLevel = chosen?.available ? chosen : recommended;
  const level = exam?.level ?? session?.level ?? selectedLevel;
  const exercise = session?.exercise ?? null;
  const attempts = session?.attempts ?? [];
  const finished = session?.finished ?? false;

  // Conseils, jamais automatiques : passer l'examen quand les critères sont remplis,
  // puis passer au niveau suivant une fois l'examen réussi.
  const status = progress.get(level.id)?.status ?? 'new';
  const next = status === 'mastered' ? nextLevel(LEVELS, level, progress) : null;
  const notDismissed = dismissedAdviceFor !== level.id;
  const examAdvice =
    exam === null && status === 'ready' && notDismissed && (session === null || session.statusAtStart !== 'ready');
  const nextAdvice = exam === null && session === null && status === 'mastered' && notDismissed;

  // Valeurs lues par les callbacks stables (événements clavier, minuteries).
  const latest = useRef({ preferences, level, examAdvice, nextAdvice, next, progress });
  useEffect(() => {
    latest.current = { preferences, level, examAdvice, nextAdvice, next, progress };
  });

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
      const sessionAttempts = [...current.attempts, updated.attempt];
      const total = latest.current.preferences.notesPerSession;
      commitSession({
        ...current,
        id,
        exercise: updated,
        attempts: sessionAttempts,
        finished: total > 0 && sessionAttempts.length >= total,
      });
    },
    [commitSession],
  );

  const startLevel = useCallback(
    (target: LevelDefinition) => {
      const { preferences: currentPreferences, progress: currentProgress } = latest.current;
      const octaveMode = effectiveOctaveMode(currentPreferences, target);
      examApi.abandon();
      // Le niveau joué devient le niveau choisi : il ne change plus en cours de route.
      onPreferencesChange({ levelId: target.id });
      setDismissedAdviceFor(null);
      commitSession({
        id: null,
        level: target,
        octaveMode,
        statusAtStart: currentProgress.get(target.id)?.status ?? 'new',
        assisted: currentPreferences.showNoteNames,
        finished: false,
        exercise: startNote(chooseNote(target, null), octaveMode, performance.now()),
        attempts: [],
      });
    },
    [commitSession, examApi, onPreferencesChange],
  );

  const startExam = useCallback(
    (target: LevelDefinition) => {
      commitSession(null);
      setDismissedAdviceFor(null);
      examApi.start(target, examOctaveMode(latest.current.preferences, target));
    },
    [commitSession, examApi],
  );

  const leaveExam = useCallback(() => examApi.abandon(), [examApi]);

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
   * - examen terminé : niveau suivant s'il est réussi, nouvel essai sinon ;
   * - examen ou niveau suivant conseillé : y aller ;
   * - aucune séance, ou séance terminée : nouvelle séance ;
   * - bonne réponse sans passage automatique : note suivante ;
   * - sinon rien (une séance ou un examen en cours n'est jamais relancé par erreur).
   */
  const handleEnter = useCallback(() => {
    const { level: current, examAdvice: suggestExam, nextAdvice: suggestNext, next: nextTarget, preferences: prefs } =
      latest.current;
    const runningExam = examRef.current;
    if (runningExam) {
      if (!runningExam.result) return;
      if (!runningExam.result.passed) startExam(runningExam.level);
      else if (nextTarget) startLevel(nextTarget);
      else leaveExam();
      return;
    }
    const running = sessionRef.current;
    if (suggestExam) startExam(current);
    else if (suggestNext && nextTarget) startLevel(nextTarget);
    else if (!running || running.finished) startLevel(current);
    else if (running.exercise.phase === 'answered' && !prefs.autoAdvance) advance();
  }, [advance, examRef, leaveExam, startExam, startLevel]);

  const dismissAdvice = useCallback(() => setDismissedAdviceFor(latest.current.level.id), []);

  const selectLevel = useCallback(
    (levelId: string) => {
      examApi.abandon();
      onPreferencesChange({ levelId });
      commitSession(null);
    },
    [commitSession, examApi, onPreferencesChange],
  );

  /** Pause de ce qui est en cours (séance ou examen). */
  const pauseActive = useCallback(
    (reason: PauseReason) => {
      const now = performance.now();
      examApi.pause(reason, now);
      updateExercise((current) => pause(current, reason, now));
    },
    [examApi, updateExercise],
  );

  const togglePause = useCallback(() => {
    const now = performance.now();
    if (examRef.current) {
      examApi.togglePause(now);
      return;
    }
    updateExercise((current) => (current.phase === 'paused' ? resumeNote(current, now) : pause(current, 'user', now)));
  }, [examApi, examRef, updateExercise]);

  const handleNote = useCallback(
    (event: NoteEvent) => {
      setPressed((current) => {
        const updated = new Set(current);
        if (event.type === 'noteon') updated.add(event.note);
        else updated.delete(event.note);
        return updated;
      });
      if (event.type !== 'noteon') return;
      if (examRef.current) examApi.play(event.note, event.timestamp);
      else updateExercise((current) => playNote(current, event.note, event.timestamp));
    },
    [examApi, examRef, updateExercise],
  );

  const keyboardBaseNote = useNoteEvents(handleNote, preferences.computerKeyboard);

  // Bref signal rouge sur une mauvaise réponse (séance ou examen).
  const lastAnswer = (exam ? exam.line.current.lastAnswer : exercise?.lastAnswer) ?? null;
  const wrongFlash = lastAnswer !== null && !lastAnswer.correct && flashEndedAt !== lastAnswer.at;
  useEffect(() => {
    if (!lastAnswer || lastAnswer.correct) return;
    const timer = setTimeout(() => setFlashEndedAt(lastAnswer.at), WRONG_FLASH_MS);
    return () => clearTimeout(timer);
  }, [lastAnswer]);

  // Passage automatique à la note suivante après une bonne réponse.
  const phase = exercise?.phase;
  const { autoAdvance, advanceDelayMs } = preferences;
  useEffect(() => {
    if (phase !== 'answered' || finished || !autoAdvance) return;
    const timer = setTimeout(advance, advanceDelayMs);
    return () => clearTimeout(timer);
  }, [phase, finished, autoAdvance, advanceDelayMs, advance]);

  // Une déconnexion du clavier MIDI choisi met en pause.
  useEffect(() => {
    let wasListening = midiManager.getSnapshot().listening;
    return midiManager.subscribe(() => {
      const { listening, selectedId } = midiManager.getSnapshot();
      if (wasListening && !listening) {
        setPressed(new Set());
        if (selectedId) pauseActive('midi-disconnected');
      }
      wasListening = listening;
    });
  }, [pauseActive]);

  // Onglet masqué : pause, pour ne pas fausser les temps de réponse.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) pauseActive('user');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [pauseActive]);

  // Raccourcis : Entrée (voir handleEnter), Espace = pause / reprendre, Échap = reporter le conseil.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        handleEnter();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
      } else if (event.code === 'Escape' && (latest.current.examAdvice || latest.current.nextAdvice)) {
        event.preventDefault();
        dismissAdvice();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEnter, togglePause, dismissAdvice]);

  const summary = summarizeSession(attempts);
  const lastAttempt = attempts.at(-1);
  const timed = preferences.timed;
  const assisted = session?.assisted ?? preferences.showNoteNames;
  const waitingForEnter = exercise?.phase === 'answered' && !finished && !autoAdvance;
  const activeState = exam ? exam.line.current : exercise;
  const paused = activeState?.phase === 'paused' && !finished && !exam?.result;

  let noteColor: string = COLORS.pending;
  if (exercise?.phase === 'answered') noteColor = COLORS.correct;
  else if (wrongFlash) noteColor = COLORS.wrong;

  /** Couleurs de la ligne d'examen : jouées (vert, ou orange si ratées au premier essai), attendue, à venir. */
  const examNotes: StaffNote[] = exam
    ? exam.line.notes.map((midi, index) => {
        const line = exam.line;
        if (index < line.attempts.length) {
          return { midi, color: line.attempts[index].firstTryCorrect ? COLORS.correct : COLORS.missed };
        }
        if (index === line.position && !line.done) return { midi, color: wrongFlash ? COLORS.wrong : COLORS.current };
        return { midi, color: COLORS.pending };
      })
    : [];
  const examSummary = exam?.result ? summarizeSession(exam.attempts) : null;

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

        {preferences.computerKeyboard && (
          <p className="hint keyboard-hint">
            {t.computerKeyboardHint(
              WHITE_KEY_CODES.map(keyLabel).join(' '),
              keyLabel(OCTAVE_DOWN_CODE),
              keyLabel(OCTAVE_UP_CODE),
              keyLabel(WHITE_KEY_CODES[0]),
              noteName(keyboardBaseNote, true),
            )}
          </p>
        )}

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
            {exam && <strong>{t.examTitle} · </strong>}
            {t.levelNumber(level.number)} · {text(level.title)}
            {!exam && assisted && <span className="badge">{t.assistedBadge}</span>}
          </span>
          {exam && !exam.result && <span>{t.examLine(exam.lineIndex + 1, level.exam.lines)}</span>}
          {!exam && session && !finished && (
            <span>
              {t.noteProgress(Math.min(attempts.length + 1, preferences.notesPerSession || Infinity), preferences.notesPerSession)}
              {summary.firstTryRate !== null && ` · ${t.sessionFirstTry(percent(summary.firstTryRate))}`}
              {timed && summary.medianMs !== null && ` · ${t.sessionMedian(seconds(summary.medianMs))}`}
            </span>
          )}
        </div>

        {examAdvice && (
          <div className="advice" role="status">
            <p>
              <strong>{t.examReadyTitle(level.number)}</strong> {t.examReadyText}
            </p>
            <div className="advice-actions">
              <button type="button" className="primary" onClick={() => startExam(level)}>
                {t.takeExam} <kbd>{t.keyEnter}</kbd>
              </button>
              <button type="button" onClick={dismissAdvice}>
                {t.later} <kbd>{t.keyEscape}</kbd>
              </button>
            </div>
          </div>
        )}

        {nextAdvice && (
          <div className="advice" role="status">
            <p>
              <strong>{t.levelAlreadyMastered(level.number)}</strong>{' '}
              {next ? t.nextLevelSuggestion(next.number, text(next.title)) : t.allLevelsMastered}
            </p>
            <div className="advice-actions">
              {next && (
                <button type="button" className="primary" onClick={() => startLevel(next)}>
                  {t.goToLevel(next.number)} <kbd>{t.keyEnter}</kbd>
                </button>
              )}
              <button type="button" onClick={dismissAdvice}>
                {t.stayOnLevel} <kbd>{t.keyEscape}</kbd>
              </button>
            </div>
          </div>
        )}

        <div className="staff-card">
          {exam?.result && examSummary ? (
            <div className="session-summary" role="status">
              <h3 className={exam.result.passed ? 'passed' : 'failed'}>
                {exam.result.passed ? t.examPassed(level.number) : t.examFailed}
              </h3>
              <p>
                {t.summaryFirstTry(examSummary.firstTryCorrect, examSummary.notes, percent(exam.result.firstTryRate))}
              </p>
              {!exam.result.passed && <p>{t.examNeeded(percent(level.exam.passAccuracy))}</p>}
              {examSummary.toReview.length > 0 && (
                <p>
                  {t.summaryToReview}{' '}
                  {examSummary.toReview.map(({ note, misses }) => `${noteName(note, true)} (${misses})`).join(', ')}
                </p>
              )}
              <div className="advice-actions">
                {exam.result.passed ? (
                  next ? (
                    <button type="button" className="primary" onClick={() => startLevel(next)}>
                      {t.goToLevel(next.number)} <kbd>{t.keyEnter}</kbd>
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={leaveExam}>
                      {t.backToTraining} <kbd>{t.keyEnter}</kbd>
                    </button>
                  )
                ) : (
                  <>
                    <button type="button" className="primary" onClick={() => startExam(level)}>
                      {t.retryExam} <kbd>{t.keyEnter}</kbd>
                    </button>
                    <button type="button" onClick={leaveExam}>
                      {t.backToTraining}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : exam ? (
            <StaffView notes={examNotes} clef={level.clef} />
          ) : finished ? (
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
              <button type="button" className={examAdvice ? '' : 'primary'} onClick={() => startLevel(level)}>
                {t.newSession} {!examAdvice && <kbd>{t.keyEnter}</kbd>}
              </button>
            </div>
          ) : exercise ? (
            <div className="staff-exercise">
              <StaffView notes={[{ midi: exercise.expected, color: noteColor }]} clef={level.clef} />
              {assisted && exercise.phase !== 'answered' && (
                <p className="assisted-name">{noteName(exercise.expected)}</p>
              )}
            </div>
          ) : (
            <div className="staff-placeholder">
              <p>{t.startPrompt}</p>
              <button
                type="button"
                className={examAdvice || nextAdvice ? '' : 'primary'}
                onClick={() => startLevel(level)}
              >
                {t.start}
              </button>
              {!examAdvice && !nextAdvice && <p className="hint">{t.orPressEnter}</p>}
            </div>
          )}

          {paused && (
            <div className="pause-overlay" role="status">
              {activeState?.pauseReason === 'midi-disconnected' ? (
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
          {!exam && exercise?.phase === 'answered' && lastAttempt && !finished ? (
            <span className="ok">
              {noteName(lastAttempt.expected)}
              {timed && ` · ${seconds(lastAttempt.timeToCorrectMs)}`}
              {!lastAttempt.firstTryCorrect && ` · ${t.errorCount(lastAttempt.errorCount)}`}
            </span>
          ) : wrongFlash && lastAnswer && !finished && !exam?.result ? (
            <span className="ko">{t.youPlayed(noteName(lastAnswer.played))}</span>
          ) : !exam && timed && exercise && !finished && exercise.phase !== 'answered' ? (
            <LiveTimer stopwatch={exercise.stopwatch} />
          ) : (
            <span>&nbsp;</span>
          )}
        </div>

        {exam && !exam.result && (
          <div className="controls">
            <button type="button" onClick={togglePause}>
              {paused ? t.resume : t.pause} <kbd>{t.keySpace}</kbd>
            </button>
            <button type="button" onClick={leaveExam}>
              {t.abandonExam}
            </button>
          </div>
        )}

        {!exam && exercise && !finished && (
          <div className="controls">
            {waitingForEnter && (
              <button type="button" className="primary" onClick={advance}>
                {t.nextNote} <kbd>{t.keyEnter}</kbd>
              </button>
            )}
            <button type="button" onClick={togglePause}>
              {paused ? t.resume : t.pause} <kbd>{t.keySpace}</kbd>
            </button>
            <button type="button" onClick={() => startLevel(level)}>
              {t.restart}
            </button>
          </div>
        )}

        <PianoKeys pressed={pressed} onNote={handleNote} />

        {!exam && attempts.length > 0 && (
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
