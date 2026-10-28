import { useEffect, useSyncExternalStore } from 'react';
import { HistoryService, type HistorySnapshot } from '../storage/HistoryService';
import { IndexedDbHistoryStore } from '../storage/historyStore';

const PROFILE_STORAGE_KEY = 'midi-trainer:profile';

/** Instance unique ; repli en mémoire si IndexedDB est indisponible (navigation privée stricte…). */
export const historyService = new HistoryService(
  typeof indexedDB === 'undefined' ? null : new IndexedDbHistoryStore(indexedDB),
);

function readStoredProfileId(): string | null {
  try {
    return localStorage.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Élèves et historique de l'élève courant ; mémorise le dernier élève choisi sur cet appareil. */
export function useHistory(): HistorySnapshot {
  const snapshot = useSyncExternalStore(historyService.subscribe, historyService.getSnapshot);

  useEffect(() => {
    void historyService.load(readStoredProfileId());
  }, []);

  useEffect(() => {
    if (!snapshot.profileId) return;
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, snapshot.profileId);
    } catch {
      // choix non mémorisé, sans conséquence
    }
  }, [snapshot.profileId]);

  return snapshot;
}
