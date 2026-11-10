import { describe, expect, it, vi } from 'vitest'
import worker from './index'

describe('error page HTTP responses', () => {
  it('reads a complete localized asset without forwarding conditional or range headers', async () => {
    const asset = vi.fn(async () => new Response('English error', {
      headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex, nofollow' },
    }))
    const response = await worker.fetch(new Request('https://weapp.dev/en/404.html?source=test', {
      headers: { 'if-none-match': 'cached', 'range': 'bytes=0-10' },
    }), { ASSETS: { fetch: asset } })
    const forwarded = asset.mock.calls[0]?.[0] as Request | undefined
    expect(forwarded?.url).toBe('https://weapp.dev/en/404/')
    expect([...forwarded!.headers]).toEqual([])
    expect(response.status).toBe(404)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await response.text()).toBe('English error')
  })

  it('does not hide asset failures or fetch rejections', async () => {
    for (const status of [404, 500, 503]) {
      const upstream = new Response('Asset failure', { status })
      const response = await worker.fetch(new Request('https://weapp.dev/404/'), {
        ASSETS: { fetch: async () => upstream },
      })
      expect(response).toBe(upstream)
    }
    await expect(worker.fetch(new Request('https://weapp.dev/404/'), {
      ASSETS: { fetch: async () => { throw new Error('Asset unavailable') } },
    })).rejects.toThrow('Asset unavailable')
  })

  it('forwards other paths and methods without changing the response', async () => {
    for (const [path, method] of [['/projects/', 'GET'], ['/404/extra', 'GET'], ['/404/', 'POST']]) {
      const upstream = new Response(null, { status: 405 })
      const asset = vi.fn(async () => upstream)
      const request = new Request(`https://weapp.dev${path}`, { method })
      expect(await worker.fetch(request, { ASSETS: { fetch: asset } })).toBe(upstream)
      expect(asset).toHaveBeenCalledWith(request)
    }
  })
})
