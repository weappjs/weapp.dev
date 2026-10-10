import { describe, expect, it } from 'vitest'
import { createHeroStarfield } from './hero-starfield'

describe('shared opening starfield', () => {
  it('preserves identical SSR and GL samples and the smaller mobile prefix', () => {
    const desktop = createHeroStarfield(400)
    expect(createHeroStarfield(400)).toEqual(desktop)
    expect(createHeroStarfield(160)).toEqual(desktop.slice(0, 160))
    desktop[0]!.x = 99
    expect(createHeroStarfield(1)[0]!.x).toBeLessThan(1)
  })

  it('spreads both budgets over every part of the stage with bounded white dust', () => {
    for (const count of [160, 400, 900, 2400]) {
      const stars = createHeroStarfield(count)
      expect(stars).toHaveLength(count)
      expect(stars.every(star => star.x >= 0.015 && star.x < 0.985 && star.y >= 0.015 && star.y < 0.985
        && star.size >= 1.4 && star.size < 3.2 && star.brightness >= 0.16 && star.brightness < 0.42)).toBe(true)
      const quadrants = [0, 0, 0, 0]
      for (const star of stars) {
        const quadrant = (star.x >= 0.5 ? 1 : 0) + (star.y >= 0.5 ? 2 : 0)
        quadrants[quadrant] += 1
      }
      expect(Math.min(...quadrants)).toBeGreaterThan(count * 0.15)
      expect(Math.max(...quadrants)).toBeLessThan(count * 0.35)
    }
  })

  it('handles an empty field and rejects invalid budgets', () => {
    expect(createHeroStarfield(0)).toEqual([])
    expect(() => createHeroStarfield(-1)).toThrow(RangeError)
    expect(() => createHeroStarfield(1.5)).toThrow(RangeError)
  })
})
