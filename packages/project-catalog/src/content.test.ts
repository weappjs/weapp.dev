import { describe, expect, it } from 'vitest'
import rezor from './content/projects/rezor.json'
import uniHelper from './content/projects/uni-helper.json'
import varo from './content/projects/varo.json'
import vpt from './content/projects/vite-plugin-taro.json'
import vueMini from './content/projects/vue-mini.json'
import sqlite from './content/projects/weapp-sqlite.json'
import tailwind from './content/projects/weapp-tailwindcss.json'
import vite from './content/projects/weapp-vite.json'
import wotUi from './content/projects/wot-ui.json'
import { projectDefinitionSchema } from './content/schemas'

describe('project definitions', () => {
  const projects = [vite, tailwind, varo, sqlite, vpt, vueMini, rezor, uniHelper, wotUi].map(project => projectDefinitionSchema.parse(project))
  const officialDocsUrls: Record<string, string> = {
    'weapp-tailwindcss': 'https://tw.weapp.dev/',
    'weapp-vite': 'https://vite.weapp.dev/',
    'vite-plugin-taro': 'https://vpt.js.org/',
    'weapp-sqlite': 'https://sqlite.weapp.dev/',
    '@varo-ui/cli': 'https://varo.weapp.dev/',
    '@vue-mini/core': 'https://vuemini.org/',
    'rezor': 'https://github.com/rezorjs/rezor',
    'create-uni': 'https://uni-helper.cn/',
    'wot-design-uni': 'https://wot-ui.cn/',
  }

  it('provides complete localized content for every project', () => {
    for (const project of projects) {
      for (const locale of ['zh-CN', 'en'] as const) {
        expect(project.locales[locale].name).not.toHaveLength(0)
        expect(project.locales[locale].description).not.toHaveLength(0)
        expect(project.locales[locale].audience).not.toHaveLength(0)
        expect(project.locales[locale].useCases.length).toBeGreaterThan(0)
        expect(project.locales[locale].capabilities.length).toBeGreaterThan(0)
        expect(project.locales[locale].faqs.length).toBeGreaterThan(0)
      }
      if (project.status === 'planned') {
        expect(project.npmUrl).toBeUndefined()
      }
      else {
        expect(project.npmUrl).toMatch(/^https:\/\//)
      }
      const license = 'license' in project ? project.license : undefined
      expect(project.status === 'planned' || license).toBeTruthy()
      license && expect(license).toMatch(/^https:\/\//)
      if (project.status === 'planned') {
        expect(project.installCommand).toBeUndefined()
      }
      else {
        expect(project.installCommand).toContain(project.packageName)
      }
      expect(project.keywords.length).toBeGreaterThan(0)
      expect(project.role).toBeTruthy()
      expect(project.dataCompleteness).toBeTruthy()
      if (project.visuals) {
        for (const visual of [project.visuals.primary, project.visuals.secondary]) {
          expect(visual.src).toMatch(/^\/media\/(projects|showcase)\/.+\.(webp|png)$/)
          expect(visual.avif).toMatch(/^\/media\/(projects|showcase)\/.+\.(avif|png)$/)
          expect(visual.width).toBeGreaterThan(0)
          expect(visual.height).toBeGreaterThan(0)
          expect(visual.locales['zh-CN'].alt).not.toHaveLength(0)
          expect(visual.locales.en.caption).not.toHaveLength(0)
        }
      }
    }
  })

  it('reserves canonical documentation routes without publishing them', () => {
    for (const project of projects) {
      expect(project.futureDocsPath).toMatch(/^\/docs\/[\w-]+\/$/)
      expect(project.docsUrl).toBe(officialDocsUrls[project.packageName])
    }
  })

  it('publishes the Varo release and package actions', () => {
    expect(varo).toMatchObject({
      status: 'stable',
      maturity: 'stable',
      packageName: '@varo-ui/cli',
      github: 'daguanren21/Varo',
      docsUrl: 'https://varo.weapp.dev/',
      npmUrl: 'https://www.npmjs.com/package/@varo-ui/cli',
      installCommand: 'pnpm dlx @varo-ui/cli add --target weapp button input card',
    })
  })

  it('keeps weapp-sqlite honest while it is planned', () => {
    const definition = projectDefinitionSchema.parse(sqlite)
    expect(definition).toMatchObject({ status: 'planned', role: 'Local data', dataCompleteness: 'planned' })
    expect(definition.npmUrl).toBeUndefined()
    expect(definition.visuals).toBeUndefined()
    expect(definition.locales['zh-CN'].description).toContain('规划')
    expect(definition.locales.en.description).toContain('planned')
  })

  it('keeps published package links canonical and planned links empty', () => {
    const expected: Record<string, string> = {
      'weapp-vite': 'https://www.npmjs.com/package/weapp-vite',
      'weapp-tailwindcss': 'https://www.npmjs.com/package/weapp-tailwindcss',
      'vite-plugin-taro': 'https://www.npmjs.com/package/vite-plugin-taro',
      '@varo-ui/cli': 'https://www.npmjs.com/package/@varo-ui/cli',
      '@vue-mini/core': 'https://www.npmjs.com/package/@vue-mini/core',
      'rezor': 'https://www.npmjs.com/package/rezor',
      'create-uni': 'https://www.npmjs.com/package/create-uni',
      'wot-design-uni': 'https://www.npmjs.com/package/wot-design-uni',
    }

    for (const project of projects) {
      if (project.status === 'planned') {
        expect(project.npmUrl).toBeUndefined()
      }
      else {
        expect(project.npmUrl).toBe(expected[project.packageName])
      }
    }
  })

  it('rejects non-package npm URLs at the content boundary', () => {
    expect(projectDefinitionSchema.safeParse({ ...vite, npmUrl: 'https://www.npmjs.com/search?q=vite' }).success).toBe(false)
    expect(projectDefinitionSchema.safeParse({ ...vite, npmUrl: 'https://registry.npmjs.org/weapp-vite' }).success).toBe(false)
  })
})
