import vptProject from '@weapp/project-catalog/projects/vite-plugin-taro.json'
import plannedProject from '@weapp/project-catalog/projects/weapp-sqlite.json'
import viteProject from '@weapp/project-catalog/projects/weapp-vite.json'
import { describe, expect, it } from 'vitest'
import { projectDefinitionSchema } from '../content/schemas'
import { getSiteProfile } from './deployment'
import { createSiteResources } from './site-resources'

const projects = [
  { id: 'weapp-vite', data: projectDefinitionSchema.parse(viteProject) },
  { id: 'weapp-sqlite', data: projectDefinitionSchema.parse(plannedProject) },
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
    expect(resources['llms-full.txt']).toContain('Implementation services for this tool are not confirmed.')
  })

  it('includes the services and sponsorship references on the complete site', () => {
    const resources = createSiteResources(getSiteProfile(), projects)
    expect(resources['llms.txt']).toContain('https://weapp.dev/pricing/#services')
    expect(resources['llms-full.txt']).toContain('25% to the contributors fund')
  })

  it('describes the private booking product without inventing commercial availability', () => {
    const resources = createSiteResources(getSiteProfile(), projects)
    for (const name of ['llms.txt', 'llms-full.txt'] as const) {
      expect(resources[name]).toContain('https://weapp.dev/products/weapp-booking/')
      expect(resources[name]).toContain('https://weapp.dev/en/products/weapp-booking/')
      expect(resources[name]).toContain('external integration acceptance is pending')
      expect(resources[name]).toContain('not yet commercially released')
      expect(resources[name]).not.toMatch(/github\.com\/[^\s)]+\/weapp-booking/)
    }
  })

  it('marks planned projects without inventing releases or install commands', () => {
    const resources = createSiteResources(getSiteProfile(), [projects[1]])
    expect(resources['llms.txt']).toContain('(planned; not released)')
    expect(resources['llms-full.txt']).toContain('Status: planned; not released')
    expect(resources['llms-full.txt']).not.toContain('- Install:')
    expect(resources['llms-full.txt']).not.toContain('- npm:')
  })
})
