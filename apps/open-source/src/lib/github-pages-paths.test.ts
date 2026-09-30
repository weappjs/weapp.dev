import { describe, expect, it } from 'vitest'
import { relativeSiteUrl, rewriteRootUrls } from './github-pages-paths'

describe('GitHub Pages relative URLs', () => {
  it('keeps assets next to the homepage and walks up from nested routes', () => {
    expect(relativeSiteUrl('.', '/_astro/home.css')).toBe('./_astro/home.css')
    expect(relativeSiteUrl('.', '/projects/weapp-vite/')).toBe('./projects/weapp-vite/')
    expect(relativeSiteUrl('.', '/#about')).toBe('./#about')
    expect(relativeSiteUrl('en', '/_astro/home.css')).toBe('../_astro/home.css')
    expect(relativeSiteUrl('en', '/projects/weapp-vite/')).toBe('../projects/weapp-vite/')
    expect(relativeSiteUrl('en', '/')).toBe('../')
    expect(relativeSiteUrl('projects/weapp-vite', '/')).toBe('../../')
    expect(relativeSiteUrl('en/projects/weapp-vite', '/en/')).toBe('../../')
    expect(relativeSiteUrl('_astro', '/_astro/geist.woff2')).toBe('./geist.woff2')
  })

  it('rewrites html and css root paths without touching canonical hosts', () => {
    const html = rewriteRootUrls(
      '<link rel="stylesheet" href="/_astro/home.css"><a href="https://weapp.dev/en/">EN</a><a href="/projects/">项目</a><img src="/logo.svg">',
      'en',
    )
    expect(html).toContain('href="../_astro/home.css"')
    expect(html).toContain('href="https://weapp.dev/en/"')
    expect(html).toContain('href="../projects/"')
    expect(html).toContain('src="../logo.svg"')

    const css = rewriteRootUrls('url(/_astro/geist.woff2) url("/_astro/sora.woff2")', '_astro')
    expect(css).toBe('url(./geist.woff2) url("./sora.woff2")')
  })
})
