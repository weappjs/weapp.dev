import { describe, expect, it } from 'vitest'
import { createHeroStarfield, heroStarMotion } from './hero-starfield'
import { writeHeroStarfieldAttributes } from './hero-starfield-renderer'

function fieldAttributes(count: number) {
  return {
    start: new Float32Array(count * 2),
    target: new Float32Array(count * 2),
    ...Object.fromEntries(['delay', 'kind', 'size', 'brightness', 'depth', 'seed', 'orbit', 'twinkle', 'flow', 'parallax'].map(key => [key, new Float32Array(count)])),
  } as Parameters<typeof writeHeroStarfieldAttributes>[0]
}

describe('shared starfield rendering data', () => {
  it('keeps the exact SSR positions and brightness without altering foreground buffers', () => {
    const attributes = fieldAttributes(407)
    Object.values(attributes).forEach(attribute => attribute.fill(7))
    writeHeroStarfieldAttributes(attributes, 7, 400, 1440, 820, 1.75, true)
    expect([...attributes.start.slice(0, 14)]).toEqual(Array.from({ length: 14 }).fill(7))
    createHeroStarfield(400).forEach((star, index) => {
      const i = index + 7
      expect(attributes.start[i * 2]).toBeCloseTo(star.x * 2520, 3)
      expect(attributes.start[i * 2 + 1]).toBeCloseTo(star.y * 1435, 3)
      expect(attributes.target[i * 2]).toBe(attributes.start[i * 2])
      expect(attributes.target[i * 2 + 1]).toBe(attributes.start[i * 2 + 1])
      expect(attributes.brightness[i]).toBeCloseTo(star.brightness)
      expect(attributes.depth[i]).toBeCloseTo(heroStarMotion(index, false).driftPeriod)
      expect(attributes.parallax[i]).toBe(heroStarMotion(index, false).layer === 'far' ? 2 : 6)
    })
  })

  it('keeps drift and radial parallax inside the same edge budget and disables narrow-screen parallax', () => {
    const attributes = fieldAttributes(400)
    for (const [width, height, desktop] of [[1024, 352, true], [320, 510, false]] as const) {
      writeHeroStarfieldAttributes(attributes, 0, 400, width, height, 1.75, desktop)
      createHeroStarfield(400).forEach((star, index) => {
        const available = Math.max(0, Math.min(star.x * width, (1 - star.x) * width, star.y * height, (1 - star.y) * height) - 3.5)
        expect(attributes.orbit[index]! / 1.75 + attributes.parallax[index]!).toBeLessThanOrEqual(available + 0.00001)
        expect(attributes.parallax[index]!).toBeGreaterThanOrEqual(0)
        expect(attributes.parallax[index]!).toBeLessThanOrEqual(desktop ? heroStarMotion(index, false).layer === 'far' ? 2 : 6 : 0)
      })
    }
  })
})
