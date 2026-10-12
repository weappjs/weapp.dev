import { describe, expect, it } from 'vitest'
import { renderCatalogTable, syncCatalogReadme } from '../scripts/catalog-readme.mjs'

const projects = [{
  slug: 'example',
  status: 'stable',
  locales: {
    'en': { name: 'Example', tagline: 'A mini-app toolkit' },
    'zh-CN': { name: '示例', tagline: '小程序工具箱' },
  },
}]

function readme(tables = {}) {
  return ['# weapp', ...['en', 'zh-CN'].map(lang => `<!-- catalog:${lang}:start -->\n${tables[lang] || renderCatalogTable(projects, lang)}\n<!-- catalog:${lang}:end -->`), 'User-maintained documentation.'].join('\n\n')
}

function formattedTable(lang) {
  return `\n${renderCatalogTable(projects, lang).split('\n').map((line, index) => index === 1
    ? '| :---------------------------- | ----------------: | :----------------------: |'
    : line.replaceAll(' | ', '       |     ')).join('\n')}\n`
}

describe('README catalog synchronization', () => {
  it.each(['en', 'zh-CN'])('preserves formatted and compact %s tables with identical facts', (lang) => {
    for (const table of [renderCatalogTable(projects, lang), formattedTable(lang)]) {
      const original = readme({ [lang]: table })
      expect(syncCatalogReadme(original, projects)).toEqual({ readme: original, changed: false, changedLanguages: [] })
    }
  })

  it('updates only the language containing a changed field and is stable on the next run', () => {
    const original = readme({ 'en': formattedTable('en'), 'zh-CN': formattedTable('zh-CN') })
    const changedProjects = structuredClone(projects)
    changedProjects[0].locales.en.tagline = 'An updated toolkit'
    const result = syncCatalogReadme(original, changedProjects)
    expect(result.changed).toBe(true)
    expect(result.changedLanguages).toEqual(['en'])
    expect(result.readme).toContain('An updated toolkit')
    expect(result.readme).not.toContain('A mini-app toolkit')
    expect(result.readme).toContain(formattedTable('zh-CN'))
    expect(result.readme).toContain('User-maintained documentation.')
    expect(syncCatalogReadme(result.readme, changedProjects).changed).toBe(false)
  })

  it.each(['slug', 'status', 'name', 'tagline'])('detects a stale %s field for check mode', (field) => {
    const changedProjects = structuredClone(projects)
    const target = ['name', 'tagline'].includes(field) ? changedProjects[0].locales.en : changedProjects[0]
    target[field] = 'updated'
    expect(syncCatalogReadme(readme(), changedProjects).changed).toBe(true)
  })

  it.each(['en', 'zh-CN'])('rejects missing, reversed, or duplicate %s markers', (lang) => {
    const source = readme()
    const start = `<!-- catalog:${lang}:start -->`
    const end = `<!-- catalog:${lang}:end -->`
    expect(() => syncCatalogReadme(source.replace(start, ''), projects)).toThrow(`missing catalog markers: ${lang}`)
    expect(() => syncCatalogReadme(source.replace(end, ''), projects)).toThrow(`missing catalog markers: ${lang}`)
    const reversed = source.replace(start, '__START_MARKER__').replace(end, start).replace('__START_MARKER__', end)
    expect(() => syncCatalogReadme(reversed, projects)).toThrow(`missing catalog markers: ${lang}`)
    expect(() => syncCatalogReadme(`${source}\n${start}`, projects)).toThrow(`duplicate catalog markers: ${lang}`)
  })

  it('preserves CRLF formatting and escaped pipes in project facts', () => {
    const escapedProjects = structuredClone(projects)
    escapedProjects[0].locales.en.tagline = 'Build | run'
    const result = syncCatalogReadme(readme().replaceAll('\n', '\r\n'), escapedProjects)
    expect(result.readme).toContain('Build \\| run')
    expect(result.readme.replaceAll('\r\n', '')).not.toContain('\n')
    expect(syncCatalogReadme(result.readme, escapedProjects).changed).toBe(false)
  })
})
