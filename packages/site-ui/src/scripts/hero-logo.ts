import { MINIPROGRAM_VIEWBOX } from '../lib/hero-brand'
import { HERO_LOGO_COORDINATES, HERO_LOGO_POINT_SIZES } from './hero-logo-data'

export const HERO_LOGO_VIEWBOX = MINIPROGRAM_VIEWBOX

export type HeroLogoColorIndex = 0 | 1 | 2 | 3

/** Fixed sRGB colors keep the static Logo and its WebGL handoff identical. */
export const HERO_LOGO_PALETTE = Object.freeze([
  { css: '#71d6ae', rgb: [113 / 255, 214 / 255, 174 / 255] },
  { css: '#87bdec', rgb: [135 / 255, 189 / 255, 236 / 255] },
  { css: '#f2c28a', rgb: [242 / 255, 194 / 255, 138 / 255] },
  { css: '#d7e8e5', rgb: [215 / 255, 232 / 255, 229 / 255] },
].map(color => Object.freeze({ css: color.css, rgb: Object.freeze(color.rgb as [number, number, number]) })))

export interface HeroLogoPoint {
  readonly x: number
  readonly y: number
  /** Normalized diameter, shared by the static source discs and WebGL. */
  readonly size: number
  readonly brightness: number
  readonly colorIndex: HeroLogoColorIndex
  readonly sparkle: 0 | 1
}

export interface HeroLogoPath {
  readonly d: string
  readonly brightness: number
  readonly count: number
  readonly size: number
  readonly color: string
  readonly colorIndex: HeroLogoColorIndex
  readonly sparkle: 0 | 1
}

const MOBILE_COUNT = 900
const DESKTOP_COUNT = 2400
const sizes = HERO_LOGO_POINT_SIZES
const brightnesses = [0.52, 0.72, 0.92] as const
let desktopPoints: readonly HeroLogoPoint[] | undefined
let mobilePoints: readonly HeroLogoPoint[] | undefined
let paths: { mobile: readonly HeroLogoPath[], desktop: readonly HeroLogoPath[] } | undefined

function indexedVariation(index: number, seed: number): number {
  let value = index ^ seed
  value = Math.imul(value ^ value >>> 16, 0x7FEB352D)
  value = Math.imul(value ^ value >>> 15, 0x846CA68B)
  return ((value ^ value >>> 16) >>> 0) / 0x100000000
}

function sourceColor(index: number, x: number, y: number): HeroLogoColorIndex {
  const variation = indexedVariation(index, 0x6D2B79F5)
  // Jade grounds the lower mark; cool light favors the upper right and warm
  // light the upper left. Indexed variation avoids hard bands or a gradient.
  const jade = 0.4 + (y - 0.5) * 0.2
  const ice = 0.35 + (x - y) * 0.2
  const gold = 0.15 - (x - 0.5) * 0.2
  if (variation < jade) {
    return 0
  }
  if (variation < jade + ice) {
    return 1
  }
  if (variation < jade + ice + gold) {
    return 2
  }
  return 3
}

/** The checked-in silhouette is sampled once, without canvas or font startup. */
export function createHeroLogo(mobile: boolean): readonly HeroLogoPoint[] {
  if (!desktopPoints) {
    const packed = atob(HERO_LOGO_COORDINATES)
    if (packed.length !== DESKTOP_COUNT * 4) {
      throw new Error('Particle Logo data must contain 2400 coordinate pairs')
    }
    desktopPoints = Object.freeze(Array.from({ length: DESKTOP_COUNT }, (_, index) => {
      const offset = index * 4
      const x = (packed.charCodeAt(offset) | packed.charCodeAt(offset + 1) << 8) / 65535
      const y = (packed.charCodeAt(offset + 2) | packed.charCodeAt(offset + 3) << 8) / 65535
      const size = sizes[index % sizes.length]!
      const brightness = brightnesses[Math.floor(index / sizes.length) % brightnesses.length]!
      const sparkle: 0 | 1 = size === 0.012 && brightness === 0.92 && indexedVariation(index, 0x1B873593) < 0.45 ? 1 : 0
      return Object.freeze({
        x,
        y,
        size,
        brightness,
        colorIndex: sourceColor(index, x, y),
        sparkle,
      })
    }))
    mobilePoints = Object.freeze(desktopPoints.slice(0, MOBILE_COUNT))
  }
  return mobile ? mobilePoints! : desktopPoints
}

function starPaths(points: readonly HeroLogoPoint[]): readonly HeroLogoPath[] {
  const groups = new Map<string, { -readonly [Key in keyof HeroLogoPath]: HeroLogoPath[Key] }>()
  for (const point of points) {
    const key = `${point.colorIndex}/${point.size}/${point.brightness}/${point.sparkle}`
    let group = groups.get(key)
    if (!group) {
      group = { d: '', brightness: point.brightness, count: 0, size: point.size, color: HERO_LOGO_PALETTE[point.colorIndex]!.css, colorIndex: point.colorIndex, sparkle: point.sparkle }
      groups.set(key, group)
    }
    const diameter = point.size * MINIPROGRAM_VIEWBOX
    const radius = diameter / 2
    const x = point.x * MINIPROGRAM_VIEWBOX
    const y = point.y * MINIPROGRAM_VIEWBOX
    const rounded = (value: number) => Number(value.toFixed(3))
    if (point.sparkle) {
      // The four tips stay inside the existing source disc, preserving the
      // silhouette and non-overlap guarantee when the fragment shape changes.
      const notch = radius * 0.16
      const vertices = [[0, -radius], [notch, -notch], [radius, 0], [notch, notch], [0, radius], [-notch, notch], [-radius, 0], [-notch, -notch]]
      group.d += `${vertices.map(([dx, dy], index) => `${index === 0 ? 'M' : 'L'}${rounded(x + dx!)},${rounded(y + dy!)}`).join('')}z`
    }
    else {
      // Subpixel rounding keeps SSR compact without changing the visible circle.
      group.d += `M${rounded(x - radius)},${rounded(y)}a${radius},${radius} 0 1 0 ${diameter},0a${radius},${radius} 0 1 0 -${diameter},0z`
    }
    group.count += 1
  }
  return Object.freeze([...groups.values()].map(group => Object.freeze(group)))
}

/** Mobile paths are a strict prefix; desktop paths add only the remaining stars. */
export function createHeroLogoPaths(): { mobile: readonly HeroLogoPath[], desktop: readonly HeroLogoPath[] } {
  if (!paths) {
    const desktop = createHeroLogo(false)
    paths = Object.freeze({
      mobile: starPaths(createHeroLogo(true)),
      desktop: starPaths(desktop.slice(MOBILE_COUNT)),
    })
  }
  return paths
}
