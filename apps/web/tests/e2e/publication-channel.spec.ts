import { getBuildChannel } from '../../src/lib/build-channel'
import { isOpenSourceSite, siteOrigin } from './site-target'
import { expect, test } from './test'

const channel = getBuildChannel()
const preview = channel === 'preview'

test.describe('website publication channel', () => {
  test.use({ javaScriptEnabled: false })

  for (const pathname of ['/', '/en/']) {
    test(`renders ${channel} metadata and localized notice without JavaScript at ${pathname}`, async ({ page }) => {
      await page.goto(pathname)
      await expect(page.locator('html')).toHaveAttribute('data-site-channel', channel)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}${pathname}`)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', preview ? 'noindex, follow' : 'index, follow')
      const notice = page.locator('[data-preview-notice]')
      if (preview) {
        await expect(notice).toBeVisible()
        await expect(notice).toContainText(pathname === '/' ? '预览版本，内容可能更新。' : 'Preview version. Content may change.')
        const liveLink = notice.getByRole('link', { name: pathname === '/' ? '访问正式网站' : 'Visit the live website' })
        await expect(liveLink).toHaveAttribute('href', `${siteOrigin}${pathname}`)
        await expect(liveLink).toBeVisible()
        const bounds = await liveLink.boundingBox()
        expect(bounds?.height).toBeGreaterThanOrEqual(44)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      }
      else {
        await expect(notice).toHaveCount(0)
      }
    })
  }

  test('ships channel-specific crawler rules while preserving the official sitemap', async ({ request }) => {
    const robots = await request.get('/robots.txt')
    expect(robots.ok()).toBe(true)
    expect(await robots.text()).toBe(preview
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap-index.xml\n`)
    const headers = await request.get('/_headers')
    expect(headers.status()).toBe(preview ? 200 : 404)
    if (preview) {
      expect(await headers.text()).toBe('/*\n  X-Robots-Tag: noindex, nofollow\n')
    }
    const sitemap = await request.get('/sitemap-index.xml')
    expect(sitemap.ok()).toBe(true)
    expect(await sitemap.text()).toContain(`${siteOrigin}/sitemap-`)
    const cname = await request.get('/CNAME')
    expect(cname.status()).toBe(isOpenSourceSite && !preview ? 200 : 404)
    if (isOpenSourceSite && !preview) {
      expect((await cname.text()).trim()).toBe(new URL(siteOrigin).hostname)
    }
  })
})

test.describe('preview notice viewport layout', () => {
  test.skip(!preview, 'The stable site has no preview notice')

  for (const pathname of ['/', '/en/']) {
    test(`keeps hero controls in view as the notice wraps at ${pathname}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'The explicit viewport sequence runs once')
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(pathname)
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
      const heights: number[] = []
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await page.setViewportSize(viewport)
        await page.evaluate(() => window.scrollTo(0, 0))
        await expect(page.locator('[data-preview-notice]')).toBeInViewport()
        await expect.poll(() => page.locator('.home-hero-screen').evaluate(element => Math.round(element.getBoundingClientRect().bottom))).toBe(viewport.height)
        const notice = await page.locator('[data-preview-notice]').boundingBox()
        heights.push(notice!.height)
        for (const control of await page.locator('[data-hero-controls] button').all()) {
          const bounds = await control.boundingBox()
          expect(bounds!.y).toBeGreaterThanOrEqual(0)
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)
          await control.focus()
          await expect(control).toBeFocused()
          expect(await page.evaluate(() => window.scrollY), 'Focusing hero controls must not scroll away from a hovered project').toBe(0)
        }
      }
      expect(heights[2]).toBe(heights[0])
      if (pathname === '/en/') {
        expect(heights[1], 'The narrow English notice must exercise a real line wrap').toBeGreaterThan(heights[0]!)
      }
    })
  }
})

test('keeps preview analytics disabled during real page initialization', async ({ page }) => {
  test.skip(!preview, 'Production analytics are checked separately on their official host')
  const trackerRequests: string[] = []
  page.on('request', (request) => {
    if (/google-analytics\.com|googletagmanager\.com|hm\.baidu\.com/.test(request.url())) {
      trackerRequests.push(request.url())
    }
  })
  await page.goto('/')
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-ready', '')
  await expect(page.locator('script[src*="googletagmanager"], script[src*="hm.baidu.com"]')).toHaveCount(0)
  expect(trackerRequests).toEqual([])
})
