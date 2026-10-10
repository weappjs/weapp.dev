import { MINIPROGRAM_VIEWBOX } from '../lib/hero-brand'
import { HERO_LOGO_COORDINATES, HERO_LOGO_POINT_SIZES } from './hero-logo-data'

export const HERO_LOGO_VIEWBOX = MINIPROGRAM_VIEWBOX

export interface HeroLogoPoint {
  readonly x: number
  readonly y: number
  /** Normalized diameter, shared by the static circles and WebGL source. */
  readonly size: number
  readonly brightness: number
}

export interface HeroLogoPath {
  readonly d: string
  readonly brightness: number
  readonly count: number
}

const MOBILE_COUNT = 900
const DESKTOP_COUNT = 2400
const sizes = HERO_LOGO_POINT_SIZES
const brightnesses = [0.52, 0.72, 0.92] as const
let desktopPoints: readonly HeroLogoPoint[] | undefined
let mobilePoints: readonly HeroLogoPoint[] | undefined
let paths: { mobile: readonly HeroLogoPath[], desktop: readonly HeroLogoPath[] } | undefined

/** The checked-in silhouette is sampled once, without canvas or font startup. */
export function createHeroLogo(mobile: boolean): readonly HeroLogoPoint[] {
  if (!desktopPoints) {
    const packed = atob(HERO_LOGO_COORDINATES)
    if (packed.length !== DESKTOP_COUNT * 4) {
      throw new Error('Particle Logo data must contain 2400 coordinate pairs')
    }
    desktopPoints = Object.freeze(Array.from({ length: DESKTOP_COUNT }, (_, index) => {
      const offset = index * 4
      return Object.freeze({
        x: (packed.charCodeAt(offset) | packed.charCodeAt(offset + 1) << 8) / 65535,
        y: (packed.charCodeAt(offset + 2) | packed.charCodeAt(offset + 3) << 8) / 65535,
        size: sizes[index % sizes.length]!,
        brightness: brightnesses[Math.floor(index / sizes.length) % brightnesses.length]!,
      })
    }))
    mobilePoints = Object.freeze(desktopPoints.slice(0, MOBILE_COUNT))
  }
  return mobile ? mobilePoints! : desktopPoints
}

function circlePaths(points: readonly HeroLogoPoint[]): readonly HeroLogoPath[] {
  const groups = Array.from({ length: sizes.length * brightnesses.length }, () => ({ d: '', brightness: 0, count: 0 }))
  for (const [index, point] of points.entries()) {
    const group = groups[index % groups.length]!
    const diameter = point.size * MINIPROGRAM_VIEWBOX
    const radius = diameter / 2
    // Subpixel rounding keeps SSR compact without changing the visible circle.
    const left = Number((point.x * MINIPROGRAM_VIEWBOX - radius).toFixed(3))
    const y = Number((point.y * MINIPROGRAM_VIEWBOX).toFixed(3))
    group.d += `M${left},${y}a${radius},${radius} 0 1 0 ${diameter},0a${radius},${radius} 0 1 0 -${diameter},0z`
    group.brightness = point.brightness
    group.count += 1
  }
  return Object.freeze(groups.filter(group => group.count > 0).map(group => Object.freeze(group)))
}

/** Mobile paths are a strict prefix; desktop paths add only the remaining stars. */
export function createHeroLogoPaths(): { mobile: readonly HeroLogoPath[], desktop: readonly HeroLogoPath[] } {
  if (!paths) {
    const desktop = createHeroLogo(false)
    paths = Object.freeze({
      mobile: circlePaths(createHeroLogo(true)),
      desktop: circlePaths(desktop.slice(MOBILE_COUNT)),
    })
  }
  return paths
}
