export type Locale = 'fr' | 'en';

export const LOCALES: readonly Locale[] = ['fr', 'en'];

/** Texte présent dans toutes les langues de l'interface (utilisé dans les données de configuration). */
export type LocalizedText = Readonly<Record<Locale, string>>;

export function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en';
}

/** Langue par défaut : celle du navigateur si elle est prise en charge, sinon le français. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'fr';
}
