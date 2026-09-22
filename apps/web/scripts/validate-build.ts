import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { parse } from 'node-html-parser'
import { getSiteProfile, isRetiredOpenSourcePath } from '../src/lib/deployment'

const root = resolve(import.meta.dirname, '..')
const site = getSiteProfile()
const dist = resolve(root, site.outputDir)
const githubPages = site.target === 'github-pages'
const projectIds = (await readdir(resolve(root, 'src/content/projects'))).filter(file => file.endsWith('.json')).map(file => file.slice(0, -5))
const expectedFiles = [
  ...['', 'en/'].flatMap(prefix => [
    `${prefix}index.html`,
    ...['projects', 'pricing', 'privacy', 'contributors', 'sponsors'].map(route => `${prefix}${route}/index.html`),
    ...projectIds.map(id => `${prefix}projects/${id}/index.html`),
  ]),
  '404.html',
  'releases.xml',
  'sitemap-index.xml',
  'robots.txt',
  'llms.txt',
  'llms-full.txt',
  'og.png',
  'og.svg',
  ...(githubPages ? ['CNAME', '.nojekyll', '404/index.html'] : []),
]
const retiredDocsHosts = ['tw.icebreaker.top', 'vite.icebreaker.top']
const errors: string[] = []
const openSourceForbiddenCopy = /\bsponsors?(?:ship)?\b|\b(?:donations?|donate|funds?)\b|paid services?|engineering services?|migration and training|cloud[ -]build|business partnerships?|赞助|基金|分账|捐赠|打赏|付费服务|迁移与培训|服务报价|云构建|企业合作|[¥￥$€]\s*\d/i

async function collectHtml(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectHtml(path) : path.endsWith('.html') ? [path] : []
  }))
  return nested.flat()
}

function outputPathForUrl(pathname: string): string {
  if (pathname === '/') {
    return resolve(dist, 'index.html')
  }
  if (pathname === '/404' || pathname === '/404/') {
    return resolve(dist, githubPages ? '404/index.html' : '404.html')
  }
  return pathname.endsWith('/') ? resolve(dist, pathname.slice(1), 'index.html') : resolve(dist, pathname.slice(1))
}

function isOwnUrl(value: string): boolean {
  try {
    return new URL(value).origin === site.origin
  }
  catch {
    return false
  }
}

function hasForbiddenSchema(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenSchema)
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  const node = value as Record<string, unknown>
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  return types.some(type => type === 'Service' || type === 'DonateAction') || Object.values(node).some(hasForbiddenSchema)
}

for (const file of expectedFiles) {
  try {
    await access(resolve(dist, file))
  }
  catch {
    errors.push(`Missing expected build output: ${file}`)
  }
}

if (githubPages) {
  try {
    const cname = (await readFile(resolve(dist, 'CNAME'), 'utf8')).trim()
    if (cname !== new URL(site.origin).hostname) {
      errors.push(`CNAME: expected ${new URL(site.origin).hostname}, received ${cname || '(empty)'}`)
    }
  }
  catch {
    errors.push('CNAME: unable to read Pages hostname')
  }
}
else {
  for (const name of ['CNAME', '.nojekyll']) {
    try {
      await access(resolve(dist, name))
      errors.push(`${name}: Pages deployment file must not appear in the Cloudflare output`)
    }
    catch {
      // The complete site does not publish GitHub Pages control files.
    }
  }
}

const htmlFiles = await collectHtml(dist)
for (const file of htmlFiles) {
  const label = relative(dist, file)
  if (/^baidu_verify_[^/]+\.html$/.test(label)) {
    continue
  }
  const html = await readFile(file, 'utf8')
  const document = parse(html)
  const pagePath = `/${label.replace(/index\.html$/, '')}`
  const canonicalPath = label === '404.html' ? '/404/' : pagePath
  const retiredRedirect = githubPages && isRetiredOpenSourcePath(pagePath)
  const destination = pagePath.startsWith('/en/') ? '/en/projects/' : '/projects/'
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  const expectedCanonical = new URL(retiredRedirect ? destination : canonicalPath, site.origin).href
  const alternates = document.querySelectorAll('link[rel="alternate"][hreflang]')
  const title = document.querySelectorAll('title')
  const descriptions = document.querySelectorAll('meta[name="description"]')
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content')
  const schemas = document.querySelectorAll('script[type="application/ld+json"]')

  if (canonical !== expectedCanonical) {
    errors.push(`${label}: expected canonical ${expectedCanonical}, received ${canonical ?? '(missing)'}`)
  }
  for (const host of retiredDocsHosts) {
    if (html.includes(host)) {
      errors.push(`${label}: contains retired documentation host ${host}`)
    }
  }
  if (title.length !== 1 || !title[0].text.trim()) {
    errors.push(`${label}: missing unique title`)
  }
  if (descriptions.length !== 1 || !descriptions[0].getAttribute('content')?.trim()) {
    errors.push(`${label}: missing unique description`)
  }
  if (!robots) {
    errors.push(`${label}: missing robots directive`)
  }
  if ((retiredRedirect || label === '404.html' || label === '404/index.html' || label === 'en/404/index.html') && !robots?.includes('noindex')) {
    errors.push(`${label}: compatibility redirects and 404 pages must be noindex`)
  }

  if (retiredRedirect) {
    const refresh = document.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content')
    const refreshHref = refresh?.match(/^0\s*;\s*url=(.+)$/i)?.[1]
    if (!refreshHref || /^(?:https?:)?\//.test(refreshHref) || new URL(refreshHref, `${site.origin}${pagePath}`).pathname !== destination) {
      errors.push(`${label}: expected immediate relative redirect to ${destination}`)
    }
    const link = document.querySelector('a[href]')
    const href = link?.getAttribute('href')
    if (!href || !link?.text.trim() || /^(?:https?:)?\//.test(href) || new URL(href, `${site.origin}${pagePath}`).pathname !== destination) {
      errors.push(`${label}: missing visible relative project-index fallback`)
    }
  }
  else {
    if (alternates.length < 3 || alternates.some(link => !isOwnUrl(link.getAttribute('href') ?? ''))) {
      errors.push(`${label}: missing language alternates on this site's origin`)
    }
    for (const property of ['og:url', 'og:image']) {
      const value = document.querySelector(`meta[property="${property}"]`)?.getAttribute('content')
      if (!value || !isOwnUrl(value)) {
        errors.push(`${label}: ${property} must use this site's origin`)
      }
    }
    if (schemas.length === 0) {
      errors.push(`${label}: missing JSON-LD schema`)
    }
  }
  for (const schema of schemas) {
    try {
      const data: unknown = JSON.parse(schema.text)
      if (githubPages && hasForbiddenSchema(data)) {
        errors.push(`${label}: open-source output must not contain Service or DonateAction schema`)
      }
    }
    catch {
      errors.push(`${label}: invalid JSON-LD schema`)
    }
  }

  if (document.text.includes('—') || document.text.includes('–')) {
    errors.push(`${label}: contains a forbidden dash character`)
  }
  if ((githubPages || label === 'index.html' || label === 'en/index.html') && /SponsorGraphs|echarts/.test(html)) {
    errors.push(`${label}: must not load sponsor graph runtime`)
  }
  if (!githubPages && /^(?:en\/)?sponsors\/index\.html$/.test(label)) {
    const runtimeScripts = html.match(/<script[^>]+src="[^"]*SponsorGraphs[^" ]*"/g) ?? []
    if (runtimeScripts.length !== 1) {
      errors.push(`${label}: expected exactly one sponsor graph runtime script`)
    }
  }
  if (githubPages) {
    const published = parse(html)
    published.querySelectorAll('style, script:not([type="application/ld+json"])').forEach(node => node.remove())
    const publishedContent = `${published.text} ${schemas.map(schema => schema.text).join(' ')}`
    if (openSourceForbiddenCopy.test(publishedContent)) {
      errors.push(`${label}: open-source output contains financial or paid-service content`)
    }
  }

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    if (!href || /^(?:mailto:|tel:)/.test(href)) {
      continue
    }
    const targetUrl = new URL(href, `${site.origin}${pagePath}`)
    if (githubPages && ['https://weapp.dev', 'https://weapp.js.org'].includes(targetUrl.origin) && isRetiredOpenSourcePath(targetUrl.pathname)) {
      errors.push(`${label}: normal navigation links to retired financial page ${href}`)
    }
    if (targetUrl.origin !== site.origin) {
      continue
    }
    try {
      const targetPath = outputPathForUrl(targetUrl.pathname)
      await access(targetPath)
      if (targetUrl.hash) {
        const target = parse(await readFile(targetPath, 'utf8'))
        const id = decodeURIComponent(targetUrl.hash.slice(1))
        if (!target.querySelectorAll('[id]').some(node => node.id === id)) {
          errors.push(`${label}: broken internal anchor ${href}`)
        }
      }
    }
    catch {
      errors.push(`${label}: broken internal link ${href}`)
    }
  }
}

const sitemapFiles = (await readdir(dist)).filter(file => /^sitemap.*\.xml$/.test(file))
for (const file of [...sitemapFiles, 'robots.txt', 'llms.txt', 'llms-full.txt', 'releases.xml']) {
  try {
    const contents = await readFile(resolve(dist, file), 'utf8')
    for (const host of retiredDocsHosts) {
      if (contents.includes(host)) {
        errors.push(`${file}: contains retired documentation host ${host}`)
      }
    }
    if (file.startsWith('sitemap')) {
      const urls = [...contents.matchAll(/<loc>([^<]+)<\/loc>|<xhtml:link[^>]*href="([^"]+)"/g)].map(match => match[1] ?? match[2])
      if (urls.length === 0) {
        errors.push(`${file}: sitemap has no URLs`)
      }
      for (const value of urls) {
        const url = new URL(value)
        if (url.origin !== site.origin || /\/404(?:\.html|\/|$)/.test(url.pathname) || (githubPages && isRetiredOpenSourcePath(url.pathname))) {
          errors.push(`${file}: unexpected sitemap URL ${value}`)
        }
        try {
          await access(outputPathForUrl(url.pathname))
        }
        catch {
          errors.push(`${file}: sitemap URL has no output ${value}`)
        }
      }
    }
    if (file === 'robots.txt' && !contents.includes(`Sitemap: ${site.origin}/sitemap-index.xml`)) {
      errors.push(`${file}: sitemap must use this site's origin`)
    }
    if (file === 'releases.xml' && !contents.includes(`<link>${site.origin}/</link>`)) {
      errors.push(`${file}: release channel must use this site's origin`)
    }
    if (file.startsWith('llms')) {
      const otherOrigin = githubPages ? 'https://weapp.dev/' : 'https://weapp.js.org/'
      if (contents.includes(otherOrigin)) {
        errors.push(`${file}: reference pages must use this site's origin`)
      }
      if (githubPages && (openSourceForbiddenCopy.test(contents) || /\/(?:en\/)?(?:pricing|sponsors|contributors)\//.test(contents))) {
        errors.push(`${file}: open-source reference contains financial or paid-service content`)
      }
    }
  }
  catch {
    errors.push(`Unable to validate required SEO output: ${file}`)
  }
}

if (!githubPages) {
  for (const prefix of ['', 'en/']) {
    const home = parse(await readFile(resolve(dist, `${prefix}index.html`), 'utf8'))
    const pricing = parse(await readFile(resolve(dist, `${prefix}pricing/index.html`), 'utf8'))
    const sponsorTiers = pricing.querySelectorAll('.pricing-sponsor-tier h3').map(node => node.text)
    const expectedTiers = prefix ? ['Supporter', 'Bronze sponsor', 'Silver sponsor'] : ['普通支持', '铜牌赞助', '银牌赞助']
    if (JSON.stringify(sponsorTiers.slice(0, 3)) !== JSON.stringify(expectedTiers) || sponsorTiers.length !== 4) {
      errors.push(`${prefix}pricing/: incorrect sponsorship tiers for this target`)
    }
    if (pricing.querySelector('#plans')) {
      errors.push(`${prefix}pricing/: product shelf must not be published`)
    }
    for (const id of ['roadmap', 'cloud-build', 'services', 'support', 'boundary', 'faq']) {
      if (!pricing.querySelector(`#${id}`)) {
        errors.push(`${prefix}pricing/: missing #${id}`)
      }
    }
    if (!home.querySelector('a[href$="#services"]')) {
      errors.push(`${prefix}index.html: missing services entry`)
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
else {
  console.log(`Validated ${site.name}: ${expectedFiles.length} required outputs, ${htmlFiles.length} pages, SEO resources, and all internal links.`)
}
