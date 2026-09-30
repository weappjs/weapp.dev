export function isCanonicalNpmPackageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && (url.hostname === 'www.npmjs.com' || url.hostname === 'npmjs.com')
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.pathname.startsWith('/package/')
      && url.pathname.length > '/package/'.length
      && url.search === ''
      && url.hash === ''
  }
  catch {
    return false
  }
}
