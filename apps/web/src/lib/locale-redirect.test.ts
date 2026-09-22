import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { relativeSiteUrl } from './github-pages-paths'
import { isCrawlerUserAgent, LOCALE_STORAGE_KEY, localeChoiceScript, localeRedirectHref, localeRedirectScript } from './locale-redirect'

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

function runRedirect(input: {
  pageLocale?: string
  saved?: string | null
  languages?: readonly string[]
  language?: string
  userAgent?: string
  switchHref?: string | null
  pageHref: string
  storageThrows?: boolean
}) {
  const current = new URL(input.pageHref)
  const storage = new Map<string, string>()
  if (input.saved) {
    storage.set(LOCALE_STORAGE_KEY, input.saved)
  }
  const location = {
    href: current.href,
    pathname: current.pathname,
    search: current.search,
    hash: current.hash,
    replaced: null as string | null,
    replace(next: string) {
      location.replaced = next
    },
  }
  const link = input.switchHref == null
    ? null
    : {
        getAttribute(name: string) {
          return name === 'href' ? input.switchHref : null
        },
      }
  runInNewContext(localeRedirectScript(), {
    URL,
    document: {
      documentElement: { dataset: { locale: input.pageLocale } },
      querySelector(selector: string) {
        return selector === '[data-locale-switch]' ? link : null
      },
    },
    navigator: {
      userAgent: input.userAgent ?? chrome,
      languages: input.languages ?? [input.language ?? ''],
      language: input.language ?? input.languages?.[0] ?? '',
    },
    localStorage: {
      getItem(key: string) {
        if (input.storageThrows) {
          throw new Error('blocked')
        }
        return storage.get(key) ?? null
      },
      setItem(key: string, value: string) {
        storage.set(key, value)
      },
    },
    location,
  })
  return { href: location.replaced, saved: storage.get(LOCALE_STORAGE_KEY) ?? null }
}

describe('client locale redirect', () => {
  it('recognizes crawlers without treating Chrome as a bot', () => {
    expect(isCrawlerUserAgent(chrome)).toBe(false)
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Google Toolbar)')).toBe(false)
    expect(isCrawlerUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36')).toBe(false)
    expect(isCrawlerUserAgent(googlebot)).toBe(true)
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true)
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Baiduspider/2.0)')).toBe(true)
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Yahoo! Slurp)')).toBe(true)
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Bytespider)')).toBe(true)
  })

  it('follows the loop table for both the helper and the inline script', () => {
    const cases = [
      {
        name: 'chinese page with a chinese system stays',
        input: {
          pageLocale: 'zh-CN',
          languages: ['zh-CN'],
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/',
        },
        expected: null,
      },
      {
        name: 'english listed before chinese still stays on the chinese page',
        input: {
          pageLocale: 'zh-CN',
          languages: ['en-US', 'zh-CN'],
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/?utm_source=e2e#projects',
        },
        expected: null,
      },
      {
        name: 'a saved english choice overrides a chinese language list',
        input: {
          pageLocale: 'zh-CN',
          saved: 'en',
          languages: ['zh-CN', 'en-US'],
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/',
        },
        expected: 'https://weapp.dev/en/',
      },
      {
        name: 'an english-only list leaves the chinese page once',
        input: {
          pageLocale: 'zh-CN',
          languages: ['en-US'],
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/?utm_source=e2e#projects',
        },
        expected: 'https://weapp.dev/en/?utm_source=e2e#projects',
      },
      {
        name: 'english project with an english system stays',
        input: {
          pageLocale: 'en',
          languages: ['en-US'],
          switchHref: '/projects/weapp-vite/',
          pageHref: 'https://weapp.dev/en/projects/weapp-vite/',
        },
        expected: null,
      },
      {
        name: 'saved chinese choice leaves the english project',
        input: {
          pageLocale: 'en',
          saved: 'zh-CN',
          languages: ['en-US'],
          switchHref: '/projects/weapp-vite/',
          pageHref: 'https://weapp.dev/en/projects/weapp-vite/',
        },
        expected: 'https://weapp.dev/projects/weapp-vite/',
      },
      {
        name: 'missing switch target stays, including 404',
        input: {
          pageLocale: 'zh-CN',
          languages: ['en-US'],
          switchHref: null,
          pageHref: 'https://weapp.dev/404/',
        },
        expected: null,
      },
      {
        name: 'crawler stays on the opened url',
        input: {
          pageLocale: 'zh-CN',
          languages: ['en-US'],
          userAgent: googlebot,
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/',
        },
        expected: null,
      },
      {
        name: 'traditional chinese tags use the chinese site',
        input: {
          pageLocale: 'en',
          languages: ['zh-TW', 'en-US'],
          switchHref: '/',
          pageHref: 'https://weapp.dev/en/',
        },
        expected: 'https://weapp.dev/',
      },
      {
        name: 'hong kong chinese tags use the chinese site',
        input: {
          pageLocale: 'en',
          languages: ['zh-HK'],
          switchHref: '/projects/weapp-vite/',
          pageHref: 'https://weapp.dev/en/projects/weapp-vite/',
        },
        expected: 'https://weapp.dev/projects/weapp-vite/',
      },
      {
        name: 'empty language list uses english',
        input: {
          pageLocale: 'zh-CN',
          languages: [''],
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/',
        },
        expected: 'https://weapp.dev/en/',
      },
      {
        name: 'invalid saved value falls through to the system',
        input: {
          pageLocale: 'zh-CN',
          saved: 'zh',
          languages: ['fr-FR'],
          switchHref: '/en/',
          pageHref: 'https://weapp.dev/',
        },
        expected: 'https://weapp.dev/en/',
      },
      {
        name: 'same pathname does not navigate',
        input: {
          pageLocale: 'zh-CN',
          languages: ['en-US'],
          switchHref: '/',
          pageHref: 'https://weapp.dev/',
        },
        expected: null,
      },
    ] as const

    for (const sample of cases) {
      const input = {
        saved: null,
        userAgent: chrome,
        ...sample.input,
      }
      expect(localeRedirectHref(input), sample.name).toBe(sample.expected)
      const ran = runRedirect(input)
      expect(ran.href, `${sample.name} script`).toBe(sample.expected)
      expect(ran.saved, `${sample.name} storage`).toBe(input.saved)
    }
  })

  it('keeps GitHub Pages on the same host and subpath', () => {
    const target = localeRedirectHref({
      pageLocale: 'zh-CN',
      saved: null,
      languages: ['en-US'],
      userAgent: chrome,
      switchHref: relativeSiteUrl('.', '/en/'),
      pageHref: 'https://weappjs.github.io/weapp.dev/',
    })
    expect(target).toBe('https://weappjs.github.io/weapp.dev/en/')

    const back = localeRedirectHref({
      pageLocale: 'en',
      saved: 'zh-CN',
      languages: ['en-US'],
      userAgent: chrome,
      switchHref: relativeSiteUrl('en/projects/weapp-vite', '/projects/weapp-vite/'),
      pageHref: 'https://weappjs.github.io/weapp.dev/en/projects/weapp-vite/?q=1#start',
    })
    expect(back).toBe('https://weappjs.github.io/weapp.dev/projects/weapp-vite/?q=1#start')
  })

  it('uses navigator.language when the language list is empty and ignores blocked storage', () => {
    expect(runRedirect({
      pageLocale: 'en',
      languages: [],
      language: 'zh-HK',
      switchHref: '/',
      pageHref: 'https://weapp.dev/en/',
    }).href).toBe('https://weapp.dev/')

    expect(runRedirect({
      pageLocale: 'zh-CN',
      languages: ['en-US'],
      switchHref: '/en/',
      pageHref: 'https://weapp.dev/',
      storageThrows: true,
    }).href).toBe('https://weapp.dev/en/')
  })

  it('writes only an explicit language choice', () => {
    expect(localeRedirectScript()).not.toContain('setItem')
    expect(localeRedirectScript()).toContain('location.replace')
    expect(localeRedirectScript()).not.toContain('location.assign')

    const storage = new Map<string, string>()
    const clicks: Array<() => void> = []
    const link: { choice: string | null, getAttribute: (name: string) => string | null, addEventListener: (type: string, listener: () => void) => void } = {
      choice: 'zh-CN',
      getAttribute(name: string) {
        return name === 'data-locale-choice' ? link.choice : null
      },
      addEventListener(_type: string, listener: () => void) {
        clicks.push(listener)
      },
    }
    runInNewContext(localeChoiceScript(), {
      document: {
        querySelectorAll: () => [link],
      },
      localStorage: {
        setItem(key: string, value: string) {
          storage.set(key, value)
        },
      },
    })
    clicks[0]?.()
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe('zh-CN')

    link.choice = 'fr'
    clicks[0]?.()
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe('zh-CN')

    link.choice = 'en'
    const blocked = { ...link, choice: 'en' }
    const failingClicks: Array<() => void> = []
    runInNewContext(localeChoiceScript(), {
      document: {
        querySelectorAll: () => [{
          getAttribute: () => 'en',
          addEventListener: (_type: string, listener: () => void) => failingClicks.push(listener),
        }],
      },
      localStorage: {
        setItem() {
          throw new Error('blocked')
        },
      },
    })
    expect(() => failingClicks[0]?.()).not.toThrow()
    expect(blocked.choice).toBe('en')
  })
})
