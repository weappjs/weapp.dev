import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './test'

test.use({ headless: true })
for (const prefix of ['', '/en']) {
  test(`booking responsive navigation and accessibility: ${prefix || 'zh'}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One page covers all four viewport widths')
    await page.goto(`${prefix}/products/weapp-booking/`)
    await expect(page.getByRole('heading', { name: 'weapp-booking', exact: true })).toBeVisible()
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${prefix || 'zh'} at ${width}px`).toBe(true)
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`booking-${prefix ? 'en' : 'zh'}-${width}.png`), fullPage: true })
      }
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
    await page.locator(`main a[href="${prefix}/pricing/#contact"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/pricing/#contact$`))
    await expect(page.locator('#contact a[href^="mailto:"]')).toBeVisible()
  })
}
