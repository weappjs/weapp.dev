import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MINIPROGRAM_PATH, MINIPROGRAM_VIEWBOX } from '../lib/hero-brand'
import { createHeroLogo, createHeroLogoPaths } from './hero-logo'
import { HERO_LOGO_PATH_SHA256 } from './hero-logo-data'

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

  it('keeps every source circle separate so SSR and additive WebGL brightness match', () => {
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

  it('renders only matching star circles, split into nine tiers and additive desktop paths', () => {
    const paths = createHeroLogoPaths()
    expect(createHeroLogoPaths()).toBe(paths)
    for (const [groups, points] of [
      [paths.mobile, createHeroLogo(true)],
      [paths.desktop, createHeroLogo(false).slice(900)],
    ] as const) {
      expect(groups).toHaveLength(9)
      expect(groups.reduce((count, group) => count + group.count, 0)).toBe(points.length)
      const rendered = []
      for (const group of groups) {
        const circles = [...group.d.matchAll(/M([\d.]+),([\d.]+)a([\d.]+),([\d.]+) 0 1 0 ([\d.]+),0a([\d.]+),([\d.]+) 0 1 0 -([\d.]+),0z/g)]
        expect(circles).toHaveLength(group.count)
        expect(circles.map(circle => circle[0]).join('')).toBe(group.d)
        for (const circle of circles) {
          const [, left, y, radius, radiusY, diameter, secondRadius, secondRadiusY, secondDiameter] = circle
          expect(Number(radiusY)).toBe(Number(radius))
          expect(Number(secondRadius)).toBe(Number(radius))
          expect(Number(secondRadiusY)).toBe(Number(radius))
          expect(Number(diameter)).toBe(Number(radius) * 2)
          expect(Number(secondDiameter)).toBe(Number(diameter))
          rendered.push({
            left: Number(left),
            y: Number(y),
            radius: Number(radius),
            brightness: group.brightness,
          })
        }
      }
      const expected = points.map(point => ({
        left: Number((point.x * MINIPROGRAM_VIEWBOX - point.size * MINIPROGRAM_VIEWBOX / 2).toFixed(3)),
        y: Number((point.y * MINIPROGRAM_VIEWBOX).toFixed(3)),
        radius: point.size * MINIPROGRAM_VIEWBOX / 2,
        brightness: point.brightness,
      }))
      const order = (a: { left: number, y: number }, b: { left: number, y: number }) => a.left - b.left || a.y - b.y
      expect(rendered.sort(order)).toEqual(expected.sort(order))
    }
  })
})
