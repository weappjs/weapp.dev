import { describe, expect, it } from 'vitest'
import { getSiteProfile } from '../lib/deployment'
import { getSiteCopy, siteCopy } from './ui'

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

describe('site purpose copy', () => {
  it('keeps the open-source introduction and contribution path free of commercial content', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const copy = getSiteCopy(locale, getSiteProfile('github-pages'))
      const publicIntroduction = JSON.stringify({ hero: copy.hero, about: copy.about, collaboration: copy.collaboration, footer: copy.footer.description })
      expect(publicIntroduction).not.toMatch(/weapp\.dev|赞助|基金|付费|sponsor|paid service|fund/i)
      expect(copy.about.description).toContain('JavaScript')
      expect(copy.about.description).toContain('TypeScript')
      expect(copy.about.items[2].body).toContain('weappjs')
      expect(copy.privacy.description).toContain('weapp.js.org')
    }
  })

  it('retains engineering adoption and services copy for weapp.dev', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const copy = getSiteCopy(locale, getSiteProfile('weapp'))
      expect(copy.hero.title).toBe('weapp.dev')
      expect(copy.commercial.cards.some(card => card.kind === 'service')).toBe(true)
      expect(copy.commercial.services.length).toBeGreaterThan(0)
    }
  })

  it('describes the Pages analytics providers without claiming a Cloudflare baseline', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const copy = getSiteCopy(locale, getSiteProfile('github-pages'))
      const publicAnalytics = JSON.stringify({ privacy: copy.privacy, preferences: copy.analytics })
      expect(publicAnalytics).not.toMatch(/Cloudflare|Core Web Vitals|始终启用|always remains active/)
      expect(publicAnalytics).toContain('Google Analytics')
      expect(publicAnalytics).toContain('Global Privacy Control')
      expect(publicAnalytics).toContain('Do Not Track')
    }
  })

  it('distinguishes possible Cloudflare hosting metrics from the controllable analytics providers', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const copy = getSiteCopy(locale, getSiteProfile('weapp'))
      const hostingDisclosure = copy.privacy.sections[1].body
      expect(hostingDisclosure).toContain('Cloudflare')
      expect(hostingDisclosure).toContain(locale === 'zh-CN' ? '可能另行记录' : 'may separately record')
      expect(hostingDisclosure).toContain(locale === 'zh-CN' ? '只控制百度统计和 Google Analytics' : 'control only Baidu Analytics and Google Analytics')
      expect(JSON.stringify({ privacy: copy.privacy, preferences: copy.analytics })).not.toMatch(/始终启用|always remains active/)
    }
  })
})
