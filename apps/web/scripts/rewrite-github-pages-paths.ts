import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { getSiteProfile } from '../src/lib/deployment'
import { rewriteRootUrls } from '../src/lib/github-pages-paths'

const site = getSiteProfile()
const root = resolve(process.argv[2] || join(import.meta.dirname, '..', site.outputDir))
const shouldRewrite = site.target === 'github-pages' || Boolean(process.argv[2])

if (shouldRewrite) {
  // Astro emits the host's fallback at /404.html. Keep a real /404/ page too,
  // copying the original before each file gets URLs relative to its own directory.
  await mkdir(join(root, '404'), { recursive: true })
  try {
    await copyFile(join(root, '404.html'), join(root, '404/index.html'), constants.COPYFILE_EXCL)
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
      throw error
    }
    // A repeated rewrite must preserve the already-rewritten nested copy.
  }
}

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return collect(path)
    }
    return /\.(?:html|css)$/.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

const leftover: string[] = []
const files = shouldRewrite ? await collect(root) : []
for (const file of files) {
  const fromDir = dirname(relative(root, file))
  const original = await readFile(file, 'utf8')
  const next = rewriteRootUrls(original, fromDir)
  if (next !== original) {
    await writeFile(file, next)
  }
  if (/(?:href|src)=["']\/_astro\//.test(next) || /url\(\s*["']?\/_astro\//.test(next)) {
    leftover.push(relative(root, file))
  }
}

if (leftover.length) {
  throw new Error(`GitHub Pages rewrite left root /_astro/ URLs in ${leftover.join(', ')}`)
}
