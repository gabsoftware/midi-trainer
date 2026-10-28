import { createContext, useContext } from 'react';
import { midiToPitch, pitchName } from '../music/pitch';
import type { Locale, LocalizedText } from './locale';
import { formatPercent, formatSeconds, MESSAGES, type Messages } from './messages';

export interface I18n {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Messages;
  /** Texte de configuration (niveaux…) dans la langue courante. */
  readonly text: (value: LocalizedText) => string;
  readonly noteName: (midi: number, withOctave?: boolean) => string;
  readonly seconds: (ms: number) => string;
  readonly percent: (ratio: number) => string;
}

export function createI18n(locale: Locale, setLocale: (locale: Locale) => void): I18n {
  return {
    locale,
    setLocale,
    t: MESSAGES[locale],
    text: (value) => value[locale],
    noteName: (midi, withOctave = false) => pitchName(midiToPitch(midi), locale, { withOctave }),
    seconds: (ms) => formatSeconds(ms, locale),
    percent: (ratio) => formatPercent(ratio, locale),
  };
}

export const I18nContext = createContext<I18n>(createI18n('fr', () => undefined));

export function useI18n(): I18n {
  return useContext(I18nContext);
}
