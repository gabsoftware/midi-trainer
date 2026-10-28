import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { attachComputerKeyboard, DEFAULT_BASE_NOTE } from '../midi/computerKeyboard';
import type { NoteListener } from '../midi/events';
import { MidiInputManager, type MidiSnapshot } from '../midi/MidiInputManager';

const DEVICE_STORAGE_KEY = 'midi-trainer:device';

/** Instance unique pour toute l'application (survit aux doubles montages de StrictMode). */
export const midiManager = new MidiInputManager();

function readStoredDevice(): { id?: string; name?: string } {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? '{}') as { id?: string; name?: string };
  } catch {
    return {};
  }
}

/** État MIDI courant ; démarre l'accès au premier appel et mémorise le périphérique choisi. */
export function useMidi(): MidiSnapshot {
  const snapshot = useSyncExternalStore(midiManager.subscribe, midiManager.getSnapshot);

  useEffect(() => {
    void midiManager.init(readStoredDevice());
  }, []);

  useEffect(() => {
    if (snapshot.selectedId && snapshot.selectedName) {
      localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ id: snapshot.selectedId, name: snapshot.selectedName }));
    }
  }, [snapshot.selectedId, snapshot.selectedName]);

  return snapshot;
}

/**
 * Abonne `listener` aux notes du clavier MIDI et, si demandé, du clavier
 * d'ordinateur. Les deux sources produisent exactement le même type d'événement.
 * Retourne la note de base (Do) de la simulation au clavier d'ordinateur.
 */
export function useNoteEvents(listener: NoteListener, computerKeyboard: boolean): number {
  const listenerRef = useRef(listener);
  const [baseNote, setBaseNote] = useState(DEFAULT_BASE_NOTE);

  useEffect(() => {
    listenerRef.current = listener;
  });

  useEffect(() => midiManager.onNote((event) => listenerRef.current(event)), []);

  useEffect(() => {
    if (!computerKeyboard) return;
    const source = attachComputerKeyboard(window, (event) => listenerRef.current(event), setBaseNote);
    return () => source.dispose();
  }, [computerKeyboard]);

  return baseNote;
}
