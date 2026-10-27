import { describe, expect, it } from 'vitest'
import { createHeroBackgroundMotion } from './hero-background-motion'

describe('active-time background parallax', () => {
  it('starts at the shared static picture and converges radially within 250ms', () => {
    const motion = createHeroBackgroundMotion()
    expect(motion.advance(0)).toEqual({ x: 0, y: 0 })
    motion.setPointer(1200, 0, 1200, 800)
    const point = motion.advance(250)
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(1 - Math.exp(-3))
    expect(point.x).toBeLessThan(0)
    expect(point.y).toBeGreaterThan(0)
    motion.advance(1000)
    expect(Math.hypot(...Object.values(motion.advance(0)))).toBeCloseTo(1)
  })

  it('produces the same motion at different frame rates without counting inactive time', () => {
    const desktop = createHeroBackgroundMotion()
    const mobileBudget = createHeroBackgroundMotion()
    desktop.setPointer(1200, 400, 1200, 800)
    mobileBudget.setPointer(1200, 400, 1200, 800)
    for (let index = 0; index < 30; index++) {
      desktop.advance(1000 / 30)
    }
    for (let index = 0; index < 10; index++) {
      mobileBudget.advance(100)
    }
    expect(desktop.snapshot().position.x).toBeCloseTo(mobileBudget.snapshot().position.x, 12)
    const before = desktop.snapshot()
    expect(desktop.advance(0)).toEqual(before.position)
    expect(desktop.snapshot()).toEqual(before)
  })

  it('restores a frozen offset independently and resets both offset and input for replay', () => {
    const motion = createHeroBackgroundMotion()
    motion.setPointer(1200, 400, 1200, 800)
    motion.advance(125)
    motion.release()
    const snapshot = motion.snapshot()
    const restored = createHeroBackgroundMotion(snapshot)
    expect(restored.advance(0)).toEqual(snapshot.position)
    restored.advance(250)
    expect(Math.abs(restored.snapshot().position.x)).toBeLessThan(Math.abs(snapshot.position.x) * 0.051)
    expect(motion.snapshot()).toEqual(snapshot)
    restored.reset()
    expect(restored.snapshot()).toEqual({ position: { x: 0, y: 0 }, target: { x: 0, y: 0 } })
    expect(restored.moving).toBe(false)
  })

  it('preserves even a tiny painted offset during a zero-time paused reconnect', () => {
    const motion = createHeroBackgroundMotion({ position: { x: 0.00001, y: -0.00001 }, target: { x: 0, y: 0 } })
    expect(motion.advance(0)).toEqual({ x: 0.00001, y: -0.00001 })
    expect(motion.advance(16)).toEqual({ x: 0, y: 0 })
  })

  it('centers unusable pointer geometry and returns to rest after release', () => {
    const motion = createHeroBackgroundMotion()
    motion.setPointer(2400, -800, 1200, 800)
    expect(Math.hypot(...Object.values(motion.advance(1000)))).toBeLessThanOrEqual(1)
    motion.release()
    motion.advance(1000)
    expect(motion.advance(0)).toEqual({ x: 0, y: 0 })
    motion.setPointer(1, 1, 0, 800)
    expect(motion.snapshot().target).toEqual({ x: 0, y: 0 })
    motion.setPointer(Number.NaN, 1, 1200, 800)
    expect(motion.snapshot().target).toEqual({ x: 0, y: 0 })
  })
})
