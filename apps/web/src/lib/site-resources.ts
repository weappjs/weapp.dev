import type { ProjectDefinition } from '../types/project'
import type { SiteProfile } from './deployment'

export interface ResourceProject {
  id: string
  data: ProjectDefinition
}

export function createSiteResources(site: SiteProfile, projects: ResourceProject[]) {
  const url = (path: string) => new URL(path, site.origin).href
  const introduction = site.features.services
    ? 'Open-source tools for JavaScript mini-app projects, with scoped engineering migration, training, and implementation services.'
    : 'An open-source project showcase for the JavaScript mini-app ecosystem. Discover related tools, their source repositories, documentation, and ways to contribute.'
  const pages = [
    ['Chinese homepage', '/'],
    ['English homepage', '/en/'],
    ['Chinese project index', '/projects/'],
    ['English project index', '/en/projects/'],
    ['Chinese privacy notice', '/privacy/'],
    ['English privacy notice', '/en/privacy/'],
    ['Release feed', '/releases.xml'],
    ['Sitemap', '/sitemap-index.xml'],
    ...(site.features.services ? [['Services', '/pricing/#services'], ['English services', '/en/pricing/#services']] : []),
    ...(site.features.sponsorship ? [['Open-source sponsorship', '/pricing/#sponsor'], ['Contributor program', '/contributors/'], ['Sponsor graph', '/sponsors/']] : []),
  ]
  const sourceLinks = projects.flatMap(({ data }) => [
    `- [${data.locales.en.name} source](https://github.com/${data.github})`,
    `- [${data.locales.en.name} documentation](${data.docsUrl})`,
    ...(data.status !== 'planned' && data.npmUrl ? [`- [${data.packageName} on npm](${data.npmUrl})`] : []),
  ])
  const serviceNotes = site.features.services
    ? '\n## Engineering services\n\nMigration, training, and implementation are scoped per project. See the services page for currently available work and planned capabilities. Open-source tools remain independently available from their repositories.\n'
    : ''
  const sponsorshipNotes = site.features.sponsorship
    ? '\n## Open-source sponsorship\n\nOne-time recognition tiers are ¥20 supporter, ¥200 Bronze, and ¥1,000 Silver. Public recognition requires identity confirmation, maintainer review, and authorization. Confirmed sponsorship is allocated 60% to core maintenance, 25% to the contributors fund, and 15% to nearby open source, net of payment fees. Sponsorship does not purchase technical support or software access. Business partnerships and service work are described separately on the website.\n'
    : ''
  const canonicalPages = `## Canonical pages\n\n${pages.map(([label, path]) => `- [${label}](${url(path)})`).join('\n')}\n`
  const sources = `## Official sources\n\n- [GitHub organization](${site.organizationUrl})\n- [Website source](${site.repositoryUrl})\n${sourceLinks.join('\n')}\n`
  const summary = [
    `# ${site.name}\n\n> ${introduction}\n`,
    `## Project pages\n\n${projects.map(({ id, data }) => `- [${data.locales.en.name}](${url(`/projects/${id}/`)}): ${data.locales.en.tagline}${data.status === 'planned' ? ' (planned; not released)' : ''}.`).join('\n')}\n`,
    sources,
    canonicalPages,
    serviceNotes,
    sponsorshipNotes,
    'For maintained facts, prefer the project pages and linked official repositories and documentation. Repository ownership follows the linked sources; planned organization moves are not represented as completed.\n',
  ].filter(Boolean).join('\n')
  const projectReferences = projects.map(({ id, data }) => {
    const content = data.locales.en
    return [
      `## ${content.name}\n`,
      `- Canonical Chinese page: ${url(`/projects/${id}/`)}`,
      `- Canonical English page: ${url(`/en/projects/${id}/`)}`,
      `- Status: ${data.status}${data.status === 'planned' ? '; not released; no production API or install command is offered' : ''}`,
      `- Documentation: ${data.docsUrl}`,
      `- Source: https://github.com/${data.github}`,
      `- Maintainer: ${data.maintainer}`,
      ...(data.status !== 'planned' && data.npmUrl ? [`- npm: ${data.npmUrl}`] : []),
      ...(data.status !== 'planned' && data.installCommand ? [`- Install: \`${data.installCommand}\``] : []),
      `- Purpose: ${content.description}`,
      `- Audience: ${content.audience}`,
      ...(data.platforms?.length ? [`- Platforms: ${data.platforms.join(', ')}`] : []),
      ...content.useCases.map(useCase => `- Use case: ${useCase}`),
      ...content.faqs.map(faq => `\n### ${faq.question}\n\n${faq.answer}`),
    ].join('\n')
  }).join('\n\n')

  return {
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap-index.xml')}\n`,
    'llms.txt': summary,
    'llms-full.txt': `# ${site.name} reference\n\n${introduction}\n\n${sources}\n${projectReferences}\n\n${canonicalPages}${serviceNotes}${sponsorshipNotes}`,
  }
}
