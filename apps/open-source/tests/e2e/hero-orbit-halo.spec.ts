import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { captureParticleFrames, captureParticleSurface, haloState, installMotionClock, particleState, particleSurfaceDifference, setPageHidden } from './hero-motion'
import { isOpenSourceSite } from './site-target'

const homeRoute = isOpenSourceSite ? '/weapp.dev/' : '/'

declare global {
  interface Window {
    __haloFailureHits: number
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('weapp-locale', 'zh-CN'))
})

async function prepareHalo(page: Page, staticTwinkle = false, opening = false) {
  await installMotionClock(page)
  await captureParticleFrames(page, staticTwinkle ? 'halo-static' : 'halo', opening)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(homeRoute)
  await expect.poll(async () => (await particleState(page)).draws).toBeGreaterThan(0)
  await page.clock.runFor(160)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-active', '')
}

async function revealHalo(page: Page) {
  await page.clock.runFor(2600)
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
  await expect.poll(async () => (await particleState(page)).haloFrame?.reveal).toBe(1)
}

async function orbitGeometry(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.home-hero-particle-canvas')!
    const canvasBox = canvas.getBoundingClientRect()
    const orbit = document.querySelector('.home-hero-orbit')!.getBoundingClientRect()
    return {
      width: canvasBox.width,
      height: canvasBox.height,
      scale: canvas.width / canvasBox.width,
      left: orbit.left - canvasBox.left,
      top: orbit.top - canvasBox.top,
      right: orbit.right - canvasBox.left,
      bottom: orbit.bottom - canvasBox.top,
      rx: orbit.width / 2,
      ry: orbit.height / 2,
      cx: (orbit.left + orbit.right) / 2 - canvasBox.left,
      cy: (orbit.top + orbit.bottom) / 2 - canvasBox.top,
    }
  })
}

async function expectPrivateHalo(page: Page, expectedCount: number) {
  const state = await particleState(page)
  expect(state.contexts, 'Both passes must share one actual WebGL context').toBe(1)
  expect(state.haloFrame?.count).toBe(expectedCount)
  expect(state.haloFrame?.time, 'The halo uses the original active clock').toBe(state.frame!.time)
  expect(state.haloFrame?.program).toBeGreaterThan(0)
  expect(state.haloFrame?.program, 'The halo shader must not replace the wordmark program').not.toBe(state.mainProgram)
  expect(state.mainVao).toBeGreaterThan(0)
  expect(state.haloFrame?.vao).toBeGreaterThan(0)
  expect(state.haloFrame?.vao, 'Overlapping attribute locations must retain independent VAO bindings').not.toBe(state.mainVao)
  expect(state.glyphCount, 'The original glyph data must survive the second pass').toBe(page.viewportSize()!.width < 720 ? 900 : 2400)
  expect(state.flowCount).toBeGreaterThan(0)
}

const geometryCases = [
  { width: 320, height: 568, count: 256 },
  { width: 639, height: 900, count: 256 },
  { width: 640, height: 800, count: 384 },
  { width: 768, height: 1024, count: 384 },
  { width: 1023, height: 768, count: 384 },
  { width: 1024, height: 768, count: 960 },
  { width: 1024, height: 480, count: 960 },
  { width: 1440, height: 900, count: 960 },
]

for (const viewport of geometryCases) {
  test(`fits the private ${viewport.count}-point halo to the actual ${viewport.width}×${viewport.height} orbit`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The explicit viewport matrix runs once; the mobile project separately verifies DPR and lifecycle')
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await prepareHalo(page)
    await revealHalo(page)
    await expectPrivateHalo(page, viewport.count)
    const geometry = await orbitGeometry(page)
    const halo = await haloState(page)
    expect(halo.positions).toHaveLength(viewport.count * 2)
    expect(halo.styles).toHaveLength(viewport.count * 4)
    expect(halo.colors).toHaveLength(viewport.count * 3)
    const xs: number[] = []
    const ys: number[] = []
    for (let index = 0; index < viewport.count; index++) {
      const x = halo.positions[index * 2]! / geometry.scale
      const y = halo.positions[index * 2 + 1]! / geometry.scale
      xs.push(x)
      ys.push(y)
      const dx = x - geometry.cx
      const dy = y - geometry.cy
      // The implicit ellipse gradient measures the short normal displacement
      // without duplicating the production seeded sampling algorithm.
      const ellipse = (dx / geometry.rx) ** 2 + (dy / geometry.ry) ** 2
      const normal = 2 * Math.hypot(dx / geometry.rx ** 2, dy / geometry.ry ** 2)
      expect(Math.abs(ellipse - 1) / normal, 'Dust must stay within a narrow 2px corridor around the rendered orbit').toBeLessThanOrEqual(2.1)
      const size = halo.styles[index * 4]! / geometry.scale
      expect(size).toBeGreaterThanOrEqual(0.69)
      expect(size).toBeLessThanOrEqual(3.01)
      expect(halo.styles[index * 4 + 3]!).toBeGreaterThanOrEqual(6)
      expect(halo.styles[index * 4 + 3]!).toBeLessThanOrEqual(12)
    }
    const extent = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(extent[edge] - geometry[edge]), `The halo must reach the actual ellipse's ${edge} edge`).toBeLessThan(3)
    }
    expect(extent.left).toBeGreaterThan(6)
    expect(extent.top).toBeGreaterThan(6)
    expect(extent.right).toBeLessThan(geometry.width - 6)
    expect(extent.bottom).toBeLessThan(geometry.height - 6)
    const rendered = await captureParticleSurface(page)
    expect(rendered.visible, 'The isolated pass must actually paint dust rather than only upload coordinates').toBeGreaterThan(viewport.count)
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(rendered.bounds[edge] / geometry.scale - geometry[edge]), `The real halo framebuffer must follow the ${edge} ellipse edge`).toBeLessThan(8)
    }
    await testInfo.attach('halo-geometry', { body: JSON.stringify({ geometry, extent, count: viewport.count, rendered }, null, 2), contentType: 'application/json' })
  })
}

for (const viewport of [{ width: 640, count: 384 }, { width: 1024, count: 960 }]) {
  test(`retains the ${viewport.count}-point viewport budget at ${viewport.width}px when the hero is 16px narrower`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The explicit breakpoint regression runs once across browser scrollbar implementations')
    await page.setViewportSize({ width: viewport.width, height: 800 })
    await prepareHalo(page)
    await revealHalo(page)
    const before = await particleState(page)
    // Classic scrollbars reduce clientWidth without changing CSS media query
    // breakpoints. Constrain the real container to the same width on every OS
    // instead of relying on the browser's scrollbar appearance or mocks.
    await page.addStyleTag({ content: '.home-hero-screen { width: calc(100vw - 16px); }' })
    await expect.poll(() => page.locator('.home-hero-screen').evaluate(element => element.clientWidth)).toBe(viewport.width - 16)
    await page.clock.runFor(320)
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>('.home-hero-screen')!
      const canvas = screen.querySelector<HTMLCanvasElement>('.home-hero-particle-canvas')!
      return canvas.width === Math.floor(screen.clientWidth * Math.min(1.75, devicePixelRatio))
    }), { message: 'The real ResizeObserver must rebuild the drawing buffer for the constrained hero' }).toBe(true)
    await page.clock.runFor(160)
    expect(await page.evaluate(() => innerWidth), 'The CSS media query viewport must remain at the breakpoint').toBe(viewport.width)
    await expectPrivateHalo(page, viewport.count)
    expect((await particleState(page)).haloDraws, 'The constrained geometry must be checked after actual new halo draws').toBeGreaterThan(before.haloDraws)
    const geometry = await orbitGeometry(page)
    expect(geometry.width).toBe(viewport.width - 16)
    const halo = await haloState(page)
    expect(halo.positions).toHaveLength(viewport.count * 2)
    for (let index = 0; index < viewport.count; index++) {
      const dx = halo.positions[index * 2]! / geometry.scale - geometry.cx
      const dy = halo.positions[index * 2 + 1]! / geometry.scale - geometry.cy
      const ellipse = (dx / geometry.rx) ** 2 + (dy / geometry.ry) ** 2
      const normal = 2 * Math.hypot(dx / geometry.rx ** 2, dy / geometry.ry ** 2)
      expect(Math.abs(ellipse - 1) / normal, 'The viewport budget must still follow the constrained container’s actual ellipse').toBeLessThanOrEqual(2.1)
    }
    const rendered = await captureParticleSurface(page)
    expect(rendered.visible, 'The constrained hero must retain a real rendered halo').toBeGreaterThan(viewport.count)
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(rendered.bounds[edge] / geometry.scale - geometry[edge]), `The real resized halo framebuffer must follow the ${edge} ellipse edge`).toBeLessThan(8)
    }
    await testInfo.attach('halo-viewport-budget', { body: JSON.stringify({ viewportWidth: viewport.width, clientWidth: geometry.width, count: viewport.count, geometry, rendered }, null, 2), contentType: 'application/json' })
  })
}

test('scintillates the real halo within bounded brightness while every dust position stays fixed', async ({ page }) => {
  await prepareHalo(page)
  await revealHalo(page)
  const before = await haloState(page)
  await captureParticleSurface(page)
  await page.clock.runFor(3000)
  await captureParticleSurface(page)
  const movement = await particleSurfaceDifference(page)
  const after = await haloState(page)
  expect(after.positions).toEqual(before.positions)
  expect(after.styles).toEqual(before.styles)
  expect(after.colors).toEqual(before.colors)
  expect(movement.elapsed).toBeGreaterThan(3)
  expect(movement.changed, 'Isolated halo pixels must slowly change without the wordmark or background').toBeGreaterThan(Math.max(12, movement.visible * 0.02))
  expect(movement.absoluteAlphaChange).toBeGreaterThan(movement.visible)
  const bound = await page.evaluate(() => {
    const { surface, previousSurface } = window.__heroParticleProbe
    if (!surface || !previousSurface) {
      throw new Error('Two actual halo framebuffer samples are required')
    }
    let compared = 0
    let maximumRelativeChange = 0
    for (let index = 3; index < surface.pixels.length; index += 4) {
      const current = surface.pixels[index]!
      const previous = previousSurface.pixels[index]!
      if (current >= 24 && previous >= 24 && current < 230 && previous < 230) {
        compared += 1
        maximumRelativeChange = Math.max(maximumRelativeChange, Math.abs(current - previous) / Math.max(current, previous))
      }
    }
    return { compared, maximumRelativeChange }
  })
  expect(bound.compared).toBeGreaterThan(100)
  expect(bound.maximumRelativeChange, 'Slow ±25% scintillation must not flash points on and off').toBeLessThanOrEqual(0.45)
})

test('keeps the frozen-phase halo identical during automatic, hovered and focused planet selection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Automatic planet emphasis is a desktop interaction')
  await prepareHalo(page, true)
  await revealHalo(page)
  await captureParticleSurface(page)
  const baseline = await haloState(page)
  const appearance = () => page.locator('.home-hero-orbit').evaluate(element =>
    ['::before', '::after'].map((pseudo) => {
      const style = getComputedStyle(element, pseudo)
      return {
        border: style.border,
        boxShadow: style.boxShadow,
        mask: style.maskImage,
        opacity: style.opacity,
        background: style.backgroundImage,
        filter: style.filter,
      }
    }))
  const baselineAppearance = await appearance()
  await page.clock.runFor(3100)
  const planets = page.locator('.home-hero-planet')
  await expect(planets.nth(0)).toHaveAttribute('data-planet-active', '')
  for (const interaction of ['automatic', 'hover', 'focus'] as const) {
    if (interaction === 'hover') {
      await planets.nth(3).hover({ force: true })
      await expect(planets.nth(3)).toHaveAttribute('data-planet-active', '')
    }
    if (interaction === 'focus') {
      await planets.nth(6).focus()
      await expect(planets.nth(6)).toHaveAttribute('data-planet-active', '')
    }
    await captureParticleSurface(page)
    const change = await particleSurfaceDifference(page)
    expect(change.visible, 'The invariant comparison must contain a rendered halo').toBeGreaterThan(100)
    expect(change.changed, `${interaction} selection must not repaint a brighter ring or arc`).toBe(0)
    expect(change.absoluteAlphaChange).toBe(0)
    const current = await haloState(page)
    expect(current.positions).toEqual(baseline.positions)
    expect(current.styles).toEqual(baseline.styles)
    expect(current.colors).toEqual(baseline.colors)
    expect(await appearance(), `${interaction} selection must keep the constant CSS core and bloom paint`).toEqual(baselineAppearance)
  }
})

test('gates the halo through entrance and replay and freezes its actual framebuffer with the shared pause', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) {
      return getContext.call(this, contextId, contextId === 'webgl2' ? { ...(options as WebGLContextAttributes), preserveDrawingBuffer: true } : options)
    } as typeof getContext
  })
  await prepareHalo(page, false, true)
  const screen = page.locator('.home-hero-screen')
  expect((await captureParticleSurface(page)).visible, 'The opening must not reveal dust behind the Logo').toBe(0)
  await page.clock.runFor(1000)
  await expect(screen).toHaveAttribute('data-hero-phase', 'assembling')
  expect((await captureParticleSurface(page)).visible).toBe(0)
  await page.clock.runFor(1500)
  await expect(screen).toHaveAttribute('data-hero-phase', 'ready')
  await expectPrivateHalo(page, page.viewportSize()!.width >= 1024 ? 960 : page.viewportSize()!.width >= 640 ? 384 : 256)
  expect((await haloState(page)).frames.some(frame => frame.reveal > 0 && frame.reveal < 1), 'The halo must share the staged planet reveal rather than appear before ready').toBe(true)
  expect((await captureParticleSurface(page)).visible).toBeGreaterThan(100)
  const picture = () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.home-hero-particle-canvas')!
    const gl = canvas.getContext('webgl2')!
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let hash = 2166136261
    let alpha = 0
    for (let index = 0; index < pixels.length; index++) {
      hash = Math.imul(hash ^ pixels[index]!, 16777619)
      if (index % 4 === 3) {
        alpha += pixels[index]!
      }
    }
    return { hash: hash >>> 0, alpha }
  })
  await page.locator('[data-planet-toggle]').click()
  const paused = await particleState(page)
  const retained = await picture()
  expect(retained.alpha).toBeGreaterThan(1000)
  await page.clock.fastForward(60000)
  const frozen = await particleState(page)
  expect(frozen.haloDraws).toBe(paused.haloDraws)
  expect(frozen.haloFrame).toEqual(paused.haloFrame)
  expect(await picture(), 'Pausing must retain exactly the last real dust picture').toEqual(retained)
  await page.locator('[data-planet-toggle]').click()
  await page.clock.runFor(160)
  const resumed = await particleState(page)
  expect(resumed.haloFrame!.time - paused.haloFrame!.time).toBeLessThan(0.3)
  await setPageHidden(page, true)
  const hidden = await particleState(page)
  await page.clock.fastForward(60000)
  expect((await particleState(page)).haloDraws).toBe(hidden.haloDraws)
  await setPageHidden(page, false)
  await page.clock.runFor(160)
  expect((await particleState(page)).haloFrame!.time - hidden.haloFrame!.time).toBeLessThan(0.3)
  await page.locator('[data-hero-replay]').click()
  await expect(screen).toHaveAttribute('data-hero-phase', 'logo')
  expect((await captureParticleSurface(page)).visible, 'Replay must clear the previous halo before showing the Logo').toBe(0)
  const replay = await particleState(page)
  await page.clock.runFor(2500)
  await expect(screen).toHaveAttribute('data-hero-phase', 'ready')
  expect((await captureParticleSurface(page)).visible).toBeGreaterThan(100)
  expect((await particleState(page)).contexts).toBe(replay.contexts)
})

test('restores the complete paused-ready halo picture in one static reconnect draw and releases both passes', async ({ page }) => {
  await prepareHalo(page, true)
  await revealHalo(page)
  expect((await captureParticleSurface(page)).visible).toBeGreaterThan(100)
  await page.locator('[data-planet-toggle]').click()
  const paused = await particleState(page)
  expect(paused.resources.programs).toBe(2)
  expect(paused.resources.vaos).toBe(2)
  const particle = await page.locator('hero-particles').evaluateHandle((element) => {
    element.remove()
    return element
  })
  try {
    await expect.poll(async () => (await particleState(page)).resources).toEqual({ programs: 0, vaos: 0, buffers: 0 })
    await page.evaluate(() => {
      window.__heroParticleProbe.captureSurface = true
    })
    await particle.evaluate(element => document.querySelector('.home-hero-screen')!.prepend(element))
    await expect.poll(async () => (await particleState(page)).draws).toBe(paused.draws + 1)
    const reconnected = await particleState(page)
    expect(reconnected.haloDraws).toBe(paused.haloDraws + 1)
    expect(reconnected.haloFrame?.reveal).toBe(1)
    expect(reconnected.resources).toEqual(paused.resources)
    const change = await particleSurfaceDifference(page)
    expect(change.visible, 'The reconnect snapshot must include actual halo pixels from its late optional pass').toBeGreaterThan(100)
    expect(change.changed, 'Frozen scintillation must restore the exact ready halo picture without another animation frame').toBe(0)
    expect(change.absoluteAlphaChange).toBe(0)
    await page.clock.fastForward(60000)
    expect((await particleState(page)).draws).toBe(reconnected.draws)
    expect((await particleState(page)).haloDraws).toBe(reconnected.haloDraws)
  }
  finally {
    await particle.dispose()
  }
})

for (const failure of ['shader', 'allocation'] as const) {
  test(`keeps the core and original particle renderer when optional halo ${failure} fails`, async ({ page }) => {
    await installMotionClock(page)
    await captureParticleFrames(page)
    await page.addInitScript((kind) => {
      window.__haloFailureHits = 0
      const shaders = new WeakSet<WebGLShader>()
      const programs = new WeakSet<WebGLProgram>()
      const prototype = WebGL2RenderingContext.prototype
      const shaderSource = prototype.shaderSource
      prototype.shaderSource = function (shader, source) {
        if (source.includes('a_haloPosition')) {
          shaders.add(shader)
        }
        return shaderSource.call(this, shader, source)
      }
      const attachShader = prototype.attachShader
      prototype.attachShader = function (program, shader) {
        if (shaders.has(shader)) {
          programs.add(program)
        }
        return attachShader.call(this, program, shader)
      }
      const getShaderParameter = prototype.getShaderParameter
      prototype.getShaderParameter = function (shader, parameter) {
        if (kind === 'shader' && shaders.has(shader) && parameter === this.COMPILE_STATUS) {
          window.__haloFailureHits += 1
          return false
        }
        return getShaderParameter.call(this, shader, parameter)
      }
      const createBuffer = prototype.createBuffer
      prototype.createBuffer = function (this: WebGL2RenderingContext) {
        const current = this.getParameter(this.CURRENT_PROGRAM) as WebGLProgram | null
        if (kind === 'allocation' && current && programs.has(current)) {
          window.__haloFailureHits += 1
          return null
        }
        return createBuffer.call(this)
      } as typeof createBuffer
    }, failure)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(homeRoute)
    await expect.poll(async () => (await particleState(page)).draws).toBeGreaterThan(0)
    await page.clock.runFor(2800)
    await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
    expect(await page.evaluate(() => window.__haloFailureHits)).toBeGreaterThan(0)
    const before = await particleState(page)
    expect(before.haloDraws).toBe(0)
    expect(before.glyphCount).toBe(page.viewportSize()!.width < 720 ? 900 : 2400)
    expect(before.flowCount).toBeGreaterThan(0)
    expect((await captureParticleSurface(page)).visible, 'Failure must not leave a blank original GL renderer').toBeGreaterThan(100)
    const core = await page.locator('.home-hero-orbit').evaluate((element) => {
      const style = getComputedStyle(element, '::before')
      const color = style.borderTopColor.match(/[\d.]+/g)?.map(Number) ?? []
      return { width: style.borderTopWidth, alpha: (color[3] ?? 1) * Number(style.opacity), visible: getComputedStyle(element.parentElement!).visibility }
    })
    expect(core.width).toBe('1px')
    expect(core.alpha, 'The static ice-white core must remain bright after optional GL failure').toBeGreaterThan(0.5)
    expect(core.visible).toBe('visible')
    await page.clock.runFor(1000)
    const after = await particleState(page)
    expect(after.draws).toBeGreaterThan(before.draws)
    expect(after.frame!.time).toBeGreaterThan(before.frame!.time)
    expect(after.contexts).toBe(1)
  })
}
