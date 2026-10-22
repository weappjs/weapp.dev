import type { EventEmitter } from 'node:events'
import type { Key } from 'node:readline'
import type { CliContext, CliInput, CliOutput } from '../types.js'
import process from 'node:process'
import { emitKeypressEvents } from 'node:readline'
// eslint-disable-next-line e18e/ban-dependencies -- Version 7 preserves the CLI's Node 18 baseline.
import stringWidth from 'string-width'

// Node's type declaration requires a full readline Interface, while its decoder
// only reads escapeCodeTimeout here. Keep the runtime option on this API boundary.
const emitTerminalKeypressEvents = emitKeypressEvents as unknown as (input: CliInput, options: { escapeCodeTimeout: number }) => void
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
}

export function clipLine(value: unknown, columns: number): string {
  let output = ''
  let width = 0
  const escape = String.fromCharCode(27)
  const tokens = (String(value).match(new RegExp(`${escape}\\[[\\d;]*m|[^${escape}]+`, 'gu')) || [])
    .flatMap(token => token.startsWith('\u001B[') ? [token] : graphemes(token))
  for (const token of tokens) {
    if (token.startsWith('\u001B[')) {
      output += token
      continue
    }
    const size = stringWidth(token)
    if (width + size > columns) {
      break
    }
    output += token
    width += size
  }
  return `${output}${output.includes('\u001B[') ? '\u001B[0m' : ''}`
}

export function padLine(value: string, columns: number): string {
  const clipped = clipLine(value, columns)
  return `${clipped}${' '.repeat(Math.max(0, columns - stringWidth(clipped)))}`
}

export type TerminalFinish<T = number> = (value?: T | number) => void
export type TerminalFrame = readonly string[] | (() => readonly string[])
export interface TerminalController<T = number> {
  start?: (finish: TerminalFinish<T>, session: TerminalSession) => void
  key?: (value: string, key: Key, finish: TerminalFinish<T>, session: TerminalSession) => void | Promise<unknown>
  resize?: (finish: TerminalFinish<T>, session: TerminalSession) => void
  render?: (session: TerminalSession) => void
  tick?: (finish: TerminalFinish<T>, session: TerminalSession) => void | boolean
  cancel?: (reason: unknown) => void
  interval?: number
}
interface TerminalSessionOptions {
  alternateScreen?: boolean
  signals?: Pick<EventEmitter, 'on' | 'removeListener'>
}

/** One input owner and one paced, backpressure-aware output queue. */
export class TerminalSession {
  readonly ctx: CliContext
  readonly input: CliInput
  readonly output: CliOutput
  readonly signals: Pick<EventEmitter, 'on' | 'removeListener'>
  readonly alternateScreen: boolean
  readonly timers: Set<ReturnType<typeof setTimeout>>
  readonly wasRaw: boolean
  readonly wasPaused: boolean
  closed: boolean
  started: boolean
  suspended: boolean
  lines: string[]
  pending: TerminalFrame | null
  lastFlush: number
  blocked: boolean
  reset: boolean
  externalInterrupt?: (signal: 'SIGINT' | 'SIGTERM') => boolean
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private drainListener: (() => void) | null = null
  private interruptListener?: () => void
  private terminateListener?: () => void
  private keyListener: (value: string, key?: Key) => void = () => {}
  private resizeListener: () => void = () => {}
  private failure?: (error: unknown) => void

  constructor(ctx: CliContext, { alternateScreen = true, signals = process }: TerminalSessionOptions = {}) {
    this.ctx = ctx
    this.input = ctx.stdin
    this.output = ctx.stdout
    this.signals = signals
    this.alternateScreen = alternateScreen
    this.timers = new Set()
    this.closed = false
    this.started = false
    this.suspended = false
    this.wasRaw = Boolean(this.input.isRaw)
    this.wasPaused = 'readableFlowing' in this.input ? this.input.readableFlowing !== true : (this.input.isPaused?.() ?? true)
    this.lines = []
    this.pending = null
    this.lastFlush = -Infinity
    this.blocked = false
    this.reset = true
  }

  dimensions() {
    return {
      width: Math.max(1, Math.min(160, (this.output.columns || 80) - 1)),
      height: Math.max(1, Math.min(50, this.output.rows || 24)),
    }
  }

  render(frame: TerminalFrame) {
    if (this.closed) {
      return
    }
    // Keep only the latest request. Its layout is evaluated after pacing and
    // backpressure gates, using the dimensions at the time it is displayed.
    this.pending = frame
    this.schedule()
  }

  schedule() {
    if (!this.started || this.closed || this.suspended || this.blocked || this.flushTimer || !this.pending) {
      return
    }
    const delay = Math.max(0, 50 - (performance.now() - this.lastFlush))
    if (delay === 0) {
      this.flush()
      return
    }
    this.flushTimer = this.timeout(() => {
      this.flushTimer = null
      this.flush()
    }, delay)
  }

  flush() {
    try {
      this.writeFrame()
    }
    catch (error) {
      if (this.failure) {
        this.failure(error)
      }
      else {
        throw error
      }
    }
  }

  writeFrame() {
    if (this.closed || this.suspended || this.blocked || !this.pending) {
      return
    }
    const frame = this.pending
    this.pending = null
    const { width, height } = this.dimensions()
    const next = (typeof frame === 'function' ? frame() : frame).slice(0, height).map(line => clipLine(line, width))
    let output = this.reset ? '\u001B[H\u001B[2J' : ''
    for (let row = 0; row < Math.max(this.lines.length, next.length); row++) {
      if (this.reset || this.lines[row] !== next[row]) {
        output += `\u001B[${row + 1};1H${next[row] || ''}\u001B[K`
      }
    }
    this.reset = false
    this.lines = next
    this.lastFlush = performance.now()
    if (!output) {
      return
    }
    if (this.output.write(output) === false) {
      this.blocked = true
      this.drainListener = () => {
        this.blocked = false
        this.drainListener = null
        this.schedule()
      }
      this.output.once?.('drain', this.drainListener)
    }
  }

  interval(callback: () => void, milliseconds = 50) {
    const timer = setInterval(callback, Math.max(50, milliseconds))
    this.timers.add(timer)
    return timer
  }

  timeout(callback: () => void, milliseconds: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      try {
        callback()
      }
      catch (error) {
        if (this.failure) {
          this.failure(error)
        }
        else {
          throw error
        }
      }
    }, milliseconds)
    this.timers.add(timer)
    return timer
  }

  attachInput() {
    this.input.on?.('keypress', this.keyListener)
    this.output.on?.('resize', this.resizeListener)
    this.input.setRawMode?.(true)
    this.input.resume?.()
  }

  detachInput() {
    this.input.removeListener?.('keypress', this.keyListener)
    this.output.removeListener?.('resize', this.resizeListener)
    this.input.setRawMode?.(this.wasRaw)
    if (this.wasPaused) {
      this.input.pause?.()
    }
    else {
      this.input.resume?.()
    }
  }

  open() {
    if (this.started) {
      return
    }
    this.started = true
    // Keep a lone Escape responsive while allowing split arrow-key sequences.
    emitTerminalKeypressEvents(this.input, { escapeCodeTimeout: 50 })
    this.attachInput()
    this.output.write(`${this.alternateScreen ? '\u001B[?1049h' : ''}\u001B[?25l`)
  }

  suspend() {
    if (this.closed || this.suspended) {
      return
    }
    this.suspended = true
    this.detachInput()
    this.output.write(`\u001B[0m\u001B[?25h${this.alternateScreen ? '\u001B[?1049l' : ''}`)
  }

  resume() {
    if (this.closed || !this.suspended) {
      return
    }
    this.suspended = false
    this.attachInput()
    this.reset = true
    this.lines = []
    this.output.write(`${this.alternateScreen ? '\u001B[?1049h' : ''}\u001B[?25l`)
    this.schedule()
  }

  close() {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.pending = null
    this.flushTimer = null
    this.externalInterrupt = undefined
    if (this.drainListener) {
      this.output.removeListener?.('drain', this.drainListener)
    }
    if (this.interruptListener) {
      this.signals.removeListener('SIGINT', this.interruptListener)
    }
    if (this.terminateListener) {
      this.signals.removeListener('SIGTERM', this.terminateListener)
    }
    if (!this.started) {
      return
    }
    try {
      this.detachInput()
    }
    finally {
      if (!this.suspended) {
        this.output.write(`\u001B[0m\u001B[?25h${this.alternateScreen ? '\u001B[?1049l' : ''}`)
      }
    }
  }

  run<T = number>(controller: TerminalController<T>): Promise<T | number> {
    return new Promise<T | number>((resolve, reject) => {
      const fail = (error: unknown) => {
        try {
          this.close()
        }
        catch { /* Preserve the controller failure. */ }
        try {
          controller.cancel?.(error)
        }
        catch { /* A cleanup callback must not replace the failure. */ }
        reject(error)
      }
      this.failure = fail
      const finish: TerminalFinish<T> = (value = 0) => {
        if (this.closed) {
          return
        }
        try {
          this.close()
          resolve(value)
        }
        catch (error) {
          reject(error)
        }
      }
      const guarded = <Args extends unknown[]>(callback: ((...args: Args) => void | Promise<unknown>) | undefined) => (...args: Args) => {
        if (this.closed || this.suspended) {
          return
        }
        try {
          const value = callback?.(...args)
          if (value instanceof Promise) {
            void value.catch(fail)
          }
        }
        catch (error) {
          fail(error)
        }
      }
      const cancel = (code: number) => {
        this.ctx.cancelled = true
        this.ctx.cancelledCode = code
        controller.cancel?.(code)
        finish(code)
      }
      this.keyListener = guarded((value: string, key: Key = {}) => {
        if (key.ctrl && key.name === 'c') {
          cancel(130)
        }
        else {
          return controller.key?.(value, key, finish, this)
        }
      })
      this.resizeListener = guarded(() => {
        this.reset = true
        controller.resize?.(finish, this)
        controller.render?.(this)
      })
      const signal = (name: 'SIGINT' | 'SIGTERM', code: number) => {
        try {
          if (!this.suspended || !this.externalInterrupt?.(name)) {
            cancel(code)
          }
        }
        catch (error) {
          fail(error)
        }
      }
      this.interruptListener = () => signal('SIGINT', 130)
      this.terminateListener = () => signal('SIGTERM', 143)
      this.signals.on('SIGINT', this.interruptListener)
      this.signals.on('SIGTERM', this.terminateListener)
      try {
        this.open()
        controller.start?.(finish, this)
        if (this.closed) {
          return
        }
        controller.render?.(this)
        if (controller.tick) {
          this.interval(guarded(() => {
            if (controller.tick?.(finish, this) !== false && !this.closed) {
              controller.render?.(this)
            }
          }), controller.interval)
        }
      }
      catch (error) {
        fail(error)
      }
    })
  }
}
