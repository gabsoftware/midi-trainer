import { useCallback, useEffect, useRef, useState } from 'react';
import { MidiStatus } from './components/MidiStatus';
import { PianoKeys } from './components/PianoKeys';
import { StaffView } from './components/StaffView';
import {
  pause,
  pickNextNote,
  playNote,
  resumeNote,
  startNote,
  type NoteAttempt,
  type SingleNoteState,
} from './exercises/singleNote';
import { historyService, useHistory } from './hooks/useHistory';
import { midiManager, useMidi, useNoteEvents } from './hooks/useMidi';
import type { NoteEvent } from './midi/events';
import { frenchName, midiToPitch, naturalNotesBetween } from './music/pitch';
import type { OctaveMode } from './music/validation';
import type { ExerciseContext } from './storage/records';

/** Prototype : Mi, Fa, Sol, La, Si, Do, Ré en clé de sol. */
const NOTE_POOL = naturalNotesBetween('E4', 'D5');
const ADVANCE_DELAY_MS = 600;
const WRONG_FLASH_MS = 700;
const PREFS_STORAGE_KEY = 'midi-trainer:prototype-prefs';
/** Le pool du prototype correspond au niveau 3 du cahier des charges. */
const EXERCISE_CONTEXT: ExerciseContext = { levelId: 'level-3', mode: 'single', clef: 'treble' };

interface Session {
  /** Séance enregistrée dans l'historique, créée à la première note réussie. */
  readonly id: string | null;
  readonly exercise: SingleNoteState | null;
  readonly attempts: readonly NoteAttempt[];
}

const NO_SESSION: Session = { id: null, exercise: null, attempts: [] };

interface Prefs {
  octaveMode: OctaveMode;
  computerKeyboard: boolean;
}

function readPrefs(): Prefs {
  const defaults: Prefs = { octaveMode: 'any', computerKeyboard: true };
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return defaults;
  }
}

function noteName(midi: number, withOctave = false): string {
  return frenchName(midiToPitch(midi), { withOctave });
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export default function App() {
  const midi = useMidi();
  const history = useHistory();
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [session, setSession] = useState<Session>(NO_SESSION);
  // Reflet synchrone de `session` : les événements de note sont traités un par un,
  // et l'enregistrement d'une tentative (effet de bord) ne doit avoir lieu qu'une fois.
  const sessionRef = useRef<Session>(NO_SESSION);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set());
  /** Horodatage de la dernière mauvaise réponse dont le signal rouge est terminé. */
  const [flashEndedAt, setFlashEndedAt] = useState<number | null>(null);
  const { exercise, attempts } = session;
  const octaveModeRef = useRef(prefs.octaveMode);

  useEffect(() => {
    octaveModeRef.current = prefs.octaveMode;
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

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
      const id = current.id ?? historyService.startSession(EXERCISE_CONTEXT).id;
      historyService.recordAttempt(id, next.attempt);
      commitSession({ id, exercise: next, attempts: [...current.attempts, next.attempt] });
    },
    [commitSession],
  );

  const start = useCallback(() => {
    const exercise = startNote(pickNextNote(NOTE_POOL, null, Math.random), octaveModeRef.current, performance.now());
    commitSession({ id: null, exercise, attempts: [] });
  }, [commitSession]);

  const togglePause = useCallback(() => {
    const now = performance.now();
    updateExercise((current) => (current.phase === 'paused' ? resumeNote(current, now) : pause(current, 'user', now)));
  }, [updateExercise]);

  const handleNote = useCallback((event: NoteEvent) => {
    setPressed((current) => {
      const next = new Set(current);
      if (event.type === 'noteon') next.add(event.note);
      else next.delete(event.note);
      return next;
    });
    if (event.type === 'noteon') {
      updateExercise((current) => playNote(current, event.note, event.timestamp));
    }
  }, [updateExercise]);

  const keyboardBaseNote = useNoteEvents(handleNote, prefs.computerKeyboard);

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
      updateExercise((current) =>
        current.phase === 'answered'
          ? startNote(pickNextNote(NOTE_POOL, current.expected, Math.random), octaveModeRef.current, performance.now())
          : current,
      );
    }, ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, updateExercise]);

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
  const recognitionMedian = median(attempts.filter((a) => a.firstTryCorrect).map((a) => a.firstResponseMs));
  const lastAttempt = attempts.at(-1);

  let noteColor = '#111';
  if (exercise?.phase === 'answered') noteColor = '#15803d';
  else if (wrongFlash) noteColor = '#dc2626';

  return (
    <div className="app">
      <header className="app-header">
        <h1>Lecture de notes</h1>
        <MidiStatus midi={midi} />
      </header>

      <main className="trainer">
        <div className="trainer-meta">
          <span>Prototype · Clé de sol · Mi → Ré</span>
          <span>
            {attempts.length} note{attempts.length > 1 ? 's' : ''}
            {attempts.length > 0 && ` · ${Math.round((firstTryCount / attempts.length) * 100)} % du premier coup`}
            {recognitionMedian !== null && ` · médiane ${formatSeconds(recognitionMedian)}`}
          </span>
        </div>

        <div className="history-summary">
          {history.status === 'loading'
            ? 'Chargement de l’historique…'
            : `Historique : ${history.attempts.length} note${history.attempts.length > 1 ? 's' : ''} sur ${
                history.sessions.length
              } séance${history.sessions.length > 1 ? 's' : ''}`}
          {history.error && <span className="history-error"> · {history.error}</span>}
        </div>

        <section className="staff-card">
          {exercise ? (
            <StaffView midi={exercise.expected} clef="treble" noteColor={noteColor} />
          ) : (
            <div className="staff-placeholder">
              <p>Jouez la note affichée sur votre clavier.</p>
              <button type="button" className="primary" onClick={start}>
                Commencer
              </button>
              <p className="hint">ou appuyez sur Entrée</p>
            </div>
          )}

          {exercise?.phase === 'paused' && (
            <div className="pause-overlay" role="status">
              {exercise.pauseReason === 'midi-disconnected' ? (
                <>
                  <strong>Clavier MIDI déconnecté</strong>
                  <span>
                    {midi.listening
                      ? 'Clavier reconnecté. Appuyez sur Espace pour reprendre.'
                      : 'Rebranchez le clavier, puis appuyez sur Espace pour reprendre.'}
                  </span>
                </>
              ) : (
                <>
                  <strong>Pause</strong>
                  <span>Appuyez sur Espace pour reprendre.</span>
                </>
              )}
            </div>
          )}
        </section>

        <div className="feedback" aria-live="polite">
          {exercise?.phase === 'answered' && lastAttempt ? (
            <span className="ok">
              {noteName(lastAttempt.expected)} · {formatSeconds(lastAttempt.timeToCorrectMs)}
              {!lastAttempt.firstTryCorrect && ` · ${lastAttempt.errorCount} erreur${lastAttempt.errorCount > 1 ? 's' : ''}`}
            </span>
          ) : wrongFlash && lastAnswer ? (
            <span className="ko">Vous avez joué {noteName(lastAnswer.played)} — essayez encore</span>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>

        {exercise && (
          <div className="controls">
            <button type="button" onClick={togglePause}>
              {exercise.phase === 'paused' ? 'Reprendre' : 'Pause'} <kbd>Espace</kbd>
            </button>
            <button type="button" onClick={start}>
              Recommencer <kbd>Entrée</kbd>
            </button>
          </div>
        )}

        <PianoKeys pressed={pressed} />

        <div className="options">
          <label>
            Octave :{' '}
            <select
              value={prefs.octaveMode}
              onChange={(event) => setPrefs({ ...prefs, octaveMode: event.target.value as OctaveMode })}
            >
              <option value="any">n’importe laquelle</option>
              <option value="exact">exacte</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.computerKeyboard}
              onChange={(event) => setPrefs({ ...prefs, computerKeyboard: event.target.checked })}
            />{' '}
            Simuler avec le clavier de l’ordinateur
          </label>
          {prefs.computerKeyboard && (
            <span className="hint">
              Rangée Q S D F G H J K (AZERTY) = Do à Do · W / X : octave · touche Q = {noteName(keyboardBaseNote, true)}
            </span>
          )}
        </div>

        {attempts.length > 0 && (
          <details className="journal">
            <summary>Journal de la séance</summary>
            <table>
              <thead>
                <tr>
                  <th>Note</th>
                  <th>Jouées</th>
                  <th>1re réponse</th>
                  <th>Bonne réponse</th>
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
                      <td>{formatSeconds(a.firstResponseMs)}</td>
                      <td>{formatSeconds(a.timeToCorrectMs)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </main>
    </div>
  );
}
