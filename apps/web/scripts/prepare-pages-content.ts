import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { projectsDirectory } from '@weapp/project-catalog/paths'
import { projectDefinitionSchema } from '../src/content/schemas'
import { getSiteProfile } from '../src/lib/deployment'
import { createSiteResources } from '../src/lib/site-resources'

const site = getSiteProfile()
const root = resolve(process.argv[2] || join(import.meta.dirname, '..', site.outputDir))
const projectDirectory = projectsDirectory
const projects = await Promise.all((await readdir(projectDirectory)).filter(file => file.endsWith('.json')).map(async file => ({
  id: basename(file, '.json'),
  data: projectDefinitionSchema.parse(JSON.parse(await readFile(join(projectDirectory, file), 'utf8'))),
})))
projects.sort((left, right) => left.data.order - right.data.order)

for (const [name, content] of Object.entries(createSiteResources(site, projects))) {
  await writeFile(join(root, name), content, 'utf8')
}

await rm(join(root, 'CNAME'), { force: true })
await rm(join(root, '.nojekyll'), { force: true })
