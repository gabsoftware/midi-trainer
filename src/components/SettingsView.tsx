import { useI18n } from '../i18n/context';
import { ADVANCE_DELAYS_MS, SESSION_LENGTHS, type Preferences } from '../storage/preferences';
import { PianoKeys } from './PianoKeys';

/** Aperçu : aucune touche enfoncée. */
const NO_KEYS: ReadonlySet<number> = new Set();

interface SettingsViewProps {
  readonly studentName: string;
  readonly preferences: Preferences;
  readonly onChange: (patch: Partial<Preferences>) => void;
}

/** Réglages de l'élève courant, enregistrés à chaque modification. */
export function SettingsView({ studentName, preferences, onChange }: SettingsViewProps) {
  const { t, seconds } = useI18n();
  const delayLabel = (ms: number) => seconds(ms).replace(/[.,]?0+ s$/, ' s');

  return (
    <main className="settings">
      <h2>{t.settingsTitle(studentName)}</h2>
      <p className="hint">{t.settingsSaved}</p>

      <section className="settings-group">
        <h3>{t.settingsSession}</h3>
        <label>
          <span>{t.notesPerSession}</span>
          <select
            value={preferences.notesPerSession}
            onChange={(event) => onChange({ notesPerSession: Number(event.target.value) })}
          >
            {SESSION_LENGTHS.map((count) => (
              <option key={count} value={count}>
                {count === 0 ? t.sessionUnlimited : count}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.trainingMode}</span>
          <select
            value={preferences.timed ? 'timed' : 'training'}
            onChange={(event) => onChange({ timed: event.target.value === 'timed' })}
          >
            <option value="training">{t.modeTraining}</option>
            <option value="timed">{t.modeTimed}</option>
          </select>
        </label>
        <div className="settings-inline">
          <label>
            <input
              type="checkbox"
              checked={preferences.autoAdvance}
              onChange={(event) => onChange({ autoAdvance: event.target.checked })}
            />
            <span>{t.autoAdvance}</span>
          </label>
          {preferences.autoAdvance && (
            <label>
              <span>{t.advanceDelay}</span>
              <select
                value={preferences.advanceDelayMs}
                onChange={(event) => onChange({ advanceDelayMs: Number(event.target.value) })}
              >
                {ADVANCE_DELAYS_MS.map((delay) => (
                  <option key={delay} value={delay}>
                    {delayLabel(delay)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="settings-group">
        <h3>{t.settingsReading}</h3>
        <label>
          <span>{t.octave}</span>
          <select
            value={preferences.octaveMode}
            onChange={(event) => onChange({ octaveMode: event.target.value as Preferences['octaveMode'] })}
          >
            <option value="level">{t.octaveByLevel}</option>
            <option value="any">{t.octaveAny}</option>
            <option value="exact">{t.octaveExact}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.showNoteNames}
            onChange={(event) => onChange({ showNoteNames: event.target.checked })}
          />
          <span>{t.showNoteNames}</span>
        </label>
        <p className="hint">{t.assistedHint}</p>
      </section>

      <section className="settings-group">
        <h3>{t.settingsInput}</h3>
        <label>
          <input
            type="checkbox"
            checked={preferences.computerKeyboard}
            onChange={(event) => onChange({ computerKeyboard: event.target.checked })}
          />
          <span>{t.computerKeyboard}</span>
        </label>
        <label>
          <span>{t.keyboardShape}</span>
          <select
            value={preferences.keyboardShape}
            onChange={(event) => onChange({ keyboardShape: event.target.value as Preferences['keyboardShape'] })}
          >
            <option value="piano">{t.keyboardShapePiano}</option>
            <option value="equal-semitones">{t.keyboardShapeEqual}</option>
          </select>
        </label>
        <p className="hint">{t.keyboardShapeHint}</p>
        <PianoKeys pressed={NO_KEYS} low={60} high={83} shape={preferences.keyboardShape} />
      </section>
    </main>
  );
}
