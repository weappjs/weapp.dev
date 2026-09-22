import type { ProjectDefinition } from '../types/project'
import { describe, expect, it } from 'vitest'
import varo from '../content/projects/varo.json'
import taro from '../content/projects/vite-plugin-taro.json'
import sqlite from '../content/projects/weapp-sqlite.json'
import tailwind from '../content/projects/weapp-tailwindcss.json'
import vite from '../content/projects/weapp-vite.json'
import fallbackMetrics from '../data/project-metrics.fallback.json'
import { breadcrumbSchema, canonicalUrl, contributorsSchema, organizationSchema, pricingSchema, projectListSchema, projectSchema, projectsIndexSchema, serializeJsonLd, sponsorsSchema } from './seo'

describe('SEO helpers', () => {
  it('normalizes canonical URLs without query strings or hashes', () => {
    expect(canonicalUrl('/projects/weapp-tailwindcss/?utm_source=test#faq'))
      .toBe('https://weapp.dev/projects/weapp-tailwindcss/')
  })

  it('creates official project entity and breadcrumb schemas', () => {
    const project = { id: 'weapp-tailwindcss', data: tailwind as unknown as ProjectDefinition }
    const entity = projectSchema('zh-CN', project, fallbackMetrics['weapp-tailwindcss'])
    const breadcrumb = breadcrumbSchema('zh-CN', project)

    expect(entity['@type']).toBe('SoftwareSourceCode')
    expect(entity.codeRepository).toBe('https://github.com/sonofmagic/weapp-tailwindcss')
    expect(entity.sameAs).toContain('https://www.npmjs.com/package/weapp-tailwindcss')
    expect(breadcrumb.itemListElement).toHaveLength(3)
    expect(breadcrumb.itemListElement[1].item).toBe('https://weapp.dev/projects/')
    expect(breadcrumbSchema('en', project).itemListElement[1].item).toBe('https://weapp.dev/en/projects/')
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

  it('derives organization links from project definitions', () => {
    const project = { id: 'weapp-tailwindcss', data: tailwind as unknown as ProjectDefinition }
    const organization = organizationSchema([project])

    expect(organization.sameAs).toContain('https://tw.weapp.dev/')
    expect(organization.sameAs).toContain('https://weapp.js.org/')
    expect(organization.sameAs).toContain('https://github.com/sonofmagic/weapp-tailwindcss')
  })

  it('describes delivery and sponsorship without purchasable offers', () => {
    const schema = pricingSchema('zh-CN') as Record<string, unknown>
    expect(schema['@type']).toBe('CollectionPage')
    expect(JSON.stringify(schema)).toContain('DonateAction')
    expect(JSON.stringify(schema)).not.toContain('Offer')
  })

  it.each(['zh-CN', 'en'] as const)('keeps only sponsorship entities in the %s Pages schema', (locale) => {
    const schema = pricingSchema(locale, true)
    expect(schema.hasPart.map(part => part['@type'])).toEqual(['DonateAction', 'WebPage'])
    expect(JSON.stringify(schema)).not.toMatch(/Service|delivery|迁移|交付|定制|Gold/)
    expect(schema.url).toBe(`https://weapp.dev/${locale === 'en' ? 'en/' : ''}pricing/`)
    expect(pricingSchema(locale, false).hasPart.map(part => part['@type'])).toContain('Service')
  })

  it('describes the sponsor graph as a bilingual collection page', () => {
    expect(sponsorsSchema('zh-CN')).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.dev/sponsors/', 'inLanguage': 'zh-CN' })
    expect(sponsorsSchema('en')).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.dev/en/sponsors/', 'inLanguage': 'en-US' })
    expect(JSON.stringify(sponsorsSchema('en'))).toContain('Contributors fund')
  })

  it('describes the contributor program with localized collection metadata', () => {
    expect(contributorsSchema('zh-CN', '贡献者计划', '贡献者说明')).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.dev/contributors/', 'inLanguage': 'zh-CN', 'about': 'weapp.dev 贡献者基金与积分规则' })
    expect(contributorsSchema('en', 'Contributor program', 'Contributor details')).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.dev/en/contributors/', 'inLanguage': 'en-US', 'about': 'weapp.dev contributors fund and point rules' })
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
      'https://weapp.dev/en/projects/weapp-vite/',
      'https://weapp.dev/en/projects/weapp-tailwindcss/',
      'https://weapp.dev/en/projects/varo/',
      'https://weapp.dev/en/projects/weapp-sqlite/',
      'https://weapp.dev/en/projects/vite-plugin-taro/',
    ])
    expect(projectsIndexSchema('zh-CN', projects)).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.dev/projects/' })
    expect(projectsIndexSchema('en', projects).mainEntity.numberOfItems).toBe(5)
  })
})
