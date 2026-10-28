/** Origine d'un événement de note : vrai clavier MIDI, clavier d'ordinateur, ou clavier affiché (souris, doigt). */
export type NoteSource = 'midi' | 'computer-keyboard' | 'on-screen';

export interface NoteEvent {
  readonly type: 'noteon' | 'noteoff';
  /** Numéro de note MIDI (0–127), référence interne de toute l'application. */
  readonly note: number;
  readonly velocity: number;
  /** Canal MIDI 0–15 (affiché 1–16). Tous les canaux sont acceptés. */
  readonly channel: number;
  /** Horodatage monotone, même base que `performance.now()`. */
  readonly timestamp: number;
  readonly source: NoteSource;
}

export type NoteListener = (event: NoteEvent) => void;

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;

/**
 * Décode un message MIDI brut. Retourne `null` pour tout ce qui n'est pas
 * un Note On / Note Off valide (contrôleurs, horloge, active sensing, SysEx…).
 * Un Note On de vélocité 0 est traité comme un Note Off.
 */
export function parseMidiMessage(
  data: ArrayLike<number> | null | undefined,
  timestamp: number,
  source: NoteSource = 'midi',
): NoteEvent | null {
  if (!data || data.length < 3) {
    return null;
  }
  const status = data[0];
  const note = data[1];
  const velocity = data[2];
  if (status < 0x80 || note > 0x7f || velocity > 0x7f) {
    return null;
  }
  const command = status & 0xf0;
  const channel = status & 0x0f;
  if (command === NOTE_ON && velocity > 0) {
    return { type: 'noteon', note, velocity, channel, timestamp, source };
  }
  if (command === NOTE_OFF || command === NOTE_ON) {
    return { type: 'noteoff', note, velocity, channel, timestamp, source };
  }
  return null;
}
