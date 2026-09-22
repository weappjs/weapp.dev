import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { getSiteProfile } from '../src/lib/deployment'

const site = getSiteProfile()
const output = resolve(import.meta.dirname, '..', site.outputDir)
const template = await readFile(resolve(import.meta.dirname, 'assets/og.svg'), 'utf8')
const svg = template
  .replace('{{wordmark}}', site.name)
  .replace('{{description}}', site.features.services ? 'Open tooling and engineering for mini-apps' : 'Open-source projects for JavaScript mini-apps')

await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'og.svg'), svg, 'utf8')
await sharp(Buffer.from(svg), { density: 144 })
  .resize(1200, 630)
  .png({ compressionLevel: 9, palette: true })
  .toFile(resolve(output, 'og.png'))
