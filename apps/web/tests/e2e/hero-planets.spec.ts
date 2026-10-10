import type { Page } from '@playwright/test'
import { expectStaticStarfield } from './hero-fallback'
import { installMotionClock, setPageHidden } from './hero-motion'
import { expect, test } from './test'

const constellation = 'hero-planets'
const activePlanet = '.home-hero-planet[data-planet-active]'

declare global {
  interface Window {
    __heroSpotlightDelayStartedAt: number | null
  }
}

async function prepareSpotlight(page: Page, path: string) {
  await installMotionClock(page)
  await page.addInitScript(() => {
    window.__heroSpotlightDelayStartedAt = null
    // Observe the public running state and desktop eligibility so the delay is
    // measured from readiness, interaction resume or breakpoint re-entry.
    // The mobile orbit keeps running while automatic spotlights are disabled.
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
      if (event.matches) {
        window.__heroSpotlightDelayStartedAt = performance.now()
      }
    })
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target
        if (element instanceof HTMLElement && element.matches('hero-planets')
          && element.hasAttribute('data-planets-orbit-running')) {
          window.__heroSpotlightDelayStartedAt = performance.now()
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-planets-orbit-running'] })
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(path)
  await expect(page.locator(constellation)).toHaveAttribute('data-planets-ready', '')
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => /Syne/.test(face.family) && face.status === 'loaded'))).toBe(true)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-active', '')
  await page.clock.runFor(2600)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
  await expect(page.locator(constellation)).toHaveJSProperty('inert', false)
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
  const elapsed = await page.evaluate(() => {
    if (window.__heroSpotlightDelayStartedAt === null) {
      throw new Error('The hero must enter a running desktop interval before its next spotlight')
    }
    return performance.now() - window.__heroSpotlightDelayStartedAt
  })
  expect(elapsed, 'The test must inspect the pending three-second interval').toBeLessThan(2999)
  await page.clock.fastForward(2999 - elapsed)
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
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
      await expect(page.locator(constellation)).toHaveJSProperty('inert', false)
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
      await expectStaticStarfield(page)
      for (const planet of await planets.all()) {
        expect(await planet.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
    }
  })

  test(`gates orbital planets and keeps project rail links available without JavaScript on ${path}`, async ({ browser, baseURL, viewport }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      await page.goto(path)
      await expectStaticStarfield(page, false)
      await expect(page.locator('[data-planet-toggle]')).toBeHidden()
      for (const planet of await page.locator('.home-hero-planet').all()) {
        await expect(planet).toHaveAttribute('aria-label', /.+/)
        expect(await planet.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
        await expect(planet).toHaveCSS('animation-name', 'none')
      }
      const rail = page.locator('.home-project-rail a').first()
      await rail.focus()
      await expect(rail).toBeFocused()
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

    test('cycles every project once after wordmark readiness, with a four-second pause', async ({ page }) => {
      await prepareSpotlight(page, path)
      await expect(page.locator('[data-planet-caption]')).toHaveAttribute('aria-hidden', 'true')
      await expect(page.locator('[data-hero-logo]')).toHaveCount(0)
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
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

    test('aligns the orbit highlight with the settled link after focus or hover pauses a running orbit', async ({ page }) => {
      // Use natural CSS animation time: pre-pausing or advancing a fake clock
      // would skip the pending CSS pause that previously left the arc stale.
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(path)
      const scope = page.locator(constellation)
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
      await expect.poll(() => page.locator('.home-hero-screen').evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--hero-planet-reveal')))).toBe(1)
      for (const [interaction, index] of [['focus', 2], ['hover', 7]] as const) {
        const planet = page.locator('.home-hero-planet').nth(index)
        await expect(scope).toHaveAttribute('data-planets-orbit-running', '')
        await expect.poll(() => planet.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running' && !animation.pending))).toBe(true)
        if (interaction === 'focus') {
          const wasRunning = await planet.evaluate((element: HTMLAnchorElement) => {
            const running = element.closest('hero-planets')!.hasAttribute('data-planets-orbit-running')
            element.focus({ preventScroll: true })
            return running
          })
          expect(wasRunning, 'The focus event must pause an orbit that was actually running').toBe(true)
          await expect(planet).toBeFocused()
        }
        else {
          const box = await planet.boundingBox()
          await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
        }
        await expect(planet).toHaveAttribute('data-planet-active', '')
        await expect(scope).not.toHaveAttribute('data-planets-orbit-running', '')
        const alignment = await planet.evaluate(async (element) => {
          const animations = element.getAnimations()
          await Promise.all(animations.map(animation => animation.ready))
          const beforeFrame = element.getBoundingClientRect()
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          // Measure the native stable link, whose size does not change when
          // the inner planet visual scales during a spotlight.
          const link = element.getBoundingClientRect()
          const constellation = element.closest<HTMLElement>('hero-planets')!
          const orbit = constellation.querySelector('.home-hero-orbit')!.getBoundingClientRect()
          const dx = link.left + link.width / 2 - (orbit.left + orbit.width / 2)
          const dy = link.top + link.height / 2 - (orbit.top + orbit.height / 2)
          const actual = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
          const stored = Number.parseFloat(getComputedStyle(constellation).getPropertyValue('--orbit-highlight-angle'))
          return {
            animationCount: animations.length,
            settled: animations.every(animation => !animation.pending && animation.playState === 'paused'),
            centerMovement: Math.hypot(link.left - beforeFrame.left, link.top - beforeFrame.top),
            actual,
            stored,
            error: Math.abs((stored - actual + 540) % 360 - 180),
          }
        })
        expect(alignment.animationCount, 'This regression must exercise a real CSS animation pause').toBeGreaterThan(0)
        expect(alignment.settled, 'CSS pause promises must finish before checking the arc').toBe(true)
        expect(alignment.centerMovement, 'The link must remain stationary after its pause has settled').toBeLessThan(0.001)
        expect(Number.isFinite(alignment.stored)).toBe(true)
        expect(alignment.error, `${interaction}: stored ${alignment.stored}°, stable center ${alignment.actual}°`).toBeLessThanOrEqual(0.01)
        await planet.evaluate((element: HTMLAnchorElement) => element.blur())
        await page.mouse.move(0, 0)
        await expect(scope).toHaveAttribute('data-planets-orbit-running', '')
        await expect(planet).not.toHaveAttribute('data-planet-active', '')
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

    test('keeps a ready focused project and its caption through desktop resizes, including a user pause', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await prepareSpotlight(page, path)
      await page.clock.runFor(400)
      const planet = page.locator('.home-hero-planet').nth(2)
      const toggle = page.locator('[data-planet-toggle]')
      const screen = page.locator('.home-hero-screen')
      const canvas = page.locator('.home-hero-particle-canvas')
      const resizeDesktop = async (width: number) => {
        const previousWidth = await canvas.evaluate((element: HTMLCanvasElement) => element.width)
        await page.setViewportSize({ width, height: 900 })
        // Classic scrollbars can make the stage narrower than the viewport.
        // Wait for a changed drawing buffer fitted to the real stage so the
        // observer has run before checking focus and caption continuity.
        await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement, oldWidth) => {
          const stage = element.closest<HTMLElement>('.home-hero-screen')!
          return element.width !== oldWidth && element.width === Math.floor(stage.clientWidth * Math.min(1.75, devicePixelRatio))
        }, previousWidth)).toBe(true)
      }
      for (const paused of [false, true]) {
        if (paused) {
          await resizeDesktop(1440)
          await toggle.click()
        }
        await planet.focus()
        await expectSpotlight(page, 2)
        await expect(toggle).toHaveAttribute('aria-pressed', String(paused))
        await resizeDesktop(1280)
        await expect(screen).toHaveAttribute('data-hero-phase', 'ready')
        await expect(screen).toHaveAttribute('data-particles-active', '')
        await expect(planet).toBeFocused()
        await expectSpotlight(page, 2)
        await expect(toggle).toHaveAttribute('aria-pressed', String(paused))
        if (paused) {
          await expect(screen).toHaveAttribute('data-hero-motion-paused', '')
          await expect(screen).toHaveAttribute('data-particles-paused', '')
        }
      }
    })

    test('restarts its delay after motion, viewport, visibility and offscreen changes', async ({ page }) => {
      await prepareSpotlight(page, path)
      await expectFreshDelay(page, 0)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await expect(page.locator('[data-planet-toggle]')).toBeHidden()
      await page.clock.fastForward(60000)
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await expectStaticStarfield(page)
      const manualPlanet = page.locator('.home-hero-planet').nth(5)
      await manualPlanet.evaluate((element: HTMLAnchorElement) => element.focus({ preventScroll: true }))
      await expect(manualPlanet).not.toBeFocused()
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.clock.runFor(160)
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
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
