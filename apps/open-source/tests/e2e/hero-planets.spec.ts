import { expect, test } from './test'

for (const path of ['/', '/en/']) {
  test(`planet logos load and remain keyboard accessible on ${path}`, async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.addInitScript(value => localStorage.setItem('weapp-theme', value), theme)
      await page.goto(path)
      const planets = page.locator('.home-hero-planet')
      await expect(planets).toHaveCount(8)
      const rezorLink = page.locator('.home-hero-planet[data-analytics-project="rezor"]')
      await expect(rezorLink).toHaveAttribute('href', 'https://github.com/rezorjs/rezor')
      await expect(rezorLink.locator('img')).toHaveAttribute('src', /(?:^|\/)brands\/rezor\.png$/)
      for (const planet of await planets.all()) {
        await planet.locator('img').evaluate(async (image: HTMLImageElement) => image.decode())
        const width = await planet.locator('img').evaluate(image => image.getBoundingClientRect().width)
        expect(width).toBeGreaterThanOrEqual(31)
        await planet.focus()
        await expect(planet).toBeFocused()
        const state = await planet.evaluate((element) => {
          const style = getComputedStyle(element)
          return { playState: style.animationPlayState, outline: style.outlineStyle }
        })
        expect(state.playState).toBe('paused')
        expect(state.outline).toBe('solid')
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const planet of await planets.all()) {
        await planet.focus()
        expect(await planet.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
  })

  test(`planet links and logos work without JavaScript on ${path}`, async ({ browser, baseURL, viewport }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      await page.goto(path)
      const planets = page.locator('.home-hero-planet')
      await expect(planets).toHaveCount(8)
      for (const planet of await planets.all()) {
        await expect(planet).toBeVisible()
        await expect(planet).toHaveAttribute('aria-label', /.+/)
        expect(await planet.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
      }
    }
    finally {
      await context.close()
    }
  })
}
