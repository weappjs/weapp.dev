import { describe, expect, it } from 'vitest'
import { downsamplePoints, glyphDelay, pairClouds, pickFieldDust, pickGlyphStar, pickParticleKind } from './hero-particles'

describe('hero particle layout', () => {
  it('downsamples a dense cloud without emptying it', () => {
    const source = Array.from({ length: 40 }, (_, index) => index)
    expect(downsamplePoints(source, 10)).toHaveLength(10)
    expect(downsamplePoints(source, 80)).toEqual(source)
  })

  it('assigns planet kinds for giants and mixed glyph dust', () => {
    expect(pickParticleKind(0.1, 0, 'giant')).toBe(5)
    expect(pickParticleKind(0.5, 0, 'giant')).toBe(2)
    expect(pickParticleKind(0.9, 0, 'giant')).toBe(1)
    expect(pickParticleKind(0.2, 0, 'glyph')).toBe(0)
    expect(pickParticleKind(0.8, 0, 'glyph')).toBe(1)
    expect(pickParticleKind(0.2, 1, 'glyph')).toBe(3)
  })

  it('makes glyph stars mixed in size with a few bright spikes', () => {
    let seed = 1
    const next = () => {
      seed = seed * 16807 % 2147483647
      return seed / 2147483647
    }
    const stars = Array.from({ length: 400 }, () => pickGlyphStar(next, 0))
    const needles = stars.filter(star => star.size < 2.5).length
    const orbs = stars.filter(star => star.size >= 4.4).length
    expect(needles).toBeGreaterThan(orbs)
    expect(orbs).toBeGreaterThan(12)
    expect(stars.some(star => star.size >= 7)).toBe(true)
  })

  it('keeps background dust small, dim, and quiet', () => {
    let seed = 11
    const next = () => {
      seed = seed * 16807 % 2147483647
      return seed / 2147483647
    }
    const dust = Array.from({ length: 80 }, () => pickFieldDust(next))
    expect(dust.every(star => star.size >= 1.4 && star.size < 3.3 && star.kind === 0 && star.twinkle <= 0.06 && star.brightness >= 0.22)).toBe(true)
  })

  it('pairs clouds by angle so morphs keep neighborhood', () => {
    const from = [
      { x: 2, y: 0, accent: 0 },
      { x: 0, y: 2, accent: 0 },
    ]
    const to = [
      { x: 4, y: 0, accent: 1 },
      { x: 0, y: 4, accent: 0 },
      { x: -4, y: 0, accent: 0 },
    ]
    const pairs = pairClouds(from, to, 0, 0)
    expect(pairs).toHaveLength(3)
    expect(pairs[0]?.from).toEqual(from[0])
    expect(pairs.every(pair => pair.from && pair.to)).toBe(true)
  })

  it('delays edge glyph particles more than the center', () => {
    const center = glyphDelay(400, 200, 400, 200, 400, 0)
    const edge = glyphDelay(40, 40, 400, 200, 400, 0)
    expect(edge).toBeGreaterThan(center)
    expect(edge).toBeLessThanOrEqual(0.52)
  })
})
