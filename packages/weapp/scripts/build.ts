import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { projectAssetsDirectory, projectsDirectory } from '@weapp-io/project-catalog/paths'
import { projectDefinitionSchema } from '@weapp-io/project-catalog/schemas'
import { createHeroLogo, HERO_LOGO_PALETTE, HERO_LOGO_VIEWBOX } from '@weapp-io/site-ui/hero-logo'
import { projectLogoFiles, projectLogos } from '../lab/project-logos.js'
import { syncCatalogReadme } from './catalog-readme.mjs'

const root = new URL('../', import.meta.url)
const dist = new URL('dist/', root)
await rm(dist, { recursive: true, force: true })
await mkdir(new URL('data/', dist), { recursive: true })
const projects = await Promise.all((await readdir(projectsDirectory)).filter(name => name.endsWith('.json')).map(async (name) => {
  const definition = projectDefinitionSchema.parse(JSON.parse(await readFile(`${projectsDirectory}/${name}`, 'utf8')))
  const { visuals: _visuals, ...data } = definition
  const slug = name.slice(0, -5)
  return { slug, id: slug, ...data }
}))
projects.sort((a, b) => a.order - b.order)
const logo = { viewBox: HERO_LOGO_VIEWBOX, palette: HERO_LOGO_PALETTE, points: createHeroLogo(false) }
await writeFile(new URL('data/catalog.json', dist), `${JSON.stringify(projects)}\n`)
await writeFile(new URL('data/logo.json', dist), `${JSON.stringify(logo)}\n`)
await writeFile(new URL('data/project-logos.json', dist), `${JSON.stringify(projectLogos)}\n`)
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
await writeFile(new URL('data/meta.json', dist), `${JSON.stringify({ version: packageJson.version })}\n`)
await cp(new URL('src/', root), new URL('src/', dist), { recursive: true })
await cp(new URL('lab/', root), new URL('lab/', dist), { recursive: true })
await mkdir(new URL('lab/logos/', dist), { recursive: true })
for (const project of projects) {
  const file = projectLogoFiles[project.slug as keyof typeof projectLogoFiles]
  if (!file || (!projectLogos[project.slug as keyof typeof projectLogos]?.fallback && project.logo !== `/brands/${file}`)) {
    throw new Error(`Missing or stale project logo mapping: ${project.slug}`)
  }
  await cp(`${projectAssetsDirectory}/brands/${file}`, new URL(`lab/logos/${file}`, dist))
}

const readmeUrl = new URL('README.md', root)
const { readme, changed } = syncCatalogReadme(await readFile(readmeUrl, 'utf8'), projects)
if (process.argv.includes('--check-readme')) {
  if (changed) {
    throw new Error('README catalog is stale; run pnpm --filter weapp build')
  }
}
else if (changed) {
  await writeFile(readmeUrl, readme)
}
process.stdout.write(`Built weapp: ${projects.length} projects, ${logo.points.length} Logo points → ${fileURLToPath(dist)}\n`)
