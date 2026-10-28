import { useRef, type PointerEvent } from 'react';
import { useI18n } from '../i18n/context';
import type { NoteListener } from '../midi/events';
import { pitchClass } from '../music/pitch';

const WHITE_WIDTH = 12;
const WHITE_HEIGHT = 48;
const BLACK_WIDTH = 8;
const BLACK_HEIGHT = 30;

/**
 * Position des touches noires, comme sur un vrai clavier : dans chaque groupe de touches
 * blanches (Do–Mi : 3 blanches, 2 noires ; Fa–Si : 4 blanches, 3 noires), les touches noires
 * sont régulièrement espacées, avec des intervalles égaux entre elles et jusqu'aux bords du
 * groupe. Résultat : Do♯ et Fa♯ penchent à gauche, Ré♯ et La♯ à droite, seul Sol♯ est centré.
 *
 * Valeur : décalage du bord gauche de la touche noire par rapport au début de son groupe.
 */
function blackKeyLeftInGroup(whitesInGroup: number, blacksInGroup: number, index: number): number {
  const gap = (whitesInGroup * WHITE_WIDTH - blacksInGroup * BLACK_WIDTH) / (blacksInGroup + 1);
  return gap * (index + 1) + BLACK_WIDTH * index;
}

/** Pour chaque touche noire (classe de hauteur) : touches blanches avant son groupe, et position dans le groupe. */
const BLACK_KEYS: ReadonlyMap<number, { readonly groupStart: number; readonly left: number }> = new Map([
  [1, { groupStart: 0, left: blackKeyLeftInGroup(3, 2, 0) }],
  [3, { groupStart: 0, left: blackKeyLeftInGroup(3, 2, 1) }],
  [6, { groupStart: 3, left: blackKeyLeftInGroup(4, 3, 0) }],
  [8, { groupStart: 3, left: blackKeyLeftInGroup(4, 3, 1) }],
  [10, { groupStart: 3, left: blackKeyLeftInGroup(4, 3, 2) }],
]);

/** Nombre de touches blanches entre le Do de l'octave et la note (exclue). */
const WHITES_BEFORE = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

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
}

/** Clavier miniature : indique les touches enfoncées et, si `onNote` est fourni, se joue au clic (C2 à C7 par défaut). */
export function PianoKeys({ pressed, low = 36, high = 96, onNote }: PianoKeysProps) {
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
  const whites: { note: number; x: number }[] = [];
  const blacks: { note: number; x: number }[] = [];
  let x = 0;
  for (let note = low; note <= high; note++) {
    const black = BLACK_KEYS.get(pitchClass(note));
    if (black) {
      // x est la jonction qui suit la touche blanche précédente : on remonte au début de l'octave.
      const octaveStart = x - WHITES_BEFORE[pitchClass(note)] * WHITE_WIDTH;
      blacks.push({ note, x: octaveStart + black.groupStart * WHITE_WIDTH + black.left });
    } else {
      whites.push({ note, x });
      x += WHITE_WIDTH;
    }
  }
  const outOfRange = [...pressed].some((note) => note < low || note > high);

  return (
    <div className="piano">
      <svg
        viewBox={`0 0 ${x} ${WHITE_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className={onNote ? 'playable' : undefined}
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        {whites.map(({ note, x: left }) => (
          <rect
            key={note}
            data-note={note}
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
            data-note={note}
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
