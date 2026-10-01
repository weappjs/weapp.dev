import { z } from 'astro/zod'
import { isCanonicalNpmPackageUrl } from '../lib/npm'

const httpsUrl = z.url().refine(
  value => new URL(value).protocol === 'https:',
  'External project URLs must use HTTPS',
)

const npmPackageUrl = httpsUrl.refine((value) => {
  return isCanonicalNpmPackageUrl(value)
}, 'npmUrl must be a canonical npm package URL')

const localizedContent = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  audience: z.string().min(1),
  useCases: z.array(z.string().min(1)).min(1),
  capabilities: z.array(z.string().min(1)).min(1),
  faqs: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })).min(1),
})

export const projectVisualSchema = z.object({
  src: z.string().startsWith('/'),
  avif: z.string().startsWith('/'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  variants: z.array(z.object({
    src: z.string().startsWith('/'),
    avif: z.string().startsWith('/'),
    width: z.number().int().positive(),
  })).min(1).optional(),
  locales: z.object({
    'zh-CN': z.object({ alt: z.string().min(1), caption: z.string().min(1) }),
    'en': z.object({ alt: z.string().min(1), caption: z.string().min(1) }),
  }),
})

export const projectDefinitionSchema = z.object({
  order: z.number().int().positive(),
  status: z.enum(['stable', 'beta', 'planned']),
  packageName: z.string().min(1),
  github: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  docsUrl: httpsUrl,
  npmUrl: npmPackageUrl.optional(),
  license: httpsUrl.optional(),
  maintainer: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  installCommand: z.string().min(1).optional(),
  futureDocsPath: z.string().startsWith('/docs/').endsWith('/'),
  logo: z.string().startsWith('/'),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  // Planned projects may omit platform claims until their public contract is confirmed.
  platforms: z.array(z.string().min(1)).min(1).optional(),
  visuals: z.object({
    primary: projectVisualSchema,
    secondary: projectVisualSchema,
  }).strict().optional(),
  role: z.enum(['Engineering', 'Styling', 'Components', 'Local data', 'Migration', 'Framework', 'Ecosystem']),
  ecosystem: z.enum(['weapp', 'taro', 'vue-mini', 'rezor', 'uni-app']),
  maturity: z.enum(['stable', 'beta', 'planned']),
  // Keep runtime data absent rather than presenting a provisional target as shipped scope.
  runtime: z.array(z.string().min(1)).min(1).optional(),
  relatedProjects: z.array(z.string().min(1)).min(1),
  dataCompleteness: z.enum(['complete', 'partial', 'planned']),
  quickStart: z.object({
    command: z.string().min(1).optional(),
    note: z.union([
      z.string().min(1),
      z.object({ 'zh-CN': z.string().min(1), 'en': z.string().min(1) }),
    ]).optional(),
  }).optional(),
  proof: z.array(z.union([
    z.string().min(1),
    z.object({ 'zh-CN': z.string().min(1), 'en': z.string().min(1) }),
  ])).min(1).optional(),
  roadmap: z.array(z.object({
    label: z.union([
      z.string().min(1),
      z.object({ 'zh-CN': z.string().min(1), 'en': z.string().min(1) }),
    ]),
    status: z.enum(['planned', 'in-progress', 'shipped']).optional(),
  })).min(1).optional(),
  locales: z.object({
    'zh-CN': localizedContent,
    'en': localizedContent,
  }),
})

export const showcaseSchema = z.object({ images: z.array(projectVisualSchema).min(1) }).strict()
