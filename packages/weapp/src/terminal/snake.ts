import { seedNumber, variation } from './scenes.js'

export type SnakeDirection = 'up' | 'down' | 'left' | 'right'
export interface SnakePoint { x: number, y: number }
export interface SnakeState {
  width: number
  height: number
  seed: number
  score: number
  phase: 'running' | 'over' | 'won'
  direction: SnakeDirection
  nextDirection: SnakeDirection
  turned: boolean
  body: SnakePoint[]
  food: SnakePoint | null
}

const vectors: Record<SnakeDirection, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const opposite: Record<SnakeDirection, SnakeDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const same = (a: SnakePoint, b: SnakePoint) => a.x === b.x && a.y === b.y

function foodFor(state: SnakeState): SnakePoint | null {
  const available: SnakePoint[] = []
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!state.body.some(point => point.x === x && point.y === y)) {
        available.push({ x, y })
      }
    }
  }
  if (!available.length) {
    return null
  }
  return available[Math.floor(variation(state.seed, state.score + 19) * available.length)]
}

export function createSnake(width = 30, height = 14, seed: string | number = 'weapp'): SnakeState {
  width = Math.max(6, Math.floor(width))
  height = Math.max(5, Math.floor(height))
  const x = Math.floor(width / 2)
  const y = Math.floor(height / 2)
  const state: SnakeState = {
    width,
    height,
    seed: seedNumber(seed),
    score: 0,
    phase: 'running',
    direction: 'right',
    nextDirection: 'right',
    turned: false,
    body: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
    food: null,
  }
  state.food = foodFor(state)
  return state
}

export function turnSnake(state: SnakeState, direction: string | undefined): SnakeState {
  if (!direction || !Object.hasOwn(vectors, direction) || state.phase !== 'running' || state.turned || direction === opposite[state.direction]) {
    return state
  }
  return { ...state, nextDirection: direction as SnakeDirection, turned: direction !== state.direction }
}

export function tickSnake(state: SnakeState): SnakeState {
  if (state.phase !== 'running') {
    return state
  }
  const direction = state.nextDirection
  const [dx, dy] = vectors[direction]
  const head = { x: state.body[0].x + dx, y: state.body[0].y + dy }
  const grows = state.food && same(head, state.food)
  const collisionBody = grows ? state.body : state.body.slice(0, -1)
  if (head.x < 0 || head.x >= state.width || head.y < 0 || head.y >= state.height || collisionBody.some(point => same(point, head))) {
    return { ...state, direction, turned: false, phase: 'over' }
  }
  const body = [head, ...state.body]
  if (!grows) {
    body.pop()
  }
  const next: SnakeState = { ...state, direction, nextDirection: direction, turned: false, body, score: state.score + (grows ? 1 : 0) }
  if (grows) {
    next.food = foodFor(next)
  }
  if (!next.food) {
    next.phase = 'won'
  }
  return next
}

/** Preserve the round on a resize when its body fits; otherwise start a new board. */
export function resizeSnake(state: SnakeState, width: number, height: number): { state: SnakeState, reset: boolean } {
  width = Math.max(6, Math.floor(width))
  height = Math.max(5, Math.floor(height))
  const xs = state.body.map(point => point.x)
  const ys = state.body.map(point => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  if (maxX - minX >= width || maxY - minY >= height) {
    return { state: createSnake(width, height, state.seed), reset: true }
  }
  const dx = Math.min(0, width - 1 - maxX) + Math.max(0, -minX)
  const dy = Math.min(0, height - 1 - maxY) + Math.max(0, -minY)
  const next = { ...state, width, height, body: state.body.map(point => ({ x: point.x + dx, y: point.y + dy })) }
  const nextFood = next.food
  if (nextFood && (nextFood.x >= width || nextFood.y >= height || next.body.some(point => same(point, nextFood)))) {
    next.food = foodFor(next)
  }
  return { state: next, reset: false }
}

export function snakeLines(state: SnakeState, color = false): string[] {
  const colorize = (text: string, code: string) => color ? `\u001B[${code}m${text}\u001B[0m` : text
  const lines = [`+${'-'.repeat(state.width * 2)}+`]
  for (let y = 0; y < state.height; y++) {
    let row = '|'
    for (let x = 0; x < state.width; x++) {
      const index = state.body.findIndex(point => point.x === x && point.y === y)
      if (index === 0) {
        row += colorize('@@', '1;92')
      }
      else if (index > 0) {
        row += colorize('oo', '32')
      }
      else if (state.food?.x === x && state.food?.y === y) {
        row += colorize('* ', '93')
      }
      else {
        row += '  '
      }
    }
    lines.push(`${row}|`)
  }
  lines.push(`+${'-'.repeat(state.width * 2)}+`)
  return lines
}
