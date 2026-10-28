import { describe, expect, it } from 'vitest';
import { LEVELS } from '../learning/levels';
import { detectLocale, LOCALES } from './locale';
import { formatPercent, formatSeconds, MESSAGES } from './messages';

describe('detectLocale', () => {
  it('reprend la première langue prise en charge du navigateur', () => {
    expect(detectLocale(['fr-FR', 'en-US'])).toBe('fr');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['de-DE', 'en-US'])).toBe('en');
  });

  it('se rabat sur le français', () => {
    expect(detectLocale(['de-DE'])).toBe('fr');
    expect(detectLocale([])).toBe('fr');
  });
});

describe('traductions', () => {
  it('ont les mêmes clés dans toutes les langues', () => {
    const keys = (locale: keyof typeof MESSAGES) => Object.keys(MESSAGES[locale]).sort();
    expect(keys('en')).toEqual(keys('fr'));
  });

  it('ne laissent aucun texte vide', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        if (typeof value === 'string') expect(value, `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('accordent le pluriel', () => {
    expect(MESSAGES.fr.sessionNotes(1)).toBe('1 note');
    expect(MESSAGES.fr.sessionNotes(2)).toBe('2 notes');
    expect(MESSAGES.en.errorCount(1)).toBe('1 error');
    expect(MESSAGES.en.errorCount(3)).toBe('3 errors');
  });

  it('traduisent chaque niveau', () => {
    for (const level of LEVELS) {
      for (const locale of LOCALES) {
        expect(level.title[locale], `${level.id}.title.${locale}`).not.toBe('');
        expect(level.description[locale], `${level.id}.description.${locale}`).not.toBe('');
      }
    }
  });
});

describe('formats', () => {
  it('suivent les conventions de chaque langue', () => {
    expect(formatSeconds(1234, 'fr')).toBe('1,23 s');
    expect(formatSeconds(1234, 'en')).toBe('1.23 s');
    expect(formatPercent(0.9, 'en')).toBe('90%');
    expect(formatPercent(0.9, 'fr')).toMatch(/^90\s%$/);
  });
});
