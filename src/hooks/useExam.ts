import { useCallback, useEffect, useRef, useState } from 'react';
import { generateLine } from '../exercises/lineGenerator';
import {
  pauseSequence,
  playSequence,
  resumeSequence,
  startSequence,
  type SequenceState,
} from '../exercises/sequence';
import type { NoteAttempt, PauseReason } from '../exercises/singleNote';
import type { LevelDefinition } from '../learning/levels';
import type { OctaveMode } from '../music/validation';
import { summarizeSession } from '../statistics/session';
import type { ExamResult } from '../storage/records';
import { historyService } from './useHistory';

/** Pause entre deux lignes, le temps de voir la ligne réussie. */
const LINE_PAUSE_MS = 700;

export interface ExamState {
  readonly level: LevelDefinition;
  readonly octaveMode: OctaveMode;
  /** Séance d'historique, créée à la première note trouvée. */
  readonly sessionId: string | null;
  /** Indice de la ligne en cours (0 = première). */
  readonly lineIndex: number;
  readonly line: SequenceState;
  /** Toutes les notes trouvées depuis le début de l'examen. */
  readonly attempts: readonly NoteAttempt[];
  /** Notes déjà apparues : les autres sont favorisées pour vérifier tout le niveau. */
  readonly used: ReadonlySet<number>;
  /** Résultat, une fois toutes les lignes jouées. */
  readonly result: ExamResult | null;
}

function newLine(level: LevelDefinition, previous: number | null, used: ReadonlySet<number>): number[] {
  const { notesPerLine, maxLeap } = level.exam;
  return generateLine(level.notes, {
    minLength: notesPerLine.min,
    maxLength: notesPerLine.max,
    maxLeap,
    previous,
    used,
    random: Math.random,
  });
}

/**
 * Examen de validation d'un niveau : des lignes de notes à jouer dans l'ordre, la suivante
 * étant générée quand la précédente est terminée. Chaque note est enregistrée (mode `exam`),
 * puis le résultat de l'examen est enregistré sur sa séance.
 */
export function useExam() {
  const [exam, setExam] = useState<ExamState | null>(null);
  // Reflet synchrone : les notes sont traitées une par une et l'enregistrement ne doit avoir lieu qu'une fois.
  const examRef = useRef<ExamState | null>(null);

  const commit = useCallback((next: ExamState | null) => {
    examRef.current = next;
    setExam(next);
  }, []);

  const start = useCallback(
    (level: LevelDefinition, octaveMode: OctaveMode) => {
      const notes = newLine(level, null, new Set());
      commit({
        level,
        octaveMode,
        sessionId: null,
        lineIndex: 0,
        line: startSequence(notes, octaveMode, performance.now()),
        attempts: [],
        used: new Set(notes),
        result: null,
      });
    },
    [commit],
  );

  const play = useCallback(
    (note: number, timestamp: number) => {
      const current = examRef.current;
      if (!current || current.result) return;
      const line = playSequence(current.line, note, timestamp);
      if (line === current.line) return;
      if (line.attempts.length === current.line.attempts.length) {
        commit({ ...current, line });
        return;
      }
      // Une note vient d'être trouvée : on l'enregistre.
      const attempt = line.attempts[line.attempts.length - 1];
      const sessionId =
        current.sessionId ??
        historyService.startSession({
          levelId: current.level.id,
          mode: 'exam',
          clef: current.level.clef,
          assisted: false,
        }).id;
      historyService.recordAttempt(sessionId, attempt);
      commit({ ...current, sessionId, line, attempts: [...current.attempts, attempt] });
    },
    [commit],
  );

  const pause = useCallback(
    (reason: PauseReason, now: number) => {
      const current = examRef.current;
      if (!current || current.result) return;
      const line = pauseSequence(current.line, reason, now);
      if (line !== current.line) commit({ ...current, line });
    },
    [commit],
  );

  const togglePause = useCallback(
    (now: number) => {
      const current = examRef.current;
      if (!current || current.result) return;
      const line =
        current.line.current.phase === 'paused'
          ? resumeSequence(current.line, now)
          : pauseSequence(current.line, 'user', now);
      if (line !== current.line) commit({ ...current, line });
    },
    [commit],
  );

  const abandon = useCallback(() => commit(null), [commit]);

  // Ligne terminée : après une courte pause, ligne suivante ou résultat.
  const lineDone = exam !== null && exam.line.done && exam.result === null;
  useEffect(() => {
    if (!lineDone) return;
    const timer = setTimeout(() => {
      const current = examRef.current;
      if (!current || !current.line.done || current.result) return;
      if (current.lineIndex + 1 < current.level.exam.lines) {
        const previous = current.line.notes[current.line.notes.length - 1];
        const notes = newLine(current.level, previous, current.used);
        commit({
          ...current,
          lineIndex: current.lineIndex + 1,
          line: startSequence(notes, current.octaveMode, performance.now()),
          used: new Set([...current.used, ...notes]),
        });
        return;
      }
      const summary = summarizeSession(current.attempts);
      const firstTryRate = summary.firstTryRate ?? 0;
      const result: ExamResult = {
        passed: firstTryRate >= current.level.exam.passAccuracy,
        notes: summary.notes,
        firstTryRate,
      };
      if (current.sessionId) historyService.completeExam(current.sessionId, result);
      commit({ ...current, result });
    }, LINE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lineDone, commit]);

  return { exam, examRef, start, play, pause, togglePause, abandon };
}
