import type { ProjectDefinition } from '../types/project'
import varo from '@weapp/project-catalog/projects/varo.json'
import taro from '@weapp/project-catalog/projects/vite-plugin-taro.json'
import panda from '@weapp/project-catalog/projects/weapp-pandacss.json'
import sqlite from '@weapp/project-catalog/projects/weapp-sqlite.json'
import stylex from '@weapp/project-catalog/projects/weapp-stylex.json'
import tailwind from '@weapp/project-catalog/projects/weapp-tailwindcss.json'
import vite from '@weapp/project-catalog/projects/weapp-vite.json'
import fallbackMetrics from '@weapp/project-catalog/snapshot'
import { describe, expect, it } from 'vitest'
import { breadcrumbSchema, canonicalUrl, contributorsSchema, pricingSchema, projectListSchema, projectSchema, projectsIndexSchema, serializeJsonLd, sponsorsSchema } from './seo'

describe('SEO helpers', () => {
  it('normalizes canonical URLs without query strings or hashes', () => {
    expect(canonicalUrl('/projects/weapp-tailwindcss/?utm_source=test#faq'))
      .toBe('https://weapp.dev/projects/weapp-tailwindcss/')
  })

  it('describes confirmed implementation services and links the open-source reference', () => {
    const project = { id: 'weapp-tailwindcss', data: tailwind as unknown as ProjectDefinition }
    const entity = projectSchema('en', project, fallbackMetrics['weapp-tailwindcss'])
    expect(entity['@type']).toBe('WebPage')
    expect(entity.mainEntity?.['@type']).toBe('Service')
    expect(entity.relatedLink).toBe('https://weapp.js.org/en/projects/weapp-tailwindcss/')
    expect(entity).not.toHaveProperty('codeRepository')
    expect(breadcrumbSchema('en', project).itemListElement[1].item).toBe('https://weapp.dev/en/projects/')
    expect(JSON.parse(serializeJsonLd(entity))).toEqual(entity)
  })

  it('does not promise services for planned or unconfirmed projects', () => {
    for (const [id, data] of [['varo', varo], ['weapp-sqlite', sqlite], ['weapp-pandacss', panda], ['weapp-stylex', stylex]] as const) {
      const entity = projectSchema('en', { id, data: data as unknown as ProjectDefinition }, fallbackMetrics.varo)
      expect(entity).not.toHaveProperty('mainEntity')
      expect(entity).not.toHaveProperty('offers')
      expect(entity).not.toHaveProperty('downloadUrl')
    }
  })

  it('describes delivery and sponsorship without purchasable offers', () => {
    const schema = pricingSchema('zh-CN') as Record<string, unknown>
    expect(schema['@type']).toBe('CollectionPage')
    expect(JSON.stringify(schema)).toContain('DonateAction')
    expect(JSON.stringify(schema)).not.toContain('Offer')
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
    const projects = [vite, tailwind, panda, stylex, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'weapp-pandacss', 'weapp-stylex', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: data as unknown as ProjectDefinition,
    }))
    const zh = projectListSchema('zh-CN', projects)
    const en = projectListSchema('en', projects)
    expect(zh.itemListOrder).toBe('https://schema.org/ItemListOrderAscending')
    expect(zh.numberOfItems).toBe(7)
    expect(en.numberOfItems).toBe(7)
    expect(zh.itemListElement.map(item => item.name)).toEqual(['weapp-vite', 'weapp-tailwindcss', 'weapp-pandacss', 'weapp-stylex', 'Varo', 'weapp-sqlite', 'VPT'])
    expect(en.itemListElement.map(item => item.url)).toEqual([
      'https://weapp.dev/en/projects/weapp-vite/',
      'https://weapp.dev/en/projects/weapp-tailwindcss/',
      'https://weapp.dev/en/projects/weapp-pandacss/',
      'https://weapp.dev/en/projects/weapp-stylex/',
      'https://weapp.dev/en/projects/varo/',
      'https://weapp.dev/en/projects/weapp-sqlite/',
      'https://weapp.dev/en/projects/vite-plugin-taro/',
    ])
    expect(projectsIndexSchema('zh-CN', projects)).toMatchObject({ '@type': 'CollectionPage', 'url': 'https://weapp.dev/projects/' })
    expect(projectsIndexSchema('en', projects).mainEntity.numberOfItems).toBe(7)
  })
})
