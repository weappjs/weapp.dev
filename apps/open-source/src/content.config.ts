import { projectsDirectory, showcasesDirectory } from '@weapp/project-catalog/paths'
import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'
import { projectDefinitionSchema, showcaseSchema } from './content/schemas'

const projects = defineCollection({
  loader: glob({ pattern: '**/*.json', base: projectsDirectory }),
  schema: projectDefinitionSchema,
})

const showcases = defineCollection({
  loader: glob({ pattern: '**/*.json', base: showcasesDirectory }),
  schema: showcaseSchema,
})

export const collections = { projects, showcases }
