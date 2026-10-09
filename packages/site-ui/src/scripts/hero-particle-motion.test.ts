import { describe, expect, it } from 'vitest'
import { constrainDisplacement, createActiveClock, glyphSafeRadii, particleFrameInterval, smoothValue } from './hero-particle-motion'

function mask(width: number, height: number, inside: (x: number, y: number) => boolean): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[(y * width + x) * 4 + 3] = inside(x, y) ? 255 : 0
    }
  }
  return pixels
}

describe('hero particle motion', () => {
  it('smooths identically over the same time at different frame rates', () => {
    function settle(frameCount: number): number {
      let current = 0
      for (let frame = 0; frame < frameCount; frame++) {
        current = smoothValue(current, 120, 1000 / frameCount, 85)
      }
      return current
    }
    expect(settle(10)).toBeCloseTo(settle(60), 12)
    expect(smoothValue(0, 1, 200, 200)).toBeCloseTo(1 - Math.exp(-1), 12)
    expect(smoothValue(4, 8, 0, 85)).toBe(4)
    expect(smoothValue(4, 8, 10, 0)).toBe(8)
  })

  it('caps displacement without changing direction or producing NaN at zero distance', () => {
    const capped = constrainDisplacement(3, 4, 2)
    expect(capped.x).toBeCloseTo(1.2, 12)
    expect(capped.y).toBeCloseTo(1.6, 12)
    expect(constrainDisplacement(1, -1, 4)).toEqual({ x: 1, y: -1 })
    expect(constrainDisplacement(0, 0, 4)).toEqual({ x: 0, y: 0 })
    expect(constrainDisplacement(3, 4, 0)).toEqual({ x: 0, y: 0 })
    expect(constrainDisplacement(Number.NaN, 4, 8)).toEqual({ x: 0, y: 0 })
  })

  it('leaves the glyph exterior still and limits edge pixels more than interior pixels', () => {
    const width = 15
    const pixels = mask(width, width, (x, y) => x >= 2 && x <= 12 && y >= 2 && y <= 12)
    const radii = glyphSafeRadii(pixels, width, width)
    expect(radii[0]).toBe(0)
    expect(radii[2 * width + 2]).toBeGreaterThan(0)
    expect(radii[2 * width + 2]).toBeLessThan(0.5)
    expect(radii[7 * width + 7]).toBeGreaterThan(4)
    expect(radii[7 * width + 7]).toBeLessThan(5.5)
  })

  it('keeps every sampled movement inside an irregular glyph including internal holes', () => {
    const width = 19
    const height = 17
    const inside = (x: number, y: number) => (x >= 1 && x <= 16 && y >= 2 && y <= 14 && !(x >= 7 && x <= 10 && y >= 6 && y <= 9)) || (x === 18 && y === 0)
    const pixels = mask(width, height, inside)
    const radii = glyphSafeRadii(pixels, width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const radius = radii[y * width + x]!
        if (!inside(x, y)) {
          expect(radius).toBe(0)
          continue
        }
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 32) {
          const movedX = Math.floor(x + 0.5 + Math.cos(angle) * radius)
          const movedY = Math.floor(y + 0.5 + Math.sin(angle) * radius)
          expect(movedX >= 0 && movedX < width && movedY >= 0 && movedY < height && inside(movedX, movedY)).toBe(true)
        }
      }
    }
  })

  it('treats the alpha threshold and canvas edges as glyph boundaries', () => {
    const pixels = mask(3, 3, () => true)
    pixels[3] = 35
    pixels[7] = 36
    const radii = glyphSafeRadii(pixels, 3, 3)
    expect(radii[0]).toBe(0)
    expect(radii[1]).toBeGreaterThan(0)
    expect(radii[8]).toBeLessThan(0.5)
    expect(glyphSafeRadii(new Uint8ClampedArray(), 0, 0)).toHaveLength(0)
    expect(() => glyphSafeRadii(pixels, 4, 4)).toThrow(RangeError)
  })

  it('preserves the active phase over pauses, background gaps and repeated state updates', () => {
    const clock = createActiveClock(2200)
    expect(clock.advance(100)).toBe(2200)
    expect(clock.advance(200)).toBe(2300)
    clock.setRunning(false, 250)
    expect(clock.current()).toBe(2350)
    expect(clock.advance(20_000)).toBe(2350)
    clock.setRunning(false, 21_000)
    clock.setRunning(true, 22_000)
    expect(clock.advance(22_100)).toBe(2450)
    clock.setRunning(true, 22_150)
    expect(clock.advance(22_200)).toBe(2550)
    expect(clock.advance(22_190)).toBe(2550)
    expect(clock.advance(22_250)).toBe(2600)
  })

  it('uses the desktop entrance and interaction budget, with quiet desktop and mobile idle budgets', () => {
    expect(particleFrameInterval(true, false, false)).toBe(1000 / 60)
    expect(particleFrameInterval(true, true, true)).toBe(1000 / 60)
    expect(particleFrameInterval(true, true, false)).toBe(1000 / 30)
    expect(particleFrameInterval(false, false, true)).toBe(100)
    expect(particleFrameInterval(false, true, false)).toBe(100)
  })
})
