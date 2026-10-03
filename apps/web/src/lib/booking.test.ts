import { describe, expect, it } from 'vitest'
import { bookingCopy, bookingPage } from './booking'
import { getSiteProfile } from './deployment'

describe('booking product publishing contract', () => {
  it('keeps bilingual scope and license content aligned with an existing contact route', () => {
    expect(Object.keys(bookingCopy.en)).toEqual(Object.keys(bookingCopy['zh-CN']))
    for (const field of ['workflow', 'capabilities', 'delivery', 'deployment', 'license'] as const) {
      expect(bookingCopy.en[field]).toHaveLength(bookingCopy['zh-CN'][field].length)
    }
    expect(JSON.stringify(bookingCopy.en)).not.toMatch(/\p{Script=Han}/u)
    expect(bookingPage('zh-CN').path).toBe('/products/weapp-booking/')
    expect(bookingPage('en').path).toBe('/en/products/weapp-booking/')
    expect(bookingPage('zh-CN').contactPath).toBe('/pricing/#contact')
    expect(bookingPage('en').contactPath).toBe('/en/pricing/#contact')
    expect(getSiteProfile().navigation.find(item => item.id === 'booking')?.path).toBe(bookingPage('zh-CN').path)
  })

  it('keeps provider acceptance and commercial release pending without offers or invented prices', () => {
    expect(bookingCopy['zh-CN'].status).toContain('待验收')
    expect(bookingCopy['zh-CN'].statusDetail).toContain('尚未正式商业发布')
    expect(bookingCopy.en.status).toContain('acceptance pending')
    expect(bookingCopy.en.statusDetail).toContain('Not yet commercially released')
    expect(JSON.stringify(bookingCopy)).not.toMatch(/[¥￥$€]\s*\d|demo\.[a-z]|downloadUrl|purchaseUrl|checkoutUrl/)
  })
})
