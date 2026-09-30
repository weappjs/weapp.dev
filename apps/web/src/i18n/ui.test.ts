import { describe, expect, it } from 'vitest'
import { siteCopy } from './ui'

describe('sponsorship allocation copy', () => {
  it('keeps Chinese and English buckets at 60/25/15', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const buckets = siteCopy[locale].pricing.sponsorAllocationBuckets
      const shares = buckets.map(bucket => Number.parseInt(bucket.share, 10))
      expect(shares).toEqual([60, 25, 15])
      expect(siteCopy[locale].pricing.sponsorAllocation).not.toContain('20%')
      expect(siteCopy[locale].pricing.faq.map(item => item.answer).join(' ')).not.toContain('20%')
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100)
      expect(siteCopy[locale].contributors.buckets.map(bucket => bucket.share)).toEqual(['60%', '25%', '15%'])
    }
  })
})

describe('contributor program localization', () => {
  it('publishes English contributor and allocation text without Chinese fallback', () => {
    expect(JSON.stringify(siteCopy.en.contributors)).not.toMatch(/\p{Script=Han}/u)
    expect(JSON.stringify(siteCopy.en.pricing.sponsorAllocationBuckets)).not.toMatch(/\p{Script=Han}/u)
    expect(siteCopy.en.pricing.sponsorAllocationBuckets).toEqual(siteCopy.en.contributors.buckets)
  })

  it('preserves the same points, allocation, and real repositories in both languages', () => {
    const chinese = siteCopy['zh-CN'].contributors
    const english = siteCopy.en.contributors
    expect(english.weights.map(weight => weight.points)).toEqual(chinese.weights.map(weight => weight.points))
    expect(english.buckets.map(bucket => bucket.share)).toEqual(chinese.buckets.map(bucket => bucket.share))
    expect(english.repos).toEqual(chinese.repos)
    expect(english.repos.find(repo => repo.name === 'weapp-vite')?.url).toBe('https://github.com/weapp-vite/weapp-vite')
    expect(english.payout).toHaveLength(chinese.payout.length)
  })
})
