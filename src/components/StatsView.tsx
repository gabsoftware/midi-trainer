import { useMemo, useState } from 'react';
import { historyService, useHistory } from '../hooks/useHistory';
import { useI18n } from '../i18n/context';
import { findLevel, LEVELS } from '../learning/levels';
import { evaluateLevel } from '../learning/mastery';
import { computeStats } from '../statistics/stats';
import { niceTicks } from '../statistics/ticks';
import { LineChart } from './LineChart';

interface StatsViewProps {
  /** Nom affiché de l'élève courant. */
  readonly studentName: string;
}

/** Tableau de bord de l'élève courant. */
export function StatsView({ studentName }: StatsViewProps) {
  const { t, locale, text, noteName, seconds, percent } = useI18n();
  const history = useHistory();
  const [levelId, setLevelId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const stats = useMemo(() => computeStats(history.attempts, levelId), [history.attempts, levelId]);
  const progress = useMemo(
    () =>
      LEVELS.filter((level) => level.available).map((level) => ({
        level,
        progress: evaluateLevel(level, history.attempts, history.sessions),
      })),
    [history.attempts, history.sessions],
  );
  const { overall, perNote, hardest, evolution } = stats;

  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const sessionLabel = (iso: string) => dateFormat.format(new Date(iso));
  const maxMedian = Math.max(0, ...evolution.map((point) => point.recognitionMedianMs ?? 0));
  const statusLabel = {
    mastered: t.statusMastered,
    ready: t.statusReady,
    learning: t.statusLearning,
    new: t.statusNew,
  };

  return (
    <main className="stats">
      <div className="stats-header">
        <h2>{t.statsTitle(studentName)}</h2>
        <select
          aria-label={t.statsLevel}
          value={levelId ?? ''}
          onChange={(event) => setLevelId(event.target.value || null)}
        >
          <option value="">{t.statsAllLevels}</option>
          {LEVELS.filter((level) => level.available).map((level) => (
            <option key={level.id} value={level.id}>
              {level.number}. {text(level.title)}
            </option>
          ))}
        </select>
      </div>

      {overall.notes === 0 ? (
        <p className="stats-empty">{t.statsEmpty}</p>
      ) : (
        <>
          <section className="kpis">
            <div className="kpi">
              <span className="kpi-label">{t.statsNotes}</span>
              <span className="kpi-value">{overall.notes}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t.statsSessions}</span>
              <span className="kpi-value">{overall.sessions}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t.statsFirstTry}</span>
              <span className="kpi-value">{percent(overall.firstTryRate ?? 0)}</span>
              <span className="kpi-detail">
                {t.statsCorrectedAfterError(overall.correctedAfterError)} · {t.statsErrors(overall.errors)}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t.statsRecognition}</span>
              <span className="kpi-value">
                {overall.recognitionMedianMs === null ? t.notMeasured : seconds(overall.recognitionMedianMs)}
              </span>
              {overall.recognitionMeanMs !== null && (
                <span className="kpi-detail">{t.statsRecognitionMean(seconds(overall.recognitionMeanMs))}</span>
              )}
            </div>
          </section>
          {overall.assistedExcluded > 0 && <p className="hint">{t.statsAssistedExcluded(overall.assistedExcluded)}</p>}

          <section>
            <h3>{t.statsEvolution}</h3>
            <div className="charts">
              <LineChart
                title={t.chartFirstTry}
                points={evolution.map((point) => ({ label: sessionLabel(point.date), value: point.firstTryRate }))}
                format={percent}
                ticks={[0, 0.5, 1]}
              />
              <LineChart
                title={t.chartRecognition}
                points={evolution.map((point) => ({ label: sessionLabel(point.date), value: point.recognitionMedianMs }))}
                format={seconds}
                ticks={niceTicks(maxMedian)}
              />
            </div>
            <details className="data-table">
              <summary>{t.statsShowData}</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.statsDate}</th>
                      <th>{t.statsLevel}</th>
                      <th className="num">{t.statsNotes}</th>
                      <th className="num">{t.statsFirstTry}</th>
                      <th className="num">{t.statsMedian}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...evolution].reverse().map((point) => (
                      <tr key={point.sessionId}>
                        <td>{sessionLabel(point.date)}</td>
                        <td>{findLevel(point.levelId)?.number ?? '—'}</td>
                        <td className="num">{point.notes}</td>
                        <td className="num">{percent(point.firstTryRate)}</td>
                        <td className="num">
                          {point.recognitionMedianMs === null ? t.notMeasured : seconds(point.recognitionMedianMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section>
            <h3>{t.statsHardest}</h3>
            {hardest.length === 0 ? (
              <p className="hint">{t.statsHardestEmpty}</p>
            ) : (
              <ol className="hardest">
                {hardest.map((note) => (
                  <li key={note.note}>
                    <strong>{noteName(note.note, true)}</strong>
                    <span>
                      {percent(note.firstTryRate)} ·{' '}
                      {note.recognitionMedianMs === null ? t.notMeasured : seconds(note.recognitionMedianMs)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3>{t.statsPerNote}</h3>
            <div className="table-scroll">
              <table className="per-note">
                <thead>
                  <tr>
                    <th>{t.statsNote}</th>
                    <th className="num">{t.statsAttempts}</th>
                    <th>{t.statsFirstTry}</th>
                    <th className="num">{t.statsMedian}</th>
                    <th className="num">{t.statsMean}</th>
                  </tr>
                </thead>
                <tbody>
                  {perNote.map((note) => (
                    <tr key={note.note}>
                      <td>{noteName(note.note, true)}</td>
                      <td className="num">{note.attempts}</td>
                      <td>
                        <span className="bar-cell">
                          <span className="bar-track">
                            <span className="bar-fill" style={{ width: `${note.firstTryRate * 100}%` }} />
                          </span>
                          <span className="num">{percent(note.firstTryRate)}</span>
                        </span>
                      </td>
                      <td className="num">
                        {note.recognitionMedianMs === null ? t.notMeasured : seconds(note.recognitionMedianMs)}
                      </td>
                      <td className="num">
                        {note.recognitionMeanMs === null ? t.notMeasured : seconds(note.recognitionMeanMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section>
        <h3>{t.statsLevels}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.statsLevel}</th>
                <th>{t.statsLevelStatus}</th>
                <th className="num">{t.statsNotes}</th>
              </tr>
            </thead>
            <tbody>
              {progress.map(({ level, progress: levelProgress }) => (
                <tr key={level.id} className={levelProgress.status === 'mastered' ? 'mastered' : ''}>
                  <td>
                    {level.number}. {text(level.title)}
                  </td>
                  <td>{statusLabel[levelProgress.status]}</td>
                  <td className="num">{levelProgress.attemptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {history.attempts.length > 0 && (
        <section className="danger-zone">
          <h3>{t.statsDanger}</h3>
          <p className="hint">{t.statsClearHint(studentName)}</p>
          {confirmClear ? (
            <div className="profile-row confirm">
              <span>{t.statsClearConfirm(studentName)}</span>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void historyService.clear();
                  setConfirmClear(false);
                }}
              >
                {t.statsClear}
              </button>
              <button type="button" autoFocus onClick={() => setConfirmClear(false)}>
                {t.cancel}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)}>
              {t.statsClear}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
