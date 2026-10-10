import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MINIPROGRAM_PATH, MINIPROGRAM_VIEWBOX } from '../lib/hero-brand'
import { createHeroLogo, createHeroLogoPaths, HERO_LOGO_PALETTE } from './hero-logo'
import { HERO_LOGO_COORDINATES, HERO_LOGO_PATH_SHA256 } from './hero-logo-data'

describe('shared particle Logo', () => {
  it('retains provenance from the canonical shared mini-program mark', () => {
    expect(HERO_LOGO_PATH_SHA256).toBe(createHash('sha256').update(MINIPROGRAM_PATH).digest('hex'))
  })

  it('shares cached immutable samples and the exact 900-point mobile prefix', () => {
    const desktop = createHeroLogo(false)
    const mobile = createHeroLogo(true)
    expect(desktop).toHaveLength(2400)
    expect(mobile).toHaveLength(900)
    expect(createHeroLogo(false)).toBe(desktop)
    expect(createHeroLogo(true)).toBe(mobile)
    expect(mobile).toEqual(desktop.slice(0, 900))
    expect(mobile[0]).toBe(desktop[0])
    expect(Object.isFrozen(desktop)).toBe(true)
    expect(desktop.every(Object.isFrozen)).toBe(true)
    expect(desktop.slice(0, 9).map(point => [point.colorIndex, point.sparkle])).toEqual([
      [0, 0],
      [1, 0],
      [0, 0],
      [1, 0],
      [3, 0],
      [3, 0],
      [2, 0],
      [1, 0],
      [1, 0],
    ])
  })

  it('retains the offline coordinates and existing size and brightness tiers', () => {
    const packed = atob(HERO_LOGO_COORDINATES)
    for (const [index, point] of createHeroLogo(false).entries()) {
      const offset = index * 4
      expect(point.x).toBe((packed.charCodeAt(offset) | packed.charCodeAt(offset + 1) << 8) / 65535)
      expect(point.y).toBe((packed.charCodeAt(offset + 2) | packed.charCodeAt(offset + 3) << 8) / 65535)
      expect(point.size).toBe([0.007, 0.009, 0.012][index % 3])
      expect(point.brightness).toBe([0.52, 0.72, 0.92][Math.floor(index / 3) % 3])
    }
  })

  it('shares immutable sRGB palette values without theme-dependent white substitution', () => {
    expect(HERO_LOGO_PALETTE.map(color => color.css)).toEqual(['#71d6ae', '#87bdec', '#f2c28a', '#d7e8e5'])
    expect(Object.isFrozen(HERO_LOGO_PALETTE)).toBe(true)
    for (const color of HERO_LOGO_PALETTE) {
      expect(Object.isFrozen(color)).toBe(true)
      expect(Object.isFrozen(color.rgb)).toBe(true)
      const channels = color.css.slice(1).match(/../g)!.map(value => Number.parseInt(value, 16) / 255)
      expect(color.rgb).toEqual(channels)
    }
  })

  it('uses a balanced palette and rare bright sparkles in both point budgets', () => {
    for (const mobile of [true, false]) {
      const points = createHeroLogo(mobile)
      const proportions = HERO_LOGO_PALETTE.map((_, colorIndex) => points.filter(point => point.colorIndex === colorIndex).length / points.length)
      for (const [index, [minimum, maximum]] of [[0.34, 0.46], [0.29, 0.41], [0.1, 0.2], [0.065, 0.14]].entries()) {
        expect(proportions[index]).toBeGreaterThanOrEqual(minimum!)
        expect(proportions[index]).toBeLessThanOrEqual(maximum!)
      }
      const sparkles = points.filter(point => point.sparkle === 1)
      expect(sparkles.length / points.length).toBeGreaterThanOrEqual(0.04)
      expect(sparkles.length / points.length).toBeLessThanOrEqual(0.06)
      expect(sparkles.every(point => point.size === 0.012 && point.brightness === 0.92)).toBe(true)
      expect(new Set(sparkles.map(point => point.colorIndex)).size).toBe(4)
    }
  })

  it('gives the mark coherent cool, warm and jade regions without hard color bands', () => {
    for (const mobile of [true, false]) {
      const points = createHeroLogo(mobile)
      const upper = points.filter(point => point.y < 0.5)
      const lower = points.filter(point => point.y >= 0.5)
      const upperLeft = upper.filter(point => point.x < 0.5)
      const upperRight = upper.filter(point => point.x >= 0.5)
      const fraction = (region: typeof points, colorIndex: number) => region.filter(point => point.colorIndex === colorIndex).length / region.length
      expect(fraction(lower, 0) - fraction(upper, 0)).toBeGreaterThan(0.04)
      expect(fraction(upperRight, 1) - fraction(upperLeft, 1)).toBeGreaterThan(0.04)
      expect(fraction(upperLeft, 2) - fraction(upperRight, 2)).toBeGreaterThan(0.04)
      for (const region of [upperLeft, upperRight, lower]) {
        expect(new Set(region.map(point => point.colorIndex)).size).toBe(4)
      }
    }
  })

  it('distributes unique stars across the mark without exceeding its circular outline', () => {
    for (const mobile of [true, false]) {
      const points = createHeroLogo(mobile)
      const unique = new Set(points.map(point => `${point.x},${point.y}`))
      expect(unique.size).toBe(points.length)
      const quadrants = [0, 0, 0, 0]
      for (const point of points) {
        expect(point.x).toBeGreaterThan(0)
        expect(point.x).toBeLessThan(1)
        expect(point.y).toBeGreaterThan(0)
        expect(point.y).toBeLessThan(1)
        expect(Math.hypot(point.x - 0.5, point.y - 0.5) + point.size / 2).toBeLessThan(0.5)
        expect([0.007, 0.009, 0.012]).toContain(point.size)
        expect([0.52, 0.72, 0.92]).toContain(point.brightness)
        quadrants[(point.x >= 0.5 ? 1 : 0) + (point.y >= 0.5 ? 2 : 0)] += 1
      }
      expect(Math.min(...quadrants)).toBeGreaterThan(points.length * 0.15)
      expect(Math.max(...quadrants)).toBeLessThan(points.length * 0.35)
    }
  })

  it('keeps source discs separate so circles and enclosed sparkles share safe additive brightness', () => {
    const points = createHeroLogo(false)
    let smallestGap = Number.POSITIVE_INFINITY
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!
      for (let otherIndex = index + 1; otherIndex < points.length; otherIndex++) {
        const other = points[otherIndex]!
        const centerDistance = Math.hypot(point.x - other.x, point.y - other.y) * MINIPROGRAM_VIEWBOX
        const gap = centerDistance - (point.size + other.size) * MINIPROGRAM_VIEWBOX / 2
        smallestGap = Math.min(smallestGap, gap)
      }
    }
    expect(smallestGap).toBeGreaterThanOrEqual(0.5)
  })

  it('renders one matching circle or enclosed eight-vertex sparkle for every source point', () => {
    const paths = createHeroLogoPaths()
    expect(createHeroLogoPaths()).toBe(paths)
    for (const [groups, points] of [
      [paths.mobile, createHeroLogo(true)],
      [paths.desktop, createHeroLogo(false).slice(900)],
    ] as const) {
      expect(groups.length).toBeLessThanOrEqual(40)
      expect(groups.reduce((count, group) => count + group.count, 0)).toBe(points.length)
      expect(Object.isFrozen(groups)).toBe(true)
      expect(groups.every(Object.isFrozen)).toBe(true)
      const rendered = []
      for (const group of groups) {
        expect(group.color).toBe(HERO_LOGO_PALETTE[group.colorIndex]!.css)
        const subpaths = group.d.match(/M[^Mz]*z/g)!
        expect(subpaths).toHaveLength(group.count)
        expect(subpaths.join('')).toBe(group.d)
        const radius = group.size * MINIPROGRAM_VIEWBOX / 2
        for (const subpath of subpaths) {
          let x: number
          let y: number
          if (group.sparkle) {
            const vertices = [...subpath.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])] as const)
            expect(vertices).toHaveLength(8)
            expect(subpath).toBe(`${vertices.map(([vx, vy], index) => `${index === 0 ? 'M' : 'L'}${vx},${vy}`).join('')}z`)
            x = (vertices[2]![0] + vertices[6]![0]) / 2
            y = (vertices[0]![1] + vertices[4]![1]) / 2
            const notch = radius * 0.16
            const offsets = [[0, -radius], [notch, -notch], [radius, 0], [notch, notch], [0, radius], [-notch, notch], [-radius, 0], [-notch, -notch]]
            for (const [index, [vx, vy]] of vertices.entries()) {
              // Each rounded coordinate contributes at most 0.0005 viewBox px.
              expect(Math.abs(vx - x - offsets[index]![0]!)).toBeLessThanOrEqual(0.001)
              expect(Math.abs(vy - y - offsets[index]![1]!)).toBeLessThanOrEqual(0.001)
              expect(Math.hypot(vx - x, vy - y)).toBeLessThanOrEqual(radius + 0.001)
            }
          }
          else {
            const circle = subpath.match(/^M([\d.]+),([\d.]+)a([\d.]+),([\d.]+) 0 1 0 ([\d.]+),0a([\d.]+),([\d.]+) 0 1 0 -([\d.]+),0z$/)
            expect(circle).not.toBeNull()
            const [, left, centerY, radiusX, radiusY, diameter, secondRadius, secondRadiusY, secondDiameter] = circle!
            expect(Number(radiusX)).toBe(radius)
            expect(Number(radiusY)).toBe(radius)
            expect(Number(secondRadius)).toBe(radius)
            expect(Number(secondRadiusY)).toBe(radius)
            expect(Number(diameter)).toBe(radius * 2)
            expect(Number(secondDiameter)).toBe(Number(diameter))
            x = Number(left) + radius
            y = Number(centerY)
          }
          rendered.push({ x, y, size: group.size, brightness: group.brightness, colorIndex: group.colorIndex, sparkle: group.sparkle })
        }
      }
      const order = (a: { x: number, y: number }, b: { x: number, y: number }) => Math.round(a.x * 1000) - Math.round(b.x * 1000) || a.y - b.y
      const expected = points.map(point => ({ ...point, x: point.x * MINIPROGRAM_VIEWBOX, y: point.y * MINIPROGRAM_VIEWBOX })).sort(order)
      for (const [index, shape] of rendered.sort(order).entries()) {
        const point = expected[index]!
        expect(shape.x).toBeCloseTo(point.x, 3)
        expect(shape.y).toBeCloseTo(point.y, 3)
        expect(shape.size).toBe(point.size)
        expect(shape.brightness).toBe(point.brightness)
        expect(shape.colorIndex).toBe(point.colorIndex)
        expect(shape.sparkle).toBe(point.sparkle)
      }
    }
  })
})
