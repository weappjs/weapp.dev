import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { captureParticleFrames, installMotionClock, particleState, setPageHidden } from './hero-motion'
import { heroWordmark, isOpenSourceSite } from './site-target'

interface WordmarkSample {
  text: string
  width: number
  height: number
  fontSize: number
  left: number
  right: number
  top: number
  bottom: number
}

declare global {
  interface Window {
    __heroWordmarkSamples: WordmarkSample[]
  }
}

const homeRoutes = (isOpenSourceSite ? ['', '/weapp.dev'] : [''])
  .flatMap(mount => [`${mount}/`, `${mount}/en/`])
const resizeRoute = isOpenSourceSite ? '/weapp.dev/' : '/'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Keep direct English visits in English, including the Pages mount.
    localStorage.setItem('weapp-locale', /\/en\//.test(location.pathname) ? 'en' : 'zh-CN')
  })
})

async function captureWordmarkSamples(page: Page) {
  await page.addInitScript(() => {
    window.__heroWordmarkSamples = []
    const samples = new WeakMap<HTMLCanvasElement, WordmarkSample>()
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      let sample = samples.get(this.canvas)
      if (!sample) {
        sample = {
          text: '',
          width: this.canvas.width,
          height: this.canvas.height,
          fontSize: Number.parseFloat(this.font.match(/([\d.]+)px/)?.[1] ?? '0'),
          left: Infinity,
          right: -Infinity,
          top: Infinity,
          bottom: -Infinity,
        }
        samples.set(this.canvas, sample)
        window.__heroWordmarkSamples.push(sample)
      }
      const glyph = this.measureText(text)
      sample.text += text
      sample.left = Math.min(sample.left, x - glyph.actualBoundingBoxLeft)
      sample.right = Math.max(sample.right, x + glyph.actualBoundingBoxRight)
      sample.top = Math.min(sample.top, y - glyph.actualBoundingBoxAscent)
      sample.bottom = Math.max(sample.bottom, y + glyph.actualBoundingBoxDescent)
      if (maxWidth === undefined) {
        fillText.call(this, text, x, y)
      }
      else {
        fillText.call(this, text, x, y, maxWidth)
      }
    }
  })
}

async function expectActiveWordmark(page: Page) {
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-active', '')
  await expect(page.locator('[data-hero-particles]')).toHaveAttribute('data-wordmark', heroWordmark)
  await expect(page.locator('#home-hero-title')).toHaveText(heroWordmark)
  const samples = await page.evaluate(() => window.__heroWordmarkSamples)
  expect(samples.length, 'The active renderer must actually sample a canvas wordmark').toBeGreaterThan(0)
  for (const sample of samples) {
    expect(sample.text, 'Canvas text must match the deployment brand').toBe(heroWordmark)
    expect(sample.left, `${sample.width}px canvas: left ink edge`).toBeGreaterThanOrEqual(sample.width * 0.05 - 1)
    expect(sample.right, `${sample.width}px canvas: right ink edge`).toBeLessThanOrEqual(sample.width * 0.95 + 1)
    expect(sample.top).toBeGreaterThanOrEqual(0)
    expect(sample.bottom).toBeLessThanOrEqual(sample.height)
  }
}

async function expectStaticWordmark(page: Page, scriptsEnabled = true) {
  if (scriptsEnabled) {
    // Wait for component initialization so the assertion cannot pass on the
    // initial static title before a broken renderer hides it.
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('hero-particles')))).toBe(true)
  }
  await expect(page.locator('.home-hero-screen')).not.toHaveAttribute('data-particles-active', '')
  await expect(page.locator('#home-hero-title')).toHaveText(heroWordmark)
  await expect(page.locator('#home-hero-title > [aria-hidden]')).toBeVisible()
  await expect(page.locator('#home-hero-title > [aria-hidden]')).toHaveCSS('visibility', 'visible')
}

async function prepareParticleMotion(page: Page, isolateGlyphs = false) {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureParticleFrames(page, isolateGlyphs)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(resizeRoute)
  await expect.poll(() => page.evaluate(() => Boolean(customElements.get('hero-particles')))).toBe(true)
}

async function expectAssembledParticles(page: Page) {
  await page.clock.runFor(2500)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-ready', '')
  await expectActiveWordmark(page)
}

async function sampleDrawRate(page: Page, minimum: number, maximum: number) {
  const initial = await particleState(page)
  await page.clock.runFor(1000)
  const after = await particleState(page)
  const count = after.draws - initial.draws
  expect(count, 'The renderer must make progress within the active frame budget').toBeGreaterThanOrEqual(minimum)
  expect(count, 'Pointer events and scheduling must respect the frame cap').toBeLessThanOrEqual(maximum)
  expect(after.frame!.time - initial.frame!.time, 'Motion uses active seconds rather than the previous idle slowdown').toBeGreaterThan(0.8)
  expect(after.frame!.time - initial.frame!.time).toBeLessThanOrEqual(1.1)
}

async function expectFrozenParticles(page: Page) {
  const paused = await particleState(page)
  await page.clock.fastForward(60000)
  const frozen = await particleState(page)
  expect(frozen.draws).toBe(paused.draws)
  expect(frozen.frame).toEqual(paused.frame)
  return paused.frame!.time
}

async function expectContinuedPhase(page: Page, pausedTime: number) {
  await expect(page.locator('.home-hero-screen')).not.toHaveAttribute('data-particles-paused', '')
  await page.clock.runFor(160)
  const after = await particleState(page)
  expect(after.frame!.progress, 'Resuming must not replay the assembly entrance').toBe(1)
  expect(after.frame!.time).toBeGreaterThanOrEqual(pausedTime)
  expect(after.frame!.time - pausedTime, 'Hidden wall-clock time must not advance the particle phase').toBeLessThan(0.3)
}

for (const route of homeRoutes) {
  test(`draws the deployment wordmark in the particle canvas at ${route}`, async ({ page }) => {
    await captureWordmarkSamples(page)
    await page.goto(route)
    await expect(page).toHaveURL(route)
    await expectActiveWordmark(page)
  })
}

test('fits the particle wordmark after desktop and mobile viewport changes', async ({ page }) => {
  await captureWordmarkSamples(page)
  await page.goto(resizeRoute)
  await expectActiveWordmark(page)

  for (const width of [320, 393, 1101, 1280, 1440, 320]) {
    const previousSamples = await page.evaluate(() => window.__heroWordmarkSamples.length)
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate((previousCount) => {
      const samples = window.__heroWordmarkSamples
      const latest = samples.at(-1)
      const screen = document.querySelector<HTMLElement>('.home-hero-screen')!
      const dpr = Math.min(1.75, window.devicePixelRatio || 1)
      return samples.length > previousCount && latest?.width === Math.floor(screen.clientWidth * dpr)
    }, previousSamples), { message: `Resample the wordmark at ${width}px` }).toBe(true)
    await expectActiveWordmark(page)
    const sizes = await page.evaluate(() => ({
      sampled: window.__heroWordmarkSamples.at(-1)!.fontSize,
      maximum: Number.parseFloat(getComputedStyle(document.querySelector('#home-hero-title')!).fontSize)
        * Math.min(1.75, window.devicePixelRatio || 1),
    }))
    expect(sizes.sampled, 'Fitting must not enlarge the existing title size').toBeLessThanOrEqual(sizes.maximum + 0.01)
  }
})

test.describe('static particle fallback without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('keeps the deployment wordmark visible in both languages', async ({ page }) => {
    for (const route of homeRoutes) {
      await page.goto(route)
      await expectStaticWordmark(page, false)
    }
  })
})

test('keeps the static wordmark visible with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const route of homeRoutes) {
    await page.goto(route)
    await expectStaticWordmark(page)
  }
})

test('keeps the static wordmark visible when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
        return null
      }
      return getContext.call(this, contextId, options)
    } as typeof getContext
  })
  for (const route of homeRoutes) {
    await page.goto(route)
    await expectStaticWordmark(page)
  }
})

for (const value of ['missing', 'blank'] as const) {
  test(`keeps the static wordmark visible with a ${value} particle brand`, async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.continue()
        return
      }
      const response = await route.fetch()
      const html = await response.text()
      const body = html.replace(/(<hero-particles\b[^>]*?)\sdata-wordmark="[^"]*"/, `$1${value === 'blank' ? ' data-wordmark="   "' : ''}`)
      expect(body, 'The fixture must alter the actual particle brand attribute').not.toBe(html)
      await route.fulfill({ response, body })
    })
    for (const route of homeRoutes) {
      await page.goto(route)
      await expectStaticWordmark(page)
    }
  })
}

test('keeps real wordmark glyphs flowing after assembly rather than only moving background dust', async ({ page }) => {
  await prepareParticleMotion(page, true)
  await expectAssembledParticles(page)
  const state = await particleState(page)
  expect(state.glyphCount).toBeGreaterThan(40)
  expect(state.flowCount).toBeGreaterThan(0)
  expect(state.maxRadius).toBeGreaterThan(0)
  expect(state.frame!.flowAmplitude).toBeCloseTo((page.viewportSize()!.width >= 1024 ? 4 : 1)
    * await page.evaluate(() => Math.min(1.75, devicePixelRatio)))
  await page.evaluate(() => {
    window.__heroParticleProbe.captureGlyph = true
  })
  await page.clock.runFor(160)
  await page.clock.runFor(1000)
  await page.evaluate(() => {
    window.__heroParticleProbe.captureGlyph = true
  })
  await page.clock.runFor(160)
  const movement = await page.evaluate(() => {
    const { glyph, previousGlyph } = window.__heroParticleProbe
    if (!glyph || !previousGlyph) {
      throw new Error('Both real glyph framebuffer samples must be captured')
    }
    let visible = 0
    let changed = 0
    for (let index = 0; index < glyph.pixels.length; index += 4) {
      if (glyph.pixels[index + 3]! >= 32 || previousGlyph.pixels[index + 3]! >= 32) {
        visible += 1
        if (Math.abs(glyph.pixels[index + 3]! - previousGlyph.pixels[index + 3]!) > 12) {
          changed += 1
        }
      }
    }
    return { visible, changed, elapsed: glyph.time - previousGlyph.time }
  })
  expect(movement.visible, 'The sampled area must contain drawn glyph pixels').toBeGreaterThan(100)
  expect(movement.changed, 'Glyph-only pixels must visibly change after assembly').toBeGreaterThan(Math.max(12, movement.visible * 0.02))
  expect(movement.elapsed).toBeGreaterThan(1)
})

test('caps entrance, idle and interaction drawing at the desktop and mobile budgets', async ({ page }) => {
  await prepareParticleMotion(page)
  const desktop = page.viewportSize()!.width >= 1024
  await page.clock.runFor(160)
  // The fake clock delivers RAF every 16ms, so a strict 60fps cap may draw on
  // alternate callbacks; keep the production upper bound and verify progress.
  await sampleDrawRate(page, desktop ? 28 : 8, desktop ? 61 : 11)
  await page.clock.runFor(1500)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-ready', '')
  await sampleDrawRate(page, desktop ? 18 : 8, desktop ? 31 : 11)
  const title = await page.locator('#home-hero-title').boundingBox()
  await page.mouse.move(title!.x + title!.width / 2, title!.y + title!.height / 2)
  await sampleDrawRate(page, desktop ? 28 : 8, desktop ? 61 : 11)
  if (desktop) {
    const previous = (await particleState(page)).frame!
    expect(previous.pointerStrength).toBeGreaterThan(0.9)
    const dpr = await page.evaluate(() => Math.min(1.75, devicePixelRatio))
    const canvas = await page.locator('.home-hero-particle-canvas').boundingBox()
    const nextX = title!.x + title!.width / 2 + 24
    const targetX = (nextX - canvas!.x) * dpr
    await page.mouse.move(nextX, title!.y + title!.height / 2)
    await page.clock.runFor(64)
    const smoothing = (await particleState(page)).frame!
    expect(smoothing.pointer[0], 'Pointer input must approach its target rather than jump immediately').toBeGreaterThan(previous.pointer[0])
    expect(smoothing.pointer[0]).toBeLessThan(targetX)
    expect(smoothing.trailCount).toBeGreaterThan(0)
    await page.clock.runFor(250)
    expect(Math.abs((await particleState(page)).frame!.pointer[0] - targetX)).toBeLessThan(2 * dpr)
  }
  else {
    expect((await particleState(page)).frame!.pointerStrength).toBe(0)
  }
  await page.mouse.move(0, 0)
  if (desktop) {
    await page.clock.runFor(100)
    const release = (await particleState(page)).frame!.pointerStrength
    expect(release, 'Pointer departure must fade smoothly before returning to idle').toBeGreaterThan(0)
    expect(release).toBeLessThan(0.9)
  }
  await page.clock.runFor(1000)
  const settled = await particleState(page)
  expect(settled.frame!.pointerStrength).toBe(0)
  expect(settled.frame!.trailCount).toBe(0)
  await sampleDrawRate(page, desktop ? 18 : 8, desktop ? 31 : 11)
})

test('freezes the particle phase offscreen, in the background and after a user pause', async ({ page }) => {
  await prepareParticleMotion(page)
  await expectAssembledParticles(page)
  const screen = page.locator('.home-hero-screen')
  await page.locator('#releases').scrollIntoViewIfNeeded()
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  let phase = await expectFrozenParticles(page)
  await screen.scrollIntoViewIfNeeded()
  await expectContinuedPhase(page, phase)
  await setPageHidden(page, true)
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  phase = await expectFrozenParticles(page)
  await setPageHidden(page, false)
  await expectContinuedPhase(page, phase)
  const toggle = page.locator('[data-planet-toggle]')
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(screen).toHaveAttribute('data-hero-motion-paused', '')
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  await expect(page.locator('hero-planets')).not.toHaveAttribute('data-planets-orbit-running', '')
  phase = await expectFrozenParticles(page)
  await toggle.click()
  await expect(screen).not.toHaveAttribute('data-hero-motion-paused', '')
  await expectContinuedPhase(page, phase)
})

test('honors live reduced-motion changes and reconnects without losing a user pause or replaying the entrance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await prepareParticleMotion(page)
  await expectAssembledParticles(page)
  const screen = page.locator('.home-hero-screen')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectStaticWordmark(page)
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  let phase = await expectFrozenParticles(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expectContinuedPhase(page, phase)
  await expectActiveWordmark(page)

  const toggle = page.locator('[data-planet-toggle]')
  await toggle.click()
  await expect(screen).toHaveAttribute('data-hero-motion-paused', '')
  const element = await page.locator('hero-particles').elementHandle()
  await element!.evaluate(node => node.remove())
  phase = await expectFrozenParticles(page)
  await element!.evaluate(node => document.querySelector('.home-hero-screen')!.prepend(node))
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  await page.clock.runFor(160)
  // A paused resize may draw one static frame; later time must remain frozen.
  await expectFrozenParticles(page)
  await toggle.click()
  await expectContinuedPhase(page, phase)
  await expectActiveWordmark(page)
  await toggle.click()
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  await expectFrozenParticles(page)
  expect(errors).toEqual([])
})

test('restores a paused hero after a hidden resize and applies the new breakpoint motion budget', async ({ page }) => {
  await prepareParticleMotion(page)
  await expectAssembledParticles(page)
  const screen = page.locator('.home-hero-screen')
  const toggle = page.locator('[data-planet-toggle]')
  await toggle.click()
  await expect(screen).toHaveAttribute('data-hero-motion-paused', '')
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  await setPageHidden(page, true)
  const paused = await particleState(page)
  const previousWidth = await page.locator('.home-hero-particle-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)
  const width = page.viewportSize()!.width >= 1024 ? 960 : 1024
  await page.setViewportSize({ width, height: 900 })
  // A different physical canvas width proves the real ResizeObserver rebuilt
  // its drawing buffer while hidden; a generic delay would miss this failure.
  await expect.poll(() => page.locator('.home-hero-particle-canvas').evaluate((canvas: HTMLCanvasElement, oldWidth) => {
    const stage = canvas.closest<HTMLElement>('.home-hero-screen')!
    return canvas.width !== oldWidth && canvas.width === Math.floor(stage.clientWidth * Math.min(1.75, devicePixelRatio))
  }, previousWidth)).toBe(true)
  await page.clock.runFor(160)
  expect((await particleState(page)).draws, 'A hidden resize must not draw').toBe(paused.draws)

  await setPageHidden(page, false)
  await expect(screen).toHaveAttribute('data-hero-motion-paused', '')
  await expect(screen).toHaveAttribute('data-particles-paused', '')
  await expect(screen).toHaveAttribute('data-particles-active', '')
  await expect.poll(async () => (await particleState(page)).draws).toBe(paused.draws + 1)
  const fitted = await particleState(page)
  expect(fitted.frame!.progress).toBe(1)
  expect(fitted.frame!.time).toBeGreaterThanOrEqual(paused.frame!.time)
  expect(fitted.frame!.time - paused.frame!.time).toBeLessThan(0.15)
  const amplitude = (width >= 1024 ? 4 : 1) * await page.evaluate(() => Math.min(1.75, devicePixelRatio))
  expect(fitted.frame!.flowAmplitude).toBeCloseTo(amplitude)
  await expectFrozenParticles(page)
  await toggle.click()
  await expectContinuedPhase(page, fitted.frame!.time)
  expect((await particleState(page)).frame!.flowAmplitude).toBeCloseTo(amplitude)
  await sampleDrawRate(page, width >= 1024 ? 18 : 8, width >= 1024 ? 31 : 11)
})

test('keeps sections readable before reveal observers run', async ({ page }) => {
  await page.goto(resizeRoute)
  const content = page.locator('#about [data-reveal]').first()
  await content.evaluate(element => element.removeAttribute('data-visible'))
  await expect(content).toHaveCSS('opacity', '1')
})
