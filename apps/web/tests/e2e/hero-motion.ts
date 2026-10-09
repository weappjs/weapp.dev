import type { Page } from '@playwright/test'

export interface ParticleFrame {
  time: number
  progress: number
  flowAmplitude: number
  pointerStrength: number
  pointer: [number, number]
  trailCount: number
}

interface GlyphSnapshot {
  time: number
  pixels: Uint8Array
}

interface ParticleProbe {
  draws: number
  frames: ParticleFrame[]
  glyphCount: number
  flowCount: number
  maxRadius: number
  contexts: number
  captureGlyph: boolean
  glyph: GlyphSnapshot | null
  previousGlyph: GlyphSnapshot | null
}

declare global {
  interface Window {
    __heroParticleProbe: ParticleProbe
  }
}

export async function installMotionClock(page: Page) {
  const time = new Date('2026-10-10T00:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(new Date(time.getTime() + 1000))
}

export async function setPageHidden(page: Page, hidden: boolean) {
  // Tab visibility is outside Playwright's clock; dispatch the native event
  // after changing the document state that the production handlers read.
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

export async function captureParticleFrames(page: Page, isolateGlyphs = false) {
  await page.addInitScript((glyphsOnly) => {
    const probe: ParticleProbe = {
      draws: 0,
      frames: [],
      glyphCount: 0,
      flowCount: 0,
      maxRadius: 0,
      contexts: 0,
      captureGlyph: false,
      glyph: null,
      previousGlyph: null,
    }
    window.__heroParticleProbe = probe
    const uniformNames = new WeakMap<WebGLUniformLocation, string>()
    const uniforms = new WeakMap<WebGL2RenderingContext, Map<string, number[]>>()
    const attributeNames = new WeakMap<WebGL2RenderingContext, Map<number, string>>()
    const attributes = new WeakMap<WebGL2RenderingContext, Map<string, WebGLBuffer>>()
    const buffers = new WeakMap<WebGLBuffer, Float32Array>()
    const seen = new WeakSet<WebGL2RenderingContext>()
    const prototype = WebGL2RenderingContext.prototype
    const shaderSource = prototype.shaderSource
    prototype.shaderSource = function (shader, source) {
      if (glyphsOnly && source.includes('gl_Position') && source.includes('a_flow')) {
        // Keep production glyph positions intact but remove twinkle and sprite
        // rotation, making framebuffer changes evidence of positional flow.
        source = source.replace(/\}\s*$/, 'v_brightness = a_brightness; v_spin = 0.0;\n}')
      }
      return shaderSource.call(this, shader, source)
    }
    const remember = (gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, values: number[]) => {
      if (!location) {
        return
      }
      const name = uniformNames.get(location)
      if (name) {
        const current = uniforms.get(gl) ?? new Map<string, number[]>()
        current.set(name, values)
        uniforms.set(gl, current)
      }
    }
    const getUniformLocation = prototype.getUniformLocation
    prototype.getUniformLocation = function (...args) {
      const location = getUniformLocation.apply(this, args)
      if (location) {
        uniformNames.set(location, args[1])
      }
      return location
    }
    const uniform1f = prototype.uniform1f
    prototype.uniform1f = function (...args) {
      remember(this, args[0], [args[1]])
      return uniform1f.apply(this, args)
    }
    const uniform3fv = prototype.uniform3fv
    prototype.uniform3fv = function (...args) {
      remember(this, args[0], Array.from(args[1]))
      return uniform3fv.apply(this, args)
    }
    const uniform2f = prototype.uniform2f
    prototype.uniform2f = function (...args) {
      remember(this, args[0], [args[1], args[2]])
      return uniform2f.apply(this, args)
    }
    const getAttribLocation = prototype.getAttribLocation
    prototype.getAttribLocation = function (...args) {
      const location = getAttribLocation.apply(this, args)
      const names = attributeNames.get(this) ?? new Map<number, string>()
      names.set(location, args[1])
      attributeNames.set(this, names)
      return location
    }
    const bufferData = prototype.bufferData
    prototype.bufferData = function (this: WebGL2RenderingContext, ...args: Parameters<typeof bufferData>) {
      const buffer = this.getParameter(this.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      if (buffer && args[1] instanceof Float32Array) {
        buffers.set(buffer, args[1].slice())
      }
      return bufferData.apply(this, args)
    } as typeof bufferData
    const vertexAttribPointer = prototype.vertexAttribPointer
    prototype.vertexAttribPointer = function (...args) {
      const name = attributeNames.get(this)?.get(args[0])
      const buffer = this.getParameter(this.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      if (name && buffer) {
        const current = attributes.get(this) ?? new Map<string, WebGLBuffer>()
        current.set(name, buffer)
        attributes.set(this, current)
      }
      return vertexAttribPointer.apply(this, args)
    }
    const drawArrays = prototype.drawArrays
    prototype.drawArrays = function (mode, first, count) {
      if (!(this.canvas instanceof HTMLCanvasElement) || !this.canvas.classList.contains('home-hero-particle-canvas')) {
        return drawArrays.call(this, mode, first, count)
      }
      if (!seen.has(this)) {
        seen.add(this)
        probe.contexts += 1
      }
      const attribute = (name: string) => {
        const buffer = attributes.get(this)?.get(name)
        return buffer ? buffers.get(buffer) : undefined
      }
      const delay = attribute('a_delay')
      const dustStart = delay?.findIndex(value => value < 0) ?? -1
      const glyphCount = dustStart < 0 ? count : dustStart
      probe.glyphCount = glyphCount
      probe.flowCount = attribute('a_flow')?.slice(0, glyphCount).filter(value => value > 0).length ?? 0
      probe.maxRadius = Math.max(0, ...(attribute('a_radius')?.slice(0, glyphCount) ?? []))
      // The visual-motion test renders the real glyph shader without field
      // dust, so background movement cannot make a stationary wordmark pass.
      drawArrays.call(this, mode, first, glyphsOnly ? glyphCount : count)
      const current = uniforms.get(this)
      const frame: ParticleFrame = {
        time: current?.get('u_time')?.[0] ?? 0,
        progress: current?.get('u_progress')?.[0] ?? 0,
        flowAmplitude: current?.get('u_flowAmplitude')?.[0] ?? 0,
        pointerStrength: current?.get('u_pointerStrength')?.[0] ?? 0,
        pointer: [current?.get('u_pointer')?.[0] ?? 0, current?.get('u_pointer')?.[1] ?? 0],
        trailCount: (current?.get('u_trails[0]') ?? []).filter((value, index) => index % 3 === 2 && value > 0).length,
      }
      probe.draws += 1
      probe.frames.push(frame)
      if (probe.frames.length > 240) {
        probe.frames.shift()
      }
      if (probe.captureGlyph) {
        const title = document.querySelector('#home-hero-title')!.getBoundingClientRect()
        const canvas = this.canvas.getBoundingClientRect()
        const scale = this.canvas.width / canvas.width
        const x = Math.max(0, Math.floor((title.left - canvas.left) * scale))
        const y = Math.max(0, Math.floor((title.top - canvas.top) * scale))
        const width = Math.min(this.canvas.width - x, Math.ceil(title.width * scale))
        const height = Math.min(this.canvas.height - y, Math.ceil(title.height * scale))
        const pixels = new Uint8Array(width * height * 4)
        this.readPixels(x, this.canvas.height - y - height, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels)
        probe.previousGlyph = probe.glyph
        probe.glyph = { time: frame.time, pixels }
        probe.captureGlyph = false
      }
    }
  }, isolateGlyphs)
}

export async function particleState(page: Page) {
  return page.evaluate(() => ({
    draws: window.__heroParticleProbe.draws,
    frame: window.__heroParticleProbe.frames.at(-1),
    glyphCount: window.__heroParticleProbe.glyphCount,
    flowCount: window.__heroParticleProbe.flowCount,
    maxRadius: window.__heroParticleProbe.maxRadius,
    contexts: window.__heroParticleProbe.contexts,
  }))
}
