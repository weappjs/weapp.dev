import process from 'node:process'
import { emitKeypressEvents } from 'node:readline'
// eslint-disable-next-line e18e/ban-dependencies -- Version 7 preserves the CLI's Node 18 baseline.
import stringWidth from 'string-width'

/** Clip by terminal columns while retaining only our SGR color sequences. */
export function clipLine(value, columns) {
  let output = ''
  let width = 0
  const escape = String.fromCharCode(27)
  const tokens = String(value).match(new RegExp(`${escape}\\[[\\d;]*m|[^${escape}]`, 'gu')) || []
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

/** Own all terminal changes and release them before resolving a controller. */
export class TerminalSession {
  constructor(ctx, { alternateScreen = true, signals = process } = {}) {
    this.ctx = ctx
    this.input = ctx.stdin
    this.output = ctx.stdout
    this.signals = signals
    this.alternateScreen = alternateScreen
    this.timers = new Set()
    this.closed = false
    this.started = false
    this.wasRaw = Boolean(this.input.isRaw)
    // An untouched Node stdin has readableFlowing=null, although isPaused()
    // says false. Treat that idle state as paused so a child can inherit its
    // file descriptor without the parent consuming the child's keystrokes.
    this.wasPaused = 'readableFlowing' in this.input ? this.input.readableFlowing !== true : (this.input.isPaused?.() ?? true)
    this.frame = ''
  }

  dimensions() {
    return {
      width: Math.max(1, Math.min(120, (this.output.columns || 80) - 1)),
      height: Math.max(1, Math.min(45, this.output.rows || 24)),
    }
  }

  render(lines) {
    const { width, height } = this.dimensions()
    const frame = lines.slice(0, height).map(line => clipLine(line, width)).join('\r\n')
    if (frame === this.frame || this.closed) {
      return
    }
    this.frame = frame
    this.output.write(`\u001B[H${frame}\u001B[J`)
  }

  interval(callback, milliseconds = 50) {
    const timer = setInterval(callback, Math.max(50, milliseconds))
    this.timers.add(timer)
    return timer
  }

  timeout(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds)
    this.timers.add(timer)
    return timer
  }

  open() {
    if (this.started) {
      return
    }
    this.started = true
    emitKeypressEvents(this.input)
    this.input.setRawMode?.(true)
    this.input.resume?.()
    this.output.write(`${this.alternateScreen ? '\u001B[?1049h' : ''}\u001B[?25l`)
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
    if (this.keyListener) {
      this.input.removeListener('keypress', this.keyListener)
    }
    if (this.resizeListener) {
      this.output.removeListener('resize', this.resizeListener)
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
      this.input.setRawMode?.(this.wasRaw)
    }
    finally {
      if (this.wasPaused) {
        this.input.pause?.()
      }
      else {
        this.input.resume?.()
      }
      this.output.write(`\u001B[0m\u001B[?25h${this.alternateScreen ? '\u001B[?1049l' : ''}`)
    }
  }

  run(controller) {
    return new Promise((resolve, reject) => {
      const finish = (value = 0) => {
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
      const guarded = callback => (...args) => {
        if (this.closed) {
          return
        }
        try {
          callback?.(...args)
        }
        catch (error) {
          try {
            this.close()
          }
          catch { /* Preserve the controller's original failure. */ }
          reject(error)
        }
      }
      const cancel = (code) => {
        this.ctx.cancelled = true
        this.ctx.cancelledCode = code
        finish(code)
      }
      this.keyListener = guarded((value, key = {}) => {
        if (key.ctrl && key.name === 'c') {
          cancel(130)
        }
        else {
          controller.key?.(value, key, finish, this)
        }
      })
      this.resizeListener = guarded(() => {
        this.frame = ''
        controller.resize?.(finish, this)
        controller.render?.(this)
      })
      this.interruptListener = () => cancel(130)
      this.terminateListener = () => cancel(143)
      this.input.on('keypress', this.keyListener)
      this.output.on('resize', this.resizeListener)
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
            controller.tick(finish, this)
            controller.render?.(this)
          }), controller.interval)
        }
      }
      catch (error) {
        try {
          this.close()
        }
        catch { /* Preserve the startup failure. */ }
        reject(error)
      }
    })
  }
}
