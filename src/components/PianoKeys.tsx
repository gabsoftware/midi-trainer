import { useI18n } from '../i18n/context';
import { pitchClass } from '../music/pitch';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const WHITE_WIDTH = 12;
const WHITE_HEIGHT = 48;
const BLACK_WIDTH = 8;
const BLACK_HEIGHT = 30;

interface PianoKeysProps {
  /** Notes actuellement enfoncées (numéros MIDI). */
  readonly pressed: ReadonlySet<number>;
  readonly low?: number;
  readonly high?: number;
}

/** Clavier miniature indiquant les touches enfoncées (C2 à C7 par défaut, 61 touches). */
export function PianoKeys({ pressed, low = 36, high = 96 }: PianoKeysProps) {
  const { t } = useI18n();
  const whites: { note: number; x: number }[] = [];
  const blacks: { note: number; x: number }[] = [];
  let x = 0;
  for (let note = low; note <= high; note++) {
    if (BLACK_PITCH_CLASSES.has(pitchClass(note))) {
      blacks.push({ note, x: x - BLACK_WIDTH / 2 });
    } else {
      whites.push({ note, x });
      x += WHITE_WIDTH;
    }
  }
  const outOfRange = [...pressed].some((note) => note < low || note > high);

  return (
    <div className="piano">
      <svg viewBox={`0 0 ${x} ${WHITE_HEIGHT}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {whites.map(({ note, x: left }) => (
          <rect
            key={note}
            x={left + 0.5}
            y={0.5}
            width={WHITE_WIDTH - 1}
            height={WHITE_HEIGHT - 1}
            rx={1.5}
            className={pressed.has(note) ? 'key white pressed' : note === 60 ? 'key white middle-c' : 'key white'}
          />
        ))}
        {blacks.map(({ note, x: left }) => (
          <rect
            key={note}
            x={left}
            y={0}
            width={BLACK_WIDTH}
            height={BLACK_HEIGHT}
            rx={1}
            className={pressed.has(note) ? 'key black pressed' : 'key black'}
          />
        ))}
      </svg>
      {outOfRange && <span className="piano-note">{t.keyOutOfRange}</span>}
    </div>
  );
}
