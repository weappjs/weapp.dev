export type SponsorSite = 'icebreaker' | 'weapp' | 'tw' | 'vite'
export type SponsorTier = 'supporter' | 'bronze' | 'silver' | 'gold'
export const openSourceSponsorTiers: readonly SponsorTier[] = ['supporter', 'bronze', 'silver']

export interface PublicSponsor {
  id: string
  kind: 'individual' | 'business'
  tier: SponsorTier
  login?: string
  profileUrl?: string
  avatarUrl?: string
  brandName?: string
  brandUrl?: string
  logoUrl?: string
  displaySites: SponsorSite[]
}

export interface SponsorSnapshot {
  version: number
  repositoryUrl: string
  total: number
  items: PublicSponsor[]
}

export function isOpenSourceSponsorTier(tier: SponsorTier): boolean {
  return openSourceSponsorTiers.includes(tier)
}

export function filterOpenSourceSponsors(snapshot: SponsorSnapshot): SponsorSnapshot {
  const items = snapshot.items.filter(item => isOpenSourceSponsorTier(item.tier))
  return { ...snapshot, total: items.length, items }
}

export type SponsorGraphNodeKind = 'sponsor' | 'project' | 'fund' | 'site'
export interface SponsorGraphNode { id: string, name: string, kind: SponsorGraphNodeKind, value?: number, url?: string }
export interface SponsorGraphEdge { source: string, target: string, value: number, label?: string }
export interface SponsorGraphData { nodes: SponsorGraphNode[], edges: SponsorGraphEdge[], relationEdges: SponsorGraphEdge[], buckets: Array<{ id: string, name: string, share: number, body: string }> }

const repositoryUrl = 'https://github.com/sonofmagic/sponsors'
const sponsorRequestTimeoutMs = 8_000
const fallback: SponsorSnapshot = {
  version: 1,
  repositoryUrl,
  total: 1,
  items: [{
    id: 'manual:easysearch',
    kind: 'business',
    tier: 'gold',
    brandName: 'Easysearch',
    brandUrl: 'https://easysearch.cn/',
    logoUrl: 'https://icebreaker.top/generated/sponsors/gold-manual-easysearch.webp',
    displaySites: ['icebreaker', 'weapp', 'tw', 'vite'],
  }],
}
const allSites: SponsorSite[] = ['icebreaker', 'weapp', 'tw', 'vite']

function sanitizeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  }
  catch {
    return undefined
  }
}

function sanitize(value: unknown): PublicSponsor | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id.trim().length === 0 || (item.kind !== 'individual' && item.kind !== 'business')) {
    return undefined
  }
  if (!['supporter', 'bronze', 'silver', 'gold'].includes(String(item.tier))) {
    return undefined
  }
  const displaySites = Array.isArray(item.displaySites)
    ? [...new Set(item.displaySites.filter((site): site is SponsorSite => allSites.includes(site as SponsorSite)))]
    : []
  if (!displaySites.includes('weapp')) {
    return undefined
  }
  const id = item.id.trim()
  const login = typeof item.login === 'string' ? item.login.trim() : ''
  const brandName = typeof item.brandName === 'string' ? item.brandName.trim() : ''
  const profileUrl = sanitizeUrl(item.profileUrl)
  const avatarUrl = sanitizeUrl(item.avatarUrl)
  const brandUrl = sanitizeUrl(item.brandUrl)
  const logoUrl = sanitizeUrl(item.logoUrl)
  return {
    id,
    kind: item.kind,
    tier: item.tier as SponsorTier,
    ...(login ? { login } : {}),
    ...(profileUrl ? { profileUrl } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(brandName ? { brandName } : {}),
    ...(brandUrl ? { brandUrl } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    displaySites,
  }
}

export async function loadPublicSponsors(): Promise<SponsorSnapshot> {
  const endpoint = import.meta.env.SPONSOR_SNAPSHOT_URL || 'https://icebreaker.top/api/sponsor/v1/sponsors'
  try {
    const headers: Record<string, string> = {}
    if (import.meta.env.SPONSOR_API_TOKEN) {
      headers.Authorization = `Bearer ${import.meta.env.SPONSOR_API_TOKEN}`
    }
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(sponsorRequestTimeoutMs) })
    if (!response.ok) {
      throw new Error(`Sponsor snapshot returned ${response.status}`)
    }
    const rawPayload = await response.json() as unknown
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      throw new TypeError('Sponsor snapshot payload must be an object')
    }
    const payload = rawPayload as Record<string, unknown>
    if (!Array.isArray(payload.items)) {
      throw new TypeError('Sponsor snapshot payload is missing items')
    }
    const items = payload.items.map(sanitize).filter((item): item is PublicSponsor => Boolean(item)).reduce<PublicSponsor[]>((unique, item) => {
      if (!unique.some(existing => existing.id === item.id)) {
        unique.push(item)
      }
      return unique
    }, [])
    const version = typeof payload.version === 'number' && Number.isInteger(payload.version) && payload.version > 0 ? payload.version : 1
    return { version, repositoryUrl, total: items.length, items }
  }
  catch {
    return fallback
  }
}

const projects = [
  ['project:weapp-vite', 'weapp-vite', 'https://github.com/weapp-vite/weapp-vite'],
  ['project:weapp-tailwindcss', 'weapp-tailwindcss', 'https://github.com/sonofmagic/weapp-tailwindcss'],
  ['project:weapp-dev', 'weapp.dev', 'https://github.com/sonofmagic/weapp.dev'],
] as const
const sites = [
  ['site:weapp', 'weapp.dev', 'https://weapp.dev/'],
  ['site:tw', 'tw.weapp.dev', 'https://tw.weapp.dev/'],
  ['site:vite', 'vite.weapp.dev', 'https://vite.weapp.dev/'],
  ['site:icebreaker', 'icebreaker.top', 'https://icebreaker.top/'],
] as const

export function sponsorGraphData(snapshot: SponsorSnapshot): SponsorGraphData {
  const nodes: SponsorGraphNode[] = projects.map(([id, name, url]) => ({ id, name, kind: 'project', url }))
  nodes.push(...sites.map(([id, name, url]) => ({ id, name, kind: 'site' as const, url })))
  const edges: SponsorGraphEdge[] = []
  const relationEdges: SponsorGraphEdge[] = []
  const seenSponsorIds = new Set<string>()
  const sponsorItems = snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.items) ? snapshot.items : []
  for (const sponsor of sponsorItems) {
    const sponsorId = typeof sponsor.id === 'string' ? sponsor.id.trim() : ''
    if (!sponsorId || seenSponsorIds.has(sponsorId)) {
      continue
    }
    seenSponsorIds.add(sponsorId)
    const brandName = typeof sponsor.brandName === 'string' ? sponsor.brandName.trim() : ''
    const login = typeof sponsor.login === 'string' ? sponsor.login.trim() : ''
    const name = brandName || login || sponsorId
    const sponsorUrl = sanitizeUrl(sponsor.brandUrl) ?? sanitizeUrl(sponsor.profileUrl)
    nodes.push({ id: `sponsor:${sponsorId}`, name, kind: 'sponsor', ...(sponsorUrl ? { url: sponsorUrl } : {}) })
    const displaySites = Array.isArray(sponsor.displaySites) ? sponsor.displaySites : []
    for (const site of [...new Set(displaySites)].filter(site => allSites.includes(site))) {
      relationEdges.push({ source: `sponsor:${sponsorId}`, target: `site:${site}`, value: 1, label: 'display' })
    }
  }
  const buckets = [
    { id: 'fund:core', name: 'Core maintenance', share: 60, body: 'Maintainer time, tests, CI, domain and docs.' },
    { id: 'fund:contributors', name: 'Contributors fund', share: 25, body: 'Quarterly pool and targeted bounties.' },
    { id: 'fund:ecosystem', name: 'Nearby open source', share: 15, body: 'Related mini-program ecosystem projects.' },
  ]
  for (const bucket of buckets) {
    nodes.push({ id: bucket.id, name: bucket.name, kind: 'fund', value: bucket.share })
    edges.push({ source: 'ledger:net', target: bucket.id, value: bucket.share, label: `${bucket.share}%` })
  }
  nodes.push({ id: 'ledger:net', name: 'Confirmed net receipts', kind: 'fund', value: 100 })
  return { nodes, edges, relationEdges, buckets }
}
