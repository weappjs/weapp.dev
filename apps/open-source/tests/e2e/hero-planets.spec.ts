import type { Locator, Page } from '@playwright/test'
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
    // Running motion stays independent of selection. A cleared spotlight also
    // starts a fresh delay even though the physical orbit keeps moving.
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
      if (event.matches) {
        window.__heroSpotlightDelayStartedAt = performance.now()
      }
    })
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target
        const scope = element instanceof HTMLElement ? element.closest('hero-planets') : null
        if (scope?.hasAttribute('data-planets-orbit-running')
          && !scope.querySelector('[data-planet-active]')) {
          window.__heroSpotlightDelayStartedAt = performance.now()
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-planets-orbit-running', 'data-planet-active'] })
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

async function expectSpotlight(page: Page, index: number, paused = false) {
  const selected = page.locator('.home-hero-planet').nth(index)
  await expect(page.locator(activePlanet)).toHaveCount(1)
  await expect(selected).toHaveAttribute('data-planet-active', '')
  if (paused) {
    await expect(page.locator(constellation)).not.toHaveAttribute('data-planets-orbit-running', '')
  }
  else {
    await expect(page.locator(constellation)).toHaveAttribute('data-planets-orbit-running', '')
  }
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

async function hoverMovingPlanet(page: Page, planet: Locator) {
  const box = await planet.boundingBox()
  if (!box) {
    throw new Error('A moving project must be visible before pointer interaction')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
}

for (const path of ['/', '/en/']) {
  for (const theme of ['light', 'dark']) {
    test(`planet logos load and remain keyboard accessible in ${theme} theme on ${path}`, async ({ page }) => {
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
        const state = await planet.evaluate(async (element) => {
          const style = getComputedStyle(element)
          const animations = element.closest('hero-planets')!.getAnimations()
          await Promise.all(animations.map(animation => animation.ready))
          return { count: animations.length, playState: animations[0]?.playState, outline: style.outlineStyle }
        })
        expect(state.count, 'Keyboard selection must retain one actual shared native orbit timeline').toBe(1)
        expect(state.playState).toBe('running')
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
      await expect(page.locator(constellation)).toHaveCSS('animation-name', 'none')
      for (const planet of await planets.all()) {
        expect(await planet.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
    })
  }

  test(`gates orbital planets and keeps project rail links available without JavaScript on ${path}`, async ({ browser, baseURL, viewport }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      await page.goto(path)
      await expectStaticStarfield(page, false)
      await expect(page.locator('[data-planet-toggle]')).toBeHidden()
      await expect(page.locator('[data-hero-replay]')).toBeHidden()
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

  test(`hero controls keep two icon targets and localized accessible names on ${path}`, async ({ page }) => {
    await prepareSpotlight(page, path)
    const controls = page.locator('[data-hero-controls]')
    await expect(controls).toBeVisible()
    await expect(controls.locator('button')).toHaveCount(2)
    const toggle = controls.locator('[data-planet-toggle]')
    const replay = controls.locator('[data-hero-replay]')
    await expect(toggle).toHaveAccessibleName(path === '/en/' ? 'Pause hero animation' : '暂停首屏动画')
    await expect(toggle).toHaveAttribute('title', path === '/en/' ? 'Pause hero animation' : '暂停首屏动画')
    await expect(replay).toHaveAccessibleName(path === '/en/' ? 'Replay hero animation' : '重播首屏动画')
    await expect(replay).toHaveAttribute('title', path === '/en/' ? 'Replay hero animation' : '重播首屏动画')
    for (const button of [toggle, replay]) {
      await expect(button).toHaveCSS('width', '44px')
      await expect(button).toHaveCSS('height', '44px')
      await expect(button.locator('svg:visible')).toHaveCount(1)
      const paintedText = await button.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const text: string[] = []
        while (walker.nextNode()) {
          const value = walker.currentNode.textContent?.trim()
          if (!value) {
            continue
          }
          let shown = true
          for (let parent = walker.currentNode.parentElement; parent && parent !== element; parent = parent.parentElement) {
            const style = getComputedStyle(parent)
            shown &&= style.display !== 'none' && style.visibility !== 'hidden'
              && style.clipPath === 'none' && style.clip === 'auto'
          }
          if (shown) {
            text.push(value)
          }
        }
        return text
      })
      expect(paintedText, 'The controls must remain pure icons at desktop and mobile widths').toEqual([])
    }
    await toggle.click()
    await expect(toggle).toHaveAccessibleName(path === '/en/' ? 'Resume hero animation' : '继续首屏动画')
    await expect(toggle).toHaveAttribute('title', path === '/en/' ? 'Resume hero animation' : '继续首屏动画')
    await expect(toggle.locator('[data-planet-play-icon]')).toBeVisible()
    await replay.focus()
    await expect(replay).toBeFocused()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(toggle).toBeHidden()
    await expect(replay).toBeHidden()
  })

  test.describe(`desktop planet spotlights on ${path}`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Desktop spotlight behavior')
      await page.setViewportSize({ width: 1280, height: 900 })
    })

    test('cycles every project once after wordmark readiness, with four seconds of emphasis while orbiting', async ({ page }) => {
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

    test('replay gates the projects and restarts the full delay from the first project', async ({ page }) => {
      await prepareSpotlight(page, path)
      await expectFreshDelay(page, 0)
      await page.clock.fastForward(4000)
      await expectFreshDelay(page, 1)
      await page.locator('[data-hero-replay]').click()
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'logo')
      await expect(page.locator(activePlanet)).toHaveCount(0)
      await expect(page.locator('[data-planet-caption]')).toBeHidden()
      await expect(page.locator(constellation)).toHaveJSProperty('inert', true)
      await expect(page.locator(constellation)).not.toHaveAttribute('data-planets-orbit-running', '')
      await page.clock.runFor(2600)
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
      await expectFreshDelay(page, 0)
    })

    test('keeps the shared-phase highlight attached to moving automatic, focused and hovered planets', async ({ page }, testInfo) => {
      // Natural animation time proves that selection keeps the physical
      // orbit moving; a fake clock cannot provide its native layout evidence.
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(path)
      const scope = page.locator(constellation)
      await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
      await expect.poll(() => page.locator('.home-hero-screen').evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--hero-planet-reveal')))).toBe(1)
      for (const [interaction, index] of [['focus', 2], ['hover', 7], ['automatic', 0]] as const) {
        let selectedIndex: number = index
        if (interaction === 'automatic') {
          await expect(page.locator(activePlanet)).toHaveCount(1)
          selectedIndex = await page.locator(activePlanet).evaluate(element => [...element.closest('hero-planets')!.querySelectorAll('.home-hero-planet')].indexOf(element))
        }
        const planet = page.locator('.home-hero-planet').nth(selectedIndex)
        await expect(scope).toHaveAttribute('data-planets-orbit-running', '')
        await expect.poll(() => scope.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running' && !animation.pending))).toBe(true)
        if (interaction === 'focus') {
          await planet.focus()
          await expect(planet).toBeFocused()
        }
        else if (interaction === 'hover') {
          const box = await planet.boundingBox()
          await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
        }
        await expectSpotlight(page, selectedIndex)
        await expect(scope).toHaveAttribute('data-planets-highlight', '')
        const alignment = await planet.evaluate(async (element) => {
          const constellation = element.closest<HTMLElement>('hero-planets')!
          const animations = constellation.getAnimations()
          await Promise.all(animations.map(animation => animation.ready))
          const measure = (frameTime: number) => {
            const link = element.getBoundingClientRect()
            const ellipse = constellation.querySelector<SVGEllipseElement>('[data-planet-highlight]')!
            const dash = getComputedStyle(ellipse).strokeDashoffset
            const resolved = dash.match(/^(?:calc\()?\s*(-?[\d.]+)(?:px)?\s*\)?$/)
            if (!resolved) {
              throw new Error(`The actual SVG dash offset must resolve to one scalar, received ${dash}`)
            }
            const offset = Number(resolved[1])
            const along = ((2.5 - offset) / 100 % 1 + 1) % 1
            const point = ellipse.getPointAtLength(along * ellipse.getTotalLength()).matrixTransform(ellipse.getScreenCTM()!)
            const style = getComputedStyle(constellation)
            const phase = Number.parseFloat(style.getPropertyValue('--orbit-turn'))
            const selected = Number.parseFloat(style.getPropertyValue('--orbit-highlight-p'))
            const animationTime = animations[0]?.currentTime
            return {
              sampledAt: performance.now(),
              frameTime,
              timelineTime: document.timeline.currentTime,
              animationTime: typeof animationTime === 'number' ? animationTime : null,
              active: element.hasAttribute('data-planet-active'),
              x: link.left + link.width / 2,
              y: link.top + link.height / 2,
              error: Math.hypot(point.x - link.left - link.width / 2, point.y - link.top - link.height / 2),
              phase,
              selected,
              offset,
            }
          }
          const readFrame = () => new Promise<ReturnType<typeof measure>>(resolve => requestAnimationFrame(timestamp => resolve(measure(timestamp))))
          const first = await readFrame()
          let second
          // Adjacent callbacks can be nearly simultaneous. Choose the window
          // by elapsed natural time alone, never by the observed movement.
          do {
            second = await readFrame()
          } while (second.frameTime - first.frameTime < 100 || second.sampledAt - first.sampledAt < 100)
          return {
            first,
            second,
            elapsed: second.sampledAt - first.sampledAt,
            animationCount: animations.length,
            running: animations.every(animation => !animation.pending && animation.playState === 'running'),
            movement: Math.hypot(second.x - first.x, second.y - first.y),
            selectedPosition: Number.parseFloat((element as HTMLElement).style.getPropertyValue('--orbit-p')),
          }
        })
        await testInfo.attach(`${interaction}-orbit-observation`, { body: JSON.stringify(alignment, null, 2), contentType: 'application/json' })
        expect(alignment.elapsed, 'Observe at least 100ms of natural animation time').toBeGreaterThanOrEqual(100)
        expect(alignment.second.frameTime - alignment.first.frameTime).toBeGreaterThanOrEqual(100)
        expect(alignment.first.animationTime).not.toBeNull()
        expect(alignment.second.animationTime).toBeGreaterThan(alignment.first.animationTime!)
        const phaseAdvance = (alignment.second.phase - alignment.first.phase + 1) % 1
        expect(phaseAdvance, 'The inherited phase must advance with the native timeline').toBeGreaterThan(0)
        expect(phaseAdvance).toBeCloseTo((alignment.second.animationTime! - alignment.first.animationTime!) / 240000, 5)
        expect(alignment.animationCount, 'A single real parent animation must drive both the projects and the highlight').toBe(1)
        expect(alignment.running, 'Selection must preserve native orbit playback').toBe(true)
        expect(alignment.movement, `${interaction} must keep the selected link moving`).toBeGreaterThan(0.01)
        for (const sample of [alignment.first, alignment.second]) {
          expect(sample.active, 'The same project must stay selected throughout the observation').toBe(true)
          expect(sample.selected).toBeCloseTo(alignment.selectedPosition, 4)
          expect(sample.offset, 'The bright arc must use the same inherited phase as its selected project').toBeCloseTo(2.5 - (sample.selected + sample.phase) * 100, 3)
          expect(sample.error, `${interaction}: the actual SVG arc midpoint must coincide with its moving link center`).toBeLessThanOrEqual(1)
        }
        await planet.evaluate((element: HTMLAnchorElement) => element.blur())
        await page.mouse.move(0, 0)
        if (interaction !== 'automatic') {
          await expect(planet).not.toHaveAttribute('data-planet-active', '')
        }
      }
      await page.locator('[data-planet-toggle]').click()
      await expect(scope).not.toHaveAttribute('data-planets-orbit-running', '')
      const frozen = await scope.evaluate(async (element) => {
        const animations = element.getAnimations()
        await Promise.all(animations.map(animation => animation.ready))
        const planet = element.querySelector('.home-hero-planet')!
        const measure = (frameTime: number) => {
          const rect = planet.getBoundingClientRect()
          return {
            sampledAt: performance.now(),
            frameTime,
            animationTime: animations[0]?.currentTime,
            phase: Number.parseFloat(getComputedStyle(element).getPropertyValue('--orbit-turn')),
            x: rect.left,
            y: rect.top,
          }
        }
        const readFrame = () => new Promise<ReturnType<typeof measure>>(resolve => requestAnimationFrame(timestamp => resolve(measure(timestamp))))
        const first = await readFrame()
        let second
        do {
          second = await readFrame()
        } while (second.frameTime - first.frameTime < 100 || second.sampledAt - first.sampledAt < 100)
        return {
          first,
          second,
          elapsed: second.sampledAt - first.sampledAt,
          paused: animations.every(animation => !animation.pending && animation.playState === 'paused'),
          movement: Math.hypot(first.x - second.x, first.y - second.y),
        }
      })
      await testInfo.attach('paused-orbit-observation', { body: JSON.stringify(frozen, null, 2), contentType: 'application/json' })
      expect(frozen.elapsed).toBeGreaterThanOrEqual(100)
      expect(frozen.second.frameTime - frozen.first.frameTime).toBeGreaterThanOrEqual(100)
      expect(frozen.second.animationTime).toBe(frozen.first.animationTime)
      expect(frozen.second.phase).toBe(frozen.first.phase)
      expect(frozen.paused).toBe(true)
      expect(frozen.movement, 'The explicit pause button must still freeze the physical orbit').toBeLessThan(0.001)
    })

    test('prioritizes focus over hover and resumes a fair cycle after interaction or pause', async ({ page }) => {
      await prepareSpotlight(page, path)
      await expectFreshDelay(page, 0)
      const planets = page.locator('.home-hero-planet')
      await hoverMovingPlanet(page, planets.nth(1))
      await expectSpotlight(page, 1)
      await planets.nth(2).focus()
      await hoverMovingPlanet(page, planets.nth(3))
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
      await expectSpotlight(page, 1, true)
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
        await expectSpotlight(page, 2, paused)
        await expect(toggle).toHaveAttribute('aria-pressed', String(paused))
        await resizeDesktop(1280)
        await expect(screen).toHaveAttribute('data-hero-phase', 'ready')
        await expect(screen).toHaveAttribute('data-particles-active', '')
        await expect(planet).toBeFocused()
        await expectSpotlight(page, 2, paused)
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

    test('restores the actual shared orbit phase after reduced motion and a host reconnect', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await prepareSpotlight(page, path)
      const toggle = page.locator('[data-planet-toggle]')
      const scope = page.locator(constellation)
      await toggle.click()
      const planet = page.locator('.home-hero-planet').nth(2)
      await planet.focus()
      await expectSpotlight(page, 2, true)
      const before = await scope.evaluate(async (element) => {
        const animations = element.getAnimations()
        await Promise.all(animations.map(animation => animation.ready))
        const animation = animations[0]!
        const duration = Number(animation.effect!.getComputedTiming().duration)
        animation.currentTime = duration * 0.375
        const planet = element.querySelector('.home-hero-planet')!
        const box = planet.getBoundingClientRect()
        return {
          phase: Number.parseFloat(getComputedStyle(element).getPropertyValue('--orbit-turn')),
          currentTime: Number(animation.currentTime),
          center: [box.left + box.width / 2, box.top + box.height / 2],
        }
      })
      expect(before.phase).toBeCloseTo(0.375, 4)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expectStaticStarfield(page)
      await page.clock.runFor(1000)
      const reduced = await scope.evaluate((element) => {
        const animations = element.getAnimations()
        return {
          count: animations.length,
          phase: Number.parseFloat(getComputedStyle(element).getPropertyValue('--orbit-turn')),
          currentTime: Number(animations[0]?.currentTime),
        }
      })
      expect(reduced.count, 'Changing motion preference must retain the shared native orbit animation instance').toBe(1)
      expect(reduced.phase).toBeCloseTo(before.phase, 4)
      expect(reduced.currentTime).toBeCloseTo(before.currentTime, 3)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.clock.runFor(160)
      await expect(scope).not.toHaveAttribute('data-planets-orbit-running', '')
      expect(await scope.evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--orbit-turn'))), 'Clearing reduced motion must preserve the saved phase and the explicit user pause').toBeCloseTo(before.phase, 4)
      const host = await scope.elementHandle()
      await host!.evaluate(element => element.remove())
      await page.clock.runFor(200)
      await host!.evaluate(element => document.querySelector('.home-hero-screen')!.append(element))
      await expect(scope).toHaveAttribute('data-planets-ready', '')
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await page.clock.runFor(160)
      const restored = await scope.evaluate(async (element) => {
        const animations = element.getAnimations()
        await Promise.all(animations.map(animation => animation.ready))
        const box = element.querySelector('.home-hero-planet')!.getBoundingClientRect()
        return {
          count: animations.length,
          paused: animations.every(animation => !animation.pending && animation.playState === 'paused'),
          phase: Number.parseFloat(getComputedStyle(element).getPropertyValue('--orbit-turn')),
          currentTime: Number(animations[0]!.currentTime),
          center: [box.left + box.width / 2, box.top + box.height / 2],
        }
      })
      expect(restored.count).toBe(1)
      expect(restored.paused).toBe(true)
      expect(restored.phase).toBeCloseTo(before.phase, 4)
      expect(restored.currentTime).toBeCloseTo(before.currentTime, 3)
      expect(Math.hypot(restored.center[0]! - before.center[0]!, restored.center[1]! - before.center[1]!)).toBeLessThan(0.01)

      expect(errors).toEqual([])
    })
  })
}
