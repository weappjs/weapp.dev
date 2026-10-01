import type { ProjectEntry } from './projects'
import { homeProjectPlacements } from '../content/home-projects'
import { assembleHomeProjects } from './home-projects'

export async function getHomeProjects(projects: ProjectEntry[]) {
  return assembleHomeProjects(projects, homeProjectPlacements)
}
