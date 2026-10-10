import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectGatedPlanets, expectStaticStarfield } from './hero-fallback'
import { captureParticleFrames, captureParticleSurface, installMotionClock, particleState, particleSurfaceDifference, setPageHidden } from './hero-motion'
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
  font: string
  syneLoaded: boolean
}

interface HeroFontLoad {
  font: string
  text: string
  resolved: boolean
  rejected: boolean
}

declare global {
  interface Window {
    __heroWordmarkSamples: WordmarkSample[]
    __heroFontLoads: HeroFontLoad[]
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
          font: this.font,
          syneLoaded: [...document.fonts].some(face => /Syne/.test(face.family) && face.status === 'loaded')
            && document.fonts.check(this.font, text),
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
  await expect(page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })).toHaveCount(1)
  await expect(page.locator('[data-hero-logo]')).toHaveCount(0)
  await expect(page.locator('[data-hero-particle-logo]')).toBeHidden()
  await expect(page.locator('[data-hero-starfield]')).toBeHidden()
  const samples = await page.evaluate(() => window.__heroWordmarkSamples)
  expect(samples.length, 'The active renderer must actually sample a canvas wordmark').toBeGreaterThan(0)
  for (const sample of samples) {
    expect(sample.text, 'Canvas text must match the deployment brand').toBe(heroWordmark)
    expect(sample.font, 'The glyph sampler must use the real Syne face at weight 700').toMatch(/^(?:700|bold) .*Syne/)
    expect(sample.syneLoaded, 'Sampling must wait for the actual Syne FontFace to load').toBe(true)
    expect(sample.left, `${sample.width}px canvas: left ink edge`).toBeGreaterThanOrEqual(sample.width * 0.05 - 1)
    expect(sample.right, `${sample.width}px canvas: right ink edge`).toBeLessThanOrEqual(sample.width * 0.95 + 1)
    expect(sample.top).toBeGreaterThanOrEqual(0)
    expect(sample.bottom).toBeLessThanOrEqual(sample.height)
  }
}

async function captureFontLoading(page: Page) {
  await page.addInitScript(() => {
    window.__heroFontLoads = []
    const load = FontFaceSet.prototype.load
    FontFaceSet.prototype.load = function (font, text = ' ') {
      if (!font.includes('Syne')) {
        return load.call(this, font, text)
      }
      const record: HeroFontLoad = { font, text, resolved: false, rejected: false }
      window.__heroFontLoads.push(record)
      return load.call(this, font, text).then((faces) => {
        record.resolved = true
        return faces
      }, (error) => {
        record.rejected = true
        throw error
      })
    }
  })
}

async function holdSyneResponse(page: Page) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested!: () => void
  const started = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route(/\/syne-latin-700-normal[^/]*\.woff2(?:\?.*)?$/, async (route) => {
    const response = await route.fetch()
    expect(response.ok(), 'The delayed font fixture must use a real successful WOFF2 response').toBe(true)
    requested()
    await held
    await route.fulfill({ response })
  })
  return { started, release }
}

async function prepareParticleMotion(page: Page, isolateGlyphs = false) {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureParticleFrames(page, isolateGlyphs)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(resizeRoute)
  await expect.poll(() => page.evaluate(() => Boolean(customElements.get('hero-particles')))).toBe(true)
  // The real font response is asynchronous even with a frozen browser clock.
  // Start advancing entrance time only after sampling the loaded Syne face.
  await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.some(sample => sample.syneLoaded))).toBe(true)
  await page.clock.runFor(160)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-active', '')
}

async function expectAssembledParticles(page: Page) {
  await page.clock.runFor(2600)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-ready', '')
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
  await expect(page.locator('hero-planets')).toHaveJSProperty('inert', false)
  await expect(page.locator('hero-planets')).not.toHaveAttribute('aria-hidden', 'true')
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

  test('keeps the static starfield visible and the brand heading accessible in both languages', async ({ page }) => {
    for (const route of homeRoutes) {
      await page.goto(route)
      await expectStaticStarfield(page, false)
    }
  })
})

test('keeps the static starfield visible with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const route of homeRoutes) {
    await page.goto(route)
    await expectStaticStarfield(page)
  }
})

test('keeps the static starfield visible when WebGL is unavailable', async ({ page }) => {
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
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
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.some(load => load.resolved))).toBe(true)
    await expectStaticStarfield(page)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
  }
})

for (const value of ['missing', 'blank'] as const) {
  test(`keeps the static starfield visible with a ${value} particle brand`, async ({ page }) => {
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
      await expectStaticStarfield(page)
    }
  })
}

test('paints the static particle Logo and starfield while the application scripts are delayed', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/_astro\/[^/]+\.js(?:\?.*)?$/, async (route) => {
    await held
    await route.continue()
  })
  try {
    await page.goto(resizeRoute, { waitUntil: 'commit' })
    await expectStaticStarfield(page, false)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
    await page.clock.runFor(1000)
    await expectStaticStarfield(page, false)
    release()
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBeGreaterThan(0)
    await page.clock.runFor(160)
    await expectActiveWordmark(page)
    await expectGatedPlanets(page)
  }
  finally {
    release()
  }
})

test('holds the cold-cache particle Logo before morphing and revealing planets over active time', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await font.started
    await expectStaticStarfield(page)
    expect((await particleState(page)).draws).toBe(0)
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.some(sample => sample.syneLoaded))).toBe(true)
    await page.clock.runFor(16)
    await expectActiveWordmark(page)
    const opening = await particleState(page)
    expect(opening.frame!.time, 'The first valid frame must begin at the Logo hold').toBeLessThan(0.08)
    expect(opening.frame!.progress).toBe(0)
    await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'logo')
    await page.clock.runFor(600)
    expect((await particleState(page)).frame!.progress, 'The Logo must remain intact for the first 700 active milliseconds').toBe(0)
    await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'logo')
    await expectGatedPlanets(page)
    await expectGatedPlanets(page)

    await page.clock.runFor(1480)
    const assembling = await particleState(page)
    expect(assembling.frame!.time).toBeGreaterThan(2)
    expect(assembling.frame!.time).toBeLessThan(2.2)
    expect(assembling.frame!.progress).toBeGreaterThan(0.8)
    expect(assembling.frame!.progress).toBeLessThan(1)
    await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'assembling')
    await expect(page.locator('.home-hero-screen')).not.toHaveAttribute('data-particles-ready', '')
    await expectGatedPlanets(page)

    await page.clock.runFor(200)
    const ready = await particleState(page)
    expect(ready.frame!.time).toBeGreaterThanOrEqual(2.2)
    expect(ready.frame!.time).toBeLessThan(2.52)
    expect(ready.frame!.progress).toBe(1)
    const screen = page.locator('.home-hero-screen')
    await expect(screen).toHaveAttribute('data-hero-phase', 'ready')
    await expect(screen).toHaveAttribute('data-particles-ready', '')
    await expect(page.locator('hero-planets')).toHaveJSProperty('inert', false)
    await expect(page.locator('hero-planets')).not.toHaveAttribute('aria-hidden', 'true')
    const reveal = () => screen.evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--hero-planet-reveal')))
    const fading = await reveal()
    expect(fading, 'Planets must fade in after assembly rather than appear fully opaque').toBeGreaterThan(0)
    expect(fading).toBeLessThan(1)
    expect(await page.locator('hero-planets').evaluate(element => Number.parseFloat(getComputedStyle(element).opacity)), 'The visible orbital layer must use the active reveal fraction').toBeCloseTo(fading, 4)
    const toggle = page.locator('[data-planet-toggle]')
    await toggle.click()
    const paused = await particleState(page)
    const pausedReveal = await reveal()
    await page.clock.fastForward(5000)
    expect((await particleState(page)).draws).toBe(paused.draws)
    expect(await reveal(), 'User pause must freeze the fade as well as the canvas').toBe(pausedReveal)
    expect(await page.locator('hero-planets').evaluate(element => Number.parseFloat(getComputedStyle(element).opacity))).toBeCloseTo(pausedReveal, 4)
    await toggle.click()
    await page.clock.runFor(400)
    expect(await reveal()).toBe(1)
    const planet = page.locator('.home-hero-planet').first()
    await expect(planet).toBeVisible()
    await planet.focus()
    await expect(planet).toBeFocused()
    await expect(planet).toHaveAttribute('target', '_blank')
  }
  finally {
    font.release()
  }
})

test('waits for the real Syne font before sampling without counting the font wait as entrance time', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await font.started
    await expectStaticStarfield(page)
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.length)).toBeGreaterThan(0)
    await page.clock.runFor(2000)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
    expect((await particleState(page)).draws).toBe(0)
    await expectStaticStarfield(page)
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.some(load => load.resolved))).toBe(true)
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBeGreaterThan(0)
    await page.clock.runFor(160)
    await expectActiveWordmark(page)
    const frame = (await particleState(page)).frame!
    expect(frame.time, 'Font waiting must not advance the assembly phase').toBeLessThan(0.2)
    expect(frame.progress).toBeLessThan(0.15)
    await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'logo')
    await expectGatedPlanets(page)
    await expectAssembledParticles(page)
  }
  finally {
    font.release()
  }
})

test('keeps the static starfield after a font failure', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  await page.route(/\/syne-latin-700-normal[^/]*\.woff2(?:\?.*)?$/, route => route.abort('failed'))
  await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.evaluate(() => window.__heroFontLoads.some(load => load.rejected))).toBe(true)
  await page.clock.runFor(3500)
  await expectStaticStarfield(page)
  expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
  expect((await particleState(page)).draws).toBe(0)
})

test('ignores a real font response arriving after the three-second deadline', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await font.started
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.length)).toBeGreaterThan(0)
    await page.clock.fastForward(3000)
    await expectStaticStarfield(page)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.some(load => load.resolved))).toBe(true)
    await page.clock.runFor(2500)
    await expectStaticStarfield(page)
    expect((await particleState(page)).draws).toBe(0)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
  }
  finally {
    font.release()
  }
})

test('keeps the static starfield when a font finishes during a user pause and starts from the opening on resume', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await font.started
    const toggle = page.locator('[data-planet-toggle]')
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.some(load => load.resolved))).toBe(true)
    await page.clock.runFor(1000)
    await expectStaticStarfield(page)
    expect((await particleState(page)).draws).toBe(0)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBeGreaterThan(0)
    await page.clock.runFor(160)
    await expectActiveWordmark(page)
    expect((await particleState(page)).frame!.progress).toBeLessThan(0.15)
    await expectGatedPlanets(page)
    await expectAssembledParticles(page)
  }
  finally {
    font.release()
  }
})

test('cancels font-wait initialization on disconnect and samples only the reconnected generation', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await font.started
    const element = await page.locator('hero-particles').elementHandle()
    await element!.evaluate(node => node.remove())
    await page.clock.fastForward(4000)
    expect((await particleState(page)).draws).toBe(0)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
    await element!.evaluate(node => document.querySelector('.home-hero-screen')!.prepend(node))
    await expectStaticStarfield(page)
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(1)
    await page.clock.runFor(160)
    await expectActiveWordmark(page)
    expect((await particleState(page)).frame!.progress).toBeLessThan(0.15)
    await expectGatedPlanets(page)
    await expectAssembledParticles(page)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length), 'A cancelled generation must never create a second renderer').toBe(1)
  }
  finally {
    font.release()
  }
})

test('starts its first font request after leaving an initial reduced-motion state', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await expectStaticStarfield(page)
    await page.clock.runFor(4000)
    expect(await page.evaluate(() => window.__heroFontLoads.length)).toBe(0)
    expect((await particleState(page)).draws).toBe(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await font.started
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.length)).toBe(1)
    await expectStaticStarfield(page)
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBeGreaterThan(0)
    await page.clock.runFor(160)
    await expectActiveWordmark(page)
    expect((await particleState(page)).frame!.progress).toBeLessThan(0.15)
    await expectGatedPlanets(page)
    await expectAssembledParticles(page)
  }
  finally {
    font.release()
  }
})

test('defers sampling when reduced motion begins during a pending font request', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  const font = await holdSyneResponse(page)
  try {
    await page.goto(resizeRoute, { waitUntil: 'domcontentloaded' })
    await font.started
    await page.emulateMedia({ reducedMotion: 'reduce' })
    font.release()
    await expect.poll(() => page.evaluate(() => window.__heroFontLoads.some(load => load.resolved))).toBe(true)
    await page.clock.runFor(1000)
    await expectStaticStarfield(page)
    expect(await page.evaluate(() => window.__heroWordmarkSamples.length)).toBe(0)
    expect((await particleState(page)).draws).toBe(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBeGreaterThan(0)
    await page.clock.runFor(160)
    await expectActiveWordmark(page)
    expect((await particleState(page)).frame!.progress).toBeLessThan(0.15)
    await expectGatedPlanets(page)
    await expectAssembledParticles(page)
  }
  finally {
    font.release()
  }
})

test('keeps the static starfield when the first real GL frame fails', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureParticleFrames(page)
  await page.addInitScript(() => {
    WebGL2RenderingContext.prototype.getError = function () {
      return this.INVALID_OPERATION
    }
  })
  await page.goto(resizeRoute)
  await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.length)).toBeGreaterThan(0)
  await page.clock.runFor(2500)
  expect((await particleState(page)).draws, 'The fixture must fail after drawing an actual first frame').toBe(1)
  await expectStaticStarfield(page)
})

test('keeps the static starfield after a failed first frame reconnects during a user pause, then activates on resume', async ({ page }) => {
  await installMotionClock(page)
  await captureWordmarkSamples(page)
  await captureFontLoading(page)
  await captureParticleFrames(page)
  await page.addInitScript(() => {
    const getError = WebGL2RenderingContext.prototype.getError
    let failFirstFrame = true
    WebGL2RenderingContext.prototype.getError = function () {
      if (failFirstFrame && this.canvas instanceof HTMLCanvasElement
        && this.canvas.classList.contains('home-hero-particle-canvas')) {
        failFirstFrame = false
        return this.INVALID_OPERATION
      }
      return getError.call(this)
    }
  })
  await page.goto(resizeRoute)
  await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.some(sample => sample.syneLoaded))).toBe(true)
  await page.clock.runFor(2500)
  const failed = await particleState(page)
  expect(failed.draws, 'The recovery scenario must begin with an actual failed GL draw').toBe(1)
  await expectStaticStarfield(page)

  const element = await page.locator('hero-particles').elementHandle()
  await element!.evaluate(node => node.remove())
  const toggle = page.locator('[data-planet-toggle]')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const completedLoads = await page.evaluate(() => window.__heroFontLoads.filter(load => load.resolved).length)
  await element!.evaluate(node => document.querySelector('.home-hero-screen')!.prepend(node))
  await expect.poll(() => page.evaluate(() => window.__heroFontLoads.filter(load => load.resolved).length)).toBeGreaterThan(completedLoads)
  await page.clock.runFor(1000)
  await expectStaticStarfield(page)
  expect((await particleState(page)).draws, 'A paused reconnect must not draw over the static starfield even after GL recovers').toBe(failed.draws)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.clock.runFor(160)
  await expectActiveWordmark(page)
  const resumed = await particleState(page)
  expect(resumed.draws, 'Resuming must render with the recovered real GL context').toBeGreaterThan(failed.draws)
  expect(resumed.frame!.progress, 'A failed opening must resume near the beginning of assembly').toBeLessThan(0.2)
  await expectGatedPlanets(page)
  expect(resumed.frame!.time, 'Paused reconnect time must not advance the opening').toBeLessThan(0.3)
  await expectAssembledParticles(page)
})

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

test('moves the real Logo points into wordmark positions after the seven-hundred-millisecond hold', async ({ page }) => {
  await prepareParticleMotion(page, true)
  const screen = page.locator('.home-hero-screen')
  await expect(screen).toHaveAttribute('data-hero-phase', 'logo')
  const svgInk = await page.locator('[data-hero-particle-logo]').evaluate((logo: SVGSVGElement) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.home-hero-particle-canvas')!
    const canvasBox = canvas.getBoundingClientRect()
    const scale = canvas.width / canvasBox.width
    const corners: DOMPoint[] = []
    for (const path of logo.querySelectorAll<SVGPathElement>('path[data-logo-points]')) {
      let shown = true
      for (let node: Element | null = path; node && node !== logo; node = node.parentElement) {
        shown &&= getComputedStyle(node).display !== 'none'
      }
      if (!shown) {
        continue
      }
      const box = path.getBBox()
      const transform = path.getScreenCTM()!
      corners.push(new DOMPoint(box.x, box.y).matrixTransform(transform), new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(transform))
    }
    return {
      left: (Math.min(...corners.map(point => point.x)) - canvasBox.left) * scale,
      top: (Math.min(...corners.map(point => point.y)) - canvasBox.top) * scale,
      right: (Math.max(...corners.map(point => point.x)) - canvasBox.left) * scale,
      bottom: (Math.max(...corners.map(point => point.y)) - canvasBox.top) * scale,
      scale,
    }
  })
  const openingState = await particleState(page)
  const origin = openingState.sourceBounds!
  expect(openingState.glyphCount).toBe((page.viewportSize()!.width < 720) ? 900 : 2400)
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(origin[edge] - svgInk[edge]), `The GL Logo ${edge} edge must match its rendered SSR point cloud`).toBeLessThan(5 * svgInk.scale)
  }
  const opening = await captureParticleSurface(page)
  expect(opening.visible, 'The first GL frame must paint Logo particles before hiding the SSR Logo').toBeGreaterThan(40)
  expect(opening.time).toBeLessThan(0.7)
  await page.clock.runFor(200)
  await captureParticleSurface(page)
  const hold = await particleSurfaceDifference(page)
  expect(hold.changed, 'Holding must preserve foreground positions; this draw excludes background, twinkle and sprite rotation').toBeLessThanOrEqual(Math.max(6, hold.visible * 0.01))
  await expect(screen).toHaveAttribute('data-hero-phase', 'logo')
  await expectGatedPlanets(page)

  await page.clock.runFor(550)
  await expect(screen).toHaveAttribute('data-hero-phase', 'assembling')
  await expectGatedPlanets(page)
  // Per-particle stagger delays keep the earliest assembling frames close to
  // the Logo. Inspect the phase boundary first, then sample actual mid-morph.
  await page.clock.runFor(450)
  const morphing = await captureParticleSurface(page)
  const morph = await particleSurfaceDifference(page)
  expect(morph.changed, 'The Logo must actually move, rather than replace a phase attribute or fade stationary pixels').toBeGreaterThan(morph.visible * 0.2)
  expect(morphing.bounds.right - morphing.bounds.left).toBeGreaterThan((opening.bounds.right - opening.bounds.left) * 1.4)
  await expectGatedPlanets(page)
  await expectAssembledParticles(page)
  const assembled = await captureParticleSurface(page)
  const target = (await particleState(page)).targetBounds!
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(assembled.bounds[edge] - target[edge]), `The assembled framebuffer must reach the sampled ${edge} wordmark edge`).toBeLessThan(12 * svgInk.scale)
  }
})

for (const effect of ['position', 'brightness'] as const) {
  test(`keeps real background-star ${effect} changing after the Logo has become the wordmark`, async ({ page }) => {
    await installMotionClock(page)
    await captureWordmarkSamples(page)
    await captureParticleFrames(page, effect === 'position' ? 'field-position' : 'field-brightness')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(resizeRoute)
    await expect.poll(() => page.evaluate(() => window.__heroWordmarkSamples.some(sample => sample.syneLoaded))).toBe(true)
    await page.clock.runFor(2800)
    await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
    const opening = await captureParticleSurface(page)
    expect(opening.visible, 'The isolated framebuffer must actually contain rendered background stars').toBeGreaterThan(100)
    await page.clock.runFor(effect === 'position' ? 8000 : 3000)
    await captureParticleSurface(page)
    const change = await particleSurfaceDifference(page)
    expect(change.elapsed).toBeGreaterThan(effect === 'position' ? 8 : 3)
    expect(change.changed, effect === 'position'
      ? 'Background pixels must drift with fixed brightness and no foreground particles'
      : 'Background pixels must twinkle at fixed positions and without foreground particles').toBeGreaterThan(Math.max(12, change.visible * 0.03))
    expect(change.absoluteAlphaChange).toBeGreaterThan(change.visible)
  })
}

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

test('returns to the static particle Logo during a live reduced-motion change and resumes a partial morph', async ({ page }) => {
  await prepareParticleMotion(page)
  await page.clock.runFor(1000)
  const assembling = await particleState(page)
  expect(assembling.frame!.progress).toBeGreaterThan(0.2)
  expect(assembling.frame!.progress).toBeLessThan(1)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'assembling')
  await expectGatedPlanets(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectStaticStarfield(page)
  const pausedTime = await expectFrozenParticles(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.runFor(160)
  await expectActiveWordmark(page)
  const resumed = await particleState(page)
  expect(resumed.frame!.time).toBeGreaterThanOrEqual(pausedTime)
  expect(resumed.frame!.time - pausedTime).toBeLessThan(0.3)
  expect(resumed.frame!.progress, 'Changing motion preference must not restart or skip assembly').toBeGreaterThanOrEqual(assembling.frame!.progress)
  expect(resumed.frame!.progress).toBeLessThan(1)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'assembling')
  await expectGatedPlanets(page)
  await expectAssembledParticles(page)
})

test('honors live reduced-motion changes and reconnects without losing a user pause or replaying the entrance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await prepareParticleMotion(page)
  await expectAssembledParticles(page)
  const screen = page.locator('.home-hero-screen')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectStaticStarfield(page)
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
