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
