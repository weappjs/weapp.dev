import { parse } from 'node-html-parser'
import { expectSiteLink, isOpenSourceSite } from './site-target'
import { expect, test } from './test'

test.skip(!isOpenSourceSite, 'Open-source publishing contract applies to the Pages target')

const retiredRoutes = ['pricing', 'sponsors', 'contributors']
const fundingCopy = /赞助|资金|基金|付费|商业服务|商业化|\bsponsor(?:ship|s)?\b|\bfund(?:ing|raising)?\b|\bpaid (?:plans?|services?|support)\b|[¥￥]/i

for (const prefix of ['', '/en']) {
  test(`publishes an open-source identity and contribution navigation on ${prefix || 'zh-CN'}`, async ({ page, isMobile }) => {
    await page.goto(`${prefix}/`)
    await expect(page.locator('#home-hero-title')).toHaveText('weapp')
    await expect(page.locator('[data-site-header]').getByRole('link', { name: 'weapp.js.org', exact: true })).toHaveCount(1)
    await expect(page.locator('[data-site-header] [data-analytics-target="site_source"]')).toHaveAttribute('href', 'https://github.com/weappjs')
    await expect(page.locator('footer [data-analytics-target="site_source"]')).toHaveAttribute('href', 'https://github.com/weappjs/weapp.dev')
    await expect(page.locator('#commercial, #vision, [data-sponsor-graphs], [aria-labelledby="projects-support-title"]')).toHaveCount(0)
    if (isMobile) {
      await page.locator('[data-mobile-menu] summary').click()
    }
    const navigation = page.getByRole('navigation', { name: isMobile ? 'Mobile navigation' : prefix ? 'Primary navigation' : '主导航', exact: true })
    await expect(navigation).toBeVisible()
    await expect(navigation.locator('[data-analytics-section]').evaluateAll(links => links.map(link => link.getAttribute('data-analytics-section')))).resolves.toEqual(['about', 'releases', 'collaboration'])
    await expectSiteLink(navigation.locator('[data-analytics-page="projects_index"]'), `${prefix}/projects/`)
    for (const section of ['about', 'releases', 'collaboration']) {
      await expectSiteLink(navigation.locator(`[data-analytics-section="${section}"]`), `${prefix}/#${section}`)
      await expect(page.locator(`#${section}`)).toHaveCount(1)
    }
    await expect(page.locator('body')).not.toContainText(fundingCopy)
  })

  test(`keeps all nine projects and their real status on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/`)
    await expect(page.locator('[data-project-card]')).toHaveCount(9)
    const planned = page.locator('[data-project-card][data-project-id="weapp-sqlite"]')
    await expect(planned).toContainText(prefix ? 'Planned' : '规划中')
    await expect(planned).toContainText(prefix ? 'Details pending' : '资料待确认')
    await expect(page.locator('[aria-labelledby="projects-support-title"]')).toHaveCount(0)
  })

  for (const route of retiredRoutes) {
    test(`retires ${prefix}/${route}/ with a static, localized redirect`, async ({ request }) => {
      const pathname = `${prefix}/${route}/`
      const response = await request.get(pathname)
      expect(response.status()).toBe(200)
      const document = parse(await response.text())
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/)
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://weapp.js.org${prefix}/projects/`)
      const refresh = document.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content')
      expect(refresh).toMatch(/^0\s*;\s*url=/i)
      const destination = refresh!.replace(/^0\s*;\s*url=/i, '')
      expect(destination).not.toMatch(/^(?:\/|https?:)/)
      expect(new URL(destination, `https://example.test${pathname}`).pathname).toBe(`${prefix}/projects/`)
      const link = document.querySelector('a[href]')
      expect(link?.textContent.trim()).toBeTruthy()
      expect(link?.getAttribute('href')).toBe(destination)
      expect(document.querySelector('script')).toBeNull()
      document.querySelectorAll('style').forEach(element => element.remove())
      expect(document.textContent).not.toMatch(fundingCopy)
    })
  }
}

test('all indexed HTML and discovery resources keep the open-source boundary', async ({ request }) => {
  const sitemapResponse = await request.get('/sitemap-0.xml')
  expect(sitemapResponse.ok()).toBe(true)
  const sitemap = await sitemapResponse.text()
  expect(sitemap).not.toMatch(/\/(?:pricing|sponsors|contributors|404)\//)
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]!))
  expect(locations.length).toBeGreaterThanOrEqual(24)
  for (const location of locations) {
    expect(location.origin).toBe('https://weapp.js.org')
    const response = await request.get(location.pathname)
    expect(response.ok(), location.pathname).toBe(true)
    const document = parse(await response.text())
    const metadata = document.querySelectorAll('title, meta[name="description"], script[type="application/ld+json"]')
      .map(element => element.getAttribute('content') ?? element.textContent)
      .join(' ')
    expect(metadata, location.pathname).not.toMatch(fundingCopy)
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(location.href)
    for (const link of document.querySelectorAll('a[href]')) {
      const destination = new URL(link.getAttribute('href')!, location)
      expect(destination.href, `${location.pathname}: ${link.textContent}`).not.toMatch(/^https:\/\/(?:www\.)?weapp\.dev(?:\/|$)/)
      if (destination.origin === location.origin) {
        expect(destination.pathname).not.toMatch(/\/(?:pricing|sponsors|contributors)\//)
      }
    }
    document.querySelectorAll('script, style').forEach(element => element.remove())
    expect(document.textContent, location.pathname).not.toMatch(fundingCopy)
  }
  for (const path of ['/llms.txt', '/llms-full.txt', '/robots.txt', '/releases.xml']) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    const content = await response.text()
    expect(content, path).toContain('https://weapp.js.org')
    expect(content, path).not.toMatch(/https:\/\/(?:www\.)?weapp\.dev(?:\/|$)/)
    expect(content, path).not.toMatch(fundingCopy)
    expect(content, path).not.toMatch(/\/(?:pricing|sponsors|contributors)\//)
  }
})

test.describe('retired routes without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  for (const prefix of ['', '/en']) {
    for (const route of retiredRoutes) {
      test(`opens the project catalog from ${prefix}/${route}/`, async ({ page }) => {
        await page.goto(`${prefix}/${route}/`)
        await expect(page).toHaveURL(`${prefix}/projects/`)
        await expect(page.locator('[data-project-card]')).toHaveCount(9)
      })
    }
  }
})
