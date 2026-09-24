import type { ProjectEntry } from './projects'

export const toolchainRoles = ['engineering', 'styling', 'components', 'data'] as const
export type ToolchainRole = typeof toolchainRoles[number]

export const catalogEcosystems = ['weapp', 'taro', 'vue-mini', 'rezor', 'uni-app'] as const
export type CatalogEcosystem = typeof catalogEcosystems[number]

export const toolchainProjectIds = ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite'] as const

const roleById: Record<string, ToolchainRole> = {
  'weapp-vite': 'engineering',
  'weapp-tailwindcss': 'styling',
  'varo': 'components',
  'weapp-sqlite': 'data',
}

const declaredRoleById: Record<string, string> = {
  'weapp-vite': 'Engineering',
  'weapp-tailwindcss': 'Styling',
  'varo': 'Components',
  'weapp-sqlite': 'Local data',
  'vite-plugin-taro': 'Migration',
}

const declaredEcosystemById: Record<string, CatalogEcosystem> = {
  'weapp-vite': 'weapp',
  'weapp-tailwindcss': 'weapp',
  'varo': 'weapp',
  'weapp-sqlite': 'weapp',
  'vite-plugin-taro': 'taro',
  'vue-mini': 'vue-mini',
  'rezor': 'rezor',
  'uni-helper': 'uni-app',
  'wot-ui': 'uni-app',
}

export function getToolchainProjects(projects: ProjectEntry[]) {
  return projects
    .filter(project => roleById[project.id])
    .sort((a, b) => toolchainRoles.indexOf(roleById[a.id]) - toolchainRoles.indexOf(roleById[b.id]))
    .map(project => ({ project, role: roleById[project.id] }))
}

export function getProjectsInEcosystem(projects: ProjectEntry[], ecosystem: CatalogEcosystem) {
  return projects
    .filter(project => project.data.ecosystem === ecosystem)
    .sort((left, right) => left.data.order - right.data.order)
}

export function getCatalogEcosystemGroups(projects: ProjectEntry[]) {
  return catalogEcosystems
    .map(id => ({ id, projects: getProjectsInEcosystem(projects, id) }))
    .filter(group => group.projects.length > 0)
}

export function getEcosystemProjects(projects: ProjectEntry[]) {
  return getProjectsInEcosystem(projects, 'uni-app')
}

const constellationExcludedIds = new Set(['weapp-sqlite'])

/** Marks that have a dedicated logo and belong on the homepage constellation. */
export function getConstellationProjects(projects: ProjectEntry[]) {
  return projects
    .filter(project => !constellationExcludedIds.has(project.id))
    .sort((left, right) => left.data.order - right.data.order)
}

/** Validate the catalog contract before any page turns it into navigation. */
export function validateToolchainCatalog(projects: ProjectEntry[]): void {
  const byId = new Map(projects.map(project => [project.id, project]))
  for (const id of toolchainProjectIds) {
    if (!byId.has(id)) {
      throw new Error(`Missing toolchain project: ${id}`)
    }
  }
  const seenOrders = new Set<number>()
  for (const project of projects) {
    const expectedOrder = toolchainProjectIds.indexOf(project.id as typeof toolchainProjectIds[number]) + 1
    if (expectedOrder > 0 && seenOrders.has(project.data.order)) {
      throw new Error(`Duplicate toolchain project order: ${project.data.order}`)
    }
    if (expectedOrder > 0) {
      seenOrders.add(project.data.order)
    }
    if (expectedOrder > 0 && project.data.order !== expectedOrder) {
      throw new Error(`Project order differs from toolchain flow: ${project.id}`)
    }
    const expectedEcosystem = declaredEcosystemById[project.id]
    if (expectedEcosystem && project.data.ecosystem !== expectedEcosystem) {
      throw new Error(`Project ecosystem differs from catalog: ${project.id}`)
    }
    for (const relatedId of project.data.relatedProjects ?? []) {
      if (!byId.has(relatedId)) {
        throw new Error(`Unknown related project ${relatedId} on ${project.id}`)
      }
      if (relatedId === project.id) {
        throw new Error(`Project cannot relate to itself: ${project.id}`)
      }
    }
    if (project.data.status === 'planned' && project.data.dataCompleteness === 'complete') {
      throw new Error(`Planned project cannot claim complete data: ${project.id}`)
    }
    if (project.data.status === 'planned' && (project.data.npmUrl || project.data.installCommand || project.data.quickStart?.command)) {
      throw new Error(`Planned project cannot publish package actions: ${project.id}`)
    }
    if (project.data.status !== 'planned' && (!project.data.platforms?.length || !project.data.runtime?.length)) {
      throw new Error(`Active project is missing platform or runtime scope: ${project.id}`)
    }
    if (project.data.status !== 'planned' && (!project.data.npmUrl || !project.data.installCommand)) {
      throw new Error(`Active project is missing package actions: ${project.id}`)
    }
    if (project.data.npmUrl) {
      const npmPath = new URL(project.data.npmUrl).pathname
      const expectedNpmPath = `/package/${project.data.packageName}`
      if (npmPath !== expectedNpmPath) {
        throw new Error(`Project npm URL does not match package name: ${project.id}`)
      }
    }
    if (project.data.maturity && project.data.maturity !== project.data.status) {
      throw new Error(`Project status and maturity differ: ${project.id}`)
    }
    if (declaredRoleById[project.id] && project.data.role !== declaredRoleById[project.id]) {
      throw new Error(`Project role differs from toolchain role: ${project.id}`)
    }
  }
}
