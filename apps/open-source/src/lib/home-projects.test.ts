import varo from '@weapp/project-catalog/projects/varo.json'
import taro from '@weapp/project-catalog/projects/vite-plugin-taro.json'
import sqlite from '@weapp/project-catalog/projects/weapp-sqlite.json'
import tailwind from '@weapp/project-catalog/projects/weapp-tailwindcss.json'
import vite from '@weapp/project-catalog/projects/weapp-vite.json'
import tailwindImages from '@weapp/project-catalog/showcases/weapp-tailwindcss.json'
import { describe, expect, it } from 'vitest'
import { homeProjectPlacements } from '../content/home-projects'
import { projectDefinitionSchema, showcaseSchema } from '../content/schemas'
import { assembleHomeProjects } from './home-projects'

const projects = [
  { id: 'weapp-tailwindcss', data: projectDefinitionSchema.parse(tailwind) },
  { id: 'weapp-vite', data: projectDefinitionSchema.parse(vite) },
  { id: 'varo', data: projectDefinitionSchema.parse(varo) },
  { id: 'weapp-sqlite', data: projectDefinitionSchema.parse(sqlite) },
  { id: 'vite-plugin-taro', data: projectDefinitionSchema.parse(taro) },
]

describe('home project composition', () => {
  it('keeps editorial order when the catalog is reordered or extended', () => {
    const extended = [...projects].reverse().concat({ id: 'new-project', data: projects[0].data })
    const result = assembleHomeProjects(extended, homeProjectPlacements)
    expect(result.map(project => project.id)).toEqual(['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro'])
    expect(result.filter(project => project.data.ecosystem === 'weapp').map(project => project.id)).toEqual(['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite'])
    expect(result.map(project => project.demo)).toEqual(['build', 'style', 'registry', 'sqlite', 'migration'])
  })

  it('combines independent metadata and demo placements without requiring screenshots', () => {
    const changedProjects = structuredClone(projects)
    const changedProject = changedProjects.find(project => project.id === 'weapp-tailwindcss')!
    changedProject.data.docsUrl = 'https://example.com/new-docs/'
    changedProject.data.status = 'beta'
    const changedPlacements = structuredClone(homeProjectPlacements)
    changedPlacements[0].reversed = true
    const result = assembleHomeProjects(changedProjects, changedPlacements)
    const tailwindResult = result.find(project => project.id === 'weapp-tailwindcss')!
    expect(tailwindResult.data.docsUrl).toBe('https://example.com/new-docs/')
    expect(tailwindResult.data.status).toBe('beta')
    expect(tailwindResult.reversed).toBe(true)
    expect(result[0]).not.toHaveProperty('showcase')
    expect(changedProjects[0].data.visuals).not.toHaveProperty('showcase')
    expect(projects[0].data.status).toBe('stable')
  })

  it('rejects stale references and duplicate placements before rendering', () => {
    expect(() => assembleHomeProjects(projects, [...homeProjectPlacements, homeProjectPlacements[0]]))
      .toThrow('Duplicate home project')
    expect(() => assembleHomeProjects(projects.slice(1), homeProjectPlacements))
      .toThrow('unknown project')
  })

  it('validates image metadata independently from the project definition', () => {
    expect(showcaseSchema.safeParse({ images: [] }).success).toBe(false)
    const invalid = structuredClone(tailwindImages)
    invalid.images[0].width = 0
    expect(showcaseSchema.safeParse(invalid).success).toBe(false)
    expect(projectDefinitionSchema.safeParse(tailwind).success).toBe(true)
    expect(projectDefinitionSchema.safeParse({
      ...tailwind,
      visuals: { ...tailwind.visuals, showcase: tailwindImages.images },
    }).success).toBe(false)
    expect(showcaseSchema.safeParse({ ...tailwindImages, status: 'stable' }).success).toBe(false)
  })

  it('requires secure external project links', () => {
    expect(projectDefinitionSchema.safeParse({ ...tailwind, docsUrl: 'http://docs.example.com/' }).success).toBe(false)
    expect(projectDefinitionSchema.safeParse({ ...tailwind, npmUrl: 'http://npm.example.com/' }).success).toBe(false)
    expect(projectDefinitionSchema.safeParse({ ...tailwind, license: 'http://example.com/license' }).success).toBe(false)
    expect(projectDefinitionSchema.safeParse({ ...tailwind, docsUrl: 'https://docs.example.com/' }).success).toBe(true)
  })
})
