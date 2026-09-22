import { expect, test } from '@playwright/test'

const chineseHome = /127\.0\.0\.1:4321\/$/
const englishHome = /127\.0\.0\.1:4321\/en\/$/

test.describe('english system', () => {
  test.use({ locale: 'en-US' })

  test('opens the Chinese home on the English home and does not loop', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(englishHome)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    expect(await page.evaluate(() => localStorage.getItem('weapp-locale'))).toBeNull()

    const paths: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        paths.push(new URL(frame.url()).pathname)
      }
    })
    await page.goto('/en/')
    await expect(page).toHaveURL(englishHome)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every(path => path === '/en/')).toBe(true)
  })

  test('keeps the project path, query, and hash', async ({ page }) => {
    await page.goto('/projects/weapp-vite/?utm_source=e2e#install')
    await expect(page).toHaveURL(/\/en\/projects\/weapp-vite\/\?utm_source=e2e#install$/)
    expect(await page.evaluate(() => localStorage.getItem('weapp-locale'))).toBeNull()
  })

  test('stays on Chinese after the language control is chosen', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(englishHome)
    await page.getByRole('link', { name: '中文' }).click()
    await expect(page).toHaveURL(chineseHome)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    expect(await page.evaluate(() => localStorage.getItem('weapp-locale'))).toBe('zh-CN')

    await page.goto('/en/projects/weapp-vite/')
    await expect(page).toHaveURL(/127\.0\.0\.1:4321\/projects\/weapp-vite\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  })

  test('leaves 404 pages on the opened URL', async ({ page }) => {
    await page.goto('/404/')
    await expect(page).toHaveURL(/\/404\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await page.goto('/en/404/')
    await expect(page).toHaveURL(/\/en\/404\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  })
})

test.describe('chinese system', () => {
  test.use({ locale: 'zh-CN' })

  test('opens an English project on its Chinese path and does not loop', async ({ page }) => {
    await page.goto('/en/projects/weapp-vite/')
    await expect(page).toHaveURL(/127\.0\.0\.1:4321\/projects\/weapp-vite\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    expect(await page.evaluate(() => localStorage.getItem('weapp-locale'))).toBeNull()

    const paths: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        paths.push(new URL(frame.url()).pathname)
      }
    })
    await page.goto('/')
    await expect(page).toHaveURL(chineseHome)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every(path => path === '/')).toBe(true)
  })

  test('stays on English after the language control is chosen', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(chineseHome)
    await page.getByRole('link', { name: 'English' }).click()
    await expect(page).toHaveURL(englishHome)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    expect(await page.evaluate(() => localStorage.getItem('weapp-locale'))).toBe('en')
  })
})

test.describe('traditional Chinese system', () => {
  test.use({ locale: 'zh-TW' })

  test('uses the Chinese pages', async ({ page }) => {
    await page.goto('/en/')
    await expect(page).toHaveURL(chineseHome)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  })
})

test.describe('crawlers', () => {
  test.use({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  })

  test('stay on the opened URL', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(chineseHome)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  })
})
