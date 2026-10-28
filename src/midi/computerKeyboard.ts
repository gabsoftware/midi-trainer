import type { NoteListener } from './events';

/**
 * Simulation d'un clavier MIDI avec le clavier de l'ordinateur.
 *
 * On utilise `KeyboardEvent.code` (position physique de la touche), donc la
 * disposition est la même en AZERTY et en QWERTY :
 *
 *   rangée du haut :   W E   T Y U   O P      (touches noires, en QWERTY)
 *   rangée du milieu : A S D F G H J K L ; '  (touches blanches Do → Fa)
 *
 * En AZERTY, la rangée du milieu commence par Q (Q S D F G H J K L M ù).
 * Z / X (W / X en AZERTY) décalent d'une octave vers le bas / le haut.
 */
const SEMITONE_BY_CODE: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
  KeyP: 15, Semicolon: 16, Quote: 17,
};

export const DEFAULT_BASE_NOTE = 60; // Do4, do central
const MIN_BASE_NOTE = 24;
const MAX_BASE_NOTE = 96;

/** Note MIDI produite par une touche, ou `null` si la touche n'est pas une touche de piano. */
export function codeToMidi(code: string, baseNote: number): number | null {
  const semitone = SEMITONE_BY_CODE[code];
  return semitone === undefined ? null : baseNote + semitone;
}

export function shiftBaseNote(baseNote: number, octaves: number): number {
  return Math.min(MAX_BASE_NOTE, Math.max(MIN_BASE_NOTE, baseNote + octaves * 12));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface ComputerKeyboardSource {
  getBaseNote(): number;
  dispose(): void;
}

/**
 * Écoute le clavier de l'ordinateur et émet des événements de note identiques
 * à ceux d'un vrai clavier MIDI (même type, même horloge).
 */
export function attachComputerKeyboard(
  target: Window,
  emit: NoteListener,
  onBaseNoteChange?: (baseNote: number) => void,
): ComputerKeyboardSource {
  let baseNote = DEFAULT_BASE_NOTE;
  // Mémorise la note émise par chaque touche, pour relâcher la bonne note
  // même si l'octave a changé entre l'appui et le relâchement.
  const held = new Map<string, number>();

  const release = (code: string, timestamp: number) => {
    const note = held.get(code);
    if (note === undefined) return;
    held.delete(code);
    emit({ type: 'noteoff', note, velocity: 0, channel: 0, timestamp, source: 'computer-keyboard' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
      return;
    }
    if (event.code === 'KeyZ' || event.code === 'KeyX') {
      baseNote = shiftBaseNote(baseNote, event.code === 'KeyZ' ? -1 : 1);
      onBaseNoteChange?.(baseNote);
      event.preventDefault();
      return;
    }
    const note = codeToMidi(event.code, baseNote);
    if (note === null || held.has(event.code)) return;
    event.preventDefault();
    held.set(event.code, note);
    emit({ type: 'noteon', note, velocity: 96, channel: 0, timestamp: event.timeStamp, source: 'computer-keyboard' });
  };

  const onKeyUp = (event: KeyboardEvent) => release(event.code, event.timeStamp);

  // Si la fenêtre perd le focus, les keyup ne nous parviendront pas.
  const onBlur = () => {
    for (const code of [...held.keys()]) release(code, performance.now());
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    getBaseNote: () => baseNote,
    dispose() {
      onBlur();
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
