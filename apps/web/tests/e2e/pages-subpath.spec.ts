import { expect, test } from '@playwright/test'
import { expectSiteLink, isOpenSourceSite } from './site-target'

test.skip(!isOpenSourceSite, 'Only the Pages artifact is mounted below /weapp.dev/')

test('loads Pages assets and navigates between languages below the repository path', async ({ page }) => {
  const failures: string[] = []
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.hostname === '127.0.0.1' && response.status() >= 400) {
      failures.push(`${response.status()} ${url.pathname}`)
    }
  })
  await page.goto('/weapp.dev/')
  await expect(page.locator('#home-hero-title')).toHaveText('weapp')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://weapp.js.org/')
  await expect(page.locator('.home-hero-screen')).toHaveCSS('background-color', 'rgb(2, 3, 8)')
  await page.locator('img').evaluateAll(images => images.forEach(image => (image as HTMLImageElement).loading = 'eager'))
  await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await expectSiteLink(page.getByRole('link', { name: 'English', exact: true }), '/weapp.dev/en/')
  await page.getByRole('link', { name: 'English', exact: true }).click()
  await expect(page).toHaveURL('/weapp.dev/en/')
  await page.locator('#projects a[data-analytics-event="select_project"][data-analytics-project="weapp-vite"]').click()
  await expect(page).toHaveURL('/weapp.dev/en/projects/weapp-vite/')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://weapp.js.org/en/projects/weapp-vite/')
  await page.getByRole('link', { name: '中文', exact: true }).click()
  await expect(page).toHaveURL('/weapp.dev/projects/weapp-vite/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('weapp-vite')
  await expectSiteLink(page.locator('[data-site-header]').getByRole('link', { name: 'weapp.js.org', exact: true }), '/weapp.dev/')
  expect(failures).toEqual([])
})

test('keeps locale redirects, query strings, and fragments inside the Pages mount', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('weapp-locale', 'en'))
  await page.goto('/weapp.dev/projects/weapp-vite/?utm_source=pages#install')
  await expect(page).toHaveURL('/weapp.dev/en/projects/weapp-vite/?utm_source=pages#install')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
})

test.describe('Pages without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  for (const mount of ['', '/weapp.dev']) {
    test(`loads localized 404 assets and returns to the correct home at ${mount || '/'}`, async ({ page }) => {
      const failures: string[] = []
      page.on('response', (response) => {
        const url = new URL(response.url())
        if (url.hostname === '127.0.0.1' && response.status() >= 400) {
          failures.push(`${response.status()} ${url.pathname}`)
        }
      })
      for (const prefix of ['', '/en']) {
        await page.goto(`${mount}${prefix}/404/`)
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
        await expect(page.locator('html')).toHaveAttribute('lang', prefix ? 'en-US' : 'zh-CN')
        await expect(page.locator('[data-site-header]')).toHaveCSS('position', 'sticky')
        await expect.poll(() => page.locator('main img').evaluateAll(images => images.length > 0 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
        const homeLink = page.locator('main').getByRole('link')
        await expect(homeLink).toBeVisible()
        await expectSiteLink(homeLink, `${mount}${prefix}/`)
        await homeLink.click()
        await expect(page).toHaveURL(`${mount}${prefix}/`)
        await expect(page.locator('#home-hero-title')).toHaveText('weapp')
      }
      expect(failures).toEqual([])
    })
  }

  test('keeps catalog links and both retired-route languages within the Pages mount', async ({ page }) => {
    for (const prefix of ['', '/en']) {
      await page.goto(`/weapp.dev${prefix}/projects/`)
      await expect(page.locator('[data-project-card]:visible')).toHaveCount(9)
      await page.locator('[data-project-card][data-project-id="weapp-vite"] a[data-analytics-event="select_project"]').click()
      await expect(page).toHaveURL(`/weapp.dev${prefix}/projects/weapp-vite/`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('weapp-vite')
      for (const route of ['pricing', 'sponsors', 'contributors']) {
        await page.goto(`/weapp.dev${prefix}/${route}/`)
        await expect(page).toHaveURL(`/weapp.dev${prefix}/projects/`)
        await expect(page.locator('[data-project-card]:visible')).toHaveCount(9)
      }
    }
  })
})
