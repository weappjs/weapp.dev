import { describe, expect, it } from 'vitest'
import { isCanonicalNpmPackageUrl } from './npm'

describe('npm package URLs', () => {
  it('accepts canonical package pages', () => {
    expect(isCanonicalNpmPackageUrl('https://www.npmjs.com/package/weapp-vite')).toBe(true)
    expect(isCanonicalNpmPackageUrl('https://npmjs.com/package/@scope/package')).toBe(true)
  })

  it('rejects non-canonical npm destinations', () => {
    expect(isCanonicalNpmPackageUrl('https://registry.npmjs.org/weapp-vite')).toBe(false)
    expect(isCanonicalNpmPackageUrl('https://www.npmjs.com/package/weapp-vite?tab=readme')).toBe(false)
    expect(isCanonicalNpmPackageUrl('https://user:pass@www.npmjs.com/package/weapp-vite')).toBe(false)
    expect(isCanonicalNpmPackageUrl('https://www.npmjs.com:8443/package/weapp-vite')).toBe(false)
  })
})
