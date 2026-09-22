import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBuildOutputDir, getDeploymentTarget, getSiteProfile, isGithubPagesBuild } from './deployment'

afterEach(() => vi.unstubAllEnvs())

describe('deployment target', () => {
  it('defaults to the complete weapp deployment', () => {
    vi.stubEnv('WEAPP_DEPLOY_TARGET', undefined)
    expect(getDeploymentTarget()).toBe('weapp')
    expect(isGithubPagesBuild()).toBe(false)
    expect(getBuildOutputDir()).toBe('dist')
    expect(getSiteProfile().origin).toBe('https://weapp.dev')
    expect(getSiteProfile().features).toEqual({ services: true, sponsorship: true })
  })

  it('selects the Pages content and output directory from the same variable', () => {
    vi.stubEnv('WEAPP_DEPLOY_TARGET', 'github-pages')
    expect(getDeploymentTarget()).toBe('github-pages')
    expect(isGithubPagesBuild()).toBe(true)
    expect(getBuildOutputDir()).toBe('dist-pages')
    expect(getSiteProfile().origin).toBe('https://weapp.js.org')
    expect(getSiteProfile().features).toEqual({ services: false, sponsorship: false })
    expect(getSiteProfile().navigation.map(item => item.path)).not.toContain('/pricing/#services')
    expect(getDeploymentTarget('anything-else')).toBe('weapp')
    expect(getBuildOutputDir('weapp')).toBe('dist')
  })
})
