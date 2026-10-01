import { posix } from 'node:path'

export function relativeSiteUrl(fromDir: string, absUrl: string): string {
  const hashIndex = absUrl.indexOf('#')
  const hash = hashIndex >= 0 ? absUrl.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? absUrl.slice(0, hashIndex) : absUrl
  const queryIndex = withoutHash.indexOf('?')
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : ''
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return absUrl
  }

  const from = fromDir === '' || fromDir === '.' ? '.' : fromDir.replaceAll('\\', '/')
  const to = pathname === '/' ? '.' : pathname.replace(/^\//, '')
  let rel = posix.relative(from, to)
  if (rel === '') {
    rel = '.'
  }
  if (pathname.endsWith('/') && !rel.endsWith('/') && rel !== '.') {
    rel += '/'
  }
  if (pathname === '/' && rel === '.') {
    rel = './'
  }
  else if (pathname === '/' && !rel.endsWith('/')) {
    rel += '/'
  }
  if (!rel.startsWith('.')) {
    rel = `./${rel}`
  }
  return `${rel}${query}${hash}`
}

export function rewriteRootUrls(content: string, fromDir: string): string {
  const rewrite = (url: string) => relativeSiteUrl(fromDir, url)

  return content
    .replaceAll(/\b(href|src|poster|action)=(["'])(\/[^"']*)\2/g, (match, attr: string, quote: string, url: string) => {
      if (url.startsWith('//')) {
        return match
      }
      return `${attr}=${quote}${rewrite(url)}${quote}`
    })
    .replaceAll(/\bsrcset=(["'])([^"']*)\1/g, (_match, quote: string, value: string) => {
      const next = value.split(',').map((part) => {
        const trimmed = part.trim()
        const [url, ...rest] = trimmed.split(/\s+/)
        if (!url?.startsWith('/') || url.startsWith('//')) {
          return part
        }
        return [rewrite(url), ...rest].join(' ')
      }).join(', ')
      return `srcset=${quote}${next}${quote}`
    })
    .replaceAll(/url\(\s*(['"]?)(\/[^'")\s]+)\1\s*\)/g, (match, quote: string, url: string) => {
      if (url.startsWith('//')) {
        return match
      }
      return `url(${quote}${rewrite(url)}${quote})`
    })
}
