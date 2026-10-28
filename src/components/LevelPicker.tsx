import { useI18n } from '../i18n/context';
import type { LevelDefinition } from '../learning/levels';
import type { LevelProgress } from '../learning/mastery';

interface LevelPickerProps {
  readonly levels: readonly LevelDefinition[];
  readonly progress: ReadonlyMap<string, LevelProgress>;
  readonly selected: LevelDefinition;
  readonly recommendedId: string;
  readonly onSelect: (levelId: string) => void;
}

export function LevelPicker({ levels, progress, selected, recommendedId, onSelect }: LevelPickerProps) {
  const { t, text, percent, seconds } = useI18n();

  const statusLabel = (level: LevelDefinition): string => {
    if (!level.available) return t.statusUnavailable;
    const status = progress.get(level.id)?.status ?? 'new';
    const label = { mastered: t.statusMastered, learning: t.statusLearning, new: t.statusNew }[status];
    return level.id === recommendedId ? `${label}, ${t.recommended}` : label;
  };

  const current = progress.get(selected.id);

  return (
    <section className="level-picker">
      <label className="level-select">
        <span>{t.level}</span>
        <select
          value={selected.id}
          onChange={(event) => {
            onSelect(event.target.value);
            event.target.blur(); // rend la main aux raccourcis clavier
          }}
        >
          {levels.map((level) => (
            <option key={level.id} value={level.id} disabled={!level.available}>
              {level.number}. {text(level.title)} ({statusLabel(level)})
            </option>
          ))}
        </select>
      </label>
      <p className="level-description">
        {t.clef[selected.clef]} · {text(selected.description)}
      </p>

      {current && (
        <div className="level-progress">
          <h3>{t.progressTitle}</h3>
          <ul>
            <li className={current.volume.met ? 'met' : ''}>
              {t.criterionVolume(current.volume.current, current.volume.target)}
            </li>
            <li className={current.accuracy.met ? 'met' : ''}>
              {t.criterionAccuracy(
                current.accuracy.current === null ? t.notMeasured : percent(current.accuracy.current),
                percent(current.accuracy.target ?? 0),
              )}
            </li>
            <li className={current.speed.met ? 'met' : ''}>
              {t.criterionSpeed(
                current.speed.current === null ? t.notMeasured : seconds(current.speed.current),
                seconds(current.speed.target ?? 0),
              )}
            </li>
            <li className={current.regularity.met ? 'met' : ''}>
              {t.criterionRegularity(
                current.regularity.sessions,
                current.regularity.targetSessions,
                current.regularity.days,
                current.regularity.targetDays,
              )}
            </li>
            <li className={current.fastTrack.met ? 'met' : ''}>
              {t.criterionFastTrack(percent(current.fastTrack.accuracyTarget), seconds(current.fastTrack.speedTargetMs))}
            </li>
          </ul>
          {current.status !== 'mastered' &&
            current.volume.met &&
            current.accuracy.met &&
            current.speed.met &&
            !current.regularity.met && <p className="hint">{t.onlyRegularityMissing}</p>}
        </div>
      )}
    </section>
  );
}
