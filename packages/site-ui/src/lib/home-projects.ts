import type { Locale, ProjectDefinition } from '@weapp/project-catalog/types'

export type HomeDemoKind = 'style' | 'build' | 'registry' | 'sqlite' | 'migration'

export interface HomeProjectPlacement {
  id: string
  demo: HomeDemoKind
  reversed: boolean
  stage: Record<Locale, string>
}

export interface HomeProject extends HomeProjectPlacement {
  data: ProjectDefinition
}

interface CatalogProject {
  id: string
  data: ProjectDefinition
}

export function assembleHomeProjects(
  projects: CatalogProject[],
  placements: HomeProjectPlacement[],
): HomeProject[] {
  const catalog = new Map(projects.map(project => [project.id, project.data]))
  const used = new Set<string>()
  return placements.map((placement) => {
    if (used.has(placement.id)) {
      throw new Error(`Duplicate home project: ${placement.id}`)
    }
    used.add(placement.id)
    const data = catalog.get(placement.id)
    if (!data) {
      throw new Error(`Home placement references unknown project: ${placement.id}`)
    }
    return { ...placement, data }
  })
}
