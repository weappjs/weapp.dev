import type { Locale, ProjectDefinition, ProjectMetrics } from '../types/project'
import { getSiteProfile } from './deployment'

const profile = getSiteProfile()
export const siteUrl = profile.origin
export const organizationId = `${siteUrl}/#organization`

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString()
}

export function canonicalUrl(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  return absoluteUrl(path)
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId,
    'name': 'weapp',
    'url': siteUrl,
    'logo': absoluteUrl('/logo.svg'),
    'sameAs': [profile.organizationUrl, profile.repositoryUrl],
  }
}

export function websiteSchema(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    'name': profile.name,
    'url': siteUrl,
    'inLanguage': locale === 'zh-CN' ? 'zh-CN' : 'en-US',
    'publisher': { '@id': organizationId },
  }
}

export function webPageSchema(locale: Locale, title: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    'name': title,
    description,
    'inLanguage': locale === 'zh-CN' ? 'zh-CN' : 'en-US',
    'isPartOf': { '@id': `${siteUrl}/#website` },
  }
}

export function projectListSchema(locale: Locale, projects: Array<{ id: string, data: ProjectDefinition }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': locale === 'zh-CN' ? `${profile.name} 项目` : `${profile.name} projects`,
    'itemListOrder': 'https://schema.org/ItemListOrderAscending',
    'numberOfItems': projects.length,
    'itemListElement': projects.map((project, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': project.data.locales[locale].name,
      'url': absoluteUrl(locale === 'zh-CN' ? `/projects/${project.id}/` : `/en/projects/${project.id}/`),
    })),
  }
}

export function projectsIndexSchema(locale: Locale, projects: Array<{ id: string, data: ProjectDefinition }>) {
  const path = locale === 'zh-CN' ? '/projects/' : '/en/projects/'
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(path),
    'name': locale === 'zh-CN' ? '工具链项目' : 'Toolchain projects',
    'url': absoluteUrl(path),
    'inLanguage': locale === 'zh-CN' ? 'zh-CN' : 'en-US',
    'isPartOf': { '@id': `${siteUrl}/#website` },
    'mainEntity': projectListSchema(locale, projects),
  }
}

export function projectSchema(
  locale: Locale,
  project: { id: string, data: ProjectDefinition },
  metrics: ProjectMetrics,
) {
  const content = project.data.locales[locale]
  const path = locale === 'zh-CN' ? `/projects/${project.id}/` : `/en/projects/${project.id}/`
  const isPlanned = project.data.status === 'planned'

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    '@id': absoluteUrl(path),
    'name': content.name,
    'description': content.description,
    'url': absoluteUrl(path),
    'image': absoluteUrl(project.data.visuals?.primary.src ?? '/logo.svg'),
    'codeRepository': `https://github.com/${project.data.github}`,
    ...(isPlanned ? {} : { downloadUrl: project.data.npmUrl }),
    'programmingLanguage': ['TypeScript', 'JavaScript'],
    'keywords': project.data.keywords.join(', '),
    ...(project.data.platforms?.length ? { runtimePlatform: project.data.platforms } : {}),
    'license': project.data.license,
    ...(isPlanned ? {} : { version: metrics.version, dateModified: metrics.releasedAt }),
    'maintainer': {
      '@type': 'Organization',
      'name': project.data.maintainer,
    },
    'mainEntityOfPage': absoluteUrl(path),
    'sameAs': [project.data.docsUrl, ...(isPlanned ? [] : [project.data.npmUrl]), `https://github.com/${project.data.github}`],
  }
}

export function breadcrumbSchema(locale: Locale, project: { id: string, data: ProjectDefinition }) {
  const homePath = locale === 'zh-CN' ? '/' : '/en/'
  const projectsLabel = locale === 'zh-CN' ? '项目' : 'Projects'
  const content = project.data.locales[locale]
  const projectPath = locale === 'zh-CN' ? `/projects/${project.id}/` : `/en/projects/${project.id}/`

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': profile.name, 'item': absoluteUrl(homePath) },
      { '@type': 'ListItem', 'position': 2, 'name': projectsLabel, 'item': absoluteUrl(`${homePath}projects/`) },
      { '@type': 'ListItem', 'position': 3, 'name': content.name, 'item': absoluteUrl(projectPath) },
    ],
  }
}
