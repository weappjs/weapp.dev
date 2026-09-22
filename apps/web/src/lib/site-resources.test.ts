import { describe, expect, it } from 'vitest'
import vptProject from '../content/projects/vite-plugin-taro.json'
import plannedProject from '../content/projects/weapp-sqlite.json'
import viteProject from '../content/projects/weapp-vite.json'
import { projectDefinitionSchema } from '../content/schemas'
import { getSiteProfile } from './deployment'
import { createSiteResources } from './site-resources'

const projects = [
  { id: 'weapp-vite', data: projectDefinitionSchema.parse(viteProject) },
  { id: 'weapp-sqlite', data: projectDefinitionSchema.parse(plannedProject) },
  { id: 'vite-plugin-taro', data: projectDefinitionSchema.parse(vptProject) },
]

describe('site resources', () => {
  it.each(['weapp', 'github-pages'])('uses the %s origin while preserving official project sources', (target) => {
    const site = getSiteProfile(target)
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
    const resources = createSiteResources(getSiteProfile('github-pages'), projects)
    const published = Object.values(resources).join('\n')
    expect(published).not.toMatch(/sponsor|donat|fund|[¥￥]|engineering services|\/(?:pricing|contributors)\//i)
    expect(published).not.toContain('https://weapp.dev/')
    expect(published).toContain('JavaScript mini-app ecosystem')
  })

  it('includes the services and sponsorship references on the complete site', () => {
    const resources = createSiteResources(getSiteProfile('weapp'), projects)
    expect(resources['llms.txt']).toContain('https://weapp.dev/pricing/#services')
    expect(resources['llms-full.txt']).toContain('25% to the contributors fund')
  })

  it('marks planned projects without inventing releases or install commands', () => {
    const resources = createSiteResources(getSiteProfile('github-pages'), [projects[1]])
    expect(resources['llms.txt']).toContain('(planned; not released)')
    expect(resources['llms-full.txt']).toContain('Status: planned; not released')
    expect(resources['llms-full.txt']).not.toContain('- Install:')
    expect(resources['llms-full.txt']).not.toContain('- npm:')
  })
})
