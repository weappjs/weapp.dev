import type { ProjectDefinition } from '../types/project'
import varo from '@weapp/project-catalog/projects/varo.json'
import taro from '@weapp/project-catalog/projects/vite-plugin-taro.json'
import sqlite from '@weapp/project-catalog/projects/weapp-sqlite.json'
import tailwind from '@weapp/project-catalog/projects/weapp-tailwindcss.json'
import vite from '@weapp/project-catalog/projects/weapp-vite.json'
import fallbackMetrics from '@weapp/project-catalog/snapshot'
import { describe, expect, it } from 'vitest'
import { breadcrumbSchema, canonicalUrl, organizationSchema, projectListSchema, projectSchema, projectsIndexSchema, serializeJsonLd } from './seo'

describe('SEO helpers', () => {
  it('normalizes canonical URLs without query strings or hashes', () => {
    expect(canonicalUrl('/projects/weapp-tailwindcss/?utm_source=test#faq'))
      .toBe('https://weapp.js.org/projects/weapp-tailwindcss/')
  })

  it('creates official project entity and breadcrumb schemas', () => {
    const project = { id: 'weapp-tailwindcss', data: tailwind as unknown as ProjectDefinition }
    const entity = projectSchema('zh-CN', project, fallbackMetrics['weapp-tailwindcss'])
    const breadcrumb = breadcrumbSchema('zh-CN', project)

    expect(entity['@type']).toBe('SoftwareSourceCode')
    expect(entity.codeRepository).toBe('https://github.com/sonofmagic/weapp-tailwindcss')
    expect(entity.sameAs).toContain('https://www.npmjs.com/package/weapp-tailwindcss')
    expect(breadcrumb.itemListElement).toHaveLength(3)
    expect(breadcrumb.itemListElement[1].item).toBe('https://weapp.js.org/projects/')
    expect(breadcrumbSchema('en', project).itemListElement[1].item).toBe('https://weapp.js.org/en/projects/')
    expect(JSON.parse(serializeJsonLd(entity))).toEqual(entity)
  })

  it('publishes release and package claims for Varo', () => {
    const project = { id: 'varo', data: varo as unknown as ProjectDefinition }
    const entity = projectSchema('en', project, fallbackMetrics.varo)
    expect(entity.version).toBe('2.1.0')
    expect(entity.dateModified).toBe('2026-09-13T15:45:51.579Z')
    expect(entity.downloadUrl).toBe('https://www.npmjs.com/package/@varo-ui/cli')
    expect(entity.sameAs).toContain('https://www.npmjs.com/package/@varo-ui/cli')
  })

  it('keeps the planned weapp-sqlite schema free of unconfirmed runtime claims', () => {
    const project = { id: 'weapp-sqlite', data: sqlite as unknown as ProjectDefinition }
    const entity = projectSchema('en', project, fallbackMetrics.varo)
    expect(entity).not.toHaveProperty('runtimePlatform')
    expect(entity).not.toHaveProperty('version')
    expect(entity).not.toHaveProperty('dateModified')
    expect(entity).not.toHaveProperty('downloadUrl')
  })

  it('identifies the hub without claiming other projects are the same organization', () => {
    const organization = organizationSchema()
    expect(organization.sameAs).toEqual(['https://github.com/weappjs', 'https://github.com/weappjs/weapp.dev'])
    const project = { id: 'varo', data: varo as unknown as ProjectDefinition }
    const entity = projectSchema('en', project, fallbackMetrics.varo)
    expect(entity.maintainer.name).toBe(varo.maintainer)
    expect(entity).not.toHaveProperty('isPartOf')
  })

  it('keeps project list schema aligned with the toolchain flow in both locales', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: data as unknown as ProjectDefinition,
    }))
    const zh = projectListSchema('zh-CN', projects)
    const en = projectListSchema('en', projects)
    expect(zh.itemListOrder).toBe('https://schema.org/ItemListOrderAscending')
    expect(zh.numberOfItems).toBe(5)
    expect(en.numberOfItems).toBe(5)
    expect(zh.itemListElement.map(item => item.name)).toEqual(['weapp-vite', 'weapp-tailwindcss', 'Varo', 'weapp-sqlite', 'VPT'])
    expect(en.itemListElement.map(item => item.url)).toEqual([
      'https://weapp.js.org/en/projects/weapp-vite/',
      'https://weapp.js.org/en/projects/weapp-tailwindcss/',
      'https://weapp.js.org/en/projects/varo/',
      'https://weapp.js.org/en/projects/weapp-sqlite/',
      'https://weapp.js.org/en/projects/vite-plugin-taro/',
    ])
    expect(projectsIndexSchema('zh-CN', projects)).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.js.org/projects/' })
    expect(projectsIndexSchema('en', projects).mainEntity.numberOfItems).toBe(5)
  })
})
