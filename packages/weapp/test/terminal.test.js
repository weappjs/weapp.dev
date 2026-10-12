import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runFx, runHub, runSnake, selectProjects } from '../src/terminal/index.js'
import { EFFECTS, renderScene } from '../src/terminal/scenes.js'
import { clipLine, TerminalSession } from '../src/terminal/session.js'
import { createSnake, resizeSnake, tickSnake, turnSnake } from '../src/terminal/snake.js'

function terminal({ raw = false, paused = true, motion = true, width = 80, height = 24 } = {}) {
  const input = new PassThrough()
  input.isTTY = true
  input.isRaw = raw
  input.setRawMode = vi.fn((value) => {
    input.isRaw = value
  })
  if (paused) {
    input.pause()
  }
  else {
    input.resume()
  }
  const output = new EventEmitter()
  output.columns = width
  output.rows = height
  output.isTTY = true
  output.text = ''
  output.write = vi.fn((value) => {
    output.text += value
  })
  const signals = new EventEmitter()
  const ctx = { lang: 'en', stdin: input, stdout: output, stderr: output, color: false, motion, interactive: true, catalog: [] }
  const key = (name, value = '', extra = {}) => input.emit('keypress', value, { name, ...extra })
  return { input, output, signals, ctx, key }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('terminal ownership', () => {
  it('restores prior raw and paused states before resolving, once', async () => {
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ render: owner => owner.render(['Hello']), key: (value, key, finish) => finish('selected') })
    expect(io.input.isRaw).toBe(true)
    expect(io.input.isPaused()).toBe(false)
    io.key('return')
    expect(await result).toBe('selected')
    expect(io.input.isRaw).toBe(false)
    expect(io.input.isPaused()).toBe(true)
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(io.output.listenerCount('resize')).toBe(0)
    expect(io.signals.eventNames()).toEqual([])
    const writes = io.output.write.mock.calls.length
    session.close()
    expect(io.output.write).toHaveBeenCalledTimes(writes)
    expect(io.output.text).toContain('\u001B[?1049h')
    expect(io.output.text).toContain('\u001B[?25h\u001B[?1049l')
  })

  it('preserves a previously raw, flowing stream', async () => {
    const io = terminal({ raw: true, paused: false })
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ key: (value, key, finish) => finish(0) })
    io.key('escape')
    await result
    expect(io.input.isRaw).toBe(true)
    expect(io.input.isPaused()).toBe(false)
  })

  it('keeps initially idle stdin from consuming an inherited child input', async () => {
    const io = terminal()
    const input = new PassThrough()
    input.isRaw = false
    input.setRawMode = (value) => {
      input.isRaw = value
    }
    expect(input.readableFlowing).toBeNull()
    expect(input.isPaused()).toBe(false)
    const session = new TerminalSession({ ...io.ctx, stdin: input }, { signals: io.signals })
    const result = session.run({ key: (value, key, finish) => finish(0) })
    input.emit('keypress', '', { name: 'return' })
    await result
    expect(input.readableFlowing).toBe(false)
  })

  it('cleans timers and listeners on Ctrl+C and process signals', async () => {
    vi.useFakeTimers()
    for (const event of ['keypress', 'SIGINT', 'SIGTERM']) {
      const io = terminal()
      const session = new TerminalSession(io.ctx, { signals: io.signals })
      const result = session.run({ tick() {}, start(finish, owner) {
        owner.timeout(() => finish(0), 5000)
      } })
      expect(vi.getTimerCount()).toBe(2)
      if (event === 'keypress') {
        io.key('c', '\u0003', { ctrl: true })
      }
      else {
        io.signals.emit(event)
      }
      expect(await result).toBe(event === 'SIGTERM' ? 143 : 130)
      expect(io.ctx.cancelled).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      expect(io.signals.eventNames()).toEqual([])
      expect(io.input.isRaw).toBe(false)
    }
  })

  it('restores the terminal when a controller fails and never exceeds 20 FPS', async () => {
    vi.useFakeTimers()
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    let ticks = 0
    const result = session.run({ interval: 1, tick() {
      if (++ticks === 20) {
        throw new Error('frame failed')
      }
    } })
    const assertion = expect(result).rejects.toThrow('frame failed')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(ticks).toBe(20)
    expect(io.input.isRaw).toBe(false)
    expect(io.input.isPaused()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clips wide text and redraws in the new viewport after resize', async () => {
    const io = terminal({ width: 12, height: 3 })
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ render: owner => owner.render(['绿色工具箱 / WEAPP']), key: (value, key, finish) => finish(0) })
    expect(io.output.text).not.toContain('WEAPP')
    io.output.columns = 40
    io.output.emit('resize')
    expect(io.output.text).toContain('绿色工具箱 / WEAPP')
    io.key('escape')
    await result
    expect(clipLine('\u001B[32m绿色weapp\u001B[0m', 6)).toBe('\u001B[32m绿色we\u001B[0m')
  })

  it('is safe to close an unopened session', () => {
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    expect(() => {
      session.close()
      session.close()
    }).not.toThrow()
    expect(io.output.write).not.toHaveBeenCalled()
  })
})

describe('terminal interactions', () => {
  it('skips the opening, dispatches with normal input, then returns to the hall', async () => {
    const io = terminal()
    const dispatch = vi.fn(async (argv) => {
      expect(argv).toEqual(['fx'])
      expect(io.input.isRaw).toBe(false)
      expect(io.input.isPaused()).toBe(true)
      expect(io.input.listenerCount('keypress')).toBe(0)
      return 0
    })
    const result = runHub(io.ctx, dispatch)
    io.key('space', ' ')
    await new Promise(resolve => setImmediate(resolve))
    expect(io.output.text).toContain('THE HALL')
    io.key('return')
    await new Promise(resolve => setImmediate(resolve))
    expect(dispatch).toHaveBeenCalledTimes(1)
    io.key('q', 'q')
    expect(await result).toBe(0)
    expect(io.input.isRaw).toBe(false)
  })

  it('passes flag-like QR content literally from the hall', async () => {
    const io = terminal({ motion: false })
    const dispatch = vi.fn(async () => 0)
    const result = runHub(io.ctx, dispatch)
    await new Promise(resolve => setImmediate(resolve))
    // QR is the tenth entry; navigating upward twice wraps to it.
    io.key('up')
    io.key('up')
    io.key('return')
    await new Promise(resolve => setImmediate(resolve))
    expect(io.output.text).toContain('QR CONTENT')
    io.key('text', '--lang=en')
    io.key('return')
    await new Promise(resolve => setImmediate(resolve))
    expect(dispatch).toHaveBeenCalledWith(['qr', '--', '--lang=en'])
    io.key('return')
    await new Promise(resolve => setImmediate(resolve))
    io.key('q', 'q')
    expect(await result).toBe(0)
  })

  it('searches both languages, permits q in search, and selects the project', async () => {
    const io = terminal()
    const projects = [
      { slug: 'vite', locales: { 'en': { name: 'Vite', tagline: 'Build' }, 'zh-CN': { description: '构建' } } },
      { slug: 'sqlite', keywords: ['query'], locales: { en: { name: 'SQLite', tagline: 'Database' } } },
    ]
    const result = selectProjects(io.ctx, projects)
    io.key('q', 'q')
    expect(io.output.text).toContain('SQLite')
    io.key('return')
    expect(await result).toBe(projects[1])
    expect(io.input.isRaw).toBe(false)
  })

  it('pauses and switches effects; no-motion keeps a static view without a timer', async () => {
    vi.useFakeTimers()
    const io = terminal({ motion: false })
    const result = runFx(io.ctx, ['logo'])
    expect(vi.getTimerCount()).toBe(0)
    io.key('space', ' ')
    expect(io.output.text).not.toContain('LIVE')
    io.key('right')
    expect(io.output.text).toContain('ORBIT')
    io.key('r', 'r')
    io.key('q', 'q')
    expect(await result).toBe(0)
  })

  it('pauses gameplay on resize and closes on interruption', async () => {
    vi.useFakeTimers()
    const io = terminal()
    const result = runSnake(io.ctx, ['snake'])
    io.output.columns = 30
    io.output.emit('resize')
    expect(io.output.text).toContain('PAUSED')
    io.output.columns = 10
    io.output.emit('resize')
    expect(io.output.text).toContain('Window')
    io.key('c', '\u0003', { ctrl: true })
    expect(await result).toBe(130)
    expect(vi.getTimerCount()).toBe(0)
    expect(io.input.isRaw).toBe(false)
  })

  it.each(['snake', 'matrix'])('%s keeps its speed through repeated input and wall-clock changes', async (kind) => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    async function frameAfter({ repeat = false, jump = false } = {}) {
      const io = terminal()
      const result = kind === 'snake' ? runSnake(io.ctx, ['snake'], { seed: 123 }) : runFx(io.ctx, ['matrix'], { seed: 123 })
      for (let index = 0; index < 10; index++) {
        await vi.advanceTimersByTimeAsync(49)
        if (repeat) {
          io.key('x', 'x')
        }
        if (jump && index === 3) {
          vi.setSystemTime(Date.now() - 86400000)
        }
        await vi.advanceTimersByTimeAsync(1)
      }
      const frame = io.output.write.mock.calls.map(([value]) => value).filter(value => value.startsWith('\u001B[H')).at(-1)
      io.key('q', 'q')
      expect(await result).toBe(0)
      return frame
    }
    const baseline = await frameAfter()
    expect(await frameAfter({ repeat: true })).toBe(baseline)
    expect(await frameAfter({ repeat: true, jump: true })).toBe(baseline)
  })
})

describe('deterministic effect frames', () => {
  it.each(EFFECTS)('%s replays the same seed and respects narrow dimensions', (effect) => {
    const first = renderScene(effect, { width: 19, height: 7, seed: 123, time: 2 })
    expect(first).toEqual(renderScene(effect, { width: 19, height: 7, seed: 123, time: 2 }))
    expect(first).toHaveLength(7)
    expect(first.every(line => line.length <= 19)).toBe(true)
    expect(first.join('')).toMatch(/\S/)
    expect(first).not.toEqual(renderScene(effect, { width: 19, height: 7, seed: 124, time: 3 }))
  })
})

describe('snake rules', () => {
  it('prevents a reversal and more than one direction change per tick', () => {
    const game = createSnake(12, 8, 1)
    expect(turnSnake(game, 'left')).toBe(game)
    const turned = turnSnake(game, 'up')
    expect(turnSnake(turned, 'left')).toBe(turned)
    const next = tickSnake(turned)
    expect(next.body[0]).toEqual({ x: game.body[0].x, y: game.body[0].y - 1 })
    expect(turnSnake(next, 'left').nextDirection).toBe('left')
  })

  it('grows only after eating and chooses food outside the body', () => {
    const game = createSnake(12, 8, 2)
    const next = tickSnake({ ...game, food: { x: game.body[0].x + 1, y: game.body[0].y } })
    expect(next.score).toBe(1)
    expect(next.body).toHaveLength(4)
    expect(next.body).not.toContainEqual(next.food)
    const moved = tickSnake({ ...game, food: { x: 0, y: 0 } })
    expect(moved.score).toBe(0)
    expect(moved.body).toHaveLength(3)
  })

  it('allows entering the departing tail but ends on walls or remaining body', () => {
    const game = {
      ...createSnake(8, 8),
      direction: 'up',
      nextDirection: 'up',
      body: [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
      food: { x: 7, y: 7 },
    }
    expect(tickSnake(game).phase).toBe('running')
    expect(tickSnake({ ...game, food: { x: 3, y: 2 } }).phase).toBe('over')
    expect(tickSnake({ ...game, body: [{ x: 3, y: 0 }] }).phase).toBe('over')
  })

  it('preserves adjacency and score when a resized round fits', () => {
    const game = { ...createSnake(30, 14, 3), score: 2 }
    const { state, reset } = resizeSnake(game, 8, 6)
    expect(reset).toBe(false)
    expect(state.score).toBe(2)
    expect(state.body.every(point => point.x >= 0 && point.x < 8 && point.y >= 0 && point.y < 6)).toBe(true)
    state.body.slice(1).forEach((point, index) => {
      const previous = state.body[index]
      expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(1)
    })
    expect(state.body).not.toContainEqual(state.food)
  })

  it('wins when eating the final free cell', () => {
    const game = {
      ...createSnake(6, 5, 3),
      width: 2,
      height: 2,
      direction: 'right',
      nextDirection: 'right',
      body: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      food: { x: 1, y: 0 },
    }
    const next = tickSnake(game)
    expect(next.phase).toBe('won')
    expect(next.food).toBeNull()
    expect(tickSnake(next)).toBe(next)
  })
})
