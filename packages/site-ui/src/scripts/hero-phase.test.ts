import { describe, expect, it, vi } from 'vitest'
import { createActiveClock } from './hero-particle-motion'
import { heroEntranceState, readHeroPhase, setHeroPhase, subscribeHeroPhase } from './hero-phase'

function createScope() {
  const attributes = new Map<string, string>()
  return Object.assign(new EventTarget(), {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  }) as unknown as HTMLElement
}

describe('hero opening phase', () => {
  it('defaults to stars and immediately sends the current phase to new subscribers', () => {
    const scope = createScope()
    const initial = vi.fn()
    const removeInitial = subscribeHeroPhase(scope, initial)
    expect(initial).toHaveBeenCalledExactlyOnceWith('stars')
    setHeroPhase(scope, 'assembling')
    const current = vi.fn()
    const removeCurrent = subscribeHeroPhase(scope, current)
    expect(current).toHaveBeenCalledExactlyOnceWith('assembling')
    expect(readHeroPhase(scope)).toBe('assembling')
    removeInitial()
    removeCurrent()
  })

  it('broadcasts changes once, isolates hero scopes and removes listeners', () => {
    const first = createScope()
    const second = createScope()
    const listener = vi.fn()
    const unrelated = vi.fn()
    const remove = subscribeHeroPhase(first, listener)
    const removeUnrelated = subscribeHeroPhase(second, unrelated)
    setHeroPhase(first, 'stars')
    setHeroPhase(first, 'assembling')
    setHeroPhase(first, 'assembling')
    setHeroPhase(first, 'ready')
    expect(listener.mock.calls).toEqual([['stars'], ['assembling'], ['ready']])
    expect(unrelated.mock.calls).toEqual([['stars']])
    remove()
    setHeroPhase(first, 'stars')
    expect(listener).toHaveBeenCalledTimes(3)
    expect(readHeroPhase(first)).toBe('stars')
    removeUnrelated()
  })

  it('starts assembly immediately and delays planet reveal until the wordmark is complete', () => {
    expect(heroEntranceState(0)).toEqual({ progress: 0, phase: 'assembling', reveal: 0, settled: false })
    expect(heroEntranceState(750)).toEqual({ progress: 0.5, phase: 'assembling', reveal: 0, settled: false })
    expect(heroEntranceState(1499).phase).toBe('assembling')
    expect(heroEntranceState(1500)).toEqual({ progress: 1, phase: 'ready', reveal: 0, settled: false })
    expect(heroEntranceState(1660)).toEqual({ progress: 1, phase: 'ready', reveal: 0.5, settled: false })
    expect(heroEntranceState(1820)).toEqual({ progress: 1, phase: 'ready', reveal: 1, settled: true })
    expect(heroEntranceState(-100).progress).toBe(0)
    expect(heroEntranceState(10_000).reveal).toBe(1)
  })

  it('freezes the reveal through inactive wall-clock time and resumes the same phase', () => {
    const clock = createActiveClock(1660)
    clock.setRunning(false, 100)
    clock.advance(60_100)
    expect(heroEntranceState(clock.current()).reveal).toBe(0.5)
    clock.setRunning(true, 60_100)
    expect(heroEntranceState(clock.advance(60_180)).reveal).toBe(0.75)
    expect(heroEntranceState(clock.advance(60_260)).settled).toBe(true)
  })
})
