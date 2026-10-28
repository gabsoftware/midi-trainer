/** Informations de la page « À propos » : version du build et identité de l'éditeur (facultative). */

/** Seuls les liens web sont acceptés (jamais `javascript:` ou autre schéma). */
export function webUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export interface AboutInfo {
  readonly version: string;
  /** Commit du build, `+` si des modifications n'étaient pas commitées ; vide hors dépôt git. */
  readonly commit: string;
  /** Éditeur ; `null` : pas de mention « Réalisé par ». */
  readonly author: { readonly name: string; readonly url: string | null } | null;
  readonly sourceUrl: string | null;
}

export function aboutInfo(
  env: Pick<ImportMetaEnv, 'VITE_AUTHOR_NAME' | 'VITE_AUTHOR_URL' | 'VITE_SOURCE_URL'>,
  version: string,
  commit: string,
): AboutInfo {
  const name = env.VITE_AUTHOR_NAME?.trim();
  return {
    version,
    commit,
    author: name ? { name, url: webUrl(env.VITE_AUTHOR_URL) } : null,
    sourceUrl: webUrl(env.VITE_SOURCE_URL),
  };
}

export const ABOUT = aboutInfo(import.meta.env, __APP_VERSION__, __APP_COMMIT__);

export const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';
