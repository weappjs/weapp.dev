export interface HeroStar {
  x: number
  y: number
  size: number
  brightness: number
}

/** Fixed normalized samples let SSR and WebGL share the same first picture. */
export function createHeroStarfield(count: number): HeroStar[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('Star count must be a nonnegative integer')
  }
  let value = 0x5EEDF13D
  const next = () => {
    value = value + 0x6D2B79F5 | 0
    let t = Math.imul(value ^ value >>> 15, 1 | value)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  return Array.from({ length: count }, () => ({
    x: 0.015 + next() * 0.97,
    y: 0.015 + next() * 0.97,
    size: 1.4 + next() * 1.8,
    brightness: 0.16 + next() * 0.26,
  }))
}

export interface HeroStarMotion {
  phase: number
  driftPeriod: number
  twinklePeriod: number
  amplitude: number
}

/** Motion metadata does not consume or change the opening starfield's samples. */
export function heroStarMotion(index: number, mobile: boolean): HeroStarMotion {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('Star index must be a nonnegative integer')
  }
  let value = 0x5EEDF13D + Math.imul(index + 1, 0x9E3779B1) | 0
  const next = () => {
    value = value + 0x6D2B79F5 | 0
    let t = Math.imul(value ^ value >>> 15, 1 | value)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  return {
    phase: next(),
    driftPeriod: 45 + next() * 30,
    twinklePeriod: 6 + next() * 6,
    amplitude: mobile ? 2 + next() * 4 : 6 + next() * 10,
  }
}

/** CPU reference for the shader, anchored to the exact static picture at t=0. */
export function sampleHeroStarMotion(index: number, mobile: boolean, seconds: number, amplitude?: number): { x: number, y: number, brightness: number } {
  const motion = heroStarMotion(index, mobile)
  const distance = amplitude ?? motion.amplitude
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(seconds)) {
    throw new RangeError('Star motion requires finite time and a nonnegative amplitude')
  }
  const turn = Math.PI * 2
  const angle = motion.phase * turn
  return {
    x: (Math.sin(seconds * turn / motion.driftPeriod + angle) - Math.sin(angle)) / 2 * distance,
    y: (Math.cos(seconds * turn / (motion.driftPeriod * 1.13) + angle * 1.7) - Math.cos(angle * 1.7)) / 2 * distance,
    brightness: 1 + (Math.sin(seconds * turn / motion.twinklePeriod + angle) - Math.sin(angle)) / 2 * 0.25,
  }
}
