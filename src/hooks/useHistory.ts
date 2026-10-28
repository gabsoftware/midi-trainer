import { useEffect, useSyncExternalStore } from 'react';
import { HistoryService, type HistorySnapshot } from '../storage/HistoryService';
import { IndexedDbHistoryStore } from '../storage/historyStore';

/** Instance unique ; repli en mémoire si IndexedDB est indisponible (navigation privée stricte…). */
export const historyService = new HistoryService(
  typeof indexedDB === 'undefined' ? null : new IndexedDbHistoryStore(indexedDB),
);

export function useHistory(): HistorySnapshot {
  const snapshot = useSyncExternalStore(historyService.subscribe, historyService.getSnapshot);
  useEffect(() => {
    void historyService.load();
  }, []);
  return snapshot;
}
