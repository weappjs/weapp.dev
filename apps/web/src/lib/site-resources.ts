import type { ProjectDefinition } from '../types/project'
import type { SiteProfile } from './deployment'
import { donationCopy } from '../i18n/donation'
import { bookingProductPath } from './booking'
import { projectService } from './services'

export interface ResourceProject {
  id: string
  data: ProjectDefinition
}

export function createSiteResources(site: SiteProfile, projects: ResourceProject[]) {
  const url = (path: string) => new URL(path, site.origin).href
  const introduction = 'Mini-app tools, project references, and scoped migration, training, and template customization for real repositories.'
  const pages = [
    ['Chinese homepage', '/'],
    ['English homepage', '/en/'],
    ['Chinese project index', '/projects/'],
    ['English project index', '/en/projects/'],
    ['weapp-booking product', bookingProductPath],
    ['weapp-booking product in English', `/en${bookingProductPath}`],
    ['Chinese privacy notice', '/privacy/'],
    ['English privacy notice', '/en/privacy/'],
    ['Release feed', '/releases.xml'],
    ['Sitemap', '/sitemap-index.xml'],
    ...([['Services', '/pricing/#services'], ['English services', '/en/pricing/#services']]),
    ...([['Open-source sponsorship', '/pricing/#sponsor'], ['Contributor program', '/contributors/'], ['Sponsor graph', '/sponsors/']]),
  ]
  const sourceLinks = projects.flatMap(({ data }) => [
    `- [${data.locales.en.name} source](https://github.com/${data.github})`,
    `- [${data.locales.en.name} documentation](${data.docsUrl})`,
    ...(data.status !== 'planned' && data.npmUrl ? [`- [${data.packageName} on npm](${data.npmUrl})`] : []),
  ])
  const serviceNotes = '\n## Engineering services\n\nMigration, training, and implementation are scoped per project. See the services page for currently available work and planned capabilities. Open-source tools remain independently available from their repositories.\n'
  const bookingNotes = '\n## weapp-booking\n\nAn independent commercial product for appointments, event registration, orders, check-in, and basic customer management. Implementation exists; external integration acceptance is pending, and the product is not yet commercially released. Guided demos, private deployment, customization, and source licensing can be discussed through the existing contact page. There is no public standard price, self-service purchase, hosted SaaS subscription, or public live demo. Source and delivery materials remain in a separate private repository; licensing and service scope require a written agreement.\n'
  const sponsorshipNotes = `\n## Open-source sponsorship\n\nOne-time recognition tiers are ¥20 supporter, ¥200 Bronze, and ¥1,000 Silver. Public recognition requires identity confirmation, maintainer review, and authorization. ${donationCopy.en.allocation} ${donationCopy.en.instruction} Sponsorship does not purchase technical support or software access. Business partnerships and service work are described separately on the website.\n`
  const canonicalPages = `## Canonical pages\n\n${pages.map(([label, path]) => `- [${label}](${url(path)})`).join('\n')}\n`
  const sources = `## Official sources\n\n- [GitHub organization](${site.organizationUrl})\n- [Website source](${site.repositoryUrl})\n${sourceLinks.join('\n')}\n`
  const summary = [
    `# ${site.name}\n\n> ${introduction}\n`,
    `## Project pages\n\n${projects.map(({ id, data }) => `- [${data.locales.en.name}](${url(`/projects/${id}/`)}): ${projectService({ id, data }, 'en').label}${data.status === 'planned' ? ' (planned; not released)' : ''}.`).join('\n')}\n`,
    sources,
    canonicalPages,
    serviceNotes,
    bookingNotes,
    sponsorshipNotes,
    'For maintained facts, prefer the project pages and linked official repositories and documentation. Repository ownership follows the linked sources; planned organization moves are not represented as completed.\n',
  ].filter(Boolean).join('\n')
  const projectReferences = projects.map((project) => {
    const service = projectService(project, 'en')
    return [
      `## ${project.data.locales.en.name}`,
      `- Chinese project and implementation page: ${url(`/projects/${project.id}/`)}`,
      `- Project and implementation page: ${url(`/en/projects/${project.id}/`)}`,
      `- Open-source project reference: ${service.openSourceUrl}`,
      `- Status: ${project.data.status}${service.planned ? '; not released' : ''}`,
      `- Summary: ${project.data.locales.en.description}`,
      `- Audience: ${project.data.locales.en.audience}`,
      `- Capabilities: ${project.data.locales.en.capabilities.join('; ')}`,
      `- Use cases: ${project.data.locales.en.useCases.join('; ')}`,
      `- Service availability: ${service.label}`,
      service.scope,
    ].join('\n')
  }).join('\n\n')

  return {
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap-index.xml')}\n`,
    'llms.txt': summary,
    'llms-full.txt': `# ${site.name} reference\n\n${introduction}\n\n${sources}\n${projectReferences}\n\n${canonicalPages}${serviceNotes}${bookingNotes}${sponsorshipNotes}`,
  }
}
