import type { CollectionEntry } from 'astro:content'
import { getCollection } from 'astro:content'
import { validateToolchainCatalog } from './toolchain'

export type ProjectEntry = CollectionEntry<'projects'>

export async function getProjects(): Promise<ProjectEntry[]> {
  const projects = (await getCollection('projects')).sort((left, right) => left.data.order - right.data.order)
  validateToolchainCatalog(projects)
  return projects
}

export async function getProject(slug: string): Promise<ProjectEntry | undefined> {
  return (await getProjects()).find(project => project.id === slug)
}
