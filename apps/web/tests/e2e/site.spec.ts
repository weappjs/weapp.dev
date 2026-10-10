import AxeBuilder from '@axe-core/playwright'
import { isOpenSourceSite } from './site-target'
import { expect, test } from './test'

async function enableAnalyticsTestMode(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__WEAPP_ANALYTICS_TEST__', { value: true })
  })
}

async function mockAnalyticsScripts(
  page: import('@playwright/test').Page,
  options: { failGa4Attempts?: number } = {},
) {
  let ga4Attempts = 0
  await page.route('https://www.googletagmanager.com/**', async route => route.fulfill({
    status: ga4Attempts++ < (options.failGa4Attempts ?? 0) ? 503 : 200,
    body: '',
    contentType: 'text/javascript',
  }))
  await page.route('https://hm.baidu.com/**', async route => route.fulfill({
    body: '',
    contentType: 'text/javascript',
    status: 200,
  }))
}

test('renders the bilingual pricing and delivery page', async ({ page }) => {
  test.skip(isOpenSourceSite, 'Sponsorship and services belong to weapp.dev')
  await page.goto('/pricing/')
  await expect(page.getByRole('heading', { level: 1, name: '围绕真实项目的迁移与培训' })).toBeVisible()
  await expect(page.locator('#plans')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^(Community|Pro|Team|Enterprise)$/ })).toHaveCount(0)
  await expect(page.getByText('¥20', { exact: true })).toBeVisible()
  await expect(page.getByText('¥200', { exact: true })).toBeVisible()
  await expect(page.getByText('¥1,000', { exact: true })).toBeVisible()
  await expect(page.getByText('¥2,000 起', { exact: true })).toBeVisible()
  await expect(page.locator('#sponsor')).toContainText('60% 核心维护')
  await expect(page.locator('#sponsor')).toContainText('25% 贡献者基金')
  await expect(page.locator('#sponsor')).toContainText('15% 周边开源')
  await expect(page.locator('#sponsor')).toContainText('赞助不是购买服务')
  await expect(page.locator('#sponsor')).toContainText('weapp.dev、tw.weapp.dev、vite.weapp.dev')
  await expect(page.locator('#sponsor')).toContainText('Easysearch')
  await expect(page.locator('#roadmap')).toContainText('建设中的能力')
  await expect(page.locator('#cloud-build')).toContainText('仍在建设中')
  await expect(page.locator('#services')).toContainText('¥8,000-15,000')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://weapp.dev/pricing/')
  await expect(page.locator('link[hreflang="en-US"]')).toHaveAttribute('href', 'https://weapp.dev/en/pricing/')
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2)
  await expect(page.locator('script[type="application/ld+json"]').nth(1)).not.toContainText('Offer')

  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\/pricing\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Migration and training for your project' })).toBeVisible()
  await expect(page.locator('#sponsor')).toContainText('¥1,000')
  await expect(page.locator('#sponsor')).toContainText('60% Core maintenance')
  await expect(page.locator('#sponsor')).toContainText('25% Contributors fund')
  await expect(page.locator('#sponsor')).toContainText('15% Adjacent open source')
  await expect(page.locator('#plans')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^(Community|Pro|Team|Enterprise)$/ })).toHaveCount(0)
})

test('light and dark headers keep readable flyouts', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript(selectedTheme => localStorage.setItem('weapp-theme', selectedTheme), theme)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.locator('[data-project-menu] summary').click()
    const flyout = page.locator('[data-header-flyout]').first()
    await expect(flyout).toBeVisible()
    const colors = await flyout.evaluate((element) => {
      const panel = getComputedStyle(element)
      const link = getComputedStyle(element.querySelector('a')!)
      const parse = (value: string) => value.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
      const [pr, pg, pb] = parse(panel.backgroundColor)
      const [lr, lg, lb] = parse(link.color)
      const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      return {
        panel: luminance(pr, pg, pb),
        link: luminance(lr, lg, lb),
      }
    })
    if (theme === 'light') {
      expect(colors.panel, theme).toBeGreaterThan(0.7)
      expect(colors.link, theme).toBeLessThan(0.45)
    }
    else {
      expect(colors.panel, theme).toBeLessThan(0.25)
      expect(colors.link, theme).toBeGreaterThan(0.55)
    }
    await page.keyboard.press('Escape')
  }
})

test('theme control changes and persists the selected theme', async ({ page }) => {
  await page.goto('/')
  const initial = await page.locator('html').getAttribute('data-theme')
  await page.getByRole('button', { name: '切换主题' }).click()
  const next = initial === 'dark' ? 'light' : 'dark'
  await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', next)
})

test('publishes indexable SEO resources and keeps 404 out of the index', async ({ page, request }) => {
  const llms = await request.get('/llms.txt')
  expect(llms.ok()).toBeTruthy()
  expect(await llms.text()).toContain('weapp-tailwindcss')

  const sitemap = await request.get('/sitemap-index.xml')
  expect(sitemap.ok()).toBeTruthy()
  expect(await sitemap.text()).not.toContain('/404')

  await page.goto('/404/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('passes automated accessibility checks in light and dark themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(selectedTheme => localStorage.setItem('weapp-theme', selectedTheme), theme)
    for (const path of (isOpenSourceSite ? ['/', '/en/', '/projects/', '/en/projects/'] : ['/', '/en/', '/pricing/', '/en/pricing/'])) {
      await page.goto(path)
      await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(element => element.hasAttribute('data-visible')))
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations, `${path} ${theme} theme violations`).toEqual([])
    }
  }
})

test('supports keyboard navigation and activation', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main-content$/)

  const themeToggle = page.getByRole('button', { name: '切换主题' })
  await themeToggle.focus()
  const initial = await page.locator('html').getAttribute('data-theme')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial === 'dark' ? 'light' : 'dark')
})

test('has no horizontal overflow or clipped interactive labels', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    controls: [...document.querySelectorAll<HTMLElement>('a, button, summary')]
      .filter(element => Boolean(element.textContent?.trim()) && element.scrollWidth > element.clientWidth + 1)
      .map(element => element.textContent?.trim() || element.getAttribute('aria-label')),
  }))
  expect(overflow).toEqual({ document: false, controls: [] })
})

test('keeps every key route stable across responsive viewports', async ({ page }) => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 },
  ]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const layout = await page.evaluate(() => {
      const title = document.querySelector('#home-hero-title')
      const box = title?.getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroTitleVisible: Boolean(box && box.top >= 0 && box.bottom <= innerHeight),
        wrappedControls: [...document.querySelectorAll<HTMLElement>('a, button, summary')]
          .filter(element => Boolean(element.textContent?.trim()) && element.scrollWidth > element.clientWidth + 1)
          .map(element => element.textContent?.trim() || element.getAttribute('aria-label')),
      }
    })
    expect(layout, `${viewport.width}px layout`).toEqual({ overflow: false, heroTitleVisible: true, wrappedControls: [] })
  }
})

test('provides a working mobile navigation menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.locator('summary[aria-label="打开导航"]')
  await menu.click()
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(mobileNav).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: 'weapp-vite' })).toBeVisible()
  await menu.click()
  await expect(mobileNav).not.toBeVisible()
})

test('opens analytics preferences directly from the privacy page', async ({ page }) => {
  await page.goto('/privacy/')
  await page.getByRole('button', { name: '打开统计偏好' }).click()
  await expect(page.getByRole('dialog', { name: '统计偏好' })).toBeVisible()
})

test('loads both analytics providers by default without a consent banner', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page)

  const configRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/analytics/config')) {
      configRequests.push(request.url())
    }
  })

  await page.goto('/?token=secret&utm_source=e2e#projects')
  await expect(page.locator('#weapp-ga4')).toHaveCount(1)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)
  await expect(page.locator('[data-analytics-banner]')).toHaveCount(0)
  expect(configRequests).toEqual([])

  const dataLayer = await page.evaluate(() => (window.dataLayer ?? []).map(command => Array.from(command as ArrayLike<unknown>)))
  expect(dataLayer.filter(command => command[0] === 'config')).toEqual([[
    'config',
    'G-P7XL4TEVNM',
    expect.objectContaining({
      page_location: 'http://127.0.0.1:4321/?utm_source=e2e',
      page_path: '/?utm_source=e2e',
      send_page_view: true,
    }),
  ]])
  expect(dataLayer.filter(command => command[0] === 'event' && command[1] === 'page_view')).toEqual([])
})

test('supports a persistent opt-out and re-enable for both providers', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page)

  await page.goto('/')
  await expect(page.locator('#weapp-ga4')).toHaveCount(1)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)

  await page.getByRole('button', { name: '统计偏好' }).click()
  const dialog = page.getByRole('dialog', { name: '统计偏好' })
  await expect(dialog).toBeVisible()
  const enabled = dialog.getByRole('checkbox')
  await expect(enabled).toBeChecked()
  await enabled.uncheck()
  await dialog.getByRole('button', { name: '保存偏好' }).click()

  await page.waitForLoadState('load')
  await expect(page.locator('#weapp-ga4')).toHaveCount(0)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('weapp-analytics-consent:v1')))
    .toBe('{"choice":"denied","version":1}')

  await page.getByRole('button', { name: '统计偏好' }).click()
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '保存偏好' }).click()
  await expect(page.locator('#weapp-ga4')).toHaveCount(1)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)
})

test('honors browser privacy signals', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true })
  })
  await mockAnalyticsScripts(page)

  await page.goto('/')
  await expect(page.locator('#weapp-ga4')).toHaveCount(0)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(0)
  await page.getByRole('button', { name: '统计偏好' }).click()
  await expect(page.getByText('浏览器已启用全局隐私控制')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('checkbox')).toBeDisabled()
})

test('keeps the other provider working when GA4 fails to load', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page, { failGa4Attempts: Number.POSITIVE_INFINITY })

  await page.goto('/')
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'weapp.dev', exact: true })).toBeAttached()
  await expect(page.locator('#home-hero-title')).toHaveText('weapp.dev')
})

test('retries a failed GA4 script without duplicating its configuration', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page, { failGa4Attempts: 1 })

  await page.goto('/?token=secret&utm_source=retry')
  await expect(page.locator('#weapp-ga4[data-failed="true"]')).toHaveCount(1)

  await page.getByRole('button', { name: '统计偏好' }).click()
  const dialog = page.getByRole('dialog', { name: '统计偏好' })
  await dialog.getByRole('button', { name: '保存偏好' }).click()
  await expect(page.locator('#weapp-ga4[data-loaded="true"]')).toHaveCount(1)

  const dataLayer = await page.evaluate(() => (window.dataLayer ?? []).map(command => Array.from(command as ArrayLike<unknown>)))
  expect(dataLayer.filter(command => command[0] === 'config')).toHaveLength(1)
  expect(dataLayer.filter(command => command[0] === 'event' && command[1] === 'page_view')).toEqual([])
})
