import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parse } from 'node-html-parser'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { unstable_dev } from 'wrangler'

const channel = process.env.REPO_DOCS_CHANNEL ?? 'stable'
const home = await readFile('dist/index.html', 'utf8')
assert.ok(home.includes(`data-site-channel="${channel}"`), 'Build the requested channel before testing its HTTP responses')

for (const config of ['wrangler.jsonc', 'wrangler.preview.jsonc']) {
  describe(`${config}: ${channel} artifact HTTP contract`, () => {
    let worker
    beforeAll(async () => {
      worker = await unstable_dev('worker/index.ts', {
        config,
        local: true,
        port: 0,
        persist: false,
        logLevel: 'error',
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          watch: false,
          showInteractiveDevSession: false,
        },
      })
    })
    afterAll(async () => {
      await worker?.stop()
    })
    const fetchPath = (path, init = {}) => worker.fetch(`https://weapp.dev${path}`, {
      redirect: 'manual',
      ...init,
    })
    const checkPreviewHeader = response => assert.equal(
      response.headers.get('x-robots-tag'),
      channel === 'preview' ? 'noindex, nofollow' : null,
    )
    for (const prefix of ['', '/en']) {
      const title = prefix ? 'Page not found | weapp.dev' : '页面不存在 | weapp.dev'
      const aliases = ['/404', '/404/', '/404.html', '/404/index', '/404/index.html']
      for (const alias of aliases) {
        it(`${prefix}${alias} returns a complete localized 404 for GET and HEAD`, async () => {
          for (const query of ['', '?source=http-test']) {
            const path = `${prefix}${alias}${query}`
            const response = await fetchPath(path)
            assert.equal(response.status, 404, path)
            assert.equal(response.headers.get('location'), null)
            assert.match(response.headers.get('content-type'), /text\/html/)
            checkPreviewHeader(response)
            const html = await response.text()
            assert.ok(html.includes(`<title>${title}</title>`))
            assert.match(html, /<meta name="robots" content="noindex, follow"/)
            assert.equal(parse(html).querySelector('link[data-locale-switch]'), null, 'Error pages must not redirect based on browser language')
            const head = await fetchPath(path, { method: 'HEAD' })
            assert.equal(head.status, 404)
            assert.equal(head.headers.get('content-type'), response.headers.get('content-type'))
            checkPreviewHeader(head)
            assert.equal(await head.text(), '')
          }
        })
      }
    }

    it('conditional and range requests cannot turn an error into a 304 or 206', async () => {
      const first = await fetchPath('/404')
      await first.arrayBuffer()
      const response = await fetchPath('/404', {
        headers: { 'if-none-match': first.headers.get('etag') ?? '*', 'range': 'bytes=0-20' },
      })
      assert.equal(response.status, 404)
      assert.ok((await response.text()).includes('<!DOCTYPE html>'))
    })

    it('unknown paths retain a real 404 without redirecting home', async () => {
      for (const path of ['/missing-http-test/', '/en/missing-http-test/', '/projects/missing-http-test/', '/404/extra', '/en/404/extra']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await fetchPath(path, { method })
          assert.equal(response.status, 404, path)
          assert.equal(response.headers.get('location'), null)
          checkPreviewHeader(response)
          if (method === 'HEAD') {
            assert.equal(await response.text(), '')
          }
          else {
            assert.match(await response.text(), /noindex, follow/)
          }
        }
      }
    })

    it('all sitemap content and static resources remain accessible', async () => {
      const sitemap = await fetchPath('/sitemap-0.xml')
      assert.equal(sitemap.status, 200)
      const xml = await sitemap.text()
      assert.ok(!xml.includes('/404'))
      const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname)
      assert.ok(paths.includes('/') && paths.includes('/en/') && paths.includes('/projects/weapp-vite/'))
      for (const path of [...paths, '/logo.svg', '/robots.txt', '/sitemap-index.xml']) {
        const response = await fetchPath(path)
        assert.equal(response.status, 200, path)
        checkPreviewHeader(response)
        await response.arrayBuffer()
      }
      const unknown = await fetchPath('/projects/nonexistent-http-test.html')
      assert.equal(unknown.status, 404)
      await unknown.arrayBuffer()
    })
  })
}
