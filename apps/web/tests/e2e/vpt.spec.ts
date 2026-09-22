import AxeBuilder from '@axe-core/playwright'
import vpt from '../../src/content/projects/vite-plugin-taro.json' with { type: 'json' }
import { expect, test } from './test'

for (const locale of ['zh-CN', 'en'] as const) {
  const home = locale === 'zh-CN' ? '/' : '/en/'
  const path = `${home}projects/vite-plugin-taro/`
  const alternate = locale === 'zh-CN' ? '/en/projects/vite-plugin-taro/' : '/projects/vite-plugin-taro/'

  test(`discovers and renders the ${locale} VPT project`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(home)
    await expect(page.locator('header a[data-analytics-project="vite-plugin-taro"]')).toHaveCount(2)
    const footerLink = page.locator('footer').getByRole('link', { name: 'VPT', exact: true })
    await expect(footerLink).toHaveAttribute('href', path)
    await footerLink.click()

    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { level: 1, name: 'VPT' })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(element => element.hasAttribute('data-visible')))
    const accessibility = await new AxeBuilder({ page }).include('main').analyze()
    expect(accessibility.violations).toEqual([])
    await expect(page.locator('main')).toContainText(vpt.locales[locale].description)
    await expect(page.locator('main a[data-analytics-target="docs"]').first()).toHaveAttribute('href', vpt.docsUrl)
    await expect(page.locator('main a[data-analytics-target="source"]')).toHaveAttribute('href', `https://github.com/${vpt.github}`)
    await expect(page.locator('main a[data-analytics-target="package"]')).toHaveAttribute('href', vpt.npmUrl)
    await expect(page.locator('pre code').filter({ hasText: vpt.installCommand })).toHaveText(vpt.installCommand)
    await expect(page.locator('[data-copy-command]')).toHaveAttribute('data-copy-command', vpt.installCommand)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://weapp.dev${path}`)
    await expect(page.locator(`link[hreflang="${locale === 'zh-CN' ? 'en-US' : 'zh-CN'}"]`)).toHaveAttribute('href', `https://weapp.dev${alternate}`)
    const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(text => JSON.parse(text))
    expect(schemas).toContainEqual(expect.objectContaining({
      '@type': 'SoftwareSourceCode',
      'name': 'VPT',
      'codeRepository': `https://github.com/${vpt.github}`,
    }))

    for (const image of await page.locator('main img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.getByRole('link', { name: locale === 'zh-CN' ? 'English' : '中文' }).click()
    await expect(page).toHaveURL(alternate)
    await expect(page.getByRole('heading', { level: 1, name: 'VPT' })).toBeVisible()
  })
}

test('includes VPT in discovery resources', async ({ request }) => {
  for (const path of ['/llms.txt', '/llms-full.txt', '/releases.xml']) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain('vite-plugin-taro')
  }
  const sitemap = await request.get('/sitemap-0.xml')
  expect(sitemap.ok()).toBe(true)
  const content = await sitemap.text()
  expect(content).toContain('https://weapp.dev/projects/vite-plugin-taro/')
  expect(content).toContain('https://weapp.dev/en/projects/vite-plugin-taro/')
})
