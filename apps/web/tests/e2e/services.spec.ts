import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './test'

for (const prefix of ['', '/en']) {
  test(`service home and project scope: ${prefix || 'zh'}`, async ({ page }) => {
    await page.goto(`${prefix}/`)
    await expect(page.locator('h1')).toContainText('weapp.dev')
    for (const section of ['open-source', 'services', 'projects', 'process', 'roadmap', 'contact', 'open-source-support']) {
      await expect(page.locator(`#${section}`)).toBeVisible()
    }
    await expect(page.locator('#open-source a').first()).toHaveAttribute('href', `https://weapp.js.org${prefix}/`)
    await expect(page.locator('[data-hero-particles]')).toHaveAttribute('data-wordmark', 'weapp.dev')
    await expect(page.locator('#services')).toContainText('¥8,000-15,000')
    await expect(page.locator('#roadmap')).toContainText(prefix ? 'not offered yet' : '不提供订阅')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://weapp.dev${prefix}/`)
    await page.goto(`${prefix}/projects/`)
    await expect(page.locator('[data-project-card]')).toHaveCount(11)
    for (const slug of ['weapp-vite', 'weapp-tailwindcss', 'weapp-pandacss', 'weapp-stylex', 'varo', 'weapp-sqlite', 'vite-plugin-taro', 'vue-mini', 'rezor', 'uni-helper', 'wot-ui']) {
      await page.goto(`${prefix}/projects/${slug}/`)
      await expect(page.locator(`main a[href="https://weapp.js.org${prefix}/projects/${slug}/"]`)).toHaveCount(1)
      const available = ['weapp-vite', 'weapp-tailwindcss'].includes(slug)
      await expect(page.locator('main a[href$="/pricing/#contact"]')).toHaveCount(available ? 1 : 0)
      if (slug === 'weapp-sqlite') {
        await expect(page.locator('[data-service-scope]')).toContainText(prefix ? 'has not shipped' : '尚未发布')
      }
      const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(schemas.join(' ')).not.toContain('SoftwareSourceCode')
      expect(schemas.join(' ').includes('"@type":"Service"')).toBe(available)
    }
  })
  test(`service pages are accessible in both themes: ${prefix || 'zh'}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const path of ['/', '/projects/', '/projects/weapp-vite/', '/projects/weapp-sqlite/']) {
      await page.goto(prefix + path)
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme)
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
  })
}

test.describe('static commercial content', () => {
  test.use({ javaScriptEnabled: false })
  test('services and existing contact methods work without scripts', async ({ page }) => {
    for (const prefix of ['', '/en']) {
      await page.goto(`${prefix}/`)
      await expect(page.locator('#services')).toBeVisible()
      await expect(page.locator('#contact a[href^="mailto:"]')).toBeVisible()
      await page.goto(`${prefix}/projects/weapp-vite/`)
      await page.locator('main a[href$="/pricing/#contact"]').click()
      await expect(page.locator('#contact')).toBeVisible()
    }
  })
})
