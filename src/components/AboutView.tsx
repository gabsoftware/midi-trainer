import { ABOUT, GPL_URL } from '../about';
import { useI18n } from '../i18n/context';

function ExternalLink({ href, children }: { readonly href: string; readonly children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Version courante, éditeur (s'il est configuré), licence et composants tiers. */
export function AboutView({ onBack }: { readonly onBack: () => void }) {
  const { t } = useI18n();
  const { version, commit, author, sourceUrl } = ABOUT;

  return (
    <main className="about">
      <h2>{t.aboutTitle(t.appTitle)}</h2>
      <p className="about-version">
        {t.aboutVersion(version)}
        {commit && <span className="hint"> · {t.aboutCommit(commit)}</span>}
      </p>
      <p>{t.aboutDescription}</p>
      {author && (
        <p>
          {t.madeBy} {author.url ? <ExternalLink href={author.url}>{author.name}</ExternalLink> : author.name}
        </p>
      )}
      <p>{t.aboutPrivacy}</p>

      <h3>{t.aboutLicenseTitle}</h3>
      <p>
        {t.aboutLicense} <ExternalLink href={GPL_URL}>GNU GPL v3</ExternalLink>
        {sourceUrl && (
          <>
            {' · '}
            <ExternalLink href={sourceUrl}>{t.aboutSource}</ExternalLink>
          </>
        )}
      </p>
      <p className="hint">{t.aboutCredits}</p>

      <button type="button" onClick={onBack}>
        {t.back}
      </button>
    </main>
  );
}

/** Pied de page : version, éditeur et lien vers « À propos ». */
export function AppFooter({ onAbout }: { readonly onAbout: () => void }) {
  const { t } = useI18n();
  const { version, author } = ABOUT;
  return (
    <footer className="app-footer">
      <span>{t.aboutVersion(version)}</span>
      {author && (
        <span>
          {t.madeBy} {author.url ? <ExternalLink href={author.url}>{author.name}</ExternalLink> : author.name}
        </span>
      )}
      <button type="button" className="link-button" onClick={onAbout}>
        {t.aboutLink}
      </button>
    </footer>
  );
}
