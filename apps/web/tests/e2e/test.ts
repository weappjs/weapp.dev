import { test as base, expect } from '@playwright/test'

// Existing tests open a URL and expect that language. Save a matching choice
// before the page script runs so the client redirect leaves the URL alone.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        const path = location.pathname
        const locale = path === '/en' || path.startsWith('/en/') ? 'en' : 'zh-CN'
        localStorage.setItem('weapp-locale', locale)
      }
      catch {
        // about:blank has no storage; the next document sets the choice.
      }
    })
    await use(page)
  },
})

export { expect }
