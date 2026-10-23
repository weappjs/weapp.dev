import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { projectsDirectory } from '@weapp-io/project-catalog/paths'
import { projectDefinitionSchema } from '../src/content/schemas'
import { getBuildChannel } from '../src/lib/build-channel'
import { getSiteProfile } from '../src/lib/deployment'
import { createSiteResources } from '../src/lib/site-resources'

const site = getSiteProfile()
const channel = getBuildChannel()
const root = resolve(process.argv[2] || join(import.meta.dirname, '..', site.outputDir))
const projectDirectory = projectsDirectory
const projects = await Promise.all((await readdir(projectDirectory)).filter(file => file.endsWith('.json')).map(async file => ({
  id: basename(file, '.json'),
  data: projectDefinitionSchema.parse(JSON.parse(await readFile(join(projectDirectory, file), 'utf8'))),
})))
projects.sort((left, right) => left.data.order - right.data.order)

// A repeated stable preparation must remove preview-only response headers.
await rm(join(root, '_headers'), { force: true })
for (const [name, content] of Object.entries(createSiteResources(site, projects, channel))) {
  await writeFile(join(root, name), content, 'utf8')
}

await rm(join(root, 'CNAME'), { force: true })
await rm(join(root, '.nojekyll'), { force: true })
