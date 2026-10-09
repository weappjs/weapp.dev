import type { z } from 'astro/zod'
import type { projectDefinitionSchema, projectVisualSchema } from '../content/schemas'

export type Locale = 'zh-CN' | 'en'
export type ProjectDefinition = z.infer<typeof projectDefinitionSchema>
export type ProjectVisual = z.infer<typeof projectVisualSchema>
export type LocalizedProjectContent = ProjectDefinition['locales'][Locale]

export interface ProjectMetrics {
  version: string
  releasedAt: string
  stars: number
  /** null means the npm downloads API has not published a count yet. */
  weeklyDownloads: number | null
  fetchedAt: string
}

export type ProjectMetricsMap = Record<string, ProjectMetrics>
