import { useCallback, useSyncExternalStore, type MouseEvent } from 'react';

/**
 * Pages de l'application, chacune avec son adresse (`/eleves`…) : le bouton « retour » du
 * navigateur fonctionne et une page peut être mise en favori. Le serveur répond index.html
 * pour ces adresses (voir la configuration du serveur web dans le README).
 */
export type Page = 'home' | 'students' | 'practice' | 'stats' | 'settings' | 'about';

const PATHS: Readonly<Record<Page, string>> = {
  home: '',
  students: 'eleves',
  practice: 'entrainement',
  stats: 'statistiques',
  settings: 'reglages',
  about: 'a-propos',
};

export function pathFor(page: Page, base = '/'): string {
  return `${base}${PATHS[page]}`;
}

/** Page d'une adresse ; adresse inconnue ou vide : accueil. */
export function pageFromPath(pathname: string, base = '/'): Page {
  const path = (pathname.startsWith(base) ? pathname.slice(base.length) : pathname).replace(/^\/+|\/+$/g, '');
  const entry = Object.entries(PATHS).find(([, value]) => value === path);
  return (entry?.[0] as Page | undefined) ?? 'home';
}

const BASE = import.meta.env.BASE_URL;
/** Navigation interne : `pushState` ne déclenche aucun événement, on prévient les abonnés nous-mêmes. */
const NAVIGATE_EVENT = 'midi-trainer:navigate';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function currentPage(): Page {
  return pageFromPath(window.location.pathname, BASE);
}

/** Va sur une page (ajoutée à l'historique du navigateur). */
export function navigate(page: Page): void {
  if (currentPage() !== page) {
    window.history.pushState(null, '', pathFor(page, BASE));
    window.dispatchEvent(new Event(NAVIGATE_EVENT));
  }
  window.scrollTo(0, 0);
}

/**
 * Lien vers une page : vrai lien (nouvel onglet possible au clic du milieu ou avec Ctrl),
 * mais un clic simple change de page sans recharger l'application.
 */
export function linkProps(page: Page): { href: string; onClick: (event: MouseEvent<HTMLAnchorElement>) => void } {
  return {
    href: pathFor(page, BASE),
    onClick: (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(page);
    },
  };
}

/** Page courante, et navigation. */
export function usePage(): readonly [Page, (page: Page) => void] {
  const page = useSyncExternalStore(subscribe, currentPage);
  return [page, useCallback((target: Page) => navigate(target), [])];
}
