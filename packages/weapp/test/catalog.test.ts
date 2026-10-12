import type { CatalogProject } from '../src/types.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findProject, mainProjects, searchProjects } from '../src/catalog.js'
import { parseArgs } from '../src/registry.js'
import { detectLanguage, isInteractive, sanitize } from '../src/shared.js'

const catalog = JSON.parse(readFileSync(new URL('../dist/data/catalog.json', import.meta.url), 'utf8')) as CatalogProject[]

describe('catalog discovery', () => {
  it('includes all eleven independently maintained projects and no install promise for planned SQLite', () => {
    expect(catalog).toHaveLength(11)
    const sqlite = findProject(catalog, 'weapp-sqlite')
    assert(sqlite)
    expect(sqlite.status).toBe('planned')
    expect(sqlite.installCommand).toBeUndefined()
    expect(sqlite.npmUrl).toBeUndefined()
    expect(sqlite.platforms).toBeUndefined()
  })

  it('finds aliases, package names, Chinese content and combined filters', () => {
    expect(findProject(catalog, 'tw')?.slug).toBe('weapp-tailwindcss')
    expect(findProject(catalog, '@vue-mini/core')?.slug).toBe('vue-mini')
    expect(findProject(catalog, 'VPT')?.slug).toBe('vite-plugin-taro')
    expect(searchProjects(catalog, '原子')).toContainEqual(findProject(catalog, 'tw'))
    expect(searchProjects(catalog, '', { ecosystem: 'uni-app', status: 'stable' }).map(project => project.slug)).toEqual(['uni-helper', 'wot-ui'])
    expect(searchProjects(catalog, 'not-a-project')).toEqual([])
    expect(() => searchProjects(catalog, '', { status: 'released' })).toThrow('Unknown status')
  })

  it('uses the ecosystem field for six main projects while preserving full searches', () => {
    expect(mainProjects(catalog).map(project => project.slug)).toEqual([
      'weapp-vite',
      'weapp-tailwindcss',
      'weapp-pandacss',
      'weapp-stylex',
      'varo',
      'weapp-sqlite',
    ])
    expect(searchProjects(catalog)).toHaveLength(11)
    expect(searchProjects(catalog, 'vue')).toContainEqual(findProject(catalog, 'vue'))
    expect(parseArgs(['projects', '--all']).options.all).toBe(true)
  })
})

describe('command boundaries', () => {
  it('parses flags before or after commands and keeps literal content after --', () => {
    expect(parseArgs(['--lang=en', 'fx', 'matrix', '--duration', '0.2', '--seed=0'])).toEqual({ command: 'fx', args: ['matrix'], options: { lang: 'en', duration: 0.2, seed: 0 } })
    expect(parseArgs(['qr', '--', '--unknown']).args).toEqual(['--unknown'])
    expect(parseArgs(['qr', '-']).args).toEqual(['-'])
  })

  it.each([
    ['docs', 'vite', '--json'],
    ['info'],
    ['lab', 'extra'],
    ['fx', '--seed', '-1'],
    ['fx', '--duration', 'Infinity'],
    ['--lang', 'fr'],
    ['palette', '#fff', '--output'],
    ['projects', '--json=false'],
    ['projects', '--status', 'stable', '--status', 'beta'],
    ['no-such-command'],
  ])('rejects unsupported, ambiguous or invalid arguments: %j', (...args) => {
    expect(() => parseArgs(args)).toThrow()
  })

  it('honors locale precedence and CI/terminal capabilities', () => {
    expect(detectLanguage({ LANG: 'en_US.UTF-8', LC_ALL: 'zh_CN' })).toBe('zh-CN')
    expect(detectLanguage({ LANG: 'en_US.UTF-8' })).toBe('en')
    expect(detectLanguage({})).toBe('zh-CN')
    const stdin = { isTTY: true, setRawMode() {} }
    const stdout = { isTTY: true }
    expect(isInteractive(stdin, stdout, { TERM: 'xterm' })).toBe(true)
    expect(isInteractive(stdin, stdout, { CI: 'true' })).toBe(false)
    expect(isInteractive(stdin, stdout, { TERM: 'dumb' })).toBe(false)
    expect(sanitize('name\x1B[2J\n')).toBe('name\\u001b[2J\\u000a')
  })
})
