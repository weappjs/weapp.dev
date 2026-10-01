import type { APIRoute } from 'astro'
import { getSiteProfile } from '../lib/deployment'
import { loadProjectMetrics } from '../lib/metrics'
import { getProjects } from '../lib/projects'
import { getReleaseLink } from '../lib/releases'

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export const GET: APIRoute = async () => {
  const profile = getSiteProfile()
  const projects = await getProjects()
  const metrics = await loadProjectMetrics()
  const items = projects.map((project) => {
    const release = metrics[project.id]
    const releaseLink = getReleaseLink(project.data.status, project.data.npmUrl)
    if (!release || !releaseLink) {
      return ''
    }
    const link = escapeXml(releaseLink)
    return `<item><title>${escapeXml(project.data.packageName)} ${escapeXml(release.version)}</title><link>${link}</link><guid isPermaLink="false">${escapeXml(project.data.packageName)}@${escapeXml(release.version)}</guid><pubDate>${new Date(release.releasedAt).toUTCString()}</pubDate><description>${escapeXml(project.data.locales.en.tagline)}</description></item>`
  }).join('')

  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${profile.name} releases</title><link>${profile.origin}/</link><description>Release updates from the weapp open-source ecosystem.</description><language>en</language>${items}</channel></rss>`
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
