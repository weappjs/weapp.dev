import AxeBuilder from '@axe-core/playwright'
import { isOpenSourceSite } from './site-target'
import { expect, test } from './test'
import { applyTheme } from './theme'

for (const prefix of ['/', '/en/']) {
  test(`contact entries respect site boundaries in ${prefix}`, async ({ page, request }) => {
    for (const route of ['', 'pricing/', 'contributors/', 'sponsors/']) {
      await page.goto(`${prefix}${route}`)
      await expect(page.locator('[data-contact-methods]')).toHaveCount(isOpenSourceSite ? 0 : route === 'pricing/' ? 2 : 1)
    }
    for (const asset of ['wechat-original.jpg', 'qq-original.jpg', 'wechat-qr.webp', 'qq-qr.webp']) {
      expect((await request.get(`/contact/${asset}`)).status()).toBe(isOpenSourceSite ? 404 : 200)
    }
  })

  test(`icon-only contacts expand by keyboard and copy in ${prefix}`, async ({ page }) => {
    test.skip(isOpenSourceSite, 'Personal contact methods belong to weapp.dev')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (value: string) => { Reflect.set(window, 'copiedContact', value) },
      } })
    })
    await page.goto(`${prefix}pricing/`)
    const contacts = page.locator('[data-donation-guidance] [data-contact-methods]')
    await expect(contacts.locator('[data-contact-account]:visible')).toHaveCount(0)
    await expect(contacts.locator('.contact-icon')).toHaveText(['', '', ''])
    const email = contacts.locator('a.contact-icon')
    await expect(email).toHaveAttribute('href', 'mailto:icebreaker@weapp.dev')
    await expect(email).toHaveAccessibleName(prefix === '/' ? '发送邮件' : 'Send an email')
    for (const [channel, account] of [['wechat', 'SonOfMagic'], ['qq', '1324318532']]) {
      const details = contacts.locator(`[data-contact-channel="${channel}"]`)
      await details.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(details).toHaveAttribute('open', '')
      await expect(contacts.locator('details[open]')).toHaveCount(1)
      await expect(details.locator('[data-contact-account]')).toHaveText(account)
      await expect(details.locator('img')).toBeVisible()
      await expect(details.locator('img')).toHaveJSProperty('naturalWidth', channel === 'wechat' ? 680 : 900)
      await details.locator('[data-contact-copy]').click()
      expect(await page.evaluate(() => Reflect.get(window, 'copiedContact'))).toBe(account)
      await expect(details.getByRole('status')).toHaveText(prefix === '/' ? '已复制账号' : 'Account copied')
      await expect(details.locator('a[download]')).toHaveAttribute('href', `/contact/${channel}-original.jpg`)
      await expect(details.locator('a[target="_blank"]')).toHaveAttribute('rel', 'noopener noreferrer')
    }
    const analyticsTargets = await contacts.locator('[data-analytics-target]').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.analyticsTarget))
    expect(analyticsTargets).toEqual(['wechat', 'wechat', 'qq', 'qq', 'email'])
    expect((await new AxeBuilder({ page }).include('[data-donation-guidance]').analyze()).violations).toEqual([])
  })

  test(`copy failure preserves a manual path in ${prefix}`, async ({ page }) => {
    test.skip(isOpenSourceSite, 'Personal contact methods belong to weapp.dev')
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: {
        writeText: async () => { throw new Error('Clipboard denied') },
      } })
    })
    await page.goto(prefix)
    const wechat = page.locator('[data-contact-channel="wechat"]')
    await wechat.locator('summary').click()
    await wechat.locator('[data-contact-copy]').click()
    await expect(wechat.getByRole('status')).toContainText(prefix === '/' ? '手动复制' : 'manually')
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('SonOfMagic')
    await expect(wechat.locator('[data-contact-account]')).toBeFocused()
  })

  test(`contacts work without JavaScript in ${prefix}`, async ({ browser }) => {
    test.skip(isOpenSourceSite, 'Personal contact methods belong to weapp.dev')
    const context = await browser.newContext({ javaScriptEnabled: false })
    try {
      const page = await context.newPage()
      await page.goto(`${prefix}pricing/`)
      const contacts = page.locator('#contact [data-contact-methods]')
      for (const channel of ['wechat', 'qq']) {
        const details = contacts.locator(`[data-contact-channel="${channel}"]`)
        await details.locator('summary').click()
        await expect(details.locator('img')).toBeVisible()
        await expect(details.locator('[data-contact-account]')).toBeVisible()
        await expect(details.locator('[data-contact-copy]')).toBeHidden()
        await expect(details.locator('a[download]')).toBeVisible()
      }
    }
    finally {
      await context.close()
    }
  })
}

for (const width of [320, 390, 768, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`expanded contacts fit ${width}px ${theme}`, async ({ page }, testInfo) => {
      test.skip(isOpenSourceSite || testInfo.project.name !== 'desktop', 'Explicit viewport matrix runs once on weapp.dev')
      await page.setViewportSize({ width, height: 1000 })
      await applyTheme(page, theme, { reducedMotion: 'reduce' })
      for (const prefix of ['/', '/en/']) {
        await page.goto(`${prefix}pricing/`)
        for (const placement of ['[data-donation-guidance]', '#contact']) {
          const contacts = page.locator(`${placement} [data-contact-methods]`)
          for (const channel of ['wechat', 'qq']) {
            await contacts.locator(`[data-contact-channel="${channel}"] summary`).click()
            const panel = contacts.locator('details[open] .contact-panel')
            const box = (await panel.boundingBox())!
            expect(box.x).toBeGreaterThanOrEqual(0)
            expect(box.x + box.width).toBeLessThanOrEqual(width)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
            const controls = await contacts.locator('summary, a:visible, button:visible').evaluateAll(elements => elements.map((element) => {
              const rect = element.getBoundingClientRect()
              return { height: rect.height, left: rect.left, right: rect.right }
            }))
            expect(controls.every(control => control.height >= 44 && control.left >= 0 && control.right <= width)).toBe(true)
            if ([390, 1440].includes(width) && placement === '[data-donation-guidance]') {
              await contacts.screenshot({ path: testInfo.outputPath(`${prefix === '/' ? 'zh' : 'en'}-${channel}.png`) })
            }
          }
        }
      }
    })
  }
}
