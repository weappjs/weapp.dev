import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { parse } from 'node-html-parser'
import { getBuildOutputDir, isGithubPagesBuild } from '../src/lib/deployment'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, getBuildOutputDir())
const githubPages = isGithubPagesBuild()
const expectedFiles = [
  'index.html',
  'en/index.html',
  'pricing/index.html',
  'en/pricing/index.html',
  '404.html',
  'projects/weapp-tailwindcss/index.html',
  'projects/weapp-vite/index.html',
  'projects/varo/index.html',
  'projects/weapp-sqlite/index.html',
  'projects/vite-plugin-taro/index.html',
  'projects/vue-mini/index.html',
  'projects/rezor/index.html',
  'en/projects/weapp-tailwindcss/index.html',
  'en/projects/weapp-vite/index.html',
  'en/projects/weapp-sqlite/index.html',
  'privacy/index.html',
  'en/privacy/index.html',
  'contributors/index.html',
  'en/contributors/index.html',
  'projects/index.html',
  'en/projects/index.html',
  'sponsors/index.html',
  'en/sponsors/index.html',
  'en/projects/varo/index.html',
  'en/projects/vite-plugin-taro/index.html',
  'en/projects/vue-mini/index.html',
  'en/projects/rezor/index.html',
  'releases.xml',
  'sitemap-index.xml',
  'robots.txt',
  'llms.txt',
  'llms-full.txt',
  'og.png',
  'CNAME',
  '.nojekyll',
]
const retiredDocsHosts = ['tw.icebreaker.top', 'vite.icebreaker.top']

async function collectHtml(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectHtml(path)
    }
    return path.endsWith('.html') ? [path] : []
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
  if (pathname.endsWith('/')) {
    return resolve(dist, pathname.slice(1), 'index.html')
  }
  return resolve(dist, pathname.slice(1))
}

const errors: string[] = []
for (const file of expectedFiles) {
  try {
    await access(resolve(dist, file))
  }
  catch {
    errors.push(`Missing expected build output: ${file}`)
  }
}

const pagesCname = (await readFile(resolve(dist, 'CNAME'), 'utf8')).trim()
if (pagesCname !== 'weapp.js.org') {
  errors.push(`CNAME: expected weapp.js.org, received ${pagesCname || '(empty)'}`)
}

for (const homeFile of ['index.html', 'en/index.html']) {
  const html = await readFile(resolve(dist, homeFile), 'utf8')
  if (html.includes('echarts') || html.includes('SponsorGraphs')) {
    errors.push(`${homeFile}: homepage must not load sponsor graph runtime`)
  }
}

for (const sponsorFile of ['sponsors/index.html', 'en/sponsors/index.html']) {
  const html = await readFile(resolve(dist, sponsorFile), 'utf8')
  const runtimeScripts = html.match(/<script[^>]+src="[^"]*SponsorGraphs[^" ]*"/g) ?? []
  if (runtimeScripts.length !== 1) {
    errors.push(`${sponsorFile}: expected exactly one sponsor graph runtime script`)
  }
}

for (const file of await collectHtml(dist)) {
  if (/^baidu_verify_[^/]+\.html$/.test(relative(dist, file))) {
    continue
  }
  const html = await readFile(file, 'utf8')
  const document = parse(html)
  const label = relative(dist, file)
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  const alternates = document.querySelectorAll('link[rel="alternate"][hreflang]')
  const title = document.querySelectorAll('title')
  const descriptions = document.querySelectorAll('meta[name="description"]')
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content')
  const schemas = document.querySelectorAll('script[type="application/ld+json"]')
  for (const host of retiredDocsHosts) {
    if (html.includes(host)) {
      errors.push(`${label}: contains retired documentation host ${host}`)
    }
  }
  if (!canonical?.startsWith('https://weapp.dev/')) {
    errors.push(`${label}: invalid canonical URL`)
  }
  if (alternates.length < 3) {
    errors.push(`${label}: missing language alternates`)
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
  if (label === '404.html' || label === 'en/404/index.html') {
    if (!robots?.includes('noindex')) {
      errors.push(`${label}: 404 must be noindex`)
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

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    if (!href || /^(?:https?:|mailto:|tel:)/.test(href)) {
      continue
    }
    const pagePath = `/${label.replace(/index\.html$/, '')}`
    const targetUrl = new URL(href, `https://weapp.dev${pagePath}`)
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

for (const file of ['sitemap-index.xml', 'robots.txt', 'llms.txt', 'llms-full.txt']) {
  try {
    const contents = await readFile(resolve(dist, file), 'utf8')
    if (file.startsWith('sitemap') && contents.includes('/404')) {
      errors.push(`${file}: must not include 404 URLs`)
    }
    for (const host of retiredDocsHosts) {
      if (contents.includes(host)) {
        errors.push(`${file}: contains retired documentation host ${host}`)
      }
    }
  }
  catch {
    errors.push(`Unable to read required SEO output: ${file}`)
  }
}

// Verify the target-specific public content as part of every build, including CI.
for (const prefix of ['', 'en/']) {
  const home = parse(await readFile(resolve(dist, `${prefix}index.html`), 'utf8'))
  const pricing = parse(await readFile(resolve(dist, `${prefix}pricing/index.html`), 'utf8'))
  const sponsorTiers = pricing.querySelectorAll('.pricing-sponsor-tier h3').map(node => node.text)
  const expectedTiers = prefix ? ['Supporter', 'Bronze sponsor', 'Silver sponsor'] : ['普通支持', '铜牌赞助', '银牌赞助']
  if (JSON.stringify(sponsorTiers.slice(0, 3)) !== JSON.stringify(expectedTiers) || sponsorTiers.length !== (githubPages ? 3 : 4)) {
    errors.push(`${prefix}pricing/: incorrect sponsorship tiers for this target`)
  }
  if (pricing.querySelector('#plans')) {
    errors.push(`${prefix}pricing/: product shelf must not be published`)
  }
  for (const id of ['roadmap', 'cloud-build', 'services', 'support', 'boundary', 'faq']) {
    if (Boolean(pricing.querySelector(`#${id}`)) === githubPages) {
      errors.push(`${prefix}pricing/: incorrect visibility for #${id}`)
    }
  }
  for (const id of ['services', 'roadmap']) {
    if (Boolean(home.querySelector(`a[href$="#${id}"]`)) === githubPages) {
      errors.push(`${prefix}index.html: incorrect visibility for ${id} link`)
    }
  }
  if (githubPages) {
    for (const share of ['60%', '25%', '15%']) {
      if (!pricing.querySelector('.pricing-sponsor-allocation')?.text.includes(share)) {
        errors.push(`${prefix}pricing/: missing allocation ${share}`)
      }
    }
  }
}

if (githubPages) {
  const surfaces = ['index.html', 'en/index.html', 'pricing/index.html', 'en/pricing/index.html', 'contributors/index.html', 'en/contributors/index.html', 'sponsors/index.html', 'en/sponsors/index.html', 'llms.txt', 'llms-full.txt']
  const commercialCopy = /\bgold\b|\benterprise\b|\bservices?\b|\btraining\b|cloud[ -]build|定制|人工服务|服务报价|迁移与培训|建设中的能力|云构建|企业合作|商业化/i
  for (const file of surfaces) {
    const contents = await readFile(resolve(dist, file), 'utf8')
    const doc = file.endsWith('.html') ? parse(contents) : undefined
    // Astro can inline shared CSS; selector names are not published service copy.
    doc?.querySelectorAll('style').forEach(node => node.remove())
    if (commercialCopy.test(doc?.toString() ?? contents)) {
      errors.push(`${file}: Pages output contains commercial content`)
    }
    if (doc) {
      // Keep the open-source project's data-roadmap-count attribute; ban commercial copy.
      doc.querySelectorAll('script:not([type="application/ld+json"])').forEach(node => node.remove())
      if (/\broadmap\b|路线图/i.test(doc.text)) {
        errors.push(`${file}: Pages output contains commercial roadmap copy`)
      }
    }
    else if (/\broadmap\b|路线图/i.test(contents)) {
      errors.push(`${file}: Pages LLM reference contains roadmap copy`)
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
else {
  console.log(`Validated ${expectedFiles.length} required outputs and all internal links.`)
}
