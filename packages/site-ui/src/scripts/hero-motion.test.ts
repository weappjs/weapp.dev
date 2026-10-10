import { afterEach, describe, expect, it, vi } from 'vitest'
import { readHeroMotionPaused, readHeroReplayVersion, requestHeroReplay, setHeroMotionPaused, subscribeHeroMotionPaused, subscribeHeroReplay } from './hero-motion'
import { createActiveClock } from './hero-particle-motion'
import { readHeroPhase } from './hero-phase'
import { createPlanetController } from './hero-planets'

function createScope() {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  return Object.assign(new EventTarget(), {
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute(name: string, value: string) {
      attributes.set(name, value)
    },
    removeAttribute(name: string) {
      attributes.delete(name)
    },
    toggleAttribute(name: string, force: boolean) {
      if (force) {
        attributes.set(name, '')
      }
      else {
        attributes.delete(name)
      }
      return attributes.has(name)
    },
    style: {
      getPropertyValue: (name: string) => properties.get(name) ?? '',
      setProperty(name: string, value: string) {
        properties.set(name, value)
      },
      removeProperty(name: string) {
        const previous = properties.get(name) ?? ''
        properties.delete(name)
        return previous
      },
    },
  }) as unknown as HTMLElement
}

describe('shared hero user pause', () => {
  afterEach(() => vi.useRealTimers())

  it('notifies a new subscriber immediately with the current scoped intent', () => {
    const scope = createScope()
    const first = vi.fn()
    const unbindFirst = subscribeHeroMotionPaused(scope, first)
    expect(first).toHaveBeenCalledExactlyOnceWith(false)
    setHeroMotionPaused(scope, true)
    const second = vi.fn()
    const unbindSecond = subscribeHeroMotionPaused(scope, second)
    expect(second).toHaveBeenCalledExactlyOnceWith(true)
    expect(readHeroMotionPaused(scope)).toBe(true)
    unbindFirst()
    unbindSecond()
  })

  it('broadcasts each changed value once and ignores repeated values', () => {
    const scope = createScope()
    const listener = vi.fn()
    const unbind = subscribeHeroMotionPaused(scope, listener)
    setHeroMotionPaused(scope, false)
    setHeroMotionPaused(scope, true)
    setHeroMotionPaused(scope, true)
    setHeroMotionPaused(scope, false)
    setHeroMotionPaused(scope, false)
    expect(listener.mock.calls).toEqual([[false], [true], [false]])
    expect(readHeroMotionPaused(scope)).toBe(false)
    unbind()
  })

  it('isolates separate hero scopes and releases subscribers without erasing user intent', () => {
    const firstScope = createScope()
    const secondScope = createScope()
    const first = vi.fn()
    const second = vi.fn()
    const unbindFirst = subscribeHeroMotionPaused(firstScope, first)
    const unbindSecond = subscribeHeroMotionPaused(secondScope, second)
    setHeroMotionPaused(firstScope, true)
    expect(first.mock.calls).toEqual([[false], [true]])
    expect(second.mock.calls).toEqual([[false]])
    unbindFirst()
    unbindFirst()
    expect(readHeroMotionPaused(firstScope)).toBe(true)
    setHeroMotionPaused(firstScope, false)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(1)
    unbindSecond()
  })

  it('keeps automatic and manual planet attention separate from shared user pause', () => {
    vi.useFakeTimers()
    const scope = createScope()
    const controller = createPlanetController(['vite', 'panda'], vi.fn(), {
      desktop: true,
      reducedMotion: false,
      visible: true,
      pageHidden: false,
      revealed: true,
    }, readHeroMotionPaused(scope))
    const listener = vi.fn((paused: boolean) => controller.setPaused(paused))
    const unbind = subscribeHeroMotionPaused(scope, listener)
    vi.advanceTimersByTime(3000)
    controller.setHover('panda')
    controller.setFocus('vite')
    controller.setFocus(null)
    controller.setHover(null)
    vi.advanceTimersByTime(3000)
    expect(listener.mock.calls).toEqual([[false]])
    expect(readHeroMotionPaused(scope)).toBe(false)
    setHeroMotionPaused(scope, true)
    expect(listener.mock.calls).toEqual([[false], [true]])
    expect(vi.getTimerCount()).toBe(0)
    unbind()
    controller.destroy()
  })

  it('reuses stored intent when a renderer reconnects after pausing without WebGL', () => {
    vi.useFakeTimers()
    const scope = createScope()
    setHeroMotionPaused(scope, true)
    const createController = () => createPlanetController(['vite'], vi.fn(), {
      desktop: true,
      reducedMotion: false,
      visible: true,
      pageHidden: false,
      revealed: true,
    }, readHeroMotionPaused(scope))
    const first = createController()
    const unbindFirst = subscribeHeroMotionPaused(scope, paused => first.setPaused(paused))
    first.destroy()
    unbindFirst()
    const second = createController()
    const unbindSecond = subscribeHeroMotionPaused(scope, paused => second.setPaused(paused))
    expect(readHeroMotionPaused(scope)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    setHeroMotionPaused(scope, false)
    expect(vi.getTimerCount()).toBe(1)
    unbindSecond()
    second.destroy()
  })
})

describe('shared hero replay requests', () => {
  it('persists counters and immediate notifications independently in each hero scope', () => {
    const firstScope = createScope()
    const secondScope = createScope()
    const first = vi.fn()
    const second = vi.fn()
    const unbindFirst = subscribeHeroReplay(firstScope, first)
    const unbindSecond = subscribeHeroReplay(secondScope, second)
    expect(readHeroReplayVersion(firstScope)).toBe(0)
    expect(first).toHaveBeenCalledExactlyOnceWith(0)
    expect(second).toHaveBeenCalledExactlyOnceWith(0)
    expect(requestHeroReplay(firstScope)).toBe(1)
    expect(requestHeroReplay(firstScope)).toBe(2)
    expect(firstScope.getAttribute('data-hero-replay-version')).toBe('2')
    expect(first.mock.calls).toEqual([[0], [1], [2]])
    expect(second.mock.calls).toEqual([[0]])
    requestHeroReplay(secondScope)
    expect(readHeroReplayVersion(firstScope)).toBe(2)
    expect(readHeroReplayVersion(secondScope)).toBe(1)
    unbindFirst()
    unbindSecond()
  })

  it('cleans up listeners idempotently and exposes the stored request after reconnecting', () => {
    const scope = createScope()
    scope.setAttribute('data-hero-replay-version', '7')
    const first = vi.fn()
    const unbindFirst = subscribeHeroReplay(scope, first)
    expect(first).toHaveBeenCalledExactlyOnceWith(7)
    unbindFirst()
    unbindFirst()
    requestHeroReplay(scope)
    expect(first).toHaveBeenCalledTimes(1)
    const second = vi.fn()
    const unbindSecond = subscribeHeroReplay(scope, second)
    expect(second).toHaveBeenCalledExactlyOnceWith(8)
    requestHeroReplay(scope)
    expect(second.mock.calls).toEqual([[8], [9]])
    unbindSecond()
  })

  it('normalizes invalid stored numbers and keeps overflowed requests within safe integers', () => {
    const scope = createScope()
    for (const invalid of ['-1', '1.5', 'NaN', 'Infinity', '9007199254740992', 'invalid']) {
      scope.setAttribute('data-hero-replay-version', invalid)
      expect(readHeroReplayVersion(scope)).toBe(0)
      expect(requestHeroReplay(scope)).toBe(1)
      expect(Number.isSafeInteger(readHeroReplayVersion(scope))).toBe(true)
    }
    scope.setAttribute('data-hero-replay-version', '-0')
    expect(readHeroReplayVersion(scope)).toBe(0)
    scope.setAttribute('data-hero-replay-version', String(Number.MAX_SAFE_INTEGER - 1))
    expect(requestHeroReplay(scope)).toBe(Number.MAX_SAFE_INTEGER)
    expect(requestHeroReplay(scope)).toBe(1)
    expect(readHeroReplayVersion(scope)).toBe(1)
  })

  it('resets presentation and active time before resuming a paused hero', () => {
    const scope = createScope()
    scope.setAttribute('data-hero-phase', 'ready')
    scope.setAttribute('data-particles-active', '')
    scope.setAttribute('data-particles-ready', '')
    scope.style.setProperty('--hero-planet-reveal', '1')
    setHeroMotionPaused(scope, true)
    const clock = createActiveClock(2520)
    clock.setRunning(false, 100)
    const order: Array<{ event: string, paused: boolean, elapsed: number, phase: string, active: boolean, ready: boolean, reveal: string }> = []
    const record = (event: string) => order.push({
      event,
      paused: readHeroMotionPaused(scope),
      elapsed: clock.current(),
      phase: readHeroPhase(scope),
      active: scope.hasAttribute('data-particles-active'),
      ready: scope.hasAttribute('data-particles-ready'),
      reveal: scope.style.getPropertyValue('--hero-planet-reveal'),
    })
    scope.addEventListener('hero-phase-change', () => record('phase'))
    const unbindReplay = subscribeHeroReplay(scope, (version) => {
      if (version > 0) {
        clock.reset(0, 20_000)
        record('replay')
      }
    })
    scope.addEventListener('hero-motion-change', () => {
      clock.setRunning(!readHeroMotionPaused(scope), 20_000)
      record('resume')
    })
    requestHeroReplay(scope)
    expect(order).toEqual([
      { event: 'phase', paused: true, elapsed: 2520, phase: 'logo', active: false, ready: false, reveal: '' },
      { event: 'replay', paused: true, elapsed: 0, phase: 'logo', active: false, ready: false, reveal: '' },
      { event: 'resume', paused: false, elapsed: 0, phase: 'logo', active: false, ready: false, reveal: '' },
    ])
    expect(clock.advance(20_016)).toBe(16)
    unbindReplay()
  })

  it('supports a consumer disconnecting and reconnecting during a replay notification', () => {
    const scope = createScope()
    const first: number[] = []
    const second: number[] = []
    let seen = -1
    let unbindFirst = () => {}
    let unbindSecond = () => {}
    unbindFirst = subscribeHeroReplay(scope, (version) => {
      first.push(version)
      if (version === 1) {
        unbindFirst()
        unbindSecond = subscribeHeroReplay(scope, (next) => {
          if (seen !== next) {
            seen = next
            second.push(next)
          }
        })
      }
    })
    requestHeroReplay(scope)
    requestHeroReplay(scope)
    expect(first).toEqual([0, 1])
    expect(second).toEqual([1, 2])
    unbindSecond()
    requestHeroReplay(scope)
    expect(second).toEqual([1, 2])
  })

  it('retains the latest version when another replay is requested reentrantly', () => {
    const scope = createScope()
    const versions: number[] = []
    const unbind = subscribeHeroReplay(scope, (version) => {
      versions.push(version)
      if (version === 1) {
        requestHeroReplay(scope)
      }
    })
    requestHeroReplay(scope)
    expect(versions).toEqual([0, 1, 2])
    expect(readHeroReplayVersion(scope)).toBe(2)
    expect(readHeroMotionPaused(scope)).toBe(false)
    unbind()
  })
})
