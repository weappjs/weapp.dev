import type { Page } from '@playwright/test'

export interface ParticleFrame {
  time: number
  progress: number
  flowAmplitude: number
  pointerStrength: number
  pointer: [number, number]
  trailCount: number
}

export interface HaloFrame {
  time: number
  reveal: number
  count: number
  program: number
  vao: number
}

interface GlyphSnapshot {
  time: number
  width: number
  height: number
  pixels: Uint8Array
}

export type ParticleLayer = boolean | 'source-color' | 'field-position' | 'field-brightness' | 'halo' | 'halo-static'

interface ParticleBounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface ParticleProbe {
  draws: number
  frames: ParticleFrame[]
  glyphCount: number
  sourcePalettePoints: number[]
  sourceSparkles: number
  flowCount: number
  maxRadius: number
  contexts: number
  captureGlyph: boolean
  glyph: GlyphSnapshot | null
  previousGlyph: GlyphSnapshot | null
  captureSurface: boolean
  surface: GlyphSnapshot | null
  previousSurface: GlyphSnapshot | null
  sourceBounds: ParticleBounds | null
  targetBounds: ParticleBounds | null
  mainProgram: number
  mainVao: number
  haloDraws: number
  haloFrames: HaloFrame[]
  haloPositions: number[]
  haloStyles: number[]
  haloColors: number[]
  livePrograms: number
  liveVaos: number
  liveBuffers: number
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

export async function captureParticleFrames(page: Page, layer: ParticleLayer = false, captureOpening = false) {
  await page.addInitScript(({ selectedLayer, opening }) => {
    const probe: ParticleProbe = {
      draws: 0,
      frames: [],
      glyphCount: 0,
      sourcePalettePoints: [],
      sourceSparkles: 0,
      flowCount: 0,
      maxRadius: 0,
      contexts: 0,
      captureGlyph: false,
      glyph: null,
      previousGlyph: null,
      captureSurface: opening,
      surface: null,
      previousSurface: null,
      sourceBounds: null,
      targetBounds: null,
      mainProgram: 0,
      mainVao: 0,
      haloDraws: 0,
      haloFrames: [],
      haloPositions: [],
      haloStyles: [],
      haloColors: [],
      livePrograms: 0,
      liveVaos: 0,
      liveBuffers: 0,
    }
    window.__heroParticleProbe = probe
    const uniformNames = new WeakMap<WebGLUniformLocation, { program: WebGLProgram, name: string }>()
    const uniforms = new WeakMap<WebGLProgram, Map<string, number[]>>()
    const attributeNames = new WeakMap<WebGLProgram, Map<number, string>>()
    const attributes = new WeakMap<WebGL2RenderingContext, Map<WebGLVertexArrayObject | null, Map<number, { buffer: WebGLBuffer, size: number, stride: number, offset: number }>>>()
    const buffers = new WeakMap<WebGLBuffer, Float32Array>()
    const identities = new WeakMap<object, number>()
    let nextIdentity = 0
    const identity = (value: object | null) => {
      if (!value) {
        return 0
      }
      let id = identities.get(value)
      if (!id) {
        id = ++nextIdentity
        identities.set(value, id)
      }
      return id
    }
    const seen = new WeakSet<WebGL2RenderingContext>()
    const prototype = WebGL2RenderingContext.prototype
    const programs = new WeakSet<WebGLProgram>()
    const vaos = new WeakSet<WebGLVertexArrayObject>()
    const allocatedBuffers = new WeakSet<WebGLBuffer>()
    const createProgram = prototype.createProgram
    prototype.createProgram = function () {
      const program = createProgram.call(this)
      if (program) {
        programs.add(program)
        probe.livePrograms += 1
      }
      return program
    }
    const deleteProgram = prototype.deleteProgram
    prototype.deleteProgram = function (program) {
      if (program && programs.delete(program)) {
        probe.livePrograms -= 1
      }
      return deleteProgram.call(this, program)
    }
    const createVertexArray = prototype.createVertexArray
    prototype.createVertexArray = function () {
      const vao = createVertexArray.call(this)
      if (vao) {
        vaos.add(vao)
        probe.liveVaos += 1
      }
      return vao
    }
    const deleteVertexArray = prototype.deleteVertexArray
    prototype.deleteVertexArray = function (vao) {
      if (vao && vaos.delete(vao)) {
        probe.liveVaos -= 1
      }
      return deleteVertexArray.call(this, vao)
    }
    const createBuffer = prototype.createBuffer
    prototype.createBuffer = function () {
      const buffer = createBuffer.call(this)
      if (buffer) {
        allocatedBuffers.add(buffer)
        probe.liveBuffers += 1
      }
      return buffer
    }
    const deleteBuffer = prototype.deleteBuffer
    prototype.deleteBuffer = function (buffer) {
      if (buffer && allocatedBuffers.delete(buffer)) {
        probe.liveBuffers -= 1
      }
      return deleteBuffer.call(this, buffer)
    }
    const shaderSource = prototype.shaderSource
    prototype.shaderSource = function (shader, source) {
      if (selectedLayer && selectedLayer !== 'source-color' && selectedLayer !== 'halo' && selectedLayer !== 'halo-static' && source.includes('gl_Position') && source.includes('a_flow')) {
        // Isolate one physical effect while retaining its production shader.
        // A moving background cannot satisfy a foreground assertion, and
        // brightness cannot make a stationary field pass the position check.
        const fixedPosition = 'vec2 fixedClip = (a_target / u_resolution) * 2.0 - 1.0; fixedClip.y *= -1.0; gl_Position = vec4(fixedClip, 0.0, 1.0);'
        const isolation = selectedLayer === 'field-brightness'
          ? `${fixedPosition} v_spin = 0.0;`
          : `v_brightness = a_brightness; v_spin = 0.0; ${selectedLayer === true ? 'v_sourceLight = a_sourceStyle.y;' : ''}`
        source = source.replace(/\}\s*$/, `${isolation}\n}`)
      }
      return shaderSource.call(this, shader, source)
    }
    const remember = (location: WebGLUniformLocation | null, values: number[]) => {
      if (!location) {
        return
      }
      const uniform = uniformNames.get(location)
      if (uniform) {
        const current = uniforms.get(uniform.program) ?? new Map<string, number[]>()
        current.set(uniform.name, values)
        uniforms.set(uniform.program, current)
      }
    }
    const getUniformLocation = prototype.getUniformLocation
    prototype.getUniformLocation = function (...args) {
      const location = getUniformLocation.apply(this, args)
      if (location) {
        uniformNames.set(location, { program: args[0], name: args[1] })
      }
      return location
    }
    const uniform1f = prototype.uniform1f
    prototype.uniform1f = function (...args) {
      remember(args[0], [args[1]])
      if (selectedLayer === 'halo-static' && args[0] && uniformNames.get(args[0])?.name === 'u_haloTime') {
        // Freeze only scintillation in the actual shader. The production
        // clock and both draw passes still run, exposing any position drift.
        return uniform1f.call(this, args[0], 0)
      }
      return uniform1f.apply(this, args)
    }
    const uniform3fv = prototype.uniform3fv
    prototype.uniform3fv = function (...args) {
      remember(args[0], Array.from(args[1]))
      return uniform3fv.apply(this, args)
    }
    const uniform2f = prototype.uniform2f
    prototype.uniform2f = function (...args) {
      remember(args[0], [args[1], args[2]])
      return uniform2f.apply(this, args)
    }
    const getAttribLocation = prototype.getAttribLocation
    prototype.getAttribLocation = function (...args) {
      const location = getAttribLocation.apply(this, args)
      const names = attributeNames.get(args[0]) ?? new Map<number, string>()
      names.set(location, args[1])
      attributeNames.set(args[0], names)
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
      const buffer = this.getParameter(this.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      if (buffer) {
        const vao = this.getParameter(this.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
        const arrays = attributes.get(this) ?? new Map()
        const current = arrays.get(vao) ?? new Map()
        current.set(args[0], { buffer, size: args[1], stride: args[4], offset: args[5] })
        arrays.set(vao, current)
        attributes.set(this, arrays)
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
      const program = this.getParameter(this.CURRENT_PROGRAM) as WebGLProgram | null
      const vao = this.getParameter(this.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
      const current = program ? uniforms.get(program) : undefined
      const attribute = (name: string) => {
        const location = program ? [...(attributeNames.get(program) ?? [])].find(([, value]) => value === name)?.[0] : undefined
        const descriptor = location === undefined ? undefined : attributes.get(this)?.get(vao)?.get(location)
        const source = descriptor ? buffers.get(descriptor.buffer) : undefined
        if (!descriptor || !source) {
          return undefined
        }
        const stride = (descriptor.stride || descriptor.size * 4) / 4
        const offset = descriptor.offset / 4
        const length = Math.min(count, Math.floor((source.length - offset - descriptor.size) / stride) + 1)
        const values = new Float32Array(length * descriptor.size)
        for (let index = 0; index < length; index++) {
          for (let component = 0; component < descriptor.size; component++) {
            values[index * descriptor.size + component] = source[offset + index * stride + component]!
          }
        }
        return values
      }
      const haloOnly = selectedLayer === 'halo' || selectedLayer === 'halo-static'
      if (current?.has('u_haloTime')) {
        probe.haloDraws += 1
        probe.haloFrames.push({
          time: current.get('u_haloTime')?.[0] ?? 0,
          reveal: current.get('u_haloReveal')?.[0] ?? 0,
          count,
          program: identity(program),
          vao: identity(vao),
        })
        if (probe.haloFrames.length > 240) {
          probe.haloFrames.shift()
        }
        probe.haloPositions = Array.from(attribute('a_haloPosition') ?? [])
        probe.haloStyles = Array.from(attribute('a_haloStyle') ?? [])
        probe.haloColors = Array.from(attribute('a_haloColor') ?? [])
        // Existing foreground/background evidence must never include this
        // independent pass, even if GL reuses numeric attribute locations.
        return !selectedLayer || haloOnly ? drawArrays.call(this, mode, first, count) : undefined
      }
      probe.mainProgram = identity(program)
      probe.mainVao = identity(vao)
      const delay = attribute('a_delay')
      const dustStart = delay?.findIndex(value => value < 0) ?? -1
      const glyphCount = dustStart < 0 ? count : dustStart
      probe.glyphCount = glyphCount
      const sourceStyle = attribute('a_sourceStyle')
      const sourcePalettePoints = [0, 0, 0, 0]
      let sourceSparkles = 0
      if (sourceStyle) {
        for (let index = 0; index < glyphCount; index++) {
          const color = sourceStyle[index * 4 + 2]!
          if (Number.isInteger(color) && color >= 0 && color < sourcePalettePoints.length) {
            sourcePalettePoints[color]! += 1
          }
          sourceSparkles += sourceStyle[index * 4 + 3]! >= 0.5 ? 1 : 0
        }
      }
      probe.sourcePalettePoints = sourcePalettePoints
      probe.sourceSparkles = sourceSparkles
      probe.flowCount = attribute('a_flow')?.slice(0, glyphCount).filter(value => value > 0).length ?? 0
      probe.maxRadius = Math.max(0, ...(attribute('a_radius')?.slice(0, glyphCount) ?? []))
      const positionBounds = (positions?: Float32Array): ParticleBounds | null => {
        if (!positions || glyphCount === 0) {
          return null
        }
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        for (let index = 0; index < glyphCount * 2; index += 2) {
          left = Math.min(left, positions[index]!)
          right = Math.max(right, positions[index]!)
          top = Math.min(top, positions[index + 1]!)
          bottom = Math.max(bottom, positions[index + 1]!)
        }
        return { left, top, right, bottom }
      }
      probe.sourceBounds = positionBounds(attribute('a_start'))
      probe.targetBounds = positionBounds(attribute('a_target'))
      // Source-color samples exclude the background but retain the actual
      // source twinkle; an isolated white field cannot satisfy a Logo check.
      const fieldOnly = selectedLayer === 'field-position' || selectedLayer === 'field-brightness'
      if (!haloOnly) {
        drawArrays.call(this, mode, fieldOnly ? first + glyphCount : first, fieldOnly ? count - glyphCount : selectedLayer ? glyphCount : count)
      }
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
        probe.glyph = { time: frame.time, width, height, pixels }
        probe.captureGlyph = false
      }
      if (probe.captureSurface) {
        probe.captureSurface = false
        const capture = () => {
          const width = this.canvas.width
          const height = this.canvas.height
          const pixels = new Uint8Array(width * height * 4)
          this.readPixels(0, 0, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels)
          probe.previousSurface = probe.surface
          probe.surface = { time: frame.time, width, height, pixels }
        }
        // A ready paused reconnect validates the main pass before preparing
        // its optional halo. Read before paint but after the complete draw
        // stack so either legitimate pass order yields the real full frame.
        if (haloOnly) {
          queueMicrotask(capture)
        }
        else {
          capture()
        }
      }
    }
  }, { selectedLayer: layer, opening: captureOpening })
}

export async function particleState(page: Page) {
  return page.evaluate(() => ({
    draws: window.__heroParticleProbe.draws,
    frame: window.__heroParticleProbe.frames.at(-1),
    glyphCount: window.__heroParticleProbe.glyphCount,
    sourcePalettePoints: window.__heroParticleProbe.sourcePalettePoints,
    sourceSparkles: window.__heroParticleProbe.sourceSparkles,
    flowCount: window.__heroParticleProbe.flowCount,
    maxRadius: window.__heroParticleProbe.maxRadius,
    contexts: window.__heroParticleProbe.contexts,
    sourceBounds: window.__heroParticleProbe.sourceBounds,
    targetBounds: window.__heroParticleProbe.targetBounds,
    mainProgram: window.__heroParticleProbe.mainProgram,
    mainVao: window.__heroParticleProbe.mainVao,
    haloDraws: window.__heroParticleProbe.haloDraws,
    haloFrame: window.__heroParticleProbe.haloFrames.at(-1),
    resources: {
      programs: window.__heroParticleProbe.livePrograms,
      vaos: window.__heroParticleProbe.liveVaos,
      buffers: window.__heroParticleProbe.liveBuffers,
    },
  }))
}

export async function haloState(page: Page) {
  return page.evaluate(() => ({
    positions: window.__heroParticleProbe.haloPositions,
    styles: window.__heroParticleProbe.haloStyles,
    colors: window.__heroParticleProbe.haloColors,
    frames: window.__heroParticleProbe.haloFrames,
  }))
}

export async function captureParticleSurface(page: Page) {
  await page.evaluate(() => {
    window.__heroParticleProbe.captureSurface = true
  })
  await page.clock.runFor(160)
  return page.evaluate(() => {
    const sample = window.__heroParticleProbe.surface
    if (!sample) {
      throw new Error('A real particle framebuffer must be captured')
    }
    let visible = 0
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    let alpha = 0
    for (let index = 3; index < sample.pixels.length; index += 4) {
      const value = sample.pixels[index]!
      alpha += value
      if (value >= 8) {
        const pixel = (index - 3) / 4
        const x = pixel % sample.width
        const y = sample.height - 1 - Math.floor(pixel / sample.width)
        visible += 1
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    return { time: sample.time, visible, alpha, bounds: { left, top, right, bottom } }
  })
}

export async function particleSurfaceDifference(page: Page) {
  return page.evaluate(() => {
    const { surface, previousSurface } = window.__heroParticleProbe
    if (!surface || !previousSurface || surface.pixels.length !== previousSurface.pixels.length) {
      throw new Error('Two equal-sized real particle framebuffer samples must be captured')
    }
    let visible = 0
    let changed = 0
    let absoluteAlphaChange = 0
    for (let index = 3; index < surface.pixels.length; index += 4) {
      const current = surface.pixels[index]!
      const previous = previousSurface.pixels[index]!
      if (current >= 8 || previous >= 8) {
        visible += 1
        const difference = Math.abs(current - previous)
        absoluteAlphaChange += difference
        if (difference >= 2) {
          changed += 1
        }
      }
    }
    return { visible, changed, absoluteAlphaChange, elapsed: surface.time - previousSurface.time }
  })
}

export async function particleSurfacePalette(page: Page, palette: ReadonlyArray<{ rgb: number[] }>) {
  return page.evaluate((colors) => {
    const sample = window.__heroParticleProbe.surface
    if (!sample) {
      throw new Error('A real particle framebuffer must be captured before checking its palette')
    }
    const pixelsPerColor = colors.map(() => 0)
    let visible = 0
    let unmatched = 0
    for (let offset = 0; offset < sample.pixels.length; offset += 4) {
      const alpha = sample.pixels[offset + 3]!
      // Skip faint edge coverage so one 8-bit rounding step cannot dominate
      // the hue. Source discs retain alpha >= 0.52 away from their edges.
      if (alpha < 64) {
        continue
      }
      visible += 1
      const match = colors.findIndex(color => color.rgb.every((value, channel) =>
        Math.abs(sample.pixels[offset + channel]! - value * alpha / 255) <= 3))
      if (match >= 0) {
        pixelsPerColor[match]! += 1
      }
      else {
        unmatched += 1
      }
    }
    return { time: sample.time, visible, unmatched, pixelsPerColor }
  }, palette)
}
