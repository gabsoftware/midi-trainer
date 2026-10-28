import { useEffect, useState } from 'react';
import type { Locale } from '../i18n/locale';

/** API Keyboard (Chrome, Edge) : pas encore dans les types DOM de TypeScript. */
interface KeyboardLayoutApi {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
}

/** Touches dont la lettre diffère entre QWERTY et AZERTY (les autres sont identiques). */
const AZERTY_LABELS: Readonly<Record<string, string>> = {
  KeyA: 'Q', KeyQ: 'A', KeyW: 'Z', KeyZ: 'W', Semicolon: 'M', Quote: 'Ù', KeyM: ',',
};

function fallbackLabel(code: string, locale: Locale): string {
  if (locale === 'fr' && AZERTY_LABELS[code]) return AZERTY_LABELS[code];
  return code.startsWith('Key') ? code.slice(3) : code;
}

/**
 * Lettre imprimée sur une touche physique (`KeyboardEvent.code`) pour la disposition
 * réelle du clavier. Sans l'API Keyboard, on suppose AZERTY en français et QWERTY en anglais.
 */
export function useKeyLabels(locale: Locale): (code: string) => string {
  const [layout, setLayout] = useState<ReadonlyMap<string, string> | null>(null);

  useEffect(() => {
    const keyboard = (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard;
    if (!keyboard?.getLayoutMap) return;
    let active = true;
    keyboard
      .getLayoutMap()
      .then((map) => active && setLayout(map))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (code) => layout?.get(code)?.toUpperCase() ?? fallbackLabel(code, locale);
}
