import { describe, expect, it } from 'vitest';
import { aboutInfo, webUrl } from './about';

describe('webUrl', () => {
  it('accepte les liens web', () => {
    expect(webUrl('https://example.com')).toBe('https://example.com/');
    expect(webUrl(' http://example.com/page ')).toBe('http://example.com/page');
  });

  it('refuse tout autre schéma et les valeurs invalides', () => {
    expect(webUrl('javascript:alert(1)')).toBeNull();
    expect(webUrl('data:text/html,x')).toBeNull();
    expect(webUrl('example.com')).toBeNull();
    expect(webUrl('')).toBeNull();
    expect(webUrl(undefined)).toBeNull();
  });
});

describe('aboutInfo', () => {
  it('sans configuration, n’affiche aucun éditeur', () => {
    expect(aboutInfo({}, '1.0.0', 'abc1234')).toEqual({
      version: '1.0.0',
      commit: 'abc1234',
      author: null,
      sourceUrl: null,
    });
  });

  it('reprend l’éditeur et ses liens', () => {
    const info = aboutInfo(
      { VITE_AUTHOR_NAME: ' Éditeur ', VITE_AUTHOR_URL: 'https://editeur.example', VITE_SOURCE_URL: 'https://code.example/app' },
      '1.0.0',
      '',
    );
    expect(info.author).toEqual({ name: 'Éditeur', url: 'https://editeur.example/' });
    expect(info.sourceUrl).toBe('https://code.example/app');
  });

  it('garde le nom même si le lien est invalide', () => {
    expect(aboutInfo({ VITE_AUTHOR_NAME: 'Éditeur', VITE_AUTHOR_URL: 'javascript:x' }, '1.0.0', '').author).toEqual({
      name: 'Éditeur',
      url: null,
    });
  });
});
