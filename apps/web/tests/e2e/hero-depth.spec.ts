import type { Page } from '@playwright/test'
import type { ParticleLayer } from './hero-motion'
import { expect, test } from '@playwright/test'
import { anchorParticleSurface, captureParticleFrames, captureParticleSurface, installMotionClock, particleState, particleSurfaceDifference, particleSurfaceTranslation, setPageHidden } from './hero-motion'
import { isOpenSourceSite } from './site-target'

const homeRoute = isOpenSourceSite ? '/weapp.dev/' : '/'

async function prepare(page: Page, layer: ParticleLayer = false) {
  await installMotionClock(page)
  await captureParticleFrames(page, layer)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(homeRoute)
  await expect.poll(() => page.evaluate(() =>
    Boolean(customElements.get('hero-particles'))
    && [...document.fonts].some(face => /Syne/.test(face.family) && face.status === 'loaded'))).toBe(true)
  await page.clock.runFor(160)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-active', '')
}

async function seek(page: Page, seconds: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = (await particleState(page)).frame!.time
    if (current >= seconds - 0.016) {
      return
    }
    await page.clock.runFor(Math.max(16, Math.ceil((seconds - current) * 1000)))
  }
}

async function visibleLayers(page: Page) {
  return page.locator('.home-hero-screen').evaluate((screen) => {
    const opacity = (selector: string) => Number.parseFloat(getComputedStyle(screen.querySelector(selector)!).opacity)
    return {
      parent: opacity('hero-planets'),
      orbit: opacity('.home-hero-orbit'),
      planets: opacity('.home-hero-planet'),
      labels: opacity('.home-hero-planet-name'),
    }
  })
}

test('reveals orbit, planet bodies and labels in order without extending the active entrance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The 60ms stage boundaries need the desktop frame budget')
  await prepare(page)
  await seek(page, 2.23)
  const early = await visibleLayers(page)
  expect(early.parent).toBe(1)
  expect(early.orbit).toBeGreaterThan(0)
  expect(early.orbit).toBeLessThan(1)
  expect(early.planets).toBe(0)
  expect(early.labels).toBe(0)

  await seek(page, 2.32)
  const middle = await visibleLayers(page)
  expect(middle.orbit).toBeGreaterThan(middle.planets)
  expect(middle.planets).toBeGreaterThan(0)
  expect(middle.labels).toBe(0)
  await page.locator('[data-planet-toggle]').click()
  const paused = await particleState(page)
  await page.clock.fastForward(60000)
  expect(await visibleLayers(page), 'Pause must freeze all three painted layers').toEqual(middle)
  expect((await particleState(page)).draws).toBe(paused.draws)
  const particle = await page.locator('hero-particles').evaluateHandle((element) => {
    element.remove()
    return element
  })
  try {
    await particle.evaluate(element => document.querySelector('.home-hero-screen')!.prepend(element))
    await expect.poll(async () => (await particleState(page)).draws).toBeGreaterThan(paused.draws)
    expect(await visibleLayers(page), 'A paused reconnect must preserve the partial reveal').toEqual(middle)
  }
  finally {
    await particle.dispose()
  }
  await setPageHidden(page, true)
  await page.clock.fastForward(60000)
  expect(await visibleLayers(page)).toEqual(middle)
  await setPageHidden(page, false)
  await page.locator('[data-planet-toggle]').click()
  await seek(page, 2.43)
  const late = await visibleLayers(page)
  expect(late.orbit).toBe(1)
  expect(late.planets).toBeGreaterThan(late.labels)
  expect(late.planets).toBeLessThan(1)
  expect(late.labels).toBeGreaterThan(0)
  await seek(page, 2.56)
  expect(await visibleLayers(page)).toEqual({ parent: 1, orbit: 1, planets: 1, labels: 1 })
  await page.locator('[data-hero-replay]').click()
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'logo')
  await expect(page.locator('hero-planets')).toHaveJSProperty('inert', true)
  const replay = await visibleLayers(page)
  expect([replay.orbit, replay.planets, replay.labels]).toEqual([0, 0, 0])
  await seek(page, 2.23)
  const repeated = await visibleLayers(page)
  expect(repeated.orbit).toBeGreaterThan(0)
  expect(repeated.planets).toBe(0)
  expect(repeated.labels).toBe(0)
})

async function captureField(page: Page) {
  const surface = await captureParticleSurface(page)
  expect(surface.visible, 'Only genuinely drawn background stars can establish parallax').toBeGreaterThan(100)
}

for (const layer of ['far', 'near'] as const) {
  test(`moves real ${layer} stars within their independent desktop parallax budget`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Parallax is limited to desktop fine pointers')
    await prepare(page, `field-${layer}-static`)
    await seek(page, 2.8)
    await captureField(page)
    await anchorParticleSurface(page)
    const opening = await particleState(page)
    const parallax = opening.fieldParallax.filter((_, index) => layer === 'far' ? opening.fieldDepths[index]! > 75 : opening.fieldDepths[index]! <= 75)
    expect(parallax.length, 'Both depth groups must exist in the real uploaded attributes').toBeGreaterThan(100)
    expect(Math.max(...parallax), 'The selected real field attributes must retain their depth budget').toBe(layer === 'far' ? 2 : 6)
    const screen = await page.locator('.home-hero-screen').boundingBox()
    await page.mouse.move(screen!.x + screen!.width - 4, screen!.y + screen!.height / 2)
    await page.clock.runFor(320)
    await captureField(page)
    const moving = (await particleState(page)).frame!.backgroundPointer
    expect(Math.abs(moving[0])).toBeGreaterThan(0.9)
    const translation = await particleSurfaceTranslation(page)
    await testInfo.attach(`${layer}-field-registration`, { body: JSON.stringify({ moving, parallax, translation }), contentType: 'application/json' })
    expect(translation.correlation, 'The spatial match must come from the same painted stars').toBeGreaterThan(0.8)
    const distance = -translation.x
    expect(distance, 'A frozen-time field must actually move opposite to the pointer').toBeGreaterThan(layer === 'far' ? 1 : 4)
    expect(distance, 'Depth must stay inside the approved CSS pixel budget').toBeLessThan(layer === 'far' ? 2.5 : 6.5)
    await setPageHidden(page, true)
    const hidden = await particleState(page)
    await page.clock.fastForward(60000)
    expect((await particleState(page)).draws).toBe(hidden.draws)
    expect((await particleState(page)).frame!.backgroundPointer).toEqual(moving)
    await setPageHidden(page, false)
    if (layer === 'near') {
      await page.locator('[data-planet-toggle]').click()
      const paused = await particleState(page)
      await page.clock.fastForward(60000)
      expect((await particleState(page)).draws).toBe(paused.draws)
      expect((await particleState(page)).frame!.backgroundPointer).toEqual(moving)
      const particle = await page.locator('hero-particles').evaluateHandle((element) => {
        element.remove()
        return element
      })
      try {
        await particle.evaluate(element => document.querySelector('.home-hero-screen')!.prepend(element))
        await expect.poll(async () => (await particleState(page)).draws).toBeGreaterThan(paused.draws)
        expect((await particleState(page)).frame!.backgroundPointer, 'Reconnect must restore the paused background offset in its first real draw').toEqual(moving)
      }
      finally {
        await particle.dispose()
      }
      await page.locator('[data-planet-toggle]').click()
    }
    await page.locator('[data-hero-replay]').click()
    await page.clock.runFor(32)
    expect((await particleState(page)).frame!.backgroundPointer, 'Replay must start from the shared static star positions').toEqual([0, 0])
    await page.mouse.move(0, 0)
    await page.clock.runFor(400)
    await captureField(page)
    expect(Math.abs((await particleSurfaceTranslation(page)).x), 'Pointer release must return the real field to its opening anchor').toBeLessThan(0.25)
  })
}

test('keeps the background still for touch input and below the desktop breakpoint', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 1023, height: 800 })
  }
  await prepare(page, 'field-static')
  await seek(page, 2.8)
  await captureField(page)
  const screen = await page.locator('.home-hero-screen').boundingBox()
  await page.mouse.move(screen!.x + screen!.width - 4, screen!.y + screen!.height / 2)
  await page.clock.runFor(400)
  expect((await particleState(page)).frame!.backgroundPointer).toEqual([0, 0])
  await captureField(page)
  expect((await particleSurfaceDifference(page)).absoluteAlphaChange, 'Disabled input must preserve every real field pixel').toBe(0)
})

test.describe('wide touch input', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: false })

  test('keeps the desktop-sized field still on a device without a fine pointer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One dedicated context covers wide touch independently of the narrow mobile project')
    await prepare(page, 'field-static')
    await seek(page, 2.8)
    expect(await page.locator('.home-hero-screen').evaluate(element => element.clientWidth)).toBeGreaterThanOrEqual(1024)
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
    await captureField(page)
    const screen = await page.locator('.home-hero-screen').boundingBox()
    const x = screen!.x + screen!.width - 4
    const y = screen!.y + screen!.height / 2
    await page.touchscreen.tap(x, y)
    await page.locator('.home-hero-screen').dispatchEvent('pointermove', { pointerType: 'touch', clientX: x, clientY: y, isPrimary: true })
    await page.mouse.move(x, y)
    await page.clock.runFor(400)
    expect((await particleState(page)).frame!.backgroundPointer).toEqual([0, 0])
    await captureField(page)
    expect((await particleSurfaceDifference(page)).absoluteAlphaChange, 'Coarse input must not move or brighten any desktop field pixel').toBe(0)
  })
})
