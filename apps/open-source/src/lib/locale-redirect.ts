import type { Locale } from '../types/project'

export const LOCALE_STORAGE_KEY = 'weapp-locale'

const CRAWLER_USER_AGENT = /bot|crawler|spider|googlebot|bingbot|baiduspider|slurp|duckduckbot|yandex|bytespider|petalbot/i

export function isCrawlerUserAgent(userAgent: string): boolean {
  return CRAWLER_USER_AGENT.test(userAgent)
}

export function desiredSiteLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'zh-CN' || saved === 'en') {
    return saved
  }
  const hasChinese = languages.some(tag => String(tag ?? '').toLowerCase().startsWith('zh'))
  return hasChinese ? 'zh-CN' : 'en'
}

export function localeRedirectHref(input: {
  pageLocale: string | undefined
  saved: string | null
  languages: readonly string[]
  userAgent: string
  switchHref: string | null
  pageHref: string
}): string | null {
  if (input.pageLocale !== 'zh-CN' && input.pageLocale !== 'en') {
    return null
  }
  if (isCrawlerUserAgent(input.userAgent)) {
    return null
  }
  if (desiredSiteLocale(input.saved, input.languages) === input.pageLocale) {
    return null
  }
  if (!input.switchHref) {
    return null
  }
  const current = new URL(input.pageHref)
  const target = new URL(input.switchHref, current)
  target.search = current.search
  target.hash = current.hash
  if (target.pathname === current.pathname) {
    return null
  }
  return target.href
}

export function localeRedirectScript(): string {
  return `(() => {
    const pageLocale = document.documentElement.dataset.locale
    if (pageLocale !== 'zh-CN' && pageLocale !== 'en') return
    const userAgent = navigator.userAgent || ''
    if (/bot|crawler|spider|googlebot|bingbot|baiduspider|slurp|duckduckbot|yandex|bytespider|petalbot/i.test(userAgent)) return
    let saved = null
    try {
      saved = localStorage.getItem('${LOCALE_STORAGE_KEY}')
    }
    catch {
      saved = null
    }
    const tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']
    const hasChinese = Array.from(tags).some(tag => String(tag || '').toLowerCase().startsWith('zh'))
    const systemLocale = hasChinese ? 'zh-CN' : 'en'
    const desired = saved === 'zh-CN' || saved === 'en' ? saved : systemLocale
    if (desired === pageLocale) return
    const link = document.querySelector('[data-locale-switch]')
    const href = link && link.getAttribute('href')
    if (!href) return
    const url = new URL(href, location.href)
    url.search = location.search
    url.hash = location.hash
    if (url.pathname === location.pathname) return
    location.replace(url.href)
  })()`
}

export function localeChoiceScript(): string {
  return `document.querySelectorAll('[data-locale-choice]').forEach((link) => {
    link.addEventListener('click', () => {
      const choice = link.getAttribute('data-locale-choice')
      if (choice !== 'zh-CN' && choice !== 'en') return
      try {
        localStorage.setItem('${LOCALE_STORAGE_KEY}', choice)
      }
      catch {
        /* Private mode can block storage; the link still navigates. */
      }
    })
  })`
}
