import { sanitize } from '../shared.js'

export const EFFECTS = ['logo', 'orbit', 'matrix', 'fireworks']

export function seedNumber(value = 'weapp') {
  if (typeof value === 'number') {
    return value >>> 0
  }
  let seed = 2166136261
  for (const char of String(value)) {
    seed = Math.imul(seed ^ char.codePointAt(0), 16777619)
  }
  return seed >>> 0
}

export function variation(seed, index) {
  let value = (seed ^ Math.imul(index + 1, 0x9E3779B9)) >>> 0
  value = Math.imul(value ^ value >>> 16, 0x7FEB352D)
  value = Math.imul(value ^ value >>> 15, 0x846CA68B)
  return ((value ^ value >>> 16) >>> 0) / 4294967296
}

const letters = {
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
}

function wordPoints() {
  const points = []
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

function colorCode(value) {
  const hex = /^#([\da-f]{6})$/i.exec(value)
  if (!hex) {
    return ''
  }
  const n = Number.parseInt(hex[1], 16)
  return `\u001B[38;2;${n >> 16};${n >> 8 & 255};${n & 255}m`
}

function surface(width, height, color, palette) {
  const cells = Array.from({ length: height }, () => Array.from({ length: width }).fill(null))
  return {
    put(x, y, char = '*', shade = 0) {
      x = Math.round(x)
      y = Math.round(y)
      if (x >= 0 && x < width && y >= 0 && y < height) {
        cells[y][x] = { char, shade }
      }
    },
    lines() {
      return cells.map((row) => {
        let previous = -1
        let line = ''
        for (const cell of row) {
          if (!cell) {
            line += ' '
            continue
          }
          if (color && previous !== cell.shade) {
            line += colorCode(palette[cell.shade % palette.length])
            previous = cell.shade
          }
          line += cell.char
        }
        return `${line.trimEnd()}${color && previous !== -1 ? '\u001B[0m' : ''}`
      })
    },
  }
}

/** Stateless seeded frames make replay, resize and snapshots reproducible. */
export function renderScene(effect, {
  width = 79,
  height = 16,
  time = 0,
  seed = 'weapp',
  logo,
  catalog = [],
  color = false,
  opening = false,
} = {}) {
  width = Math.max(1, Math.min(110, Math.floor(width)))
  height = Math.max(1, Math.min(35, Math.floor(height)))
  const seedValue = seedNumber(seed)
  const palette = logo?.palette?.map(value => typeof value === 'string' ? value : value.css) || defaultPalette
  const screen = surface(width, height, color, palette.length ? palette : defaultPalette)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  if (effect === 'logo') {
    const progress = opening ? Math.min(1, time / 1.2) : (time % 6) / 6
    const morph = opening ? Math.max(0, Math.min(1, (progress - 0.42) / 0.4)) : Math.max(0, Math.min(1, (progress - 0.3) / 0.25))
    const gather = opening ? Math.min(1, progress / 0.35) : Math.min(1, progress / 0.18)
    const source = logo?.points?.length ? logo.points : word
    const count = Math.min(source.length, Math.max(50, Math.floor(width * height / 3)))
    const markHeight = Math.max(1, Math.min(height - 2, width / 3))
    const markWidth = markHeight * 2
    const wordWidth = Math.max(1, Math.min(width - 4, 58))
    const wordHeight = Math.max(1, Math.min(height - 2, 7))
    for (let index = 0; index < count; index++) {
      const point = source[Math.floor(index * source.length / count)]
      const target = word[index % word.length]
      const x = cx + (point.x - 0.5) * markWidth * (1 - morph) + (target.x - 0.5) * wordWidth * morph
      const y = cy + (point.y - 0.5) * markHeight * (1 - morph) + (target.y - 0.5) * wordHeight * morph
      screen.put(
        x * gather + variation(seedValue, index * 3) * (width - 1) * (1 - gather),
        y * gather + variation(seedValue, index * 3 + 1) * (height - 1) * (1 - gather),
        point.sparkle ? '+' : '*',
        point.colorIndex ?? index % 4,
      )
    }
  }
  else if (effect === 'orbit') {
    const rx = Math.max(1, width * 0.36)
    const ry = Math.max(1, height * 0.35)
    for (let ring = 0; ring < 3; ring++) {
      for (let point = 0; point < width; point++) {
        const angle = point / width * Math.PI * 2
        const ratio = 0.45 + ring * 0.25
        screen.put(cx + Math.cos(angle) * rx * ratio, cy + Math.sin(angle) * ry * ratio, '.', ring)
      }
    }
    const labels = catalog.length ? catalog.map(project => sanitize(project.slug || project.packageName)) : ['weapp-vite', 'tailwindcss', 'vue-mini', 'rezor', 'uni-helper']
    const maxNodes = Math.max(3, Math.min(labels.length, Math.floor(width / 9)))
    for (let index = 0; index < maxNodes; index++) {
      const angle = time * 0.22 + index / maxNodes * Math.PI * 2
      const x = cx + Math.cos(angle) * rx
      const y = cy + Math.sin(angle) * ry
      screen.put(x, y, 'o', index % 4)
      if (width >= 42) {
        const label = labels[index].slice(0, 17)
        const start = Math.max(0, Math.min(width - label.length, Math.round(x - label.length / 2)))
        for (let char = 0; char < label.length; char++) {
          screen.put(start + char, y + (y < cy ? -1 : 1), label[char], index % 4)
        }
      }
    }
    for (const [index, char] of [...'WEAPP'].entries()) {
      screen.put(cx - 2 + index, cy, char, 0)
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
        screen.put(originX, height - (height - originY) * age / 0.45, '|', burst % 4)
      }
      else {
        const radius = (age - 0.45) * Math.min(height * 0.6, width * 0.18)
        const particles = Math.max(8, Math.min(36, Math.floor(width / 2)))
        for (let point = 0; point < particles; point++) {
          const angle = point / particles * Math.PI * 2
          screen.put(originX + Math.cos(angle) * radius * 1.8, originY + Math.sin(angle) * radius * 0.7 + (age - 0.45) ** 2, age < 1.5 ? '*' : '.', burst % 4)
        }
      }
    }
  }
  return screen.lines()
}
