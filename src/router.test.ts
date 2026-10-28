import { describe, expect, it } from 'vitest';
import { pageFromPath, pathFor, type Page } from './router';

describe('router', () => {
  it('fait l’aller-retour entre page et adresse pour chaque page', () => {
    for (const page of ['home', 'students', 'practice', 'stats', 'settings', 'about'] as Page[]) {
      expect(pageFromPath(pathFor(page))).toBe(page);
      expect(pageFromPath(pathFor(page, '/app/'), '/app/')).toBe(page);
    }
  });

  it('donne des adresses lisibles', () => {
    expect(pathFor('home')).toBe('/');
    expect(pathFor('students')).toBe('/eleves');
    expect(pathFor('practice', '/app/')).toBe('/app/entrainement');
  });

  it('ramène à l’accueil une adresse vide ou inconnue', () => {
    expect(pageFromPath('/')).toBe('home');
    expect(pageFromPath('')).toBe('home');
    expect(pageFromPath('/nimporte-quoi')).toBe('home');
  });

  it('tolère une barre oblique finale', () => {
    expect(pageFromPath('/eleves/')).toBe('students');
  });
});
