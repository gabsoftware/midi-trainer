/** Version de package.json et commit du build, injectés par vite.config.ts. */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/**
 * Identité de l'éditeur, lue dans `.env.local` (ignoré par git, voir `.env.example`) :
 * le code ne contient aucune marque. Toutes facultatives.
 */
interface ImportMetaEnv {
  readonly VITE_AUTHOR_NAME?: string;
  readonly VITE_AUTHOR_URL?: string;
  readonly VITE_SOURCE_URL?: string;
}
