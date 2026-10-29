import { useCallback, useSyncExternalStore } from 'react';

/** Téléphone, en portrait ou en paysage : mêmes seuils que la mise en page « téléphone » de index.css. */
export const PHONE_SCREEN = '(max-width: 700px), (max-height: 500px)';

/** Vrai tant que la requête média (`(max-width: 700px)`…) correspond à l'écran. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
