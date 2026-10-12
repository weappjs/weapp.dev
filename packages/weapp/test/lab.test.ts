import type { LabContext, LabHandle } from '../src/lab.js'
import type { CatalogProject, LogoData } from '../src/types.js'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { projectLogoFiles, projectLogos } from '../lab/project-logos.js'
import { runLab, startLab } from '../src/lab.js'

const labs: LabHandle[] = []
interface TextOutput {
  text: string
  write: (value: string) => void
}
interface TestContext extends LabContext {
  stdout: TextOutput
  stderr: TextOutput
  resources: { lab?: LabHandle }
}
const fixtureCatalog = JSON.parse(readFileSync(new URL('../dist/data/catalog.json', import.meta.url), 'utf8')) as CatalogProject[]
const fixtureLogo = JSON.parse(readFileSync(new URL('../dist/data/logo.json', import.meta.url), 'utf8')) as LogoData
const logoFiles: Readonly<Record<string, string>> = projectLogoFiles
function context(overrides: Partial<TestContext> = {}): TestContext {
  const stdout: TextOutput = {
    text: '',
    write(value) {
      this.text += value
    },
  }
  const stderr: TextOutput = {
    text: '',
    write(value) {
      this.text += value
    },
  }
  return {
    lang: 'en',
    stdout,
    stderr,
    motion: true,
    catalog: fixtureCatalog.slice(0, 1),
    logo: fixtureLogo,
    resources: {},
    openUrl: async () => {},
    ...overrides,
  }
}
async function start(ctx: LabContext = context()) {
  const lab = await startLab(ctx)
  labs.push(lab)
  return lab
}
afterEach(async () => {
  await Promise.all(labs.splice(0).map(lab => lab.close()))
})

describe('offline visual lab', () => {
  it('binds only loopback and serves the source assets, fonts, and licenses', async () => {
    const lab = await start()
    expect(new URL(lab.url).hostname).toBe('127.0.0.1')
    expect(new URL(lab.url).port).not.toBe('0')
    for (const [path, contentType, text] of [
      ['/', 'text/html', 'id="canvas"'],
      ['/index.html', 'text/html', 'id="download"'],
      ['/style.css', 'text/css', 'prefers-reduced-motion'],
      ['/app.js', 'text/javascript', 'visibilitychange'],
      ['/syne-latin-700-normal.woff2', 'font/woff2', null],
      ['/geist-latin-wght-normal.woff2', 'font/woff2', null],
      ['/OFL-Syne.txt', 'text/plain', 'SIL OPEN FONT LICENSE'],
      ['/OFL-Geist.txt', 'text/plain', 'SIL OPEN FONT LICENSE'],
    ] as const) {
      const response = await fetch(new URL(path, lab.url))
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toContain(contentType)
      expect(response.headers.get('content-security-policy'), path).toContain(
        'connect-src \'self\'',
      )
      if (text) {
        expect(await response.text(), path).toContain(text)
      }
      else {
        expect((await response.arrayBuffer()).byteLength, path).toBeGreaterThan(
          1_000,
        )
      }
    }
  })

  it('sends the actual catalog and canonical Logo with locale and motion settings', async () => {
    const ctx = context({ lang: 'zh-CN', motion: false })
    const lab = await start(ctx)
    const result = await (await fetch(new URL('/data.json', lab.url))).json()
    expect(result).toEqual({
      lang: 'zh-CN',
      motion: false,
      catalog: ctx.catalog,
      logo: ctx.logo,
      projectLogos,
    })
    expect(new URL(lab.url).searchParams.get('lang')).toBe('zh-CN')
    expect(new URL(lab.url).searchParams.get('motion')).toBe('0')
  })

  it('serves eleven real project logos offline and explicitly identifies the planned fallback', async () => {
    const lab = await start()
    const { projectLogos: logos } = await (await fetch(new URL('/data.json', lab.url))).json() as { projectLogos: typeof projectLogos }
    expect(Object.keys(logos)).toHaveLength(11)
    expect(logos['weapp-sqlite']).toEqual({ url: '/logos/miniprogram.svg', fallback: true })
    expect(Object.values(logos).filter(logo => logo.fallback)).toHaveLength(1)
    for (const [slug, logo] of Object.entries(logos)) {
      const response = await fetch(new URL(logo.url, lab.url))
      expect(response.status, slug).toBe(200)
      expect(response.headers.get('content-type'), slug).toBe(logoFiles[slug].endsWith('.png') ? 'image/png' : 'image/svg+xml')
      const body = new Uint8Array(await response.arrayBuffer())
      expect(body.byteLength, slug).toBeGreaterThan(500)
      if (logoFiles[slug].endsWith('.png')) {
        expect([...body.slice(0, 4)]).toEqual([137, 80, 78, 71])
      }
      else {
        expect(new TextDecoder().decode(body), slug).toContain('<svg')
      }
    }
  })

  it('uses a closed route table and never serves arbitrary files', async () => {
    const lab = await start()
    for (const path of [
      '/package.json',
      '/../../package.json',
      '/%2e%2e%2fpackage.json',
      '/.env',
      '/src/lab.js',
      '/app.js/extra',
      '/logos/../../package.json',
      '/logos/%2e%2e%2fsrc/lab.js',
      '/logos/react.svg',
      '/logos/unknown.svg',
    ]) {
      const response = await fetch(new URL(path, lab.url))
      expect(response.status, path).toBe(404)
      expect(await response.text()).toBe('Not found')
    }
    const response = await fetch(new URL('/data.json', lab.url), {
      method: 'POST',
      body: '{}',
    })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })

  it('closes keep-alive connections and allows repeated cleanup', async () => {
    const lab = await start()
    await fetch(lab.url)
    await Promise.all([lab.close(), lab.close(), lab.closed])
    await expect(fetch(lab.url)).rejects.toThrow()
  })

  it('reuses one lab in the hub and opens the browser only once', async () => {
    const opened: string[] = []
    const ctx = context({
      hub: true,
      openUrl: async (url) => {
        opened.push(url)
      },
    })
    expect(await runLab(ctx)).toBe(0)
    const first = ctx.resources.lab
    expect(first).toBeDefined()
    if (!first) {
      throw new Error('Lab was not started')
    }
    labs.push(first)
    expect(await runLab(ctx)).toBe(0)
    expect(ctx.resources.lab).toBe(first)
    expect(opened).toEqual([first.url])
    expect(ctx.stdout.text.split(first.url).length).toBe(3)
  })

  it('supports no-open and preserves a running server when opening fails', async () => {
    let calls = 0
    const ctx = context({
      hub: true,
      openUrl: async () => {
        calls++
        throw new Error('browser failed')
      },
    })
    expect(await runLab(ctx, [], { noOpen: true })).toBe(0)
    const lab = ctx.resources.lab
    expect(lab).toBeDefined()
    if (!lab) {
      throw new Error('Lab was not started')
    }
    labs.push(lab)
    expect(calls).toBe(0)
    expect(await runLab(ctx)).toBe(0)
    expect(calls).toBe(1)
    expect(ctx.stderr.text).toContain('the lab is still running')
    expect((await fetch(lab.url)).status).toBe(200)
  })

  it('releases signal listeners and closes standalone services on cancellation', async () => {
    const controller = new AbortController()
    const ctx = context()
    const interrupts = process.listenerCount('SIGINT')
    const terminates = process.listenerCount('SIGTERM')
    const running = runLab(ctx, [], {
      noOpen: true,
      signal: controller.signal,
    })
    // Wait for startup using the URL output, rather than arbitrary sleep time.
    await new Promise<void>((resolve) => {
      const original = ctx.stdout.write.bind(ctx.stdout)
      ctx.stdout.write = (value) => {
        original(value)
        if (value.includes('Ctrl+C')) {
          resolve()
        }
      }
    })
    const lab = ctx.resources.lab
    expect(lab).toBeDefined()
    if (!lab) {
      throw new Error('Lab was not started')
    }
    controller.abort()
    expect(await running).toBe(0)
    expect(ctx.resources.lab).toBeUndefined()
    expect(process.listenerCount('SIGINT')).toBe(interrupts)
    expect(process.listenerCount('SIGTERM')).toBe(terminates)
    await expect(fetch(lab.url)).rejects.toThrow()
  })
})
