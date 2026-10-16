import vptProject from '@weapp-io/project-catalog/projects/vite-plugin-taro.json'
import sqliteProject from '@weapp-io/project-catalog/projects/weapp-sqlite.json'
import viteProject from '@weapp-io/project-catalog/projects/weapp-vite.json'
import { describe, expect, it } from 'vitest'
import { projectDefinitionSchema } from '../content/schemas'
import { getSiteProfile } from './deployment'
import { createSiteResources } from './site-resources'

const projects = [
  { id: 'weapp-vite', data: projectDefinitionSchema.parse(viteProject) },
  { id: 'weapp-sqlite', data: projectDefinitionSchema.parse(sqliteProject) },
  { id: 'vite-plugin-taro', data: projectDefinitionSchema.parse(vptProject) },
]

describe('site resources', () => {
  it('uses its own origin while preserving official project sources', () => {
    const site = getSiteProfile()
    const resources = createSiteResources(site, projects)
    expect(resources['robots.txt']).toContain(`Sitemap: ${site.origin}/sitemap-index.xml`)
    for (const name of ['llms.txt', 'llms-full.txt'] as const) {
      expect(resources[name]).toContain(`${site.origin}/projects/weapp-vite/`)
      expect(resources[name]).toContain('https://github.com/weapp-vite/weapp-vite')
      expect(resources[name]).toContain('https://vite.weapp.dev/')
      expect(resources[name]).toContain(site.repositoryUrl)
    }
    expect(resources['llms-full.txt']).toContain(`${site.origin}/en/projects/vite-plugin-taro/`)
    expect(resources['llms-full.txt']).toContain('npm create vite-taro@latest my-app')
  })

  it('keeps finance and service pages out of the open-source references', () => {
    const resources = createSiteResources(getSiteProfile(), projects)
    const published = Object.values(resources).join('\n')
    expect(published).not.toMatch(/sponsor|donat|fund|[¥￥]|engineering services|\/(?:pricing|contributors)\//i)
    expect(published).not.toContain('https://weapp.dev/')
    expect(published).toContain('JavaScript mini-app ecosystem')
  })

  it('publishes the Beta SQLite package while preserving its project route', () => {
    const resources = createSiteResources(getSiteProfile(), [projects[1]])
    expect(resources['llms.txt']).toContain('/projects/weapp-sqlite/')
    expect(resources['llms-full.txt']).toContain('Status: beta')
    expect(resources['llms-full.txt']).toContain('https://www.npmjs.com/package/@weapp-sqlite/weapp-vite')
    expect(resources['llms-full.txt']).not.toContain('(planned; not released)')
  })

  it('marks planned projects without inventing releases or install commands', () => {
    const planned = {
      id: 'planned-example',
      data: projectDefinitionSchema.parse({
        ...viteProject,
        packageName: 'planned-example',
        status: 'planned',
        maturity: 'planned',
        dataCompleteness: 'planned',
        npmUrl: undefined,
        installCommand: undefined,
        quickStart: undefined,
        platforms: undefined,
        runtime: undefined,
      }),
    }
    const resources = createSiteResources(getSiteProfile(), [planned])
    expect(resources['llms.txt']).toContain('(planned; not released)')
    expect(resources['llms-full.txt']).toContain('Status: planned; not released')
    expect(resources['llms-full.txt']).not.toContain('- Install:')
    expect(resources['llms-full.txt']).not.toContain('- npm:')
  })
})
