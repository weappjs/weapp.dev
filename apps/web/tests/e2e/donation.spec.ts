import AxeBuilder from '@axe-core/playwright'
import { isOpenSourceSite } from './site-target'
import { expect, test } from './test'
import { applyTheme } from './theme'

const routes = ['pricing/', 'contributors/', 'sponsors/']

for (const prefix of ['/', '/en/']) {
  test(`donation guidance is readable without JavaScript in ${prefix}`, async ({ browser }) => {
    test.skip(isOpenSourceSite, 'Donation pages belong to weapp.dev')
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    try {
      for (const route of routes) {
        await page.goto(`${prefix}${route}`)
        const guidance = page.locator('[data-donation-guidance]')
        await expect(guidance).toBeVisible()
        await expect(guidance).toContainText(prefix === '/' ? '捐给 XXX 项目' : 'Donate to XXX project')
        await expect(guidance).toContainText(prefix === '/' ? '单独处理' : 'handled separately')
        await expect(guidance).toContainText(prefix === '/' ? '私信我' : 'message me privately')
      }
      await page.goto(`${prefix}pricing/`)
      const question = page.locator('#faq summary').filter({ hasText: prefix === '/' ? '忘记备注' : 'forgot to name' })
      await question.click()
      await expect(question.locator('..').locator('p')).toBeVisible()
    }
    finally {
      await context.close()
    }
  })

  test(`donation links and contributor navigation work in ${prefix}`, async ({ page, isMobile }) => {
    test.skip(isOpenSourceSite, 'Donation pages belong to weapp.dev')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${prefix}sponsors/`)
    await page.locator('.sponsors-hero a[href$="/pricing/#sponsor"]').click()
    await expect(page).toHaveURL(`${prefix}pricing/#sponsor`)
    await expect(page.locator('.donation-steps li')).toHaveCount(3)
    await expect(page.locator('.pricing-sponsor-button').first()).toHaveAttribute('href', 'https://github.com/sonofmagic/sponsors')
    await page.locator('#sponsor a[href$="/contributors/"]').click()
    const contents = page.locator(isMobile ? '.contributors-mobile-contents' : '.contributors-desktop-contents')
    if (isMobile) {
      await expect(contents).not.toHaveAttribute('open', '')
      await contents.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(contents).toHaveAttribute('open', '')
    }
    await contents.locator('a[href="#contributors-weights-title"]').click()
    await expect(page).toHaveURL(`${prefix}contributors/#contributors-weights-title`)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveCount(3)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
  })

  test(`release links remain available in ${prefix}`, async ({ page }) => {
    await page.goto(prefix)
    const link = page.locator('footer a[href="/releases.xml"]')
    await expect(link).toBeVisible()
    const response = await page.request.get('/releases.xml')
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain('https://weapp.dev/')
  })
}

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    for (const prefix of ['/', '/en/']) {
      test(`support layouts fit ${width}px ${theme} ${prefix}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Explicit viewport matrix runs once')
        await page.setViewportSize({ width, height: 1000 })
        await applyTheme(page, theme, { reducedMotion: 'reduce' })
        for (const route of isOpenSourceSite ? [''] : routes) {
          await page.goto(`${prefix}${route}`)
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${prefix}${route}`).toBe(true)
          // Body overflow clipping can hide oversized children, so check the actual controls too.
          const clipped = await page.locator('main a:visible, main button:visible, main select:visible, main input:visible, [data-site-header] a:visible, [data-site-header] summary:visible, [data-site-header] button:visible').evaluateAll(elements => elements.filter((element) => {
            if (element.closest('.home-hero-constellation, [data-home-demo], .code-window')) {
              return false
            }
            const rect = element.getBoundingClientRect()
            return rect.left < -1 || rect.right > innerWidth + 1
          }).map(element => element.textContent?.trim() || element.getAttribute('aria-label')))
          expect(clipped, `${prefix}${route} clipped controls`).toEqual([])
          if (route === 'pricing/') {
            const columns = await page.locator('.pricing-sponsor-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
            expect(columns).toBe(width <= 760 ? 1 : width <= 1100 ? 2 : 4)
          }
          if (route === 'sponsors/') {
            for (const control of await page.locator('[data-search], [data-kind], [data-reset]').all()) {
              expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
            }
          }
          if ([390, 1440].includes(width)) {
            const target = route === '' ? page.locator('#open-source-support') : route === 'pricing/' ? page.locator('#sponsor') : page.locator('main')
            await target.screenshot({ path: testInfo.outputPath(`${route.replace('/', '') || 'home'}.png`), style: '[data-site-header], body > a[href="#main-content"] { visibility: hidden !important; }' })
          }
        }
      })
    }
  }
}
