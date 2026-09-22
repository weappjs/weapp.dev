import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicMediaDir = new URL('../public/media/', import.meta.url)

const projectMedia = [
  {
    repository: 'sonofmagic/weapp-tailwindcss',
    source: 'demo/web/report/web-full-report/2026-06-26T08-06-32-105Z/compare/react-vite-tailwindcss-v4-weapp.png',
    output: 'projects/tailwind-weapp',
    width: 1280,
  },
  {
    repository: 'sonofmagic/weapp-tailwindcss',
    source: 'demo/web/report/web-full-report/2026-06-26T08-06-32-105Z/compare/react-vite-tailwindcss-v4-web.png',
    output: 'projects/tailwind-web',
    width: 1280,
  },
  {
    repository: 'weapp-vite/weapp-vite',
    source: 'e2e/web-runtime/baselines/weapp/component-matrix.png',
    output: 'projects/vite-components',
    width: 780,
  },
  {
    repository: 'weapp-vite/weapp-vite',
    source: 'e2e/web-runtime/baselines/weapp/app-shell-tabbar.png',
    output: 'projects/vite-shell',
    width: 780,
  },
  {
    repository: 'daguanren21/Varo',
    page: 'https://varo.weapp.dev/',
    localSource: '../media-source/varo-homepage-latest.png',
    output: 'projects/varo-home',
    width: 1440,
  },
  {
    repository: 'daguanren21/Varo',
    source: 'apps/docs/public/brand-assets/varo-agent-ui-source.png',
    output: 'projects/varo-agent',
    width: 780,
  },
] as const

async function downloadGitHubFile(repository: string, source: string): Promise<Buffer> {
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${source}`, {
    headers: {
      'accept': 'application/vnd.github+json',
      'User-Agent': 'weapp.dev-media-generator',
    },
  })
  if (!response.ok) {
    throw new Error(`Unable to download ${repository}/${source}: ${response.status}`)
  }
  const payload = await response.json() as { content: string }
  return Buffer.from(payload.content.replaceAll('\n', ''), 'base64')
}

async function generateProjectMedia() {
  await mkdir(new URL('projects/', publicMediaDir), { recursive: true })
  for (const asset of projectMedia) {
    const source = 'localSource' in asset
      ? await readFile(new URL(asset.localSource, import.meta.url))
      : await downloadGitHubFile(asset.repository, asset.source)
    const image = sharp(source).resize({ width: asset.width, withoutEnlargement: true })
    await image.clone().webp({ quality: 82, effort: 5 }).toFile(fileURLToPath(new URL(`${asset.output}.webp`, publicMediaDir)))
    await image.clone().avif({ quality: 55, effort: 5 }).toFile(fileURLToPath(new URL(`${asset.output}.avif`, publicMediaDir)))
  }
}

async function generateBuildLens() {
  await mkdir(new URL('brand/', publicMediaDir), { recursive: true })
  const source = Buffer.from(`
    <svg width="1600" height="1100" viewBox="0 0 1600 1100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#07110d"/>
          <stop offset="0.55" stop-color="#14241d"/>
          <stop offset="1" stop-color="#0a1813"/>
        </linearGradient>
        <linearGradient id="green-sheet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8bd8b7" stop-opacity=".68"/>
          <stop offset="1" stop-color="#0e7958" stop-opacity=".2"/>
        </linearGradient>
        <linearGradient id="silver-sheet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4f7f5" stop-opacity=".38"/>
          <stop offset="1" stop-color="#89a79a" stop-opacity=".08"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="40" stdDeviation="35" flood-color="#020805" flood-opacity=".52"/>
        </filter>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="22"/>
        </filter>
      </defs>
      <rect width="1600" height="1100" fill="url(#background)"/>
      <path d="M-80 882 L850 390 L1690 570 L760 1065 Z" fill="#06100c" opacity=".72" filter="url(#shadow)"/>
      <path d="M-110 722 L700 278 L1638 470 L818 916 Z" fill="url(#green-sheet)" stroke="#b7ead4" stroke-opacity=".3" stroke-width="2" filter="url(#shadow)"/>
      <path d="M-130 562 L570 176 L1582 336 L884 720 Z" fill="url(#silver-sheet)" stroke="#f4f7f5" stroke-opacity=".26" stroke-width="2" filter="url(#shadow)"/>
      <path d="M170 900 L862 514 L1460 628 L772 1012 Z" fill="#0e7958" fill-opacity=".32" stroke="#70c6a5" stroke-opacity=".3" stroke-width="2"/>
      <path d="M84 514 L610 222 L1328 338 L800 630 Z" fill="#d9e7df" fill-opacity=".12" stroke="#eff8f3" stroke-opacity=".18" stroke-width="2"/>
      <path d="M412 102 L1262 248 L1180 294 L334 150 Z" fill="#d6ebe1" fill-opacity=".18" filter="url(#soft)"/>
      <g opacity=".24" stroke="#b8d8c9" stroke-width="2">
        <path d="M110 760 L805 382 L1485 516"/>
        <path d="M234 852 L882 502 L1395 606"/>
        <path d="M350 936 L950 614 L1302 680"/>
      </g>
    </svg>
  `)
  await sharp(source).webp({ quality: 88, effort: 6 }).toFile(fileURLToPath(new URL('brand/build-lens.webp', publicMediaDir)))
  await sharp(source).avif({ quality: 60, effort: 6 }).toFile(fileURLToPath(new URL('brand/build-lens.avif', publicMediaDir)))
}

await generateProjectMedia()
await generateBuildLens()
await writeFile(new URL('sources.json', publicMediaDir), `${JSON.stringify({
  generatedAt: '2026-09-16',
  projectMedia,
  buildLens: {
    kind: 'deterministic-raster',
    prompt: 'Premium layered translucent materials showing source, style, build, and multi-platform flow. Cold neutral and brand green. Wide composition. No text, logos, product UI, watermark, purple, or blue gradient.',
  },
}, null, 2)}\n`)
