import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBuildChannel } from './build-channel'
import { getSiteProfile } from './deployment'

const identity = getSiteProfile()

afterEach(() => vi.unstubAllEnvs())

describe('deployment channel', () => {
  it('defaults local builds to stable without changing the site identity', () => {
    vi.stubEnv('REPO_DOCS_CHANNEL', undefined)
    expect(getBuildChannel()).toBe('stable')
    expect(getSiteProfile()).toEqual(identity)
  })

  it('reads the preview channel while retaining the production origin', () => {
    vi.stubEnv('REPO_DOCS_CHANNEL', 'preview')
    expect(getBuildChannel()).toBe('preview')
    expect(getSiteProfile()).toEqual(identity)
  })

  it('accepts stable explicitly and rejects misspelled channels', () => {
    expect(getBuildChannel('stable')).toBe('stable')
    for (const invalid of ['', 'production', 'nightly', 'Preview']) {
      expect(() => getBuildChannel(invalid)).toThrow('Unsupported REPO_DOCS_CHANNEL')
    }
  })
})
