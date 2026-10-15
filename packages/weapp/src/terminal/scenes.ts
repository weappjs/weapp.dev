import type { LogoPoint } from '../types.js'
import type { ProjectPreview } from './preview.js'
// eslint-disable-next-line e18e/ban-dependencies -- Version 7 preserves the CLI's Node 18 baseline.
import stringWidth from 'string-width'
import { sanitize } from '../shared.js'
import { previewPoints } from './preview.js'
import { clipLine, graphemes } from './session.js'

export const EFFECTS = ['logo', 'orbit', 'matrix', 'fireworks'] as const
export type Effect = typeof EFFECTS[number]
export interface SceneProject { slug?: string, packageName?: string, accent?: string }
export type ScenePoint = Pick<LogoPoint, 'x' | 'y'> & Partial<Omit<LogoPoint, 'x' | 'y'>>
export interface SceneLogo { points?: readonly ScenePoint[], palette?: readonly (string | { css: string })[] }
export interface SceneOptions {
  width?: number
  height?: number
  time?: number
  seed?: string | number
  logo?: SceneLogo | readonly LogoPoint[]
  catalog?: SceneProject[]
  color?: boolean
  opening?: boolean
  focus?: number
}
interface SurfaceCell { char?: string, mask?: number, shade: number, brightness?: number, continuation?: boolean }

export function seedNumber(value: string | number = 'weapp'): number {
  if (typeof value === 'number') {
    return value >>> 0
  }
  let seed = 2166136261
  for (const char of String(value)) {
    seed = Math.imul(seed ^ char.codePointAt(0)!, 16777619)
  }
  return seed >>> 0
}

export function variation(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9E3779B9)) >>> 0
  value = Math.imul(value ^ value >>> 16, 0x7FEB352D)
  value = Math.imul(value ^ value >>> 15, 0x846CA68B)
  return ((value ^ value >>> 16) >>> 0) / 4294967296
}

const letters: Record<string, string[]> = {
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
}

function wordPoints(): ScenePoint[] {
  const points: ScenePoint[] = []
  for (const [index, char] of [...'WEAPP'].entries()) {
    letters[char].forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell === '1') {
        points.push({ x: (x + index * 6) / 28, y: y / 6 })
      }
    }))
  }
  return points
}
const word = wordPoints()
const defaultPalette = ['#71d6ae', '#87bdec', '#f2c28a', '#d7e8e5']

function mixColor(from: string, to: string, amount: number): string {
  const channels = (value: string) => /^#[\da-f]{6}$/i.test(value || '') ? [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16)) : null
  const first = channels(from) || channels(defaultPalette[0])!
  const second = channels(to) || first
  return `#${first.map((value, index) => Math.round(value + (second[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

function colorCode(value: string, brightness = 1): string {
  const hex = /^#([\da-f]{6})$/i.exec(value)
  if (!hex) {
    return ''
  }
  const n = Number.parseInt(hex[1], 16)
  return `\u001B[38;2;${Math.round((n >> 16) * brightness)};${Math.round((n >> 8 & 255) * brightness)};${Math.round((n & 255) * brightness)}m`
}

function surface(width: number, height: number, color: boolean, palette: string[]) {
  const cells: (SurfaceCell | null)[][] = Array.from({ length: height }, () => Array.from<SurfaceCell | null>({ length: width }).fill(null))
  return {
    dot(x: number, y: number, shade = 0, brightness = 0.8, size = 0) {
      const px = Math.round(x * 2)
      const py = Math.round(y * 4)
      const dots = size > 0.85 ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]]
      for (const [dx, dy] of dots) {
        const column = Math.floor((px + dx) / 2)
        const row = Math.floor((py + dy) / 4)
        if (column < 0 || column >= width || row < 0 || row >= height) {
          continue
        }
        const bit = [[1, 8], [2, 16], [4, 32], [64, 128]][(py + dy) % 4][(px + dx) % 2]
        const previous = cells[row][column]
        if (previous?.char) {
          continue
        }
        cells[row][column] = { mask: (previous?.mask || 0) | bit, shade: (previous?.brightness || 0) > brightness ? previous!.shade : shade, brightness: Math.max(previous?.brightness || 0, brightness) }
      }
    },
    put(x: number, y: number, char = '*', shade = 0) {
      x = Math.round(x)
      y = Math.round(y)
      const size = stringWidth(char)
      if (size > 0 && x >= 0 && x + size <= width && y >= 0 && y < height) {
        cells[y][x] = { char, shade }
        for (let offset = 1; offset < size; offset++) {
          cells[y][x + offset] = { shade, continuation: true }
        }
      }
    },
    lines() {
      return cells.map((row) => {
        let previous: string | number = -1
        let line = ''
        for (const cell of row) {
          if (cell?.continuation) {
            continue
          }
          if (!cell) {
            line += ' '
            continue
          }
          const brightness = cell.brightness ? Math.round(cell.brightness * 4) / 4 : 1
          const style = `${cell.shade}/${brightness}`
          if (color && previous !== style) {
            line += colorCode(palette[cell.shade % palette.length], brightness)
            previous = style
          }
          line += cell.char || String.fromCodePoint(0x2800 + (cell.mask || 0))
        }
        return `${line.trimEnd()}${color && previous !== -1 ? '\u001B[0m' : ''}`
      })
    },
  }
}

export interface ProjectPreviewOptions {
  width: number
  height: number
  from: ProjectPreview
  to: ProjectPreview
  transition?: number
  time?: number
  color?: boolean
  celebration?: number
}

/** A name seeds the stars; each official template owns a different structure. */
export function renderProjectPreview({ width, height, from, to, transition = 1, time = 0, color = false, celebration }: ProjectPreviewOptions): string[] {
  width = Math.max(1, Math.min(110, Math.floor(width)))
  height = Math.max(1, Math.min(35, Math.floor(height)))
  const screen = surface(width, height, color, defaultPalette)
  const amount = Math.max(0, Math.min(1, transition))
  const eased = 1 - (1 - amount) ** 3
  const before = previewPoints(from.template)
  const after = previewPoints(to.template)
  const seed = seedNumber(to.name)
  const previousSeed = seedNumber(from.name)
  for (let index = 0; index < Math.min(48, width); index++) {
    const startX = variation(previousSeed, index * 2)
    const startY = variation(previousSeed, index * 2 + 1)
    screen.dot((startX + (variation(seed, index * 2) - startX) * eased) * (width - 1), (startY + (variation(seed, index * 2 + 1) - startY) * eased) * (height - 1), 3, 0.2)
  }
  for (let index = 0; index < after.length; index++) {
    const point = after[index]
    const previous = before[index]
    const pulse = 0.62 + Math.sin(time * 1.6 + index / 12) * 0.12
    screen.dot((previous.x + (point.x - previous.x) * eased) * (width - 1), (previous.y + (point.y - previous.y) * eased) * (height - 1), point.group % 4, pulse)
  }
  if (celebration !== undefined) {
    const progress = Math.max(0, Math.min(1, celebration))
    const radius = 0.12 + (1 - (1 - progress) ** 3) * 0.35
    for (let index = 0; index < 28; index++) {
      const angle = index / 28 * Math.PI * 2
      screen.dot((0.5 + Math.cos(angle) * radius) * (width - 1), (0.5 + Math.sin(angle) * radius) * (height - 1), 3, 0.9 - progress * 0.7, progress < 0.7 ? 1 : 0)
    }
  }
  const label = clipLine(sanitize(to.name), Math.max(0, width - 4))
  let column = Math.max(0, Math.floor((width - stringWidth(label)) / 2))
  for (const char of graphemes(label)) {
    screen.put(column, Math.floor(height / 2), char, 3)
    column += stringWidth(char)
  }
  return screen.lines()
}

/** Stateless seeded frames make replay, resize and snapshots reproducible. */
export function renderScene(effect: Effect, {
  width = 79,
  height = 16,
  time = 0,
  seed = 'weapp',
  logo,
  catalog = [],
  color = false,
  opening = false,
  focus = -1,
}: SceneOptions = {}): string[] {
  width = Math.max(1, Math.min(110, Math.floor(width)))
  height = Math.max(1, Math.min(35, Math.floor(height)))
  const seedValue = seedNumber(seed)
  const mark: SceneLogo | undefined = logo && ('points' in logo || 'palette' in logo ? logo as SceneLogo : { points: logo as readonly LogoPoint[] })
  const suppliedPalette = mark?.palette?.map(value => typeof value === 'string' ? value : value.css)
  let palette = suppliedPalette?.length ? suppliedPalette : defaultPalette
  if (effect === 'orbit' && catalog.length && focus >= 0) {
    const position = Math.min(catalog.length - 1, focus)
    const low = Math.floor(position)
    const high = Math.ceil(position)
    const accent = mixColor(catalog[low].accent || palette[0], catalog[high].accent || palette[0], position - low)
    palette = [mixColor(palette[0], accent, 0.7), mixColor(palette[1] || palette[0], accent, 0.4), mixColor(palette[2] || palette[0], accent, 0.55), palette[3] || defaultPalette[3]]
  }
  const screen = surface(width, height, color, palette)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  if (effect === 'logo') {
    const progress = opening ? Math.min(1, time / 1.2) : (time % 6) / 6
    const morph = opening ? Math.max(0, Math.min(1, (progress - 0.42) / 0.4)) : Math.max(0, Math.min(1, (progress - 0.3) / 0.25))
    const gather = opening ? Math.min(1, progress / 0.35) : Math.min(1, progress / 0.18)
    const source = mark?.points?.length ? mark.points : word
    const count = Math.min(source.length, Math.max(150, Math.floor(width * height * 1.5)))
    const markHeight = Math.max(1, Math.min(height - 2, width / 3))
    const markWidth = markHeight * 2
    const wordWidth = Math.max(1, Math.min(width - 4, 58))
    const wordHeight = Math.max(1, Math.min(height - 2, 7))
    for (let index = 0; index < count; index++) {
      const point = source[Math.floor(index * source.length / count)]
      const target = word[index % word.length]
      const x = cx + (point.x - 0.5) * markWidth * (1 - morph) + (target.x - 0.5) * wordWidth * morph
      const y = cy + (point.y - 0.5) * markHeight * (1 - morph) + (target.y - 0.5) * wordHeight * morph
      screen.dot(
        x * gather + variation(seedValue, index * 3) * (width - 1) * (1 - gather),
        y * gather + variation(seedValue, index * 3 + 1) * (height - 1) * (1 - gather),
        point.colorIndex ?? index % 4,
        point.brightness ?? 0.8,
        (point.size || 0.007) * markWidth * 2,
      )
    }
  }
  else if (effect === 'orbit') {
    const rx = Math.max(1, width * 0.36)
    const ry = Math.max(1, height * 0.35)
    for (let ring = 0; ring < 3; ring++) {
      for (let point = 0; point < width * 5; point++) {
        const angle = point / (width * 5) * Math.PI * 2
        const ratio = 0.45 + ring * 0.25
        screen.dot(cx + Math.cos(angle) * rx * ratio, cy + Math.sin(angle) * ry * ratio, ring, 0.12 + (Math.sin(angle) + 1) * 0.075)
      }
    }
    const labels = catalog.length ? catalog.map(project => sanitize(project.slug || project.packageName || '')) : ['weapp-vite', 'weapp-tailwindcss', 'weapp-pandacss', 'weapp-stylex', 'varo', 'weapp-sqlite']
    const maxNodes = Math.min(labels.length, Math.max(3, Math.floor(width / 9)))
    for (let index = 0; index < maxNodes; index++) {
      const angle = time * 0.1 + index / maxNodes * Math.PI * 2
      const x = cx + Math.cos(angle) * rx
      const y = cy + Math.sin(angle) * ry
      const depth = (Math.sin(angle) + 1) / 2
      const emphasis = Math.max(0, 1 - Math.abs(focus - index))
      const tails = 12 + Math.round(emphasis * 6)
      for (let tail = 0; tail < tails; tail++) {
        const trailAngle = angle - tail * 0.035
        screen.dot(cx + Math.cos(trailAngle) * rx, cy + Math.sin(trailAngle) * ry, index % 4, (1 - tail / (tails + 3)) * (0.3 + depth * 0.35 + emphasis * 0.35), tail === 0 ? 0.5 + depth * 0.55 + emphasis * 0.4 : 0)
      }
      if (width >= 42) {
        const label = labels[index].replace('weapp-', '').slice(0, 17)
        const start = Math.max(0, Math.min(width - label.length, Math.round(x - label.length / 2)))
        for (let char = 0; char < label.length; char++) {
          screen.put(start + char, y + (y < cy ? -1 : 1), label[char], index % 4)
        }
      }
    }
    const source = mark?.points?.length ? mark.points : word
    const markHeight = Math.min(5, height * 0.35)
    for (let index = 0; index < Math.min(source.length, 600); index++) {
      const point = source[Math.floor(index * source.length / Math.min(source.length, 600))]
      screen.dot(cx + (point.x - 0.5) * markHeight * 2, cy + (point.y - 0.5) * markHeight, point.colorIndex ?? 0, point.brightness ?? 0.9)
    }
  }
  else if (effect === 'matrix') {
    const glyphs = 'WEAPP01:/{}[]<>+=*'
    for (let column = 0; column < width; column += 2) {
      const speed = 3 + variation(seedValue, column + 100) * 6
      const head = (time * speed + variation(seedValue, column + 200) * height * 2) % (height * 2)
      const tail = Math.max(3, Math.floor(height * (0.3 + variation(seedValue, column + 300) * 0.6)))
      for (let offset = 0; offset < tail; offset++) {
        const y = Math.floor(head - offset)
        const char = glyphs[Math.floor(variation(seedValue, column * 1000 + Math.floor(time * speed) - offset) * glyphs.length)]
        screen.put(column, y, offset > tail * 0.7 ? '.' : char, offset === 0 ? 3 : 0)
      }
    }
  }
  else if (effect === 'fireworks') {
    const period = 2.4
    for (let burst = 0; burst < Math.min(5, Math.max(2, Math.floor(width / 20))); burst++) {
      const cycle = Math.floor((time + burst * 0.7) / period)
      const age = (time + burst * 0.7) % period
      const originX = width * (0.15 + variation(seedValue, cycle * 99 + burst) * 0.7)
      const originY = height * (0.2 + variation(seedValue, cycle * 99 + burst + 40) * 0.45)
      if (age < 0.45) {
        screen.dot(originX, height - (height - originY) * age / 0.45, burst % 4, 1, 1)
      }
      else {
        const radius = (age - 0.45) * Math.min(height * 0.6, width * 0.18)
        const particles = Math.max(8, Math.min(36, Math.floor(width / 2)))
        for (let point = 0; point < particles; point++) {
          const angle = point / particles * Math.PI * 2
          screen.dot(originX + Math.cos(angle) * radius * 1.8, originY + Math.sin(angle) * radius * 0.7 + (age - 0.45) ** 2, burst % 4, Math.max(0.25, 1 - age / period), age < 1.3 ? 1 : 0)
        }
      }
    }
  }
  return screen.lines()
}
