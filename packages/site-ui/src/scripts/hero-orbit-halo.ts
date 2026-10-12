import { HERO_LOGO_PALETTE } from './hero-logo'

const TAU = Math.PI * 2
const TWINKLE_AMPLITUDE = 0.25

interface OrbitHaloGeometry {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
  viewportWidth: number
}

interface OrbitHaloPoint {
  x: number
  y: number
  diameter: number
  brightness: number
  phase: number
  period: number
  colorIndex: number
}

/** The fixed cloud is sampled by distance, including on flattened ellipses. */
export function createOrbitHaloPoints(geometry: OrbitHaloGeometry): OrbitHaloPoint[] {
  const { centerX, centerY, radiusX, radiusY, viewportWidth } = geometry
  if (![centerX, centerY, radiusX, radiusY, viewportWidth].every(Number.isFinite)
    || radiusX <= 0 || radiusY <= 0 || viewportWidth <= 0) {
    return []
  }
  const count = viewportWidth >= 1024 ? 960 : viewportWidth >= 640 ? 384 : 256
  const segments = 4096
  const distances = new Float64Array(segments + 1)
  let previousX = radiusX
  let previousY = 0
  for (let index = 1; index <= segments; index += 1) {
    const angle = index / segments * TAU
    const x = Math.cos(angle) * radiusX
    const y = Math.sin(angle) * radiusY
    distances[index] = distances[index - 1]! + Math.hypot(x - previousX, y - previousY)
    previousX = x
    previousY = y
  }
  let seed = 0x0B17A10
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const perimeter = distances[segments]!
  const points: OrbitHaloPoint[] = []
  let segment = 1
  for (let index = 0; index < count; index += 1) {
    const distance = (index + 0.5) / count * perimeter
    while (segment < segments && distances[segment]! < distance) {
      segment += 1
    }
    const before = distances[segment - 1]!
    const fraction = (distance - before) / (distances[segment]! - before)
    const angle = (segment - 1 + fraction) / segments * TAU
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const normalX = cosine / radiusX
    const normalY = sine / radiusY
    const normalLength = Math.hypot(normalX, normalY)
    const jitter = (random() * 2 - 1) * 2
    const depth = 0.775 + sine * 0.225
    // Four fifths stay pearl white; restrained flecks use the Logo palette.
    const colorIndex = index % 5 === 0 ? Math.floor(random() * 3) : 3
    points.push({
      x: centerX + cosine * radiusX + normalX / normalLength * jitter,
      y: centerY + sine * radiusY + normalY / normalLength * jitter,
      diameter: index % 29 === 0 ? 3 : 0.7 + random() * 1.7,
      brightness: (0.32 + random() * 0.3) * depth,
      phase: random() * TAU,
      period: 6 + random() * 6,
      colorIndex,
    })
  }
  return points
}

/** Also describes the shader's light envelope without moving a point. */
export function orbitHaloBrightness(point: Pick<OrbitHaloPoint, 'brightness' | 'phase' | 'period'>, time: number): number {
  return point.brightness * (1 + TWINKLE_AMPLITUDE * Math.sin(time * TAU / point.period + point.phase))
}

const VERTEX = `#version 300 es
in vec2 a_haloPosition;
in vec4 a_haloStyle;
in vec3 a_haloColor;
uniform vec2 u_haloResolution;
uniform float u_haloTime;
uniform float u_haloReveal;
uniform float u_haloDpr;
out float v_light;
out float v_coreRatio;
out float v_rays;
out vec3 v_color;
void main() {
  vec2 clip = a_haloPosition / u_haloResolution * 2.0 - 1.0;
  clip.y *= -1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
  float spriteSize = min(a_haloStyle.x * 3.0, 6.0 * u_haloDpr);
  gl_PointSize = spriteSize;
  v_coreRatio = a_haloStyle.x / spriteSize;
  v_rays = step(2.5 * u_haloDpr, a_haloStyle.x);
  float wave = sin(u_haloTime * 6.28318530718 / a_haloStyle.w + a_haloStyle.z);
  v_light = a_haloStyle.y * (1.0 + ${TWINKLE_AMPLITUDE} * wave) * u_haloReveal;
  v_color = a_haloColor;
}
`

const FRAGMENT = `#version 300 es
precision mediump float;
in float v_light;
in float v_coreRatio;
in float v_rays;
in vec3 v_color;
out vec4 fragColor;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float radius = length(uv);
  if (radius >= 1.0) {
    discard;
  }
  float core = exp(-0.69314718 * dot(uv, uv) / (v_coreRatio * v_coreRatio));
  float bloom = exp(-dot(uv, uv) * 3.4) * 0.08;
  float rays = (
    max(0.0, 1.0 - abs(uv.x) * 16.0) * exp(-abs(uv.y) * 3.0)
    + max(0.0, 1.0 - abs(uv.y) * 16.0) * exp(-abs(uv.x) * 3.0)
  ) * v_rays * 0.07;
  float edge = 1.0 - smoothstep(0.72, 1.0, radius);
  float alpha = (core + bloom + rays) * v_light * edge;
  if (alpha < 0.001) {
    discard;
  }
  vec3 color = mix(v_color, vec3(0.94, 0.97, 1.0), core * 0.72);
  fragColor = vec4(color * alpha, alpha);
}
`

interface HeroOrbitHalo {
  rebuild: (geometry: OrbitHaloGeometry, dpr: number) => boolean
  draw: (width: number, height: number, time: number, reveal: number) => boolean
  dispose: () => void
}

/** Owns GL resources only. The parent renderer owns time, reveal, and scheduling. */
export function createHeroOrbitHalo(gl: WebGL2RenderingContext): HeroOrbitHalo | null {
  let vertex: WebGLShader | null = null
  let fragment: WebGLShader | null = null
  let program: WebGLProgram | null = null
  let vao: WebGLVertexArrayObject | null = null
  let buffer: WebGLBuffer | null = null
  let count = 0
  let scale = 1
  const clearErrors = () => {
    // Bound this loop even when a failed driver repeatedly returns an error.
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (gl.getError() === gl.NO_ERROR) {
        break
      }
    }
  }
  const dispose = () => {
    gl.bindVertexArray(null)
    gl.useProgram(null)
    gl.deleteBuffer(buffer)
    gl.deleteVertexArray(vao)
    gl.deleteProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    buffer = null
    vao = null
    program = null
    vertex = null
    fragment = null
    count = 0
  }
  const fail = () => {
    dispose()
    clearErrors()
    return null
  }
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) {
      return null
    }
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }
  vertex = compile(gl.VERTEX_SHADER, VERTEX)
  fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vertex || !fragment) {
    return fail()
  }
  program = gl.createProgram()
  if (!program) {
    return fail()
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return fail()
  }
  gl.useProgram(program)
  vao = gl.createVertexArray()
  buffer = gl.createBuffer()
  if (!vao || !buffer) {
    return fail()
  }
  const position = gl.getAttribLocation(program, 'a_haloPosition')
  const style = gl.getAttribLocation(program, 'a_haloStyle')
  const color = gl.getAttribLocation(program, 'a_haloColor')
  const resolution = gl.getUniformLocation(program, 'u_haloResolution')
  const time = gl.getUniformLocation(program, 'u_haloTime')
  const reveal = gl.getUniformLocation(program, 'u_haloReveal')
  const dpr = gl.getUniformLocation(program, 'u_haloDpr')
  if ([position, style, color].some(location => location < 0) || !resolution || !time || !reveal || !dpr) {
    return fail()
  }
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  const stride = 9 * Float32Array.BYTES_PER_ELEMENT
  for (const [location, size, offset] of [[position, 2, 0], [style, 4, 2], [color, 3, 6]]) {
    gl.enableVertexAttribArray(location!)
    gl.vertexAttribPointer(location!, size!, gl.FLOAT, false, stride, offset! * Float32Array.BYTES_PER_ELEMENT)
  }
  if (gl.getError() !== gl.NO_ERROR) {
    return fail()
  }
  return {
    rebuild(geometry, pixelRatio) {
      if (!buffer || !vao || !program) {
        return false
      }
      const points = createOrbitHaloPoints(geometry)
      if (!points.length || !Number.isFinite(pixelRatio) || pixelRatio <= 0) {
        return false
      }
      const data = new Float32Array(points.length * 9)
      points.forEach((point, index) => {
        data.set([
          point.x * pixelRatio,
          point.y * pixelRatio,
          point.diameter * pixelRatio,
          point.brightness,
          point.phase,
          point.period,
          ...HERO_LOGO_PALETTE[point.colorIndex]!.rgb,
        ], index * 9)
      })
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      if (gl.getError() !== gl.NO_ERROR) {
        clearErrors()
        return false
      }
      count = points.length
      scale = pixelRatio
      return true
    },
    draw(width, height, activeTime, opacity) {
      if (!program || !vao || !count) {
        return false
      }
      if (opacity <= 0) {
        return true
      }
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.uniform2f(resolution, width, height)
      gl.uniform1f(time, activeTime)
      gl.uniform1f(reveal, opacity)
      gl.uniform1f(dpr, scale)
      gl.drawArrays(gl.POINTS, 0, count)
      if (gl.getError() !== gl.NO_ERROR) {
        clearErrors()
        return false
      }
      return true
    },
    dispose,
  }
}
