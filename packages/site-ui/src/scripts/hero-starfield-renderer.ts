import { createHeroStarfield, heroStarMotion } from './hero-starfield'

/** A field-only shader expression keeps foreground glyphs and the orbit anchored. */
export const HERO_STARFIELD_VERTEX_MOTION = `
  float fieldPhase = a_seed * 6.2831853;
  vec2 drift = vec2(
    sin(u_time * 6.2831853 / max(1.0, a_depth) + fieldPhase) - sin(fieldPhase),
    cos(u_time * 6.2831853 / max(1.0, a_depth * 1.13) + fieldPhase * 1.7) - cos(fieldPhase * 1.7)
  ) * a_orbit * 0.5 + a_parallax * u_backgroundPointer;
`

interface FieldAttributes {
  start: Float32Array
  target: Float32Array
  delay: Float32Array
  kind: Float32Array
  size: Float32Array
  brightness: Float32Array
  depth: Float32Array
  seed: Float32Array
  orbit: Float32Array
  twinkle: Float32Array
  flow: Float32Array
  parallax: Float32Array
}

/** Pack the existing SSR samples into the shared particle pass without new stars. */
export function writeHeroStarfieldAttributes(
  attributes: FieldAttributes,
  offset: number,
  count: number,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  desktop: boolean,
) {
  const field = createHeroStarfield(count)
  field.forEach((star, index) => {
    const i = offset + index
    const x = star.x * Math.floor(cssWidth * dpr)
    const y = star.y * Math.floor(cssHeight * dpr)
    attributes.start[i * 2] = x
    attributes.start[i * 2 + 1] = y
    attributes.target[i * 2] = x
    attributes.target[i * 2 + 1] = y
    attributes.delay[i] = -1
    attributes.kind[i] = 0
    attributes.size[i] = star.size * dpr
    attributes.brightness[i] = star.brightness
    const motion = heroStarMotion(index, !desktop)
    const edgeDistance = Math.min(star.x * cssWidth, (1 - star.x) * cssWidth, star.y * cssHeight, (1 - star.y) * cssHeight)
    const available = Math.max(0, edgeDistance - 3.5)
    const parallax = desktop ? Math.min(motion.layer === 'far' ? 2 : 6, available) : 0
    attributes.depth[i] = motion.driftPeriod
    attributes.seed[i] = motion.phase
    // Both effects share the same edge budget, including pointer corners.
    attributes.orbit[i] = Math.min(motion.amplitude, available - parallax) * dpr
    attributes.parallax[i] = parallax
    attributes.twinkle[i] = motion.twinklePeriod
    attributes.flow[i] = index % 9 === 0 && star.brightness > 0.3 ? 1 : 0
  })
}
