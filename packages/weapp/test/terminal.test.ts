import type { Key } from 'node:readline'
import type { SnakeState } from '../src/terminal/snake.js'
import type { CatalogProject, CliContext } from '../src/types.js'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scaffoldPlan } from '../src/commands/create/plan.js'
import { runCreateWizard, runFx, runHub, runSnake, selectProjects } from '../src/terminal/index.js'
import { EFFECTS, renderScene } from '../src/terminal/scenes.js'
import { clipLine, TerminalSession } from '../src/terminal/session.js'
import { createSnake, resizeSnake, tickSnake, turnSnake } from '../src/terminal/snake.js'
import { Workbench } from '../src/terminal/workbench.js'

const escape = String.fromCharCode(27)
const positionPattern = new RegExp(`${escape}\\[(\\d+);1H([\\s\\S]*?)${escape}\\[K`, 'g')
const colorPattern = new RegExp(`${escape}\\[[\\d;]*m`, 'g')
const framePattern = new RegExp(`${escape}\\[\\d+;1H`)
const alternateCount = (output: TestOutput) => output.text.split(`${escape}[?1049h`).length - 1
const temporary: string[] = []
const fakeClock = () => vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })

function catalog(): CatalogProject[] {
  return [...['weapp-vite', 'weapp-tailwindcss', 'weapp-ui', 'weapp-repl', 'weapp-worker', 'weapp-sqlite'], ...['vue-mini', 'rezor', 'vite-plugin-taro', 'uni-helper', 'tarojs']].map((slug, index) => ({
    slug,
    id: slug,
    order: index + 1,
    packageName: slug === 'weapp-sqlite' ? '@weapp-sqlite/weapp-vite' : slug,
    github: `weappjs/${slug}`,
    docsUrl: `https://example.com/${slug}`,
    maintainer: 'weappjs',
    futureDocsPath: `/docs/${slug}/`,
    logo: `/logos/${slug}.svg`,
    accent: '#2ba245',
    role: 'Engineering',
    maturity: index === 5 ? 'beta' : 'stable',
    relatedProjects: ['weapp-vite'],
    dataCompleteness: 'complete',
    ecosystem: index < 6 ? 'weapp' : 'uni-app',
    status: index === 5 ? 'beta' : 'stable',
    installCommand: slug === 'weapp-sqlite' ? 'pnpm add @weapp-sqlite/weapp-vite' : `npm install ${slug}`,
    ...(index === 0 ? { quickStart: { command: 'npm create weapp-vite@latest' } } : {}),
    locales: {
      'en': { name: slug, tagline: `Build with ${slug}`, description: `Project ${index} description`, audience: 'Mini-app developers', capabilities: ['Fast builds', 'Component tooling'], useCases: ['Build a mini-app'], faqs: [{ question: 'How?', answer: 'Use the CLI.' }] },
      'zh-CN': { name: slug, tagline: '小程序工具', description: `项目 ${index} 的介绍`, audience: '小程序开发者', capabilities: ['构建', '组件'], useCases: ['开发小程序'], faqs: [{ question: '怎么用？', answer: '使用 CLI。' }] },
    },
    keywords: index === 5 ? ['query', 'sqlite'] : [],
  }))
}

class TestInput extends PassThrough {
  isTTY = true
  isRaw = false
  setRawMode = vi.fn((value: boolean) => {
    this.isRaw = value
    return this
  })
}
class TestOutput extends EventEmitter {
  columns = 80
  rows = 24
  isTTY = true
  text = ''
  private screenRows: string[] = []
  write = vi.fn((value: string) => {
    this.text += value
    if (value.includes('\u001B[2J')) {
      this.screenRows.length = 0
    }
    for (const match of value.matchAll(positionPattern)) {
      this.screenRows[Number(match[1]) - 1] = match[2].replace(colorPattern, '')
    }
    return true
  })

  frame = () => this.screenRows.join('\n')
  frames = () => this.write.mock.calls.map(([value]) => value).filter(value => framePattern.test(value))
}
interface TerminalFixture {
  input: TestInput
  output: TestOutput
  signals: EventEmitter
  ctx: CliContext
  key: (name: string, value?: string, extra?: Key) => boolean
}
function terminal({ raw = false, paused = true, motion = true, width = 80, height = 24 } = {}): TerminalFixture {
  const input = new TestInput()
  input.isRaw = raw
  if (paused) {
    input.pause()
  }
  else {
    input.resume()
  }
  const output = new TestOutput()
  output.columns = width
  output.rows = height
  const signals = new EventEmitter()
  const ctx: CliContext = {
    lang: 'en',
    stdin: input,
    stdout: output,
    stderr: output,
    color: false,
    motion,
    interactive: true,
    catalog: catalog(),
    resources: {},
    openUrl: async () => undefined,
    discoverProject: async (directory = '/empty-project') => ({ requestedDirectory: directory, projectRoot: directory, kind: 'unknown', packageManager: { source: 'unresolved', conflicts: [] }, frameworks: [], configs: [], lockfiles: [], issues: [] }),
  }
  const key = (name: string, value = '', extra: Key = {}) => input.emit('keypress', value, { name, ...extra })
  return { input, output, signals, ctx, key }
}

async function nextFrame() {
  await vi.advanceTimersByTimeAsync(50)
}

async function waitScreen(io: TerminalFixture, title: string) {
  await vi.waitFor(() => expect(io.ctx.resources.workbench!.screen.title).toBe(title))
  await nextFrame()
}

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('terminal ownership', () => {
  it('restores prior raw and paused states before resolving, once', async () => {
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run<string>({ render: owner => owner.render(['Hello']), key: (_value, _key, finish) => finish('selected') })
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

  it('queues a pre-open frame without writing and preserves a raw flowing stream', async () => {
    const io = terminal({ raw: true, paused: false })
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    session.render(['Waiting for input ownership'])
    expect(io.output.write).not.toHaveBeenCalled()
    const result = session.run({ key: (_value, _key, finish) => finish(0), render: owner => owner.render(['Ready']) })
    expect(io.output.frame()).toContain('Ready')
    io.key('escape')
    await result
    expect(io.input.isRaw).toBe(true)
    expect(io.input.isPaused()).toBe(false)
  })

  it('keeps initially idle stdin from consuming inherited child input', async () => {
    const io = terminal()
    const input = new TestInput()
    input.isRaw = false
    input.setRawMode.mockImplementation((value) => {
      input.isRaw = value
      return input
    })
    expect(input.readableFlowing).toBeNull()
    const session = new TerminalSession({ ...io.ctx, stdin: input }, { signals: io.signals })
    const result = session.run({ key: (_value, _key, finish) => finish(0) })
    input.emit('keypress', '', { name: 'return' })
    await result
    expect(input.readableFlowing).toBe(false)
  })

  it('cleans timers and listeners on Ctrl+C and process signals', async () => {
    fakeClock()
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

  it('restores the terminal on controller failures and delayed output failures', async () => {
    fakeClock()
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

    const delayed = new TerminalSession(io.ctx, { signals: io.signals })
    const pending = delayed.run({ render: owner => owner.render(['Initial']) })
    const reject = expect(pending).rejects.toThrow('output failed')
    delayed.render(['Next'])
    io.output.write.mockImplementation(() => {
      throw new Error('output failed')
    })
    await nextFrame()
    await reject
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(io.input.isRaw).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('caps every frame path at 20 FPS and coalesces keys and resize', async () => {
    fakeClock()
    const io = terminal({ width: 12, height: 3 })
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    let selection = 0
    const frame = vi.fn(() => [`绿色工具箱 / WEAPP ${selection}`])
    const render = (owner: TerminalSession) => owner.render(frame)
    const result = session.run({ render, key: (_value, key, finish) => {
      if (key.name === 'escape') {
        finish(0)
      }
      else {
        selection++
        render(session)
      }
    } })
    expect(io.output.frame()).not.toContain('WEAPP')
    for (let index = 0; index < 50; index++) {
      io.key('down')
      io.output.columns = 40
      io.output.emit('resize')
    }
    expect(io.output.frames()).toHaveLength(1)
    expect(frame).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(49)
    expect(io.output.frames()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(io.output.frames()).toHaveLength(2)
    expect(frame).toHaveBeenCalledTimes(2)
    expect(io.output.frame()).toContain('绿色工具箱 / WEAPP 50')
    io.key('escape')
    await result
    expect(io.input.isRaw).toBe(false)
    expect(clipLine('\u001B[32m绿色weapp\u001B[0m', 6)).toBe('\u001B[32m绿色we\u001B[0m')
  })

  it('only updates changed rows and clears obsolete rows', async () => {
    fakeClock()
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ render: owner => owner.render(['Same', 'Old']), key: (_value, _key, finish) => finish(0) })
    session.render(['Same', 'New'])
    await nextFrame()
    expect(io.output.frames().at(-1)).toBe('\u001B[2;1HNew\u001B[K')
    session.render(['Same'])
    await nextFrame()
    expect(io.output.frames().at(-1)).toBe('\u001B[2;1H\u001B[K')
    expect(io.output.frame()).toBe('Same\n')
    io.key('escape')
    await result
  })

  it('waits for drain and writes only the newest frame under backpressure', async () => {
    fakeClock()
    const io = terminal()
    const write = io.output.write.getMockImplementation()!
    io.output.write.mockImplementation(value => write(value) && !value.includes('Initial'))
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ render: owner => owner.render(['Initial']), key: (_value, _key, finish) => finish(0) })
    session.render(['Discard this intermediate frame'])
    session.render(['Newest'])
    await vi.advanceTimersByTimeAsync(250)
    expect(io.output.frames()).toHaveLength(1)
    expect(io.output.listenerCount('drain')).toBe(1)
    io.output.emit('drain')
    expect(io.output.frames()).toHaveLength(2)
    expect(io.output.frame()).toBe('Newest')
    io.key('escape')
    await result
    expect(io.output.listenerCount('drain')).toBe(0)
  })

  it('keeps ticking under backpressure but evaluates only the latest frame at the current size', async () => {
    fakeClock()
    const io = terminal({ width: 12 })
    const write = io.output.write.getMockImplementation()!
    io.output.write.mockImplementation(value => write(value) && !value.includes('Tick 0'))
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    let tick = 0
    const frame = vi.fn(() => [`Tick ${tick} / latest terminal dimensions`])
    const result = session.run({
      render: owner => owner.render(frame),
      tick: () => { tick++ },
      key: (_value, _key, finish) => finish(0),
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(tick).toBe(5)
    expect(frame).toHaveBeenCalledTimes(1)
    io.output.columns = 80
    io.output.emit('resize')
    expect(frame).toHaveBeenCalledTimes(1)
    expect(io.output.listenerCount('drain')).toBe(1)
    io.output.emit('drain')
    expect(frame).toHaveBeenCalledTimes(2)
    expect(io.output.frame()).toBe('Tick 5 / latest terminal dimensions')
    io.key('q')
    await result
  })

  it('defers producers before opening and discards queued work on close', async () => {
    fakeClock()
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const stale = vi.fn(() => ['Stale'])
    const ready = vi.fn(() => ['Ready'])
    const after = vi.fn(() => ['After close'])
    session.render(stale)
    expect(stale).not.toHaveBeenCalled()
    const result = session.run({ render: owner => owner.render(ready), key: (_value, _key, finish) => finish(0) })
    expect(ready).toHaveBeenCalledOnce()
    expect(stale).not.toHaveBeenCalled()
    session.render(after)
    io.key('q')
    await result
    await vi.advanceTimersByTimeAsync(1000)
    expect(after).not.toHaveBeenCalled()
    expect(session.pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips unchanged ticks without suppressing duration timeouts', async () => {
    fakeClock()
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const frame = vi.fn(() => ['Paused'])
    const tick = vi.fn(() => false)
    const result = session.run({
      start: (finish, owner) => { owner.timeout(() => finish(0), 250) },
      render: owner => owner.render(frame),
      tick,
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(await result).toBe(0)
    expect(tick).toHaveBeenCalled()
    expect(frame).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles external interrupts locally only while suspended', async () => {
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const handler = vi.fn(() => true)
    const result = session.run({ render: owner => owner.render(['Ready']) })
    session.externalInterrupt = handler
    session.suspend()
    io.signals.emit('SIGINT')
    expect(handler).toHaveBeenCalledWith('SIGINT')
    expect(session.closed).toBe(false)
    expect(io.ctx.cancelled).toBeUndefined()
    session.resume()
    io.signals.emit('SIGINT')
    expect(await result).toBe(130)
    expect(handler).toHaveBeenCalledOnce()
    expect(session.externalInterrupt).toBeUndefined()
    expect(io.input.isRaw).toBe(false)
    expect(io.signals.eventNames()).toEqual([])
  })

  it('preserves global termination when the external handler declines', async () => {
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({})
    const handler = vi.fn(() => false)
    session.externalInterrupt = handler
    session.suspend()
    io.signals.emit('SIGTERM')
    expect(await result).toBe(143)
    expect(handler).toHaveBeenCalledWith('SIGTERM')
    expect(io.ctx.cancelledCode).toBe(143)
    expect(io.input.isRaw).toBe(false)
  })

  it('restores the terminal when an external interrupt handler throws', async () => {
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({})
    const assertion = expect(result).rejects.toThrow('External interrupt failed')
    session.suspend()
    session.externalInterrupt = () => {
      throw new Error('External interrupt failed')
    }
    expect(() => io.signals.emit('SIGINT')).not.toThrow()
    await assertion
    expect(io.input.isRaw).toBe(false)
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(io.signals.eventNames()).toEqual([])
  })

  it('restores the terminal when a deferred frame producer throws', async () => {
    fakeClock()
    const io = terminal()
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ render: owner => owner.render(['Initial']) })
    const assertion = expect(result).rejects.toThrow('Deferred frame failed')
    session.render(() => {
      throw new Error('Deferred frame failed')
    })
    await nextFrame()
    await assertion
    expect(io.input.isRaw).toBe(false)
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(session.pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restores input when a delayed drain flush throws', async () => {
    fakeClock()
    const io = terminal()
    const write = io.output.write.getMockImplementation()!
    io.output.write.mockImplementation(value => write(value) && !value.includes('Initial'))
    const session = new TerminalSession(io.ctx, { signals: io.signals })
    const result = session.run({ render: owner => owner.render(['Initial']) })
    const assertion = expect(result).rejects.toThrow('drain failed')
    session.render(['Pending'])
    await vi.advanceTimersByTimeAsync(250)
    io.output.write.mockImplementation(() => {
      throw new Error('drain failed')
    })
    expect(() => io.output.emit('drain')).not.toThrow()
    await assertion
    expect(session.closed).toBe(true)
    expect(io.input.isRaw).toBe(false)
    expect(io.input.isPaused()).toBe(true)
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(io.output.listenerCount('drain')).toBe(0)
    expect(io.signals.eventNames()).toEqual([])
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

describe('live workbench', () => {
  it('shows actions in the first frame and sends C directly to creation during discovery', async () => {
    fakeClock()
    const io = terminal()
    const dispatch = vi.fn(async (argv: string[]) => {
      expect(argv).toEqual(['create'])
      expect(io.input.isRaw).toBe(true)
      expect(io.input.listenerCount('keypress')).toBe(1)
      return 0
    })
    const result = runHub(io.ctx, dispatch)
    expect(io.output.frame()).toContain('WORKBENCH')
    expect(io.output.frame()).toContain('Create with weapp-vite')
    expect(io.output.frame()).not.toContain('Press any key')
    expect(io.output.frame()).not.toMatch(/snake|game/i)
    io.key('c', 'c')
    await nextFrame()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(alternateCount(io.output)).toBe(1)
    io.key('q', 'q')
    expect(await result).toBe(0)
    expect(io.input.isRaw).toBe(false)
  })

  it('limits the C shortcut to the hall and preserves project-search text', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const dispatch = vi.fn(async () => 0)
    const result = runHub(io.ctx, dispatch)
    await nextFrame()
    io.key('c', 'c')
    await nextFrame()
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(['create'])
    io.key('down')
    io.key('return')
    io.key('c', 'c')
    await nextFrame()
    expect(io.output.frame()).toContain('Search: c')
    expect(dispatch).toHaveBeenCalledTimes(1)
    io.key('escape')
    io.key('q', 'q')
    await result
  })

  it('cancels only the pending creation on Esc and ignores its late rejection', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    let rejectPreparation: (reason: Error) => void = () => {}
    const preparation = new Promise<never>((_resolve, reject) => {
      rejectPreparation = reject
    })
    const cancel = vi.fn()
    const unsubscribe = vi.fn()
    const pending = workbench.waitForCreate(preparation, cancel, (listener) => {
      listener({ phase: 'querying', packageName: 'create-weapp-vite', cwd: '/tmp' })
      return unsubscribe
    })
    await nextFrame()
    expect(io.output.frame()).toContain('PREPARING TO CREATE')
    io.key('escape')
    expect(await pending).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(workbench.abortSignal.aborted).toBe(false)
    expect(workbench.screen).toBe(workbench.hall)
    expect(io.input.isRaw).toBe(true)
    rejectPreparation(new Error('late metadata failure'))
    await nextFrame()
    expect(io.output.frame()).toContain('WORKBENCH')
    io.key('q', 'q')
    await result
  })

  it('reports elapsed query time on existing frames and completed timing without motion', async () => {
    fakeClock()
    const io = terminal()
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    workbench.setCreateProgress({ phase: 'querying', packageName: 'create-weapp-vite', cwd: '/tmp' })
    await vi.advanceTimersByTimeAsync(350)
    expect(workbench.progressLabel()).toContain('350ms')
    workbench.ctx.motion = false
    workbench.setCreateProgress({ phase: 'ready', packageName: 'create-weapp-vite', cwd: '/tmp', version: '1.2.3', elapsedMs: 312, queryElapsedMs: 312 })
    expect(workbench.progressLabel()).toContain('1.2.3 · 312ms')
    io.key('q', 'q')
    await result
  })

  it('keeps Esc local while the create command module is still loading', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    let release: (value: number) => void = () => {}
    let signal: AbortSignal | undefined
    const hub = runHub(io.ctx, () => {
      signal = io.ctx.operationSignal
      return new Promise<number>((resolve) => {
        release = resolve
      })
    })
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    io.key('return')
    io.key('escape')
    expect(signal?.aborted).toBe(true)
    expect(workbench.abortSignal.aborted).toBe(false)
    expect(workbench.session.closed).toBe(false)
    release(130)
    await nextFrame()
    expect(workbench.session.closed).toBe(false)
    expect(workbench.abortSignal.aborted).toBe(false)
    expect(workbench.screen).toBe(workbench.hall)
    io.key('q', 'q')
    await hub
  })

  it('animates idle frames, pauses, and resumes without elapsed-time jumps', async () => {
    fakeClock()
    const io = terminal()
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    io.key('x', 'x')
    await nextFrame()
    const initial = io.output.frame()
    await vi.advanceTimersByTimeAsync(300)
    expect(io.output.frame()).not.toBe(initial)
    io.key('space', ' ')
    await nextFrame()
    const paused = io.output.frame()
    const time = io.ctx.resources.workbench!.time
    await vi.advanceTimersByTimeAsync(5000)
    expect(io.output.frame()).toBe(paused)
    expect(io.ctx.resources.workbench!.time).toBe(time)
    io.key('space', ' ')
    await nextFrame()
    expect(io.ctx.resources.workbench!.time - time).toBeLessThanOrEqual(0.05)
    io.key('q', 'q')
    await result
  })

  it('updates project focus immediately while decorative motion is paused', async () => {
    fakeClock()
    const io = terminal()
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    io.key('x', 'x')
    io.key('down')
    io.key('return')
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    workbench.paused = true
    const frozenTime = workbench.time
    io.key('down')
    await nextFrame()
    expect(workbench.focus).toBe(1)
    expect(workbench.time).toBe(frozenTime)
    workbench.paused = false
    await nextFrame()
    expect(workbench.focus).toBe(1)
    io.key('escape')
    io.key('q', 'q')
    await result
  })

  it('does not compute paused frames and still reacts to selection and resize', async () => {
    fakeClock()
    const io = terminal({ width: 120, height: 30 })
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    const frame = vi.spyOn(workbench, 'frame')
    io.key('space', ' ')
    await nextFrame()
    frame.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(frame).not.toHaveBeenCalled()
    io.key('down')
    await nextFrame()
    expect(frame).toHaveBeenCalledTimes(1)
    expect(io.output.frame()).toContain('› Explore the weapp ecosystem')
    io.output.columns = 44
    io.output.rows = 18
    io.output.emit('resize')
    await nextFrame()
    expect(frame).toHaveBeenCalledTimes(2)
    const frozenTime = workbench.time
    io.key('space', ' ')
    await nextFrame()
    expect(workbench.time - frozenTime).toBeLessThanOrEqual(0.05)
    expect(frame.mock.calls.length).toBeGreaterThan(2)
    io.key('q', 'q')
    await result
  })

  it('reuses the current static layout while animation continues', async () => {
    fakeClock()
    const io = terminal({ width: 120, height: 30 })
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    const entries = vi.spyOn(workbench, 'entries')
    const initial = io.output.frame()
    await vi.advanceTimersByTimeAsync(300)
    expect(io.output.frame()).not.toBe(initial)
    expect(entries).not.toHaveBeenCalled()
    io.key('down')
    await nextFrame()
    expect(io.output.frame()).toContain('› Explore the weapp ecosystem')
    entries.mockClear()
    await vi.advanceTimersByTimeAsync(300)
    expect(entries).not.toHaveBeenCalled()
    io.output.columns = 44
    io.output.emit('resize')
    await nextFrame()
    expect(entries).toHaveBeenCalledOnce()
    io.key('q', 'q')
    await result
  })

  it('shares one alternate screen across hall, project details, and a nested wizard', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const dispatch = vi.fn(() => runCreateWizard(io.ctx))
    const result = runHub(io.ctx, dispatch)
    await nextFrame()
    io.key('down')
    io.key('return')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('Capabilities')
    io.key('escape')
    io.key('escape')
    io.key('up')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('NEW PROJECT DIRECTORY')
    expect(alternateCount(io.output)).toBe(1)
    io.key('escape')
    await nextFrame()
    expect(io.output.frame()).toContain('WORKBENCH')
    io.key('q', 'q')
    await result
  })

  it('uses a stable no-motion frame and includes narrow project facts', async () => {
    fakeClock()
    const io = terminal({ motion: false, width: 44, height: 18 })
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    expect(vi.getTimerCount()).toBe(0)
    const stable = io.output.frame()
    await vi.advanceTimersByTimeAsync(1000)
    expect(io.output.frame()).toBe(stable)
    io.key('down')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('weapp-vite')
    expect(io.output.frame()).toContain('Status: stable')
    expect(io.output.frame()).toContain('npm create weapp-vite@latest')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('Capabilities: Fast builds')
    io.key('escape')
    io.key('escape')
    io.key('q', 'q')
    await result
  })

  it('passes flag-like QR content literally and captures command output', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const dispatch = vi.fn(async () => {
      io.ctx.stdout.write('QR generated\n')
      return 0
    })
    const result = runHub(io.ctx, dispatch)
    await nextFrame()
    io.key('up')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('MORE TOOLS')
    expect(io.output.frame()).not.toMatch(/snake|game/i)
    io.key('down')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('QR CONTENT')
    io.key('text', '--lang=en')
    io.key('return')
    await nextFrame()
    expect(dispatch).toHaveBeenCalledWith(['qr', '--', '--lang=en'])
    expect(io.output.frame()).toContain('QR generated')
    expect(alternateCount(io.output)).toBe(1)
    io.key('return')
    io.key('escape')
    io.key('q', 'q')
    await result
  })

  it('defaults to six family projects, supports Tab, and honors explicit filters', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const result = selectProjects(io.ctx, io.ctx.catalog!)
    const workbench = io.ctx.resources.workbench!
    expect(workbench.entries()).toHaveLength(6)
    expect(workbench.entries().map(entry => typeof entry.value === 'string' ? undefined : entry.value.ecosystem)).toEqual(Array.from({ length: 6 }).fill('weapp'))
    io.key('tab')
    await nextFrame()
    expect(workbench.entries()).toHaveLength(11)
    io.key('text', 'vue')
    io.key('return')
    expect(await result).toBe(io.ctx.catalog![6])
    expect(io.input.isRaw).toBe(false)

    const filtered = selectProjects(io.ctx, [io.ctx.catalog![6]], { all: true, filtered: true })
    io.key('tab')
    expect(io.ctx.resources.workbench!.entries()).toHaveLength(1)
    io.key('return')
    expect(await filtered).toBe(io.ctx.catalog![6])
  })

  it('shows the beta SQLite installation while retaining its project slug', async () => {
    fakeClock()
    const io = terminal({ motion: false, width: 140, height: 30 })
    const sqlite = io.ctx.catalog![5]
    const result = selectProjects(io.ctx, [sqlite], { all: true, filtered: true })
    await nextFrame()
    expect(io.output.frame()).toContain('weapp-sqlite')
    expect(io.output.frame()).toContain('Status: beta')
    expect(io.output.frame()).toContain('pnpm add @weapp-sqlite/weapp-vite')
    io.key('return')
    expect(await result).toBe(sqlite)
  })

  it('withholds a planned fixture command independently of SQLite maturity', async () => {
    fakeClock()
    const io = terminal({ motion: false, width: 140, height: 30 })
    const planned: CatalogProject = { ...io.ctx.catalog![0], slug: 'planned-fixture', id: 'planned-fixture', status: 'planned', maturity: 'planned', quickStart: { command: 'pnpm dlx planned-fixture' } }
    const result = selectProjects(io.ctx, [planned], { all: true, filtered: true })
    await nextFrame()
    expect(io.output.frame()).toContain('Planned · No installation command')
    expect(io.output.frame()).not.toContain('pnpm dlx planned-fixture')
    io.key('return')
    expect(await result).toBe(planned)
  })

  it('permits q in project search and handles an empty result', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const result = selectProjects(io.ctx, io.ctx.catalog!)
    io.key('q', 'q')
    await nextFrame()
    expect(io.ctx.resources.workbench!.session.closed).toBe(false)
    expect(io.output.frame()).toContain('Search: q')
    io.key('text', 'uery')
    await nextFrame()
    expect(io.output.frame()).toContain('weapp-sqlite')
    io.key('x', 'x')
    await nextFrame()
    expect(io.output.frame()).toContain('No matching projects')
    io.key('backspace')
    io.key('return')
    expect(await result).toBe(io.ctx.catalog![5])
  })

  it.each(['success', 'error'])('releases inherited input around external %s and restores the same screen', async (kind) => {
    fakeClock()
    const io = terminal({ motion: false })
    const workbench = new Workbench(io.ctx, vi.fn())
    const running = workbench.run()
    await nextFrame()
    const original = workbench.screen
    let release: () => void = () => {}
    const callback = vi.fn(() => {
      expect(io.input.isRaw).toBe(false)
      expect(io.input.isPaused()).toBe(true)
      expect(io.input.listenerCount('keypress')).toBe(0)
      return new Promise<number>((resolve, reject) => {
        release = kind === 'error' ? () => reject(new Error('upstream')) : () => resolve(42)
      })
    })
    const pending = workbench.external(callback)
    const assertion = kind === 'error' ? expect(pending).rejects.toThrow('upstream') : expect(pending).resolves.toBe(42)
    expect(callback).toHaveBeenCalledTimes(1)
    release()
    await assertion
    expect(io.input.isRaw).toBe(true)
    expect(io.input.listenerCount('keypress')).toBe(1)
    expect(workbench.screen).toBe(original)
    expect(alternateCount(io.output)).toBe(2)
    io.key('q', 'q')
    await running
  })

  it.each(['q', 'ctrl+c'])('aborts pending operations on %s and refuses external callbacks after exit', async (key) => {
    fakeClock()
    const io = terminal({ motion: false })
    let release: (value: number) => void = () => {}
    let signal: AbortSignal | undefined
    const dispatch = vi.fn(() => {
      signal = io.ctx.operationSignal
      return new Promise<number>((resolve) => {
        release = resolve
      })
    })
    const result = runHub(io.ctx, dispatch)
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    io.key('return')
    expect(signal!.aborted).toBe(false)
    io.key(key === 'q' ? 'q' : 'c', key === 'q' ? 'q' : '\u0003', { ctrl: key !== 'q' })
    expect(await result).toBe(key === 'q' ? 0 : 130)
    expect(signal!.aborted).toBe(true)
    const execute = vi.fn()
    await expect(workbench.external(execute)).rejects.toMatchObject({ name: 'AbortError' })
    expect(execute).not.toHaveBeenCalled()
    release(0)
    await nextFrame()
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(io.ctx.resources.workbench!).toBeUndefined()
  })

  it('propagates Ctrl+C from an effect back through the hall', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const dispatch = vi.fn(() => runFx({ ...io.ctx }, ['orbit']))
    const result = runHub(io.ctx, dispatch)
    await nextFrame()
    io.key('up')
    io.key('return')
    await nextFrame()
    io.key('up')
    io.key('return')
    await nextFrame()
    expect(dispatch).toHaveBeenCalledWith(['fx'])
    io.key('c', '\u0003', { ctrl: true })
    expect(await result).toBe(130)
    expect(io.ctx.cancelledCode).toBe(130)
    expect(io.ctx.resources.workbench!).toBeUndefined()
    expect(io.input.isRaw).toBe(false)
    expect(io.input.listenerCount('keypress')).toBe(0)
  })
})

describe('interactive creation wizard', () => {
  async function directory() {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'weapp-wizard-'))
    temporary.push(parent)
    return path.join(parent, 'my-app')
  }

  it('collects directory, template, and official command summary in one session', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const target = await directory()
    const result = runCreateWizard(io.ctx)
    expect(io.output.frame()).toContain('NEW PROJECT DIRECTORY')
    io.key('text', target)
    io.key('return')
    await waitScreen(io, 'CHOOSE A TEMPLATE')
    expect(io.output.frame()).toContain('CHOOSE A TEMPLATE')
    expect(io.output.frame()).toContain('Native mini-app pages')
    io.key('down')
    io.key('return')
    await waitScreen(io, 'READY TO CREATE')
    expect(io.output.frame()).toContain('READY TO CREATE')
    expect(io.output.frame()).toContain('Template: wevu')
    expect(io.output.frame()).toContain('create-weapp-vite@latest')
    io.key('return')
    expect(await result).toEqual({ args: ['weapp-vite', target], options: { template: 'wevu' } })
    expect(alternateCount(io.output)).toBe(1)
    expect(io.input.isRaw).toBe(false)
    expect(io.ctx.resources.workbench!).toBeUndefined()
  })

  it('preserves the default template and cancels the wizard on Esc without execution', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const target = await directory()
    const result = runCreateWizard(io.ctx)
    io.key('text', target)
    io.key('return')
    await waitScreen(io, 'CHOOSE A TEMPLATE')
    const templateScreen = io.ctx.resources.workbench!.screen
    expect(templateScreen.type).toBe('menu')
    if (templateScreen.type !== 'menu') {
      throw new Error('Expected template menu')
    }
    expect(templateScreen.entries[templateScreen.selected || 0].value).toBe('default')
    io.key('escape')
    expect(await result).toBeNull()
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('prepares after local validation, previews selections, and cancels on Esc', async () => {
    fakeClock()
    const io = terminal({ motion: false, width: 120, height: 30 })
    const target = await directory()
    const onPlan = vi.fn()
    const onCancel = vi.fn()
    const unsubscribe = vi.fn()
    const result = runCreateWizard(io.ctx, 'weapp-vite', {}, { onPlan, onCancel, subscribeProgress: () => unsubscribe })
    io.key('text', './invalid name')
    io.key('return')
    await nextFrame()
    expect(onPlan).not.toHaveBeenCalled()
    for (let index = 0; index < './invalid name'.length; index++) {
      io.key('backspace')
    }
    io.key('text', target)
    io.key('return')
    await waitScreen(io, 'CHOOSE A TEMPLATE')
    expect(onPlan).toHaveBeenCalledOnce()
    const native = io.output.frame()
    io.key('down')
    await nextFrame()
    expect(io.output.frame()).not.toBe(native)
    expect(io.output.frame()).toContain('wevu · Your project constellation')
    expect(onCancel).not.toHaveBeenCalled()
    io.key('escape')
    expect(await result).toBeNull()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('cancels from the summary and returns to the same hall', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const target = await directory()
    const onCancel = vi.fn()
    const hub = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    const wizard = runCreateWizard(io.ctx, 'weapp-vite', {}, { onCancel })
    io.key('text', target)
    io.key('return')
    await waitScreen(io, 'CHOOSE A TEMPLATE')
    io.key('return')
    await waitScreen(io, 'READY TO CREATE')
    io.key('escape')
    expect(await wizard).toBeNull()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(workbench.screen).toBe(workbench.hall)
    expect(workbench.abortSignal.aborted).toBe(false)
    io.key('q', 'q')
    await hub
  })

  it('keeps Esc local while the directory is being validated', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const target = await directory()
    const onPlan = vi.fn()
    const onCancel = vi.fn()
    const hub = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    const wizard = runCreateWizard(io.ctx, 'weapp-vite', {}, { onPlan, onCancel })
    io.key('text', target)
    io.key('return')
    await Promise.resolve()
    expect(workbench.screen.type).toBe('preparing')
    io.key('escape')
    expect(await wizard).toBeNull()
    expect(onPlan).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(workbench.abortSignal.aborted).toBe(false)
    expect(workbench.session.closed).toBe(false)
    expect(workbench.screen).toBe(workbench.hall)
    await nextFrame()
    expect(workbench.screen).toBe(workbench.hall)
    io.key('q', 'q')
    await hub
  })

  it.each(['directory', 'template', 'summary'])('cancels Enter followed immediately by Esc at the %s step', async (step) => {
    fakeClock()
    const io = terminal({ motion: false })
    const target = await directory()
    const onCancel = vi.fn()
    const hub = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    const wizard = runCreateWizard(io.ctx, 'weapp-vite', {}, { onCancel })
    io.key('text', target)
    if (step !== 'directory') {
      io.key('return')
      await waitScreen(io, 'CHOOSE A TEMPLATE')
    }
    if (step === 'summary') {
      io.key('return')
      await waitScreen(io, 'READY TO CREATE')
    }
    io.key('return')
    io.key('escape')
    expect(await wizard).toBeNull()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(workbench.session.closed).toBe(false)
    expect(workbench.abortSignal.aborted).toBe(false)
    expect(workbench.screen).toBe(workbench.hall)
    io.key('q', 'q')
    await hub
  })

  it.each([[120, 30], [80, 24], [44, 18]])('keeps the creation action visible at %i × %i', async (width, height) => {
    fakeClock()
    const io = terminal({ motion: false, width, height })
    const target = await directory()
    const result = runCreateWizard(io.ctx)
    io.key('text', target)
    io.key('return')
    await waitScreen(io, 'CHOOSE A TEMPLATE')
    expect(io.output.frame()).toContain('default')
    expect(io.output.frame()).toContain('Enter')
    io.key('return')
    await waitScreen(io, 'READY TO CREATE')
    expect(io.output.frame()).toContain('Template: default')
    expect(io.output.frame()).toContain('Enter create')
    io.key('return')
    expect(await result).not.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows a verified success result immediately without a celebration timer', async () => {
    fakeClock()
    const io = terminal({ motion: false, width: 120, height: 30 })
    const target = await directory()
    const plan = await scaffoldPlan('weapp-vite', target, { template: 'react' })
    const result = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    workbench.showCreateSuccess(plan, { phase: 'complete', packageName: plan.package, cwd: plan.cwd, queryElapsedMs: 112, executionElapsedMs: 2345, validationElapsedMs: 18 })
    expect(workbench.screen.type).toBe('result')
    await nextFrame()
    expect(io.output.frame()).toContain('[ PROJECT CREATED ]')
    expect(io.output.frame()).toContain('I install · S scripts · D doctor')
    expect(io.output.frame()).toContain('react · Your project constellation')
    expect(io.output.frame()).toContain('Version query: 112ms')
    expect(io.output.frame()).toContain('Official scaffold: 2.3s')
    expect(io.output.frame()).toContain('Result validation: 18ms')
    expect(vi.getTimerCount()).toBe(0)
    io.key('return')
    await nextFrame()
    expect(workbench.screen).toBe(workbench.hall)
    io.key('q', 'q')
    await result
  })

  it('keeps success actions and return input available during the short star expansion', async () => {
    fakeClock()
    const io = terminal({ width: 120, height: 30 })
    const target = await directory()
    const plan = await scaffoldPlan('weapp-vite', target)
    const hub = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    workbench.showCreateSuccess(plan)
    const beginning = workbench.frame().join('\n')
    expect(beginning).toContain('[ PROJECT CREATED ]')
    expect(beginning).toContain('I install · S scripts · D doctor')
    await vi.advanceTimersByTimeAsync(350)
    expect(workbench.frame().join('\n')).not.toBe(beginning)
    io.key('return')
    expect(workbench.screen).toBe(workbench.hall)
    io.key('q', 'q')
    await hub
  })

  it.each([[120, 30], [80, 24], [44, 18]])('preserves long result paths and action guidance through scrolling at %i × %i', async (width, height) => {
    fakeClock()
    const io = terminal({ motion: false, width, height })
    io.ctx.color = true
    const target = await directory()
    const plan = await scaffoldPlan('weapp-vite', target, { template: 'react' })
    plan.directory = `/中文👩🏽‍💻/${'long-parent/'.repeat(18)}demo parent/my-app`
    const hub = runHub(io.ctx, vi.fn())
    await nextFrame()
    const workbench = io.ctx.resources.workbench!
    workbench.showCreateSuccess(plan)
    if (workbench.screen.type !== 'result') {
      throw new Error('Expected a success result')
    }
    const screen = workbench.screen
    const wide = width >= 88 && height >= 24
    const start = !wide && height >= 24 ? 8 : 3
    const end = height - 2
    const rows = () => workbench.frame().slice(start, end).map((row) => {
      const text = row.replace(colorPattern, '').slice(1)
      return (wide ? clipLine(text, 38) : text).trimEnd()
    })
    const collected: string[] = []
    for (let index = 0; index < 200; index++) {
      const visible = rows()
      const previous = screen.scroll || 0
      io.key('down')
      workbench.frame()
      if (screen.scroll === previous) {
        collected.push(...visible)
        break
      }
      collected.push(visible[0])
    }
    const text = collected.join('').replaceAll(/\s/g, '')
    expect(text).toContain(`Projectcreated:${plan.directory}`.replaceAll(/\s/g, ''))
    expect(text).toContain('Inspectthegeneratedconfigurationwithdoctor.')
    expect(text).toContain('Iinstall·Sscripts·Ddoctor;reviewtheconfirmationbeforeexecution.')
    expect(text).not.toContain('\\u001b')
    const bottom = screen.scroll
    io.key('down')
    await nextFrame()
    expect(screen.scroll).toBe(bottom)
    io.output.rows = 40
    io.output.emit('resize')
    await nextFrame()
    expect(screen.scroll).toBeLessThanOrEqual(bottom!)
    io.key('return')
    io.key('q', 'q')
    await hub
  })

  it('keeps the editable name tail and metadata status visible in a narrow terminal', async () => {
    fakeClock()
    const io = terminal({ motion: false, width: 44, height: 18 })
    const wizard = runCreateWizard(io.ctx)
    io.key('text', `/中文👩🏽‍💻/${'long-parent/'.repeat(12)}my-app`)
    const workbench = io.ctx.resources.workbench!
    workbench.setCreateProgress({ phase: 'ready', packageName: 'create-weapp-vite', cwd: '/tmp', version: '1.2.3', queryElapsedMs: 312 })
    await nextFrame()
    expect(io.output.frame()).toContain('…')
    expect(io.output.frame()).toContain('my-app▏')
    expect(io.output.frame()).toContain('1.2.3 · 312ms')
    expect(io.output.frame()).toContain('Esc cancel')
    io.key('escape')
    expect(await wizard).toBeNull()
  })

  it('keeps validation errors editable and restores the terminal on Ctrl+C', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const result = runCreateWizard(io.ctx)
    io.key('text', './invalid name')
    io.key('return')
    await nextFrame()
    expect(io.output.frame()).toContain('NEW PROJECT DIRECTORY')
    expect(io.output.frame()).toContain('directory name')
    io.key('c', '\u0003', { ctrl: true })
    expect(await result).toBeNull()
    expect(io.ctx.cancelledCode).toBe(130)
    expect(io.input.isRaw).toBe(false)
  })

  it.each(['selector', 'wizard'])('rejects an output failure during a pending %s without hanging', async (kind) => {
    const io = terminal({ motion: false })
    io.output.write.mockImplementation(() => {
      throw new Error('broken terminal')
    })
    const result = kind === 'wizard' ? runCreateWizard(io.ctx) : selectProjects(io.ctx, io.ctx.catalog!)
    await expect(result).rejects.toThrow('broken terminal')
    expect(io.ctx.resources.workbench!).toBeUndefined()
    expect(io.input.isRaw).toBe(false)
    expect(io.input.listenerCount('keypress')).toBe(0)
    expect(io.output.listenerCount('resize')).toBe(0)
  })
})

describe('effects and gameplay interactions', () => {
  it('switches static effects without starting an animation timer', async () => {
    fakeClock()
    const io = terminal({ motion: false })
    const result = runFx(io.ctx, ['logo'])
    expect(vi.getTimerCount()).toBe(0)
    io.key('space', ' ')
    await nextFrame()
    expect(io.output.frame()).not.toContain('LIVE')
    io.key('right')
    await nextFrame()
    expect(io.output.frame()).toContain('ORBIT')
    io.key('r', 'r')
    io.key('q', 'q')
    expect(await result).toBe(0)
  })

  it('pauses gameplay on resize and closes on interruption', async () => {
    fakeClock()
    const io = terminal()
    const result = runSnake(io.ctx, ['snake'])
    io.output.columns = 30
    io.output.emit('resize')
    await nextFrame()
    expect(io.output.frame()).toContain('PAUSED')
    io.output.columns = 10
    io.output.emit('resize')
    await nextFrame()
    expect(io.output.frame()).toContain('Window')
    io.key('c', '\u0003', { ctrl: true })
    expect(await result).toBe(130)
    expect(vi.getTimerCount()).toBe(0)
    expect(io.input.isRaw).toBe(false)
  })

  it.each(['snake', 'matrix'])('%s keeps its speed through repeated input and wall-clock changes', async (kind) => {
    fakeClock()
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
      const frame = io.output.frame()
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
  it('blends focused project colors smoothly and retains focus cues without color', () => {
    const options = { width: 90, height: 24, time: 2, catalog: [{ slug: 'first', accent: '#ff0000' }, { slug: 'second', accent: '#0000ff' }], logo: { palette: Array.from<string>({ length: 4 }).fill('#00ff00') }, color: true }
    const rgb = new RegExp(`${escape}\\[38;2;(\\d+);(\\d+);(\\d+)m`, 'g')
    const colors = (focus: number) => [...renderScene('orbit', { ...options, focus }).join('').matchAll(rgb)].map(match => match.slice(1).map(Number))
    expect(colors(0).some(([red, _green, blue]) => red > 0 && blue === 0)).toBe(true)
    expect(colors(1).some(([red, _green, blue]) => blue > 0 && red === 0)).toBe(true)
    expect(colors(0.5).some(([red, _green, blue]) => red > 0 && red === blue)).toBe(true)
    expect(renderScene('orbit', { ...options, color: false, focus: 0 })).not.toEqual(renderScene('orbit', { ...options, color: false, focus: 1 }))
  })

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
    const game: SnakeState = {
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
    const game: SnakeState = {
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
