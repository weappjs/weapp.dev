import { afterEach, describe, expect, it, vi } from 'vitest'
import { readHeroMotionPaused, setHeroMotionPaused, subscribeHeroMotionPaused } from './hero-motion'
import { createPlanetController } from './hero-planets'

function createScope() {
  const attributes = new Set<string>()
  return Object.assign(new EventTarget(), {
    hasAttribute: (name: string) => attributes.has(name),
    toggleAttribute(name: string, force: boolean) {
      if (force) {
        attributes.add(name)
      }
      else {
        attributes.delete(name)
      }
      return attributes.has(name)
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
