import { describe, expect, it } from 'vitest'
import { createOrbitHaloPoints, orbitHaloBrightness } from './hero-orbit-halo'

const geometry = { centerX: 603, centerY: 317, radiusX: 460, radiusY: 72, viewportWidth: 1280 }

/** Find the nearest ellipse point without relying on the generator's spacing. */
function projectToEllipse(point: { x: number, y: number }) {
  const x = point.x - geometry.centerX
  const y = point.y - geometry.centerY
  let angle = Math.atan2(y / geometry.radiusY, x / geometry.radiusX)
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const dx = geometry.radiusX * cosine - x
    const dy = geometry.radiusY * sine - y
    const tangentX = -geometry.radiusX * sine
    const tangentY = geometry.radiusY * cosine
    const derivative = dx * tangentX + dy * tangentY
    const curvature = tangentX ** 2 + tangentY ** 2
      - dx * geometry.radiusX * cosine - dy * geometry.radiusY * sine
    angle -= derivative / curvature
  }
  return { x: geometry.centerX + Math.cos(angle) * geometry.radiusX, y: geometry.centerY + Math.sin(angle) * geometry.radiusY }
}

describe('fixed orbit halo cloud', () => {
  it.each([
    [320, 256],
    [639, 256],
    [640, 384],
    [1023, 384],
    [1024, 960],
    [1920, 960],
  ])('uses the bounded viewport budget at %ipx', (viewportWidth, count) => {
    expect(createOrbitHaloPoints({ ...geometry, viewportWidth })).toHaveLength(count)
  })

  it('keeps deterministic coordinates inside a two-pixel corridor around the actual ellipse', () => {
    const points = createOrbitHaloPoints(geometry)
    expect(createOrbitHaloPoints(geometry)).toEqual(points)
    for (const point of points) {
      const closest = projectToEllipse(point)
      expect(Math.hypot(point.x - closest.x, point.y - closest.y)).toBeLessThanOrEqual(2.000001)
    }
    const translated = createOrbitHaloPoints({ ...geometry, centerX: geometry.centerX + 81, centerY: geometry.centerY - 43 })
    translated.forEach((point, index) => {
      expect(point.x - points[index]!.x).toBeCloseTo(81, 10)
      expect(point.y - points[index]!.y).toBeCloseTo(-43, 10)
      expect(point.phase).toBe(points[index]!.phase)
    })
  })

  it('keeps physical spacing uniform around a flattened ellipse instead of bunching at its ends', () => {
    const points = createOrbitHaloPoints(geometry).map(projectToEllipse)
    const distances = points.map((point, index) => {
      const next = points[(index + 1) % points.length]!
      return Math.hypot(point.x - next.x, point.y - next.y)
    })
    expect(Math.max(...distances) / Math.min(...distances)).toBeLessThan(1.03)
  })

  it('uses small pearl cores with rare fine stars and restrained existing palette flecks', () => {
    const points = createOrbitHaloPoints(geometry)
    const rare = points.filter(point => point.diameter > 2.4)
    expect(rare.length / points.length).toBeGreaterThan(0)
    expect(rare.length / points.length).toBeLessThanOrEqual(0.05)
    expect(rare.every(point => point.diameter === 3)).toBe(true)
    expect(points.every(point => point.diameter >= 0.7 && point.diameter <= 3)).toBe(true)
    expect(points.filter(point => point.colorIndex === 3).length / points.length).toBeCloseTo(0.8, 2)
    expect(new Set(points.filter(point => point.colorIndex !== 3).map(point => point.colorIndex))).toEqual(new Set([0, 1, 2]))
    expect(points.every(point => point.brightness > 0 && point.brightness <= 0.62)).toBe(true)
    const top = points.filter(point => point.y < geometry.centerY - geometry.radiusY * 0.8)
    const bottom = points.filter(point => point.y > geometry.centerY + geometry.radiusY * 0.8)
    const average = (items: typeof points) => items.reduce((sum, point) => sum + point.brightness, 0) / items.length
    expect(average(top) / average(bottom)).toBeLessThan(0.7)
  })

  it('gives each fixed point a slow staggered cycle bounded to a quarter of its base light', () => {
    const points = createOrbitHaloPoints(geometry)
    expect(points.every(point => point.period >= 6 && point.period <= 12 && point.phase >= 0 && point.phase < Math.PI * 2)).toBe(true)
    expect(new Set(points.map(point => point.phase)).size).toBe(points.length)
    for (const point of points.filter((_, index) => index % 29 === 0)) {
      const quarterPeak = (Math.PI / 2 - point.phase) * point.period / (Math.PI * 2)
      expect(orbitHaloBrightness(point, quarterPeak)).toBeCloseTo(point.brightness * 1.25, 10)
      expect(orbitHaloBrightness(point, quarterPeak + point.period / 2)).toBeCloseTo(point.brightness * 0.75, 10)
      expect(orbitHaloBrightness(point, quarterPeak + point.period)).toBeCloseTo(orbitHaloBrightness(point, quarterPeak), 10)
      for (let time = 0; time <= 30; time += 0.2) {
        const light = orbitHaloBrightness(point, time)
        expect(light).toBeGreaterThanOrEqual(point.brightness * 0.75)
        expect(light).toBeLessThanOrEqual(point.brightness * 1.25)
      }
    }
    expect(createOrbitHaloPoints(geometry)).toEqual(points)
  })

  it('omits optional decoration for invalid or empty geometry', () => {
    expect(createOrbitHaloPoints({ ...geometry, radiusX: 0 })).toEqual([])
    expect(createOrbitHaloPoints({ ...geometry, radiusY: -1 })).toEqual([])
    expect(createOrbitHaloPoints({ ...geometry, centerY: Number.NaN })).toEqual([])
    expect(createOrbitHaloPoints({ ...geometry, viewportWidth: Number.POSITIVE_INFINITY })).toEqual([])
  })
})
