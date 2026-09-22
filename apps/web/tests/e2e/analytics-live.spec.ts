import { ANALYTICS_SITE_IDS } from '../../src/scripts/analytics'
import { expect, test } from './test'

const GA4_COLLECT_URL = /^https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|analytics\.google\.com)\/g\/(?:s\/)?collect(?:\?|$)/

test.skip(process.env.WEAPP_ANALYTICS_LIVE_TEST !== '1', 'Run with the dedicated analytics protocol test command.')

test('the official Google tag emits one sanitized initial page view', async ({ page }) => {
  const pageViewRequests: string[] = []
  await page.addInitScript(() => {
    Object.defineProperty(window, '__WEAPP_ANALYTICS_TEST__', { value: true })
  })
  page.on('request', (request) => {
    if (!GA4_COLLECT_URL.test(request.url())) {
      return
    }
    const url = new URL(request.url())
    if (url.searchParams.get('tid') === ANALYTICS_SITE_IDS.ga4 && url.searchParams.get('en') === 'page_view') {
      pageViewRequests.push(request.url())
    }
  })
  await page.route(GA4_COLLECT_URL, async route => route.fulfill({ status: 204 }))
  await page.route('https://hm.baidu.com/**', async route => route.fulfill({
    body: '',
    contentType: 'text/javascript',
    status: 200,
  }))

  const pageViewRequest = page.waitForRequest((request) => {
    if (!GA4_COLLECT_URL.test(request.url())) {
      return false
    }
    const url = new URL(request.url())
    return url.searchParams.get('tid') === ANALYTICS_SITE_IDS.ga4
      && url.searchParams.get('en') === 'page_view'
  })

  await page.goto('/?token=secret&utm_source=protocol#projects')
  const requestUrl = new URL((await pageViewRequest).url())
  await page.waitForTimeout(250)

  expect(pageViewRequests).toHaveLength(1)
  expect(requestUrl.searchParams.get('tid')).toBe(ANALYTICS_SITE_IDS.ga4)
  expect(requestUrl.searchParams.get('en')).toBe('page_view')
  expect(requestUrl.searchParams.get('dl')).toBe('http://127.0.0.1:4321/?utm_source=protocol')
  expect(requestUrl.searchParams.get('dp')).toBe('/?utm_source=protocol')
  expect(requestUrl.searchParams.get('dl')).not.toContain('token=secret')
})
