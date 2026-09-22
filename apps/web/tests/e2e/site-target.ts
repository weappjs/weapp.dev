import type { Locator } from '@playwright/test'
import process from 'node:process'
import { expect } from '@playwright/test'

export const isOpenSourceSite = process.env.WEAPP_DEPLOY_TARGET === 'github-pages'
export const siteOrigin = isOpenSourceSite ? 'https://weapp.js.org' : 'https://weapp.dev'
export const siteName = isOpenSourceSite ? 'weapp.js.org' : 'weapp.dev'
export const heroWordmark = isOpenSourceSite ? 'weapp' : 'weapp.dev'

// Inspect the browser's destination so absolute and relative links have the
// same contract, without duplicating the production URL rewrite algorithm.
export async function expectSiteLink(link: Locator, pathname: string) {
  await expect.poll(() => link.evaluate((element) => {
    const destination = new URL((element as HTMLAnchorElement).href)
    return `${destination.pathname}${destination.search}${destination.hash}`
  })).toBe(pathname)
}
