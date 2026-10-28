import { useRef, type PointerEvent } from 'react';
import { useI18n } from '../i18n/context';
import type { NoteListener } from '../midi/events';
import { keyboardLayout, type KeyboardShape } from './keyboardLayout';

const WHITE_HEIGHT = 48;
const BLACK_HEIGHT = 30;

interface PianoKeysProps {
  /** Notes actuellement enfoncées (numéros MIDI). */
  readonly pressed: ReadonlySet<number>;
  readonly low?: number;
  readonly high?: number;
  /**
   * Touches jouables à la souris ou au doigt : chaque appui émet un Note On (puis un Note Off),
   * horodaté comme un événement MIDI, donc traité exactement comme un vrai clavier.
   */
  readonly onNote?: NoteListener;
  readonly shape?: KeyboardShape;
}

/**
 * Clavier miniature : indique les touches enfoncées et, si `onNote` est fourni, se joue au clic
 * (C2 à C7 par défaut). Géométrie d'un clavier à demi-tons égaux : voir keyboardLayout.ts.
 */
export function PianoKeys({ pressed, low = 36, high = 96, onNote, shape = 'piano' }: PianoKeysProps) {
  const { t } = useI18n();
  /** Note tenue par chaque pointeur (souris, doigts), pour relâcher la bonne. */
  const held = useRef(new Map<number, number>());

  const press = (event: PointerEvent<SVGSVGElement>) => {
    const note = Number((event.target as Element).getAttribute('data-note'));
    if (!onNote || event.button !== 0 || !Number.isInteger(note) || held.current.has(event.pointerId)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    held.current.set(event.pointerId, note);
    onNote({ type: 'noteon', note, velocity: 96, channel: 0, timestamp: event.timeStamp, source: 'on-screen' });
  };

  const release = (event: PointerEvent<SVGSVGElement>) => {
    const note = held.current.get(event.pointerId);
    if (note === undefined || !onNote) return;
    held.current.delete(event.pointerId);
    onNote({ type: 'noteoff', note, velocity: 0, channel: 0, timestamp: event.timeStamp, source: 'on-screen' });
  };
  const { whites, blacks, width } = keyboardLayout(low, high, shape);
  const outOfRange = [...pressed].some((note) => note < low || note > high);

  return (
    <div className="piano">
      <svg
        viewBox={`0 0 ${width} ${WHITE_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className={onNote ? 'playable' : undefined}
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        {whites.map(({ note, x: left, width: keyWidth }) => (
          <rect
            key={note}
            data-note={note}
            x={left + 0.5}
            y={0.5}
            width={keyWidth - 1}
            height={WHITE_HEIGHT - 1}
            rx={1.5}
            className={pressed.has(note) ? 'key white pressed' : note === 60 ? 'key white middle-c' : 'key white'}
          />
        ))}
        {blacks.map(({ note, x: left, width: keyWidth }) => (
          <rect
            key={note}
            data-note={note}
            x={left}
            y={0}
            width={keyWidth}
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
