import type { CatalogProject, Language, LogoData, LogoPoint } from './types.js'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import process from 'node:process'
import { projectLogoFiles, projectLogos } from '../lab/project-logos.js'
import { runtimeAsset } from './runtime.js'

// A closed route table is intentional: the lab never exposes the user's files.
const assets = new Map<string, readonly [string, string]>([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  [
    '/syne-latin-700-normal.woff2',
    ['syne-latin-700-normal.woff2', 'font/woff2'],
  ],
  [
    '/geist-latin-wght-normal.woff2',
    ['geist-latin-wght-normal.woff2', 'font/woff2'],
  ],
  ['/OFL-Syne.txt', ['OFL-Syne.txt', 'text/plain; charset=utf-8']],
  ['/OFL-Geist.txt', ['OFL-Geist.txt', 'text/plain; charset=utf-8']],
  ...Object.values(projectLogoFiles).map(file => [
    `/logos/${file}`,
    [`logos/${file}`, file.endsWith('.png') ? 'image/png' : 'image/svg+xml'],
  ] as const),
])

export interface LabHandle {
  url: string
  close: () => Promise<void>
  closed: Promise<void>
  opened?: boolean
}
export interface LabDataContext {
  lang: Language
  motion?: boolean
  catalog?: CatalogProject[]
  logo?: LogoData | readonly LogoPoint[]
}
export interface LabContext extends LabDataContext {
  stdout: { write: (value: string) => unknown }
  stderr: { write: (value: string) => unknown }
  openUrl: (url: string) => Promise<unknown>
  resources?: { lab?: LabHandle }
  hub?: boolean
}
export interface LabOptions {
  'port'?: number
  'noOpen'?: boolean
  'no-open'?: boolean
  'signal'?: AbortSignal
}

function labData(ctx: LabDataContext) {
  return {
    lang: ctx.lang === 'en' ? 'en' : 'zh-CN',
    motion: ctx.motion !== false,
    catalog: ctx.catalog || [],
    projectLogos,
    logo: Array.isArray(ctx.logo)
      ? { points: ctx.logo }
      : ctx.logo || { points: [] },
  }
}

export async function startLab(ctx: LabDataContext, options: LabOptions = {}): Promise<LabHandle> {
  const contents = new Map<string, { body: Buffer, type: string }>(
    await Promise.all(
      [...assets].map(async ([route, [name, type]]) => {
        const body = await readFile(runtimeAsset(`lab/${name}`))
        return [route, { body, type }] as const
      }),
    ),
  )
  const data = Buffer.from(JSON.stringify(labData(ctx)))
  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader(
      'Content-Security-Policy',
      'default-src \'self\'; script-src \'self\'; style-src \'self\'; font-src \'self\'; img-src \'self\' blob: data:; connect-src \'self\'; object-src \'none\'; base-uri \'none\'; frame-ancestors \'none\'',
    )
    if (request.method !== 'GET') {
      response.writeHead(405, {
        'Allow': 'GET',
        'Content-Type': 'text/plain; charset=utf-8',
      })
      response.end('Method not allowed')
      return
    }
    let path
    try {
      path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    }
    catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Invalid request')
      return
    }
    const asset
      = path === '/data.json'
        ? { body: data, type: 'application/json; charset=utf-8' }
        : contents.get(path)
    if (!asset) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    response.writeHead(200, {
      'Content-Type': asset.type,
      'Content-Length': asset.body.length,
      'Cache-Control': 'no-store',
    })
    response.end(asset.body)
  })
  server.requestTimeout = 5_000
  server.headersTimeout = 5_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    await new Promise<void>(resolve => server.close(() => resolve()))
    throw new Error('Lab server did not bind a TCP port')
  }
  const params = new URLSearchParams({
    lang: ctx.lang === 'en' ? 'en' : 'zh-CN',
  })
  if (ctx.motion === false) {
    params.set('motion', '0')
  }
  const url = `http://127.0.0.1:${address.port}/?${params}`
  let closePromise: Promise<void> | undefined
  const closed = new Promise<void>((resolve) => {
    server.once('close', resolve)
  })
  function close() {
    if (!closePromise) {
      closePromise = new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
        // HTTP keep-alive sockets must not keep the CLI alive after exit.
        server.closeAllConnections?.()
      })
    }
    return closePromise
  }
  return { url, close, closed }
}

export async function runLab(ctx: LabContext, args: string[] = [], options: LabOptions = {}): Promise<number> {
  ctx.resources ||= {}
  try {
    if (!ctx.resources.lab) {
      ctx.resources.lab = await startLab(ctx)
    }
    const lab = ctx.resources.lab
    const noOpen
      = options.noOpen
        || options['no-open']
        || (Array.isArray(args) && args.includes('--no-open'))
    ctx.stdout.write(`${lab.url}\n`)
    if (!noOpen && !lab.opened) {
      try {
        await ctx.openUrl(lab.url)
        lab.opened = true
      }
      catch {
        ctx.stderr.write(
          ctx.lang === 'en'
            ? 'Could not open the browser. Open the URL above; the lab is still running.\n'
            : '浏览器未能打开。请打开上方地址，实验室仍在运行。\n',
        )
      }
    }
    if (ctx.hub) {
      return 0
    }
    ctx.stdout.write(
      ctx.lang === 'en'
        ? 'Press Ctrl+C to close the lab.\n'
        : '按 Ctrl+C 关闭实验室。\n',
    )
    let cleanup = () => {}
    const signal = new Promise<number>((resolve) => {
      const interrupt = () => resolve(130)
      const terminate = () => resolve(0)
      const abort = () => resolve(0)
      process.once('SIGINT', interrupt)
      process.once('SIGTERM', terminate)
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) {
        resolve(0)
      }
      cleanup = () => {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', terminate)
        options.signal?.removeEventListener('abort', abort)
      }
    })
    const code = await Promise.race([signal, lab.closed.then(() => 0)])
    cleanup()
    await lab.close()
    if (ctx.resources.lab === lab) {
      delete ctx.resources.lab
    }
    return code
  }
  catch (error) {
    const message = Array.from(error instanceof Error ? error.message : String(error), (char) => {
      const code = char.codePointAt(0) ?? 0
      return code <= 31 || (code >= 127 && code <= 159) ? ' ' : char
    }).join('')
    ctx.stderr.write(
      `${ctx.lang === 'en' ? 'Could not start the lab' : '实验室启动失败'}: ${message}\n`,
    )
    return 1
  }
}
