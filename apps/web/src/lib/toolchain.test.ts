import type { ProjectEntry } from './projects'
import { describe, expect, it } from 'vitest'
import rezor from '../content/projects/rezor.json'
import uniHelper from '../content/projects/uni-helper.json'
import varo from '../content/projects/varo.json'
import taro from '../content/projects/vite-plugin-taro.json'
import vueMini from '../content/projects/vue-mini.json'
import sqlite from '../content/projects/weapp-sqlite.json'
import tailwind from '../content/projects/weapp-tailwindcss.json'
import vite from '../content/projects/weapp-vite.json'
import wotUi from '../content/projects/wot-ui.json'
import { projectDefinitionSchema } from '../content/schemas'
import { getCatalogEcosystemGroups, getConstellationProjects, getEcosystemProjects, getToolchainProjects, validateToolchainCatalog } from './toolchain'

describe('toolchain project ordering', () => {
  it('keeps the weapp stack in build-flow order', () => {
    const projects = ['varo', 'weapp-sqlite', 'weapp-vite', 'weapp-tailwindcss'].map(id => ({ id, data: {} })) as never
    expect(getToolchainProjects(projects).map(item => item.project.id)).toEqual([
      'weapp-vite',
      'weapp-tailwindcss',
      'varo',
      'weapp-sqlite',
    ])
  })

  it('validates the five project catalog and related references', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    expect(() => validateToolchainCatalog(projects)).not.toThrow()
    const invalidOrder = structuredClone(projects) as ProjectEntry[]
    invalidOrder[0].data.order = 2
    expect(() => validateToolchainCatalog(invalidOrder)).toThrow('Project order differs from toolchain flow')
    const duplicateOrder = structuredClone(projects) as ProjectEntry[]
    duplicateOrder[1].data.order = duplicateOrder[0].data.order
    expect(() => validateToolchainCatalog(duplicateOrder)).toThrow('Duplicate toolchain project order')
    expect(() => validateToolchainCatalog(projects.slice(0, 3))).toThrow('Missing toolchain project')
    const invalid = structuredClone(projects) as ProjectEntry[]
    invalid[0].data.relatedProjects = ['missing-project']
    expect(() => validateToolchainCatalog(invalid)).toThrow('Unknown related project')
    const selfRelated = structuredClone(projects) as ProjectEntry[]
    selfRelated[0].data.relatedProjects = ['weapp-vite']
    expect(() => validateToolchainCatalog(selfRelated)).toThrow('Project cannot relate to itself')
  })

  it('keeps two related paths for every core project', () => {
    for (const project of [vite, tailwind, varo, sqlite, taro]) {
      expect(projectDefinitionSchema.parse(project).relatedProjects).toHaveLength(2)
    }
  })

  it('rejects a planned project marked as complete', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    projects[3].data.dataCompleteness = 'complete'
    expect(() => validateToolchainCatalog(projects)).toThrow('Planned project cannot claim complete data')
  })

  it('keeps unconfirmed scope absent for planned data projects', () => {
    const parsed = projectDefinitionSchema.parse(sqlite)
    expect(parsed.status).toBe('planned')
    expect(parsed.platforms).toBeUndefined()
    expect(parsed.runtime).toBeUndefined()
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    expect(() => validateToolchainCatalog(projects)).not.toThrow()
  })

  it('requires confirmed scope for released projects', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    projects[0].data.platforms = undefined
    expect(() => validateToolchainCatalog(projects)).toThrow('Active project is missing platform or runtime scope')
  })

  it('rejects package actions that contradict project status', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    projects[3].data.installCommand = 'pnpm add weapp-sqlite'
    expect(() => validateToolchainCatalog(projects)).toThrow('Planned project cannot publish package actions')
    projects[3].data.installCommand = undefined
    projects[0].data.npmUrl = undefined
    expect(() => validateToolchainCatalog(projects)).toThrow('Active project is missing package actions')
  })

  it('rejects an npm URL that points to a different package', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    projects[0].data.npmUrl = 'https://www.npmjs.com/package/weapp-tailwindcss'
    expect(() => validateToolchainCatalog(projects)).toThrow('Project npm URL does not match package name')
  })

  it('rejects status and maturity drift', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    projects[0].data.maturity = 'beta'
    expect(() => validateToolchainCatalog(projects)).toThrow('Project status and maturity differ')
  })

  it('rejects a declared role that differs from the flow role', () => {
    const projects = [vite, tailwind, varo, sqlite, taro].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    projects[0].data.role = 'Styling'
    expect(() => validateToolchainCatalog(projects)).toThrow('Project role differs from toolchain role')
  })

  it('keeps project roles within the documented toolchain vocabulary', () => {
    expect(() => projectDefinitionSchema.parse({ ...vite, role: 'Documentation' })).toThrow()
  })

  it('groups the catalog by ecosystem and keeps weapp-only in the toolchain map', () => {
    const projects = [vite, tailwind, varo, sqlite, taro, vueMini, rezor, uniHelper, wotUi].map((data, index) => ({
      id: ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro', 'vue-mini', 'rezor', 'uni-helper', 'wot-ui'][index],
      data: projectDefinitionSchema.parse(data),
    })) as unknown as ProjectEntry[]
    expect(() => validateToolchainCatalog(projects)).not.toThrow()
    expect(getToolchainProjects(projects).map(item => item.project.id)).toEqual([
      'weapp-vite',
      'weapp-tailwindcss',
      'varo',
      'weapp-sqlite',
    ])
    expect(getCatalogEcosystemGroups(projects).map(group => [group.id, group.projects.map(project => project.id)])).toEqual([
      ['weapp', ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite']],
      ['taro', ['vite-plugin-taro']],
      ['vue-mini', ['vue-mini']],
      ['rezor', ['rezor']],
      ['uni-app', ['uni-helper', 'wot-ui']],
    ])
    expect(getEcosystemProjects(projects).map(project => project.id)).toEqual(['uni-helper', 'wot-ui'])
    expect(getConstellationProjects(projects).map(project => project.id)).toEqual([
      'weapp-vite',
      'weapp-tailwindcss',
      'varo',
      'vite-plugin-taro',
      'vue-mini',
      'rezor',
      'uni-helper',
      'wot-ui',
    ])
  })
})
