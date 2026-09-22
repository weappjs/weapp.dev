import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteCopy } from '../i18n/ui'
import { filterOpenSourceSponsors, isOpenSourceSponsorTier, loadPublicSponsors, sponsorGraphData } from './sponsors'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sponsor graph data', () => {
  it('filters Gold records from the public Pages sponsor view', () => {
    const snapshot = {
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 2,
      items: [
        { id: 'supporter', kind: 'individual' as const, tier: 'supporter' as const, displaySites: ['weapp' as const] },
        { id: 'bronze', kind: 'individual' as const, tier: 'bronze' as const, displaySites: ['weapp' as const] },
        { id: 'silver', kind: 'business' as const, tier: 'silver' as const, displaySites: ['weapp' as const] },
        { id: 'business', kind: 'business' as const, tier: 'gold' as const, displaySites: ['weapp' as const] },
      ],
    }

    const visible = filterOpenSourceSponsors(snapshot)
    expect(visible.items.map(item => item.id)).toEqual(['supporter', 'bronze', 'silver'])
    expect(visible.total).toBe(3)
    expect(snapshot.items).toHaveLength(4)
    const graph = sponsorGraphData(visible)
    expect(graph.nodes.filter(node => node.kind === 'sponsor').map(node => node.id)).toEqual(['sponsor:supporter', 'sponsor:bronze', 'sponsor:silver'])
    expect(graph.relationEdges.some(edge => edge.source === 'sponsor:business')).toBe(false)
  })

  it.each(['zh-CN', 'en'] as const)('keeps the three open-source tiers in %s regardless of order', (locale) => {
    const tiers = [...siteCopy[locale].pricing.sponsorTiers].reverse()
    expect(tiers.filter(tier => isOpenSourceSponsorTier(tier.id)).map(tier => tier.id)).toEqual(['silver', 'bronze', 'supporter'])
  })

  it('does not infer project funding from sponsor order or display consent', () => {
    const snapshot = {
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 2,
      items: [
        { id: 'first', kind: 'individual' as const, tier: 'supporter' as const, displaySites: ['weapp' as const, 'vite' as const] },
        { id: 'second', kind: 'individual' as const, tier: 'gold' as const, displaySites: ['weapp' as const] },
      ],
    }
    for (const items of [snapshot.items, [...snapshot.items].reverse()]) {
      const graph = sponsorGraphData({ ...snapshot, items })
      expect(graph.nodes.filter(node => node.kind === 'sponsor')).toHaveLength(2)
      expect(graph.edges.filter(edge => edge.source.startsWith('sponsor:'))).toEqual([])
    }
  })

  it('keeps graph sponsor IDs unique when called with an unsanitized snapshot', () => {
    const graph = sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 2,
      items: [
        { id: '  direct  ', kind: 'business', tier: 'gold', displaySites: ['weapp'] },
        { id: 'direct', kind: 'business', tier: 'silver', displaySites: ['vite'] },
      ],
    })

    expect(graph.nodes.filter(node => node.kind === 'sponsor')).toHaveLength(1)
    expect(graph.relationEdges.filter(edge => edge.source === 'sponsor:direct')).toEqual([{ source: 'sponsor:direct', target: 'site:weapp', value: 1, label: 'display' }])
  })

  it('drops invalid or duplicate site references before building graph edges', () => {
    const graph = sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 1,
      items: [{ id: 'acme', kind: 'business', tier: 'gold', displaySites: ['weapp', 'unknown', 'weapp'] as never }],
    })

    expect(graph.relationEdges).toEqual([{ source: 'sponsor:acme', target: 'site:weapp', value: 1, label: 'display' }])
    const nodeIds = new Set(graph.nodes.map(node => node.id))
    expect(graph.relationEdges.every(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true)
  })

  it('does not expose unsafe sponsor URLs from an unsanitized snapshot', () => {
    const graph = sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 1,
      items: [{ id: 'unsafe', kind: 'business', tier: 'gold', brandUrl: 'javascript:alert(1)', displaySites: ['weapp'] }],
    })

    expect(graph.nodes.find(node => node.id === 'sponsor:unsafe')).not.toHaveProperty('url')
  })

  it('skips malformed sponsor records without aborting graph conversion', () => {
    expect(() => sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 2,
      items: [{ id: undefined, kind: 'business', tier: 'gold', displaySites: undefined }, { id: 'valid', kind: 'business', tier: 'gold', displaySites: ['weapp'] } as never],
    } as never)).not.toThrow()
    const graph = sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 2,
      items: [{ id: undefined, kind: 'business', tier: 'gold', displaySites: undefined }, { id: 'valid', kind: 'business', tier: 'gold', displaySites: ['weapp'] } as never],
    } as never)
    expect(graph.nodes.filter(node => node.kind === 'sponsor').map(node => node.id)).toEqual(['sponsor:valid'])
  })

  it('returns the base graph when the snapshot has no item list', () => {
    const graph = sponsorGraphData({ version: 1, repositoryUrl: 'https://github.com/sonofmagic/sponsors' } as never)

    expect(graph.nodes.filter(node => node.kind === 'sponsor')).toEqual([])
    expect(graph.relationEdges).toEqual([])
    expect(graph.buckets.reduce((total, bucket) => total + bucket.share, 0)).toBe(100)
  })

  it('returns the base graph for a null snapshot', () => {
    const graph = sponsorGraphData(null as never)

    expect(graph.nodes.filter(node => node.kind === 'sponsor')).toEqual([])
    expect(graph.relationEdges).toEqual([])
  })

  it('falls back to the sponsor ID when public labels are not strings', () => {
    const graph = sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 1,
      items: [{ id: 'typed-id', brandName: { unsafe: true }, login: 42, displaySites: ['weapp'] }],
    } as never)

    expect(graph.nodes.find(node => node.id === 'sponsor:typed-id')?.name).toBe('typed-id')
  })

  it('creates valid project, sponsor, ledger and fund references', () => {
    const graph = sponsorGraphData({
      version: 1,
      repositoryUrl: 'https://github.com/sonofmagic/sponsors',
      total: 1,
      items: [{ id: 'acme', kind: 'business', tier: 'gold', brandName: 'Acme', displaySites: ['weapp'] }],
    })

    expect(graph.nodes.find(node => node.id === 'sponsor:acme')?.name).toBe('Acme')
    expect(graph.nodes.filter(node => node.kind === 'site')).toHaveLength(4)
    expect(graph.relationEdges).toEqual([{ source: 'sponsor:acme', target: 'site:weapp', value: 1, label: 'display' }])
    expect(graph.edges.some(edge => edge.source === 'ledger:net' && edge.target === 'fund:core')).toBe(true)
    expect(graph.buckets.reduce((total, bucket) => total + bucket.share, 0)).toBe(100)
    const nodeIds = new Set(graph.nodes.map(node => node.id))
    expect(graph.edges.every(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true)
  })

  it('falls back to the committed sponsor snapshot when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const snapshot = await loadPublicSponsors()

    expect(snapshot.items[0]?.brandName).toBe('Easysearch')
    expect(snapshot.items[0]?.displaySites).toContain('weapp')
  })

  it('falls back when a successful response has an invalid payload shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 9 }), { status: 200 })))

    const snapshot = await loadPublicSponsors()

    expect(snapshot.version).toBe(1)
    expect(snapshot.items[0]?.brandName).toBe('Easysearch')
  })

  it('keeps only valid public sponsors from a remote payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 4,
      items: [
        { id: 'valid', kind: 'individual', tier: 'supporter', login: 'valid', profileUrl: 'https://github.com/valid', displaySites: ['weapp'] },
        { id: 'hidden', kind: 'business', tier: 'gold', displaySites: ['vite'] },
        { id: 'bad-tier', kind: 'business', tier: 'platinum', displaySites: ['weapp'] },
        { id: '   ', kind: 'individual', tier: 'supporter', displaySites: ['weapp'] },
        { id: 'unsafe-url', kind: 'business', tier: 'gold', brandUrl: 'javascript:alert(1)', displaySites: ['weapp'] },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const snapshot = await loadPublicSponsors()

    expect(snapshot.version).toBe(4)
    expect(snapshot.items.map(item => item.id)).toEqual(['valid', 'unsafe-url'])
    expect(snapshot.items[0]?.profileUrl).toBe('https://github.com/valid')
    expect(snapshot.items[1]?.brandUrl).toBeUndefined()
  })

  it('trims public labels and drops blank display names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 'labelled', kind: 'individual', tier: 'supporter', login: '  maintainer  ', brandName: '   ', displaySites: ['weapp'] }],
    }), { status: 200 })))

    const snapshot = await loadPublicSponsors()
    expect(snapshot.items[0]).toMatchObject({ id: 'labelled', login: 'maintainer' })
    expect(snapshot.items[0]?.brandName).toBeUndefined()
    expect(sponsorGraphData(snapshot).nodes.find(node => node.id === 'sponsor:labelled')?.name).toBe('maintainer')
  })

  it('trims and deduplicates sponsor IDs before building graph nodes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        { id: '  duplicate  ', kind: 'business', tier: 'gold', brandName: 'First', displaySites: ['weapp', 'weapp', 'vite'] },
        { id: 'duplicate', kind: 'business', tier: 'silver', brandName: 'Second', displaySites: ['weapp'] },
      ],
    }), { status: 200 })))

    const snapshot = await loadPublicSponsors()
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0]).toMatchObject({ id: 'duplicate', brandName: 'First' })
    expect(snapshot.items[0]?.displaySites).toEqual(['weapp', 'vite'])
    const graph = sponsorGraphData(snapshot)
    expect(graph.nodes.filter(node => node.id === 'sponsor:duplicate')).toHaveLength(1)
    expect(graph.relationEdges.filter(edge => edge.source === 'sponsor:duplicate')).toHaveLength(2)
  })

  it.each([0, -2, 1.5, Number.NaN])('normalizes invalid snapshot version %s', async (version) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version, items: [] }), { status: 200 })))

    const snapshot = await loadPublicSponsors()

    expect(snapshot.version).toBe(1)
  })
})
