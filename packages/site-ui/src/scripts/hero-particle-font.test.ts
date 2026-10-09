import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWordmarkFont } from './hero-particle-font'

const syneFace = { family: '"Syne"', status: 'loaded' as const, weight: '700' }

afterEach(() => {
  vi.useRealTimers()
})

describe('hero brand font readiness', () => {
  it('waits for a real loaded Syne face at weight 700 for the deployment wordmark', async () => {
    const load = vi.fn().mockResolvedValue([syneFace])
    expect(await loadWordmarkFont({ load }, 'weapp.js.org')).toBe(true)
    expect(load).toHaveBeenCalledWith('700 100px "Syne"', 'weapp.js.org')
  })

  it('rejects a missing API, an empty match, a different family and a failed face', async () => {
    expect(await loadWordmarkFont(undefined, 'weapp.dev')).toBe(false)
    expect(await loadWordmarkFont({ load: async () => [] }, 'weapp.dev')).toBe(false)
    expect(await loadWordmarkFont({ load: async () => [{ ...syneFace, family: 'Arial' }] }, 'weapp.dev')).toBe(false)
    expect(await loadWordmarkFont({ load: async () => [{ ...syneFace, status: 'error' }] }, 'weapp.dev')).toBe(false)
    expect(await loadWordmarkFont({ load: async () => [{ ...syneFace, weight: '400' }] }, 'weapp.dev')).toBe(false)
    expect(await loadWordmarkFont({ load: async () => [{ ...syneFace, weight: '400 800' }] }, 'weapp.dev')).toBe(true)
  })

  it('settles font load rejection and synchronous API errors without leaking a timer', async () => {
    vi.useFakeTimers()
    expect(await loadWordmarkFont({
      load: async () => {
        throw new Error('Font failed')
      },
    }, 'weapp.dev')).toBe(false)
    expect(await loadWordmarkFont({
      load: () => {
        throw new Error('Font API failed')
      },
    }, 'weapp.dev')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('expires at three seconds and ignores a successful face that arrives late', async () => {
    vi.useFakeTimers()
    let complete!: (faces: typeof syneFace[]) => void
    const load = () => new Promise<typeof syneFace[]>((resolve) => {
      complete = resolve
    })
    const ready = loadWordmarkFont({ load }, 'weapp.dev')
    const settled = vi.fn()
    void ready.then(settled)
    await vi.advanceTimersByTimeAsync(2999)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await ready).toBe(false)
    complete([syneFace])
    await Promise.resolve()
    expect(settled).toHaveBeenCalledExactlyOnceWith(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an old mount without affecting a new mount using the same font request', async () => {
    vi.useFakeTimers()
    let complete!: (faces: typeof syneFace[]) => void
    const load = vi.fn(() => new Promise<typeof syneFace[]>((resolve) => {
      complete = resolve
    }))
    const abort = new AbortController()
    const oldMount = loadWordmarkFont({ load }, 'weapp.dev', abort.signal)
    abort.abort()
    expect(await oldMount).toBe(false)
    const newMount = loadWordmarkFont({ load }, 'weapp.dev')
    complete([syneFace])
    expect(await newMount).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(load).toHaveBeenCalledTimes(2)
    expect(await loadWordmarkFont({ load }, 'weapp.dev', abort.signal)).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
