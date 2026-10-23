import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { projectsDirectory } from '@weapp-io/project-catalog/paths'
import { parse } from 'node-html-parser'
import { getBuildChannel } from '../src/lib/build-channel'
import { getSiteProfile } from '../src/lib/deployment'

const root = resolve(import.meta.dirname, '..')
const site = getSiteProfile()
const channel = getBuildChannel()
const preview = channel === 'preview'
const dist = resolve(root, site.outputDir)
const projectIds = (await readdir(projectsDirectory)).filter(file => file.endsWith('.json')).map(file => file.slice(0, -5))
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
  'bimi/logo.svg',
  ...(preview ? ['_headers'] : []),
]
const retiredDocsHosts = ['tw.icebreaker.top', 'vite.icebreaker.top']
const errors: string[] = []

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
    return resolve(dist, '404.html')
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

for (const file of expectedFiles) {
  try {
    await access(resolve(dist, file))
  }
  catch {
    errors.push(`Missing expected build output: ${file}`)
  }
}

for (const name of ['CNAME', '.nojekyll', '.well-known/bimi', ...(preview ? [] : ['_headers'])]) {
  try {
    await access(resolve(dist, name))
    errors.push(`Forbidden build output: ${name}`)
  }
  catch {
    // The complete site does not publish legacy BIMI paths or Pages control files.
  }
}

if (preview) {
  const headers = await readFile(resolve(dist, '_headers'), 'utf8').catch(() => '')
  if (!/^\/\*\n\s+X-Robots-Tag: noindex, nofollow\n$/i.test(headers)) {
    errors.push('_headers: preview responses must disallow indexing for every path')
  }
}

const cssFiles = (await readdir(dist, { recursive: true })).filter(file => file.endsWith('.css'))
for (const file of cssFiles) {
  const css = await readFile(resolve(dist, file), 'utf8')
  const executableCss = css
    .replace(/\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, '')
    .replace(/\burl\((?:\\[\s\S]|[^\\)])*\)/gi, '')
  const directives = [...new Set([...executableCss.matchAll(/(?<![\\\w-])@(?:theme|apply|source|tailwind|custom-variant|utility|variant|config|plugin|reference)(?![\w-])/gi)].map(match => match[0]))]
  if (directives.length > 0) {
    errors.push(`${file}: contains uncompiled Tailwind CSS directives: ${directives.join(', ')}`)
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
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  const expectedCanonical = new URL(canonicalPath, site.origin).href
  const alternates = document.querySelectorAll('link[rel="alternate"][hreflang]')
  const title = document.querySelectorAll('title')
  const descriptions = document.querySelectorAll('meta[name="description"]')
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content')
  const schemas = document.querySelectorAll('script[type="application/ld+json"]')

  if (document.querySelector('html')?.getAttribute('data-site-channel') !== channel) {
    errors.push(`${label}: build channel must be ${channel}`)
  }
  const notice = document.querySelector('[data-preview-notice]')
  const expectsNotice = preview
  if (expectsNotice) {
    const message = pagePath.startsWith('/en/') ? 'Preview version. Content may change.' : '预览版本，内容可能更新。'
    if (!notice?.text.includes(message) || notice.querySelector('a')?.getAttribute('href') !== expectedCanonical) {
      errors.push(`${label}: missing localized preview notice and production link`)
    }
  }
  else if (notice) {
    errors.push(`${label}: unexpected preview notice`)
  }

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
  if (preview && robots !== 'noindex, follow') {
    errors.push(`${label}: preview pages must be noindex`)
  }
  else if (!preview && !['404.html', '404/index.html', 'en/404/index.html'].includes(label) && robots !== 'index, follow') {
    errors.push(`${label}: stable content pages must remain indexable`)
  }
  if ((label === '404.html' || label === '404/index.html' || label === 'en/404/index.html') && !robots?.includes('noindex')) {
    errors.push(`${label}: 404 pages must be noindex`)
  }

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
  for (const schema of schemas) {
    try {
      JSON.parse(schema.text)
    }
    catch {
      errors.push(`${label}: invalid JSON-LD schema`)
    }
  }

  if (document.text.includes('—') || document.text.includes('–')) {
    errors.push(`${label}: contains a forbidden dash character`)
  }
  if ((label === 'index.html' || label === 'en/index.html') && /SponsorGraphs|echarts/.test(html)) {
    errors.push(`${label}: must not load sponsor graph runtime`)
  }
  if (/^(?:en\/)?sponsors\/index\.html$/.test(label)) {
    const runtimeScripts = html.match(/<script[^>]+src="[^"]*SponsorGraphs[^" ]*"/g) ?? []
    if (runtimeScripts.length !== 1) {
      errors.push(`${label}: expected exactly one sponsor graph runtime script`)
    }
  }

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    if (!href || /^(?:mailto:|tel:)/.test(href)) {
      continue
    }
    const targetUrl = new URL(href, `${site.origin}${pagePath}`)

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
        if (url.origin !== site.origin || /\/404(?:\.html|\/|$)/.test(url.pathname)) {
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
    if (file === 'robots.txt') {
      const expectedRobots = preview
        ? 'User-agent: *\nDisallow: /\n'
        : `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap-index.xml\n`
      if (contents !== expectedRobots) {
        errors.push(`${file}: incorrect crawler policy for ${channel}`)
      }
    }
    if (file === 'releases.xml' && !contents.includes(`<link>${site.origin}/</link>`)) {
      errors.push(`${file}: release channel must use this site's origin`)
    }
    if (file.startsWith('llms')) {
      const canonicalSection = contents.split('## Canonical pages\n')[1]?.split('\n## ')[0] ?? ''
      const canonicalLinks = [...canonicalSection.matchAll(/\]\((https?:\/\/[^)]+)\)/g)]
      if (!canonicalLinks.length || canonicalLinks.some(match => !isOwnUrl(match[1]))) {
        errors.push(`${file}: canonical page references must use this site’s origin`)
      }
    }
  }
  catch {
    errors.push(`Unable to validate required SEO output: ${file}`)
  }
}

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

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
else {
  console.log(`Validated ${site.name}: ${expectedFiles.length} required outputs, ${htmlFiles.length} pages, SEO resources, and all internal links.`)
}
