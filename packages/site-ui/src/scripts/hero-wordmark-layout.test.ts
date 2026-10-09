import { describe, expect, it } from 'vitest'
import { ellipseWordmarkWidth, fitGlyphLayout, measureGlyphLayout } from './hero-wordmark-layout'

describe('wordmark ink layout', () => {
  it('fits actual overhanging ink instead of relying on advance width', () => {
    const layout = measureGlyphLayout([
      { width: 10, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 13, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 },
      { width: 9, actualBoundingBoxLeft: 1, actualBoundingBoxRight: 11, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 3 },
    ], -2)
    expect(layout.positions).toEqual([0, 8])
    expect(layout.left).toBe(-3)
    expect(layout.right).toBe(19)
    expect(layout.width).toBe(22)
    expect(layout.height).toBe(11)
    const center = 100
    const origin = center - (layout.left + layout.right) / 2
    expect((origin + layout.left + origin + layout.right) / 2).toBe(center)
    const baseline = center + (layout.ascent - layout.descent) / 2
    expect((baseline - layout.ascent + baseline + layout.descent) / 2).toBe(center)
  })

  it('keeps positive bearings and empty words finite', () => {
    const layout = measureGlyphLayout([
      { width: 12, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 0 },
    ], 3)
    expect(layout.left).toBe(2)
    expect(layout.width).toBe(8)
    expect(measureGlyphLayout([], 3)).toMatchObject({ left: 0, right: 0, width: 0, height: 0, positions: [] })
  })

  it('solves a long wordmark fit against the full elliptical orbit at 72 independent angles', () => {
    const scenarios = [
      { rx: 344, ry: 153, radius: 50, fontSize: 128 },
      { rx: 544, ry: 279, radius: 54, fontSize: 144 },
      { rx: 624, ry: 140, radius: 40, fontSize: 80 },
      { rx: 825, ry: 300, radius: 54, fontSize: 144 },
    ]
    for (const scenario of scenarios) {
      const measure = (fontSize: number) => ({ width: fontSize * 10.3, height: fontSize * 0.73 })
      const available = (height: number) => ellipseWordmarkWidth(height, scenario.rx, scenario.ry, scenario.radius)
      const fit = fitGlyphLayout(scenario.fontSize, measure, available)!
      expect(fit.fontSize).toBeGreaterThan(0)
      expect(fit.fontSize).toBeLessThanOrEqual(scenario.fontSize)
      // Check circle/rectangle distance without using the fit's square-root formula.
      for (let angle = 0; angle < 72; angle += 1) {
        const phase = angle * Math.PI * 2 / 72
        const x = scenario.rx * Math.cos(phase)
        const y = scenario.ry * Math.sin(phase)
        const dx = Math.max(0, Math.abs(x) - fit.layout.width / 2)
        const dy = Math.max(0, Math.abs(y) - fit.layout.height / 2)
        const clearance = Math.hypot(dx, dy) - scenario.radius - 5
        expect(clearance, `Orbit angle ${angle * 5}° must leave room for the maximum planet and particle halo`).toBeGreaterThanOrEqual(16)
      }
      if (fit.fontSize < scenario.fontSize) {
        const larger = measure(fit.fontSize + scenario.fontSize / 2048)
        expect(larger.width).toBeGreaterThan(available(larger.height))
      }
    }
  })

  it('keeps the requested size when safe and returns no fit for an impossible orbit', () => {
    const measure = (fontSize: number) => ({ width: fontSize * 3, height: fontSize * 0.4 })
    const fit = fitGlyphLayout(144, measure, height => ellipseWordmarkWidth(height, 544, 279, 54))
    expect(fit?.fontSize).toBe(144)
    expect(ellipseWordmarkWidth(0, 300, 50, 40)).toBe(0)
    expect(fitGlyphLayout(144, measure, height => ellipseWordmarkWidth(height, 300, 50, 40))).toBeNull()
  })

  it('keeps phone and landscape tablet ink clear of moving project planets', () => {
    const scenarios = [
      { viewport: '320×900', rx: 136, ry: 324, radius: 22, fontSize: 36 },
      { viewport: '390×844', rx: 163, ry: 303.84, radius: 22, fontSize: 39 },
      { viewport: '844×390', rx: 320.72, ry: 109.2, radius: 26, fontSize: 67.52 },
    ]
    for (const scenario of scenarios) {
      for (const widthFactor of [6.4, 10.3]) {
        const fit = fitGlyphLayout(
          scenario.fontSize,
          size => ({ width: size * widthFactor, height: size * 0.73 }),
          height => ellipseWordmarkWidth(height, scenario.rx, scenario.ry, scenario.radius),
        )!
        expect(fit.fontSize).toBeGreaterThan(0)
        expect(fit.fontSize).toBeLessThanOrEqual(scenario.fontSize)
        for (let angle = 0; angle < 72; angle += 1) {
          const phase = angle * Math.PI * 2 / 72
          const dx = Math.max(0, Math.abs(scenario.rx * Math.cos(phase)) - fit.layout.width / 2)
          const dy = Math.max(0, Math.abs(scenario.ry * Math.sin(phase)) - fit.layout.height / 2)
          expect(Math.hypot(dx, dy) - scenario.radius - 5, `${scenario.viewport} at ${angle * 5}°`).toBeGreaterThanOrEqual(16)
        }
      }
    }
  })
})
