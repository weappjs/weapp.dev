import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'

const target = process.env.WEAPP_DEPLOY_TARGET ?? 'weapp'
if (!['weapp', 'github-pages'].includes(target)) {
  throw new Error(`Unknown WEAPP_DEPLOY_TARGET: ${target}`)
}
const root = resolve(target === 'github-pages' ? 'dist-pages' : 'dist')
await stat(resolve(root, 'index.html'))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
}

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end()
    return
  }
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4321')
    let pathname = decodeURIComponent(url.pathname)
    if (target === 'github-pages' && pathname === '/weapp.dev') {
      response.writeHead(308, { location: `/weapp.dev/${url.search}` }).end()
      return
    }
    if (target === 'github-pages' && pathname.startsWith('/weapp.dev/')) {
      pathname = pathname.slice('/weapp.dev'.length)
    }
    let file = resolve(root, `.${pathname}`)
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end()
      return
    }
    // Prefer the Pages directory artifact, whose relative URLs are written for
    // /404/. Other targets keep Astro's root 404.html preview fallback.
    if (pathname === '/404/') {
      const directoryPage = await stat(resolve(file, 'index.html')).catch(() => null)
      if (!directoryPage?.isFile()) {
        file = resolve(root, '404.html')
      }
    }
    const entry = await stat(file)
    if (entry.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(308, { location: `${url.pathname}/${url.search}` }).end()
        return
      }
      file = resolve(file, 'index.html')
    }
    const info = await stat(file)
    response.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(file).on('error', () => response.destroy()).pipe(response)
  }
  catch {
    response.writeHead(404).end('Not found')
  }
}).listen(4321, '127.0.0.1')
