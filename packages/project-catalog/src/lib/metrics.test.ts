import { describe, expect, it } from 'vitest'
import { formatCompactNumber, hasSameProjectMetricValues, isProjectMetrics, parseMetricsMap, showsPublicMetrics, usesLiveMetrics } from './metrics'

const validMetrics = {
  version: '1.2.3',
  releasedAt: '2026-08-25T00:00:00.000Z',
  stars: 321,
  weeklyDownloads: 4567,
  fetchedAt: '2026-08-26T00:00:00.000Z',
}

describe('project metrics', () => {
  it('accepts a complete metric record', () => {
    expect(isProjectMetrics(validMetrics)).toBe(true)
    expect(parseMetricsMap({ project: validMetrics })).toEqual({ project: validMetrics })
  })

  it('rejects missing, negative, or invalid values', () => {
    expect(isProjectMetrics({ ...validMetrics, stars: -1 })).toBe(false)
    expect(isProjectMetrics({ ...validMetrics, releasedAt: 'not-a-date' })).toBe(false)
    expect(parseMetricsMap({})).toBeNull()
  })

  it('ignores fetch timestamps when public metric values are unchanged', () => {
    expect(hasSameProjectMetricValues(validMetrics, {
      ...validMetrics,
      fetchedAt: '2026-09-02T00:00:00.000Z',
    })).toBe(true)
    expect(hasSameProjectMetricValues(validMetrics, {
      ...validMetrics,
      weeklyDownloads: validMetrics.weeklyDownloads + 1,
    })).toBe(false)
  })

  it('formats public metrics compactly', () => {
    expect(formatCompactNumber(11561, 'en')).toBe('11.6K')
  })

  it('hides vanity metrics for planned projects only', () => {
    expect(showsPublicMetrics('planned')).toBe(false)
    expect(showsPublicMetrics('stable')).toBe(true)
    expect(showsPublicMetrics('beta')).toBe(true)
  })

  it('refreshes live metrics only for published packages', () => {
    expect(usesLiveMetrics({ status: 'planned' })).toBe(false)
    expect(usesLiveMetrics({ status: 'planned', npmUrl: 'https://www.npmjs.com/package/weapp-sqlite' })).toBe(false)
    expect(usesLiveMetrics({ status: 'stable' })).toBe(false)
    expect(usesLiveMetrics({ status: 'stable', npmUrl: 'https://www.npmjs.com/package/weapp-vite' })).toBe(true)
    expect(usesLiveMetrics({ status: 'beta', npmUrl: 'https://www.npmjs.com/package/weapp-vite' })).toBe(true)
  })
})
