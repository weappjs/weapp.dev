import { describe, expect, it } from 'vitest'
import { getSiteCopy } from './ui'

describe('site purpose copy', () => {
  it('keeps the open-source introduction and contribution path free of commercial content', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const copy = getSiteCopy(locale)
      const publicIntroduction = JSON.stringify({ hero: copy.hero, about: copy.about, collaboration: copy.collaboration, footer: copy.footer.description })
      expect(publicIntroduction).not.toMatch(/weapp\.dev|赞助|基金|付费|sponsor|paid service|fund/i)
      expect(copy.about.description).toContain('JavaScript')
      expect(copy.about.description).toContain('TypeScript')
      expect(copy.about.items[2].body).toContain('weappjs')
      expect(copy.privacy.description).toContain('weapp.js.org')
    }
  })

  it('describes the Pages analytics providers without claiming a Cloudflare baseline', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const copy = getSiteCopy(locale)
      const publicAnalytics = JSON.stringify({ privacy: copy.privacy, preferences: copy.analytics })
      expect(publicAnalytics).not.toMatch(/Cloudflare|Core Web Vitals|始终启用|always remains active/)
      expect(publicAnalytics).toContain('Google Analytics')
      expect(publicAnalytics).toContain('Global Privacy Control')
      expect(publicAnalytics).toContain('Do Not Track')
    }
  })
})
