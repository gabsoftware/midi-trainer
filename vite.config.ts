import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/** Commit du build (affiché dans « À propos »), suivi de `+` s'il y a des modifications non commitées. */
function buildCommit(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== ''
    return dirty ? `${hash}+` : hash
  } catch {
    return '' // pas de dépôt git (archive téléchargée…)
  }
}

/** Adresse web valide (http ou https), terminée par `/` ; sinon `null`. */
function siteUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.href.endsWith('/') ? url.href : `${url.href}/`
  } catch {
    return null
  }
}

/**
 * Référencement. Les balises fixes (titre, description, aperçu de partage) sont dans index.html ;
 * ce qui dépend de l'adresse du site ou de l'éditeur vient de `.env.local` (VITE_SITE_URL,
 * VITE_AUTHOR_NAME, VITE_AUTHOR_URL), pour qu'aucun domaine ni aucune marque ne soit dans le code :
 * adresse canonique, og:url et og:image (adresses absolues), données structurées schema.org,
 * robots.txt et sitemap.xml.
 */
function seo(env: Record<string, string>): Plugin {
  const site = siteUrl(env.VITE_SITE_URL)
  const authorName = env.VITE_AUTHOR_NAME?.trim()
  const authorUrl = siteUrl(env.VITE_AUTHOR_URL)
  return {
    name: 'midi-trainer-seo',
    transformIndexHtml() {
      const tags: HtmlTagDescriptor[] = []
      if (site) {
        tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: site }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: site }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image', content: `${site}og-image.png` }, injectTo: 'head' },
        )
      }
      if (authorName) tags.push({ tag: 'meta', attrs: { name: 'author', content: authorName }, injectTo: 'head' })
      const data = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Apprendre à lire les notes',
        alternateName: 'Learn to Read Music',
        description:
          'Apprendre à lire les notes sur la portée, pas à pas, en jouant chaque note sur un clavier : 10 niveaux, examens de validation, statistiques, plusieurs élèves.',
        educationalUse: 'practice',
        learningResourceType: 'exercise',
        teaches: 'Lecture de notes sur la portée (clé de sol, clé de fa, grand système)',
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        browserRequirements: 'Chrome, Edge ou Firefox ; Web MIDI pour un clavier MIDI',
        inLanguage: ['fr', 'en'],
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        license: 'https://www.gnu.org/licenses/gpl-3.0.html',
        softwareVersion: version,
        ...(site && { url: site, image: `${site}og-image.png` }),
        ...(authorName && { author: { '@type': 'Organization', name: authorName, ...(authorUrl && { url: authorUrl }) } }),
      }
      // Bloc de données, jamais exécuté : non concerné par la politique de sécurité des scripts.
      tags.push({
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        children: JSON.stringify(data).replaceAll('<', '\\u003c'),
        injectTo: 'head',
      })
      return tags
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...(site ? [`Sitemap: ${site}sitemap.xml`] : [])].join('\n')
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots}\n` })
      if (site) {
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}</loc></url>\n</urlset>\n`
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), seo(env)],
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_COMMIT__: JSON.stringify(buildCommit()),
    },
    build: {
      // VexFlow embarque la police musicale Bravura (~800 ko) : normal pour une appli locale.
      chunkSizeWarningLimit: 1200,
    },
  }
})
