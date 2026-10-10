import { describe, expect, it } from 'vitest'
import { createHeroStarfield, heroStarMotion, sampleHeroStarMotion } from './hero-starfield'

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

describe('quiet background star motion', () => {
  it('preserves the exact static positions and brightness at the handoff', () => {
    for (const mobile of [true, false]) {
      for (let index = 0; index < 400; index++) {
        expect(sampleHeroStarMotion(index, mobile, 0)).toEqual({ x: 0, y: 0, brightness: 1 })
      }
    }
  })

  it('provides independent deterministic phases and bounded slow desktop and mobile motion', () => {
    const phases = new Set()
    for (let index = 0; index < 400; index++) {
      const desktop = heroStarMotion(index, false)
      const mobile = heroStarMotion(index, true)
      expect(heroStarMotion(index, false)).toEqual(desktop)
      expect(desktop.phase).toBeGreaterThanOrEqual(0)
      expect(desktop.phase).toBeLessThan(1)
      expect(desktop.driftPeriod).toBeGreaterThanOrEqual(45)
      expect(desktop.driftPeriod).toBeLessThan(75)
      expect(desktop.twinklePeriod).toBeGreaterThanOrEqual(6)
      expect(desktop.twinklePeriod).toBeLessThan(12)
      expect(desktop.amplitude).toBeGreaterThanOrEqual(6)
      expect(desktop.amplitude).toBeLessThan(16)
      expect(mobile.amplitude).toBeGreaterThanOrEqual(2)
      expect(mobile.amplitude).toBeLessThan(6)
      expect(mobile.phase).toBe(desktop.phase)
      expect(mobile.driftPeriod).toBe(desktop.driftPeriod)
      expect(mobile.twinklePeriod).toBe(desktop.twinklePeriod)
      phases.add(desktop.phase)
    }
    expect(phases.size).toBe(400)
  })

  it('drifts and twinkles while staying inside each axis and brightness budget', () => {
    for (const mobile of [true, false]) {
      for (let index = 0; index < 20; index++) {
        const motion = heroStarMotion(index, mobile)
        let changed = false
        for (let seconds = 1; seconds <= 180; seconds += 1) {
          const sample = sampleHeroStarMotion(index, mobile, seconds)
          expect(Math.abs(sample.x)).toBeLessThanOrEqual(motion.amplitude)
          expect(Math.abs(sample.y)).toBeLessThanOrEqual(motion.amplitude)
          expect(sample.brightness).toBeGreaterThanOrEqual(0.75)
          expect(sample.brightness).toBeLessThanOrEqual(1.25)
          changed ||= Math.hypot(sample.x, sample.y) > 0.5 && Math.abs(sample.brightness - 1) > 0.02
        }
        expect(changed).toBe(true)
      }
    }
  })

  it('respects the renderer edge clamp without suppressing twinkling', () => {
    for (let seconds = 0; seconds <= 90; seconds += 1) {
      const clamped = sampleHeroStarMotion(19, false, seconds, 0.75)
      expect(Math.abs(clamped.x)).toBeLessThanOrEqual(0.75)
      expect(Math.abs(clamped.y)).toBeLessThanOrEqual(0.75)
      expect(clamped.brightness).toBe(sampleHeroStarMotion(19, false, seconds).brightness)
      const still = sampleHeroStarMotion(19, false, seconds, 0)
      expect(Math.abs(still.x)).toBe(0)
      expect(Math.abs(still.y)).toBe(0)
      expect(still.brightness).toBe(clamped.brightness)
    }
    expect(() => heroStarMotion(-1, false)).toThrow(RangeError)
    expect(() => heroStarMotion(1.5, false)).toThrow(RangeError)
    expect(() => sampleHeroStarMotion(0, false, Number.NaN)).toThrow(RangeError)
    expect(() => sampleHeroStarMotion(0, false, 1, -1)).toThrow(RangeError)
  })
})
