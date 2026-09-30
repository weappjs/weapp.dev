import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_CONSENT_KEY,
  hasPrivacySignal,
  isProductionAnalyticsHost,
  mapBaiduEvent,
  normalizeAnalyticsEvent,
  readAnalyticsConsent,
  sanitizeAnalyticsUrl,
  writeAnalyticsConsent,
} from './analytics'

describe('analytics client policy', () => {
  it('persists only versioned consent values', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    expect(readAnalyticsConsent(storage)).toBeNull()
    writeAnalyticsConsent(storage, 'granted')
    expect(values.get(ANALYTICS_CONSENT_KEY)).toBe('{"choice":"granted","version":1}')
    expect(readAnalyticsConsent(storage)).toBe('granted')
    values.set(ANALYTICS_CONSENT_KEY, '{"choice":"granted","version":2}')
    expect(readAnalyticsConsent(storage)).toBeNull()
  })

  it('loads production analytics only on this application host', () => {
    expect(isProductionAnalyticsHost('weapp.dev')).toBe(true)
    expect(isProductionAnalyticsHost('weapp.js.org')).toBe(false)
    expect(isProductionAnalyticsHost('www.weapp.dev')).toBe(false)
    expect(isProductionAnalyticsHost('localhost')).toBe(false)
  })

  it('honors Global Privacy Control and Do Not Track', () => {
    expect(hasPrivacySignal({ globalPrivacyControl: true })).toBe(true)
    expect(hasPrivacySignal({ doNotTrack: '1' })).toBe(true)
    expect(hasPrivacySignal({ doNotTrack: '0' })).toBe(false)
  })

  it('keeps only bounded UTM parameters in page URLs', () => {
    expect(sanitizeAnalyticsUrl('https://weapp.dev/projects/weapp-vite/?token=secret&utm_source=github#install'))
      .toBe('https://weapp.dev/projects/weapp-vite/?utm_source=github')
  })

  it('allows only the declared parameters for each event', () => {
    expect(normalizeAnalyticsEvent('click_outbound', {
      project: 'weapp-vite',
      target: 'docs',
      url: 'https://example.com/private',
    })).toEqual({ project: 'weapp-vite', target: 'docs' })
    expect(mapBaiduEvent('switch_language', { from: 'zh-CN', to: 'en' }))
      .toEqual(['site', 'switch_language', 'zh-CN:en'])
    expect(normalizeAnalyticsEvent('select_related_project', { from: 'varo', project: 'weapp-sqlite' }))
      .toEqual({ from: 'varo', project: 'weapp-sqlite' })
    expect(normalizeAnalyticsEvent('copy_command', { project: 'weapp-vite', secret: 'drop' }))
      .toEqual({ project: 'weapp-vite' })
  })
})
