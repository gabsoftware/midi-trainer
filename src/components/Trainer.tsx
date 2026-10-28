import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateLine } from '../exercises/lineGenerator';
import {
  pauseSequence,
  playSequence,
  resumeSequence,
  startSequence,
  type SequenceState,
} from '../exercises/sequence';
import type { NoteAttempt, PauseReason } from '../exercises/singleNote';
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
  /** Note déjà jouée, ligne en cours : estompée, pour que le regard aille à la note à jouer. */
  played: '#a8a29e',
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
  /** Ligne en cours : une seule note (exercice `single`) ou une suite de notes (`sequence`). */
  readonly line: SequenceState;
  readonly attempts: readonly NoteAttempt[];
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Ligne suivante (une note, ou une suite de notes selon le niveau), choisie selon les
 * performances de l'élève : les notes ratées reviennent plus souvent, les notes reconnues
 * vite moins souvent. L'historique est relu à chaque tirage, donc l'adaptation joue dès la
 * ligne suivante. Toutes les tentatives de l'élève sur une note comptent, quel que soit le
 * niveau : reconnaître une note est la même compétence partout.
 */
function chooseLine(level: LevelDefinition, previous: number | null): number[] {
  const weights = noteWeights(level.notes, historyService.getSnapshot().attempts, level.fastResponseMs);
  if (level.exercise === 'single' || !level.line) {
    return [pickWeightedNote(level.notes, weights, previous, Math.random)];
  }
  const { min, max, maxLeap } = level.line;
  return generateLine(level.notes, {
    minLength: min,
    maxLength: max,
    maxLeap,
    previous,
    used: new Set(),
    weights,
    random: Math.random,
  });
}

function startLine(level: LevelDefinition, octaveMode: OctaveMode, previous: number | null): SequenceState {
  return startSequence(chooseLine(level, previous), octaveMode, performance.now());
}

/**
 * Couleurs d'une ligne. Note isolée : noire, verte une fois trouvée. Suite de notes : jouées
 * (gris pâle), attendue (bleu, avec le curseur), à venir (noir) ; une fois la ligne terminée,
 * chaque note devient verte, ou orange si elle a été ratée au premier essai.
 */
/** Position du curseur de lecture : seulement dans une ligne de plusieurs notes, tant qu'elle n'est pas terminée. */
function lineCursor(line: SequenceState): number | null {
  return line.notes.length > 1 && !line.done ? line.position : null;
}

function lineNotes(line: SequenceState, wrongFlash: boolean): StaffNote[] {
  if (line.notes.length === 1) {
    const color = line.done ? COLORS.correct : wrongFlash ? COLORS.wrong : COLORS.pending;
    return [{ midi: line.notes[0], color }];
  }
  return line.notes.map((midi, index) => {
    if (index < line.attempts.length) {
      if (!line.done) return { midi, color: COLORS.played };
      return { midi, color: line.attempts[index].firstTryCorrect ? COLORS.correct : COLORS.missed };
    }
    if (index === line.position && !line.done) return { midi, color: wrongFlash ? COLORS.wrong : COLORS.current };
    return { midi, color: COLORS.pending };
  });
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
  const line = session?.line ?? null;
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

  const updateLine = useCallback(
    (update: (line: SequenceState) => SequenceState) => {
      const current = sessionRef.current;
      if (!current || current.finished) return;
      const updated = update(current.line);
      if (updated === current.line) return;
      if (updated.attempts.length === current.line.attempts.length || updated.notes !== current.line.notes) {
        commitSession({ ...current, line: updated });
        return;
      }
      // Une note vient d'être trouvée : on l'enregistre dans l'historique.
      const attempt = updated.attempts[updated.attempts.length - 1];
      const id =
        current.id ??
        historyService.startSession({
          levelId: current.level.id,
          mode: current.level.exercise,
          clef: current.level.clef,
          assisted: current.assisted,
        }).id;
      historyService.recordAttempt(id, attempt);
      const sessionAttempts = [...current.attempts, attempt];
      const total = latest.current.preferences.notesPerSession;
      commitSession({
        ...current,
        id,
        line: updated,
        attempts: sessionAttempts,
        // Une ligne commencée est toujours terminée.
        finished: total > 0 && sessionAttempts.length >= total && updated.done,
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
        line: startLine(target, octaveMode, null),
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

  /** Ligne suivante, une fois la ligne terminée (automatiquement ou avec Entrée). */
  const advance = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    updateLine((state) =>
      state.done ? startLine(current.level, current.octaveMode, state.notes[state.notes.length - 1]) : state,
    );
  }, [updateLine]);

  /**
   * Entrée :
   * - examen terminé : niveau suivant s'il est réussi (ou entraînement s'il n'y en a plus), nouvel essai sinon ;
   * - examen ou niveau suivant conseillé : y aller ;
   * - aucune séance, ou séance terminée : nouvelle séance ;
   * - ligne terminée sans passage automatique : ligne suivante ;
   * - sinon rien (une séance ou un examen en cours n'est jamais relancé par erreur).
   */
  const handleEnter = useCallback(() => {
    const { level: current, examAdvice: suggestExam, nextAdvice: suggestNext, next: nextTarget, preferences: prefs } =
      latest.current;
    const runningExam = examRef.current;
    if (runningExam) {
      if (!runningExam.result) return;
      if (!runningExam.result.passed) startExam(runningExam.level);
      else startLevel(nextTarget ?? runningExam.level);
      return;
    }
    const running = sessionRef.current;
    if (suggestExam) startExam(current);
    else if (suggestNext && nextTarget) startLevel(nextTarget);
    else if (!running || running.finished) startLevel(current);
    else if (running.line.done && !prefs.autoAdvance) advance();
  }, [advance, examRef, startExam, startLevel]);

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
      updateLine((current) => pauseSequence(current, reason, now));
    },
    [examApi, updateLine],
  );

  const togglePause = useCallback(() => {
    const now = performance.now();
    if (examRef.current) {
      examApi.togglePause(now);
      return;
    }
    updateLine((current) =>
      current.current.phase === 'paused' ? resumeSequence(current, now) : pauseSequence(current, 'user', now),
    );
  }, [examApi, examRef, updateLine]);

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
      else updateLine((current) => playSequence(current, event.note, event.timestamp));
    },
    [examApi, examRef, updateLine],
  );

  const keyboardBaseNote = useNoteEvents(handleNote, preferences.computerKeyboard);

  // Bref signal rouge sur une mauvaise réponse (séance ou examen).
  const lastAnswer = (exam ? exam.line : line)?.current.lastAnswer ?? null;
  const wrongFlash = lastAnswer !== null && !lastAnswer.correct && flashEndedAt !== lastAnswer.at;
  useEffect(() => {
    if (!lastAnswer || lastAnswer.correct) return;
    const timer = setTimeout(() => setFlashEndedAt(lastAnswer.at), WRONG_FLASH_MS);
    return () => clearTimeout(timer);
  }, [lastAnswer]);

  // Passage automatique à la ligne suivante une fois la ligne terminée.
  const lineDone = line?.done ?? false;
  const { autoAdvance, advanceDelayMs } = preferences;
  useEffect(() => {
    if (!lineDone || finished || !autoAdvance) return;
    const timer = setTimeout(advance, advanceDelayMs);
    return () => clearTimeout(timer);
  }, [lineDone, finished, autoAdvance, advanceDelayMs, advance]);

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
  const waitingForEnter = lineDone && !finished && !autoAdvance;
  const activeState = (exam ? exam.line : line)?.current;
  const paused = activeState?.phase === 'paused' && !finished && !exam?.result;
  const sequenceLevel = level.exercise === 'sequence';
  const lineSummary = line?.done && sequenceLevel ? summarizeSession(line.attempts) : null;
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
              <button type="button" onClick={() => startLevel(level)}>
                {t.keepPractising}
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
              <button type="button" onClick={() => startExam(level)}>
                {t.retryExam}
              </button>
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
                {exam.result.passed && next && (
                  <button type="button" className="primary" onClick={() => startLevel(next)}>
                    {t.goToLevel(next.number)} <kbd>{t.keyEnter}</kbd>
                  </button>
                )}
                <button
                  type="button"
                  className={exam.result.passed ? '' : 'primary'}
                  onClick={() => startExam(level)}
                >
                  {t.retryExam} {!exam.result.passed && <kbd>{t.keyEnter}</kbd>}
                </button>
                <button
                  type="button"
                  className={exam.result.passed && !next ? 'primary' : ''}
                  onClick={() => startLevel(level)}
                >
                  {t.practiceLevel(level.number)} {exam.result.passed && !next && <kbd>{t.keyEnter}</kbd>}
                </button>
              </div>
            </div>
          ) : exam ? (
            <StaffView notes={lineNotes(exam.line, wrongFlash)} cursor={lineCursor(exam.line)} clef={level.clef} />
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
          ) : line ? (
            <div className="staff-exercise">
              <StaffView notes={lineNotes(line, wrongFlash)} cursor={lineCursor(line)} clef={level.clef} />
              {assisted && !line.done && <p className="assisted-name">{noteName(line.current.expected)}</p>}
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
          {!exam && lineSummary && !finished ? (
            <span className={lineSummary.errors === 0 ? 'ok' : ''}>
              {t.summaryFirstTry(lineSummary.firstTryCorrect, lineSummary.notes, percent(lineSummary.firstTryRate ?? 0))}
              {timed && lineSummary.medianMs !== null && ` · ${t.summaryMedian(seconds(lineSummary.medianMs))}`}
            </span>
          ) : !exam && lineDone && lastAttempt && !finished ? (
            <span className="ok">
              {noteName(lastAttempt.expected)}
              {timed && ` · ${seconds(lastAttempt.timeToCorrectMs)}`}
              {!lastAttempt.firstTryCorrect && ` · ${t.errorCount(lastAttempt.errorCount)}`}
            </span>
          ) : wrongFlash && lastAnswer && !finished && !exam?.result ? (
            <span className="ko">{t.youPlayed(noteName(lastAnswer.played))}</span>
          ) : !exam && timed && line && !finished && !line.done ? (
            <LiveTimer stopwatch={line.current.stopwatch} />
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

        {!exam && line && !finished && (
          <div className="controls">
            {waitingForEnter && (
              <button type="button" className="primary" onClick={advance}>
                {sequenceLevel ? t.nextLine : t.nextNote} <kbd>{t.keyEnter}</kbd>
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

        <PianoKeys pressed={pressed} onNote={handleNote} shape={preferences.keyboardShape} />

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
