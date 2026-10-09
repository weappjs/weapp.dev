import type { Page } from '@playwright/test'
import { installMotionClock, setPageHidden } from './hero-motion'
import { expect, test } from './test'

const constellation = 'hero-planets'
const activePlanet = '.home-hero-planet[data-planet-active]'

async function prepareSpotlight(page: Page, path: string) {
  // Freeze time before navigation: the observer must arm the intro delay before
  // the test advances it, independently of resource loading and machine speed.
  await installMotionClock(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(path)
  await expect(page.locator(constellation)).toHaveAttribute('data-planets-ready', '')
  await expect(page.locator(constellation)).toHaveAttribute('data-planets-orbit-running', '')
}

async function expectSpotlight(page: Page, index: number) {
  const selected = page.locator('.home-hero-planet').nth(index)
  await expect(page.locator(activePlanet)).toHaveCount(1)
  await expect(selected).toHaveAttribute('data-planet-active', '')
  await expect(page.locator(constellation)).not.toHaveAttribute('data-planets-orbit-running', '')
  await expect(page.locator('[data-planet-caption]')).toBeVisible()
  await expect(page.locator('[data-planet-caption-name]')).toHaveText((await selected.getAttribute('data-planet-name'))!)
  await expect(page.locator('[data-planet-caption-tagline]')).toHaveText((await selected.getAttribute('data-planet-tagline')) ?? '')
}

async function expectFreshDelay(page: Page, index: number) {
  await expect(page.locator(constellation)).toHaveAttribute('data-planets-orbit-running', '')
  await page.clock.fastForward(2999)
  await expect(page.locator(activePlanet)).toHaveCount(0)
  await page.clock.fastForward(1)
  await expectSpotlight(page, index)
}

for (const path of ['/', '/en/']) {
  test(`planet logos load and remain keyboard accessible on ${path}`, async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.addInitScript(value => localStorage.setItem('weapp-theme', value), theme)
      await page.goto(path)
      const planets = page.locator('.home-hero-planet')
      await expect(planets).toHaveCount(10)
      await expect(page.locator(constellation)).toHaveAttribute('data-planets-ready', '')
      for (const [id, docs] of [['weapp-pandacss', 'https://panda.weapp.dev/'], ['weapp-stylex', 'https://stylex.weapp.dev/']]) {
        const planet = page.locator(`.home-hero-planet[data-analytics-project="${id}"]`)
        await expect(planet).toHaveAttribute('href', docs)
        await expect(planet.locator('img')).toHaveAttribute('src', new RegExp(`(?:^|/)brands/${id}\\.svg$`))
      }
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
        const name = await planet.getAttribute('data-planet-name')
        const label = planet.locator('xpath=following-sibling::*[1]')
        await expect(label).toHaveClass('home-hero-planet-name')
        await expect(label).toHaveText(name!)
        if ((page.viewportSize()?.width ?? 0) >= 1024) {
          await expect(label).toBeVisible()
          await expect(planet).toHaveAccessibleDescription((await planet.getAttribute('data-planet-tagline'))!)
        }
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
      await expect(planets).toHaveCount(10)
      await expect(page.locator('[data-planet-toggle]')).toBeHidden()
      await expect(page.locator('[data-planet-caption]')).toBeHidden()
      for (const planet of await planets.all()) {
        await expect(planet).toBeVisible()
        await expect(planet).toHaveAttribute('aria-label', /.+/)
        expect(await planet.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
        await expect(planet).toHaveCSS('animation-name', 'none')
        if ((viewport?.width ?? 0) >= 1024) {
          await expect(planet.locator('xpath=following-sibling::*[1]')).toBeVisible()
        }
      }
    }
    finally {
      await context.close()
    }
  })

  test(`mobile planets keep their original sizes without automatic spotlights on ${path}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile viewport behavior')
    await prepareSpotlight(page, path)
    const planet = page.locator('.home-hero-planet').first()
    await expect(planet).toHaveCSS('width', '44px')
    const toggle = page.locator('[data-planet-toggle]')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAccessibleName(path === '/en/' ? 'Pause hero animation' : '暂停首屏动画')
    const target = await toggle.boundingBox()
    expect(target!.width).toBeGreaterThanOrEqual(44)
    expect(target!.height).toBeGreaterThanOrEqual(44)
    await expect(planet.locator('xpath=following-sibling::*[1]')).toBeHidden()
    await page.clock.fastForward(60000)
    await expect(page.locator(activePlanet)).toHaveCount(0)
    await planet.focus()
    await expect(planet).toBeFocused()
    await expect(page.locator('[data-planet-caption]')).toBeHidden()
    await page.setViewportSize({ width: 768, height: 900 })
    await expect(planet).toHaveCSS('width', '52px')
    await page.clock.fastForward(60000)
    await expect(page.locator(activePlanet)).toHaveCount(0)
    await page.setViewportSize({ width: 320, height: 720 })
    await expect(planet).toHaveCSS('width', '44px')
    await page.clock.fastForward(60000)
    await expect(page.locator(activePlanet)).toHaveCount(0)
  })

  test.describe(`desktop planet spotlights on ${path}`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Desktop spotlight behavior')
      await page.setViewportSize({ width: 1280, height: 900 })
    })

    test('cycles every project once, with a four-second pause and no WebGL dependency', async ({ page }) => {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) {
          if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
            return null
          }
          return getContext.call(this, contextId, options)
        } as typeof getContext
      })
      await prepareSpotlight(page, path)
      await expect(page.locator('[data-planet-caption]')).toHaveAttribute('aria-hidden', 'true')
      await expect(page.locator('[data-hero-logo]')).toHaveCSS('visibility', 'visible')
      for (let index = 0; index <= 10; index += 1) {
        await expectFreshDelay(page, index % 10)
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
        await page.clock.fastForward(3999)
        await expectSpotlight(page, index % 10)
        await page.clock.fastForward(1)
        await expect(page.locator(activePlanet)).toHaveCount(0)
        await expect(page.locator('[data-planet-caption]')).toBeHidden()
      }
    })

    test('prioritizes focus over hover and resumes a fair cycle after interaction or pause', async ({ page }) => {
      await prepareSpotlight(page, path)
      await expectFreshDelay(page, 0)
      const planets = page.locator('.home-hero-planet')
      await planets.nth(1).hover()
      await expectSpotlight(page, 1)
      await planets.nth(2).focus()
      await planets.nth(3).hover()
      await expectSpotlight(page, 2)
      await page.clock.fastForward(30000)
      await expectSpotlight(page, 2)
      const toggle = page.locator('[data-planet-toggle]')
      await toggle.focus()
      await expectSpotlight(page, 3)
      await page.mouse.move(0, 0)
      await expectFreshDelay(page, 1)
      const pauseLabel = path === '/en/' ? 'Pause hero animation' : '暂停首屏动画'
      const resumeLabel = path === '/en/' ? 'Resume hero animation' : '继续首屏动画'
      await expect(toggle).toHaveAccessibleName(pauseLabel)
      await expect(toggle.locator('[data-planet-pause-icon]')).toBeVisible()
      await expect(toggle.locator('[data-planet-play-icon]')).toBeHidden()
      await toggle.click()
      await expect(toggle).toHaveAccessibleName(resumeLabel)
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-motion-paused', '')
      await expect(toggle.locator('[data-planet-pause-icon]')).toBeHidden()
      await expect(toggle.locator('[data-planet-play-icon]')).toBeVisible()
      await page.clock.fastForward(30000)
      await expectSpotlight(page, 1)
      await toggle.click()
      await expect(toggle).toHaveAccessibleName(pauseLabel)
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(page.locator('.home-hero-screen')).not.toHaveAttribute('data-hero-motion-paused', '')
      await expect(toggle.locator('[data-planet-pause-icon]')).toBeVisible()
      await expect(toggle.locator('[data-planet-play-icon]')).toBeHidden()
      await expectFreshDelay(page, 2)
    })

    test('restarts its delay after motion, viewport, visibility and offscreen changes', async ({ page }) => {
      await prepareSpotlight(page, path)
      await expectFreshDelay(page, 0)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await expect(page.locator('[data-planet-toggle]')).toBeHidden()
      await page.clock.fastForward(60000)
      await expect(page.locator(activePlanet)).toHaveCount(0)
      const manualPlanet = page.locator('.home-hero-planet').nth(5)
      await manualPlanet.focus()
      await expectSpotlight(page, 5)
      await expect(manualPlanet.locator('.home-hero-planet-visual')).toHaveCSS('transform', 'none')
      await expect(manualPlanet.locator('.home-hero-planet-visual')).toHaveCSS('scale', 'none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect(page.locator('[data-planet-toggle]')).toBeVisible()
      await page.locator('[data-planet-toggle]').focus()
      await expectFreshDelay(page, 1)

      await page.locator('footer').scrollIntoViewIfNeeded()
      await expect(page.locator(constellation)).not.toHaveAttribute('data-planets-orbit-running', '')
      await page.clock.fastForward(60000)
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await page.locator('.home-hero-screen').scrollIntoViewIfNeeded()
      await expectFreshDelay(page, 2)

      await setPageHidden(page, true)
      await expect(page.locator(constellation)).not.toHaveAttribute('data-planets-orbit-running', '')
      await page.clock.fastForward(60000)
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await setPageHidden(page, false)
      await expectFreshDelay(page, 3)

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.locator('[data-planet-caption]')).toBeHidden()
      await expect(page.locator('[data-planet-toggle]')).toBeVisible()
      await page.clock.fastForward(60000)
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await page.setViewportSize({ width: 1280, height: 900 })
      await expectFreshDelay(page, 4)
    })

    test('cleans up a detached constellation and starts one fresh cycle after reconnection', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await prepareSpotlight(page, path)
      await expectFreshDelay(page, 0)
      await page.locator('[data-planet-toggle]').click()
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-motion-paused', '')
      const element = await page.locator(constellation).elementHandle()
      await element!.evaluate(node => node.remove())
      await expect(page.locator('[data-planet-caption]')).toBeHidden()
      await expect(page.locator('[data-planet-toggle]')).toBeHidden()
      await page.clock.fastForward(30000)
      expect(await element!.evaluate(node => ({
        ready: node.hasAttribute('data-planets-ready'),
        running: node.hasAttribute('data-planets-orbit-running'),
        active: node.querySelectorAll('[data-planet-active]').length,
      }))).toEqual({ ready: false, running: false, active: 0 })
      await element!.evaluate(node => document.querySelector('.home-hero-screen')!.append(node))
      await expect(page.locator(constellation)).toHaveAttribute('data-planets-ready', '')
      await expect(page.locator('[data-planet-toggle]')).toHaveAttribute('aria-pressed', 'true')
      await page.clock.fastForward(30000)
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await expect(page.locator(constellation)).not.toHaveAttribute('data-planets-orbit-running', '')
      await page.locator('[data-planet-toggle]').click()
      await expectFreshDelay(page, 0)
      await page.clock.fastForward(4000)
      await expectFreshDelay(page, 1)
      expect(errors).toEqual([])
    })
  })
}
