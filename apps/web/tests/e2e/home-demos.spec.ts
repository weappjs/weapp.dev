import { demoCopy } from '../../src/components/home/demos/copy'
import { expect, test } from './test'

for (const locale of ['zh-CN', 'en'] as const) {
  const copy = demoCopy[locale]
  const route = locale === 'en' ? '/en/' : '/'

  test(`${locale}: style controls change real CSS and keep instances independent`, async ({ page }) => {
    await page.goto(route)
    await page.getByRole('tab', { name: copy.tabs.style, exact: true }).click()
    const hero = page.locator('home-demos style-demo')
    const button = hero.locator('[data-style-button]')
    const before = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return { color: style.backgroundColor, radius: style.borderRadius, padding: style.padding }
    })
    await hero.getByRole('radio', { name: copy.colors[1], exact: true }).check()
    await hero.locator('select').selectOption('2')
    await hero.getByRole('checkbox', { name: copy.compact }).check()
    await expect(button).toHaveClass('bg-blue-700 text-white rounded-lg px-4 py-2 font-medium')
    await expect(hero.locator('code')).toContainText('bg-blue-700 text-white')
    const after = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return { color: style.backgroundColor, radius: style.borderRadius, padding: style.padding }
    })
    expect(after.color).not.toBe(before.color)
    expect(after.radius).not.toBe(before.radius)
    expect(after.padding).not.toBe(before.padding)
    await expect(page.locator('#projects .home-project-proof')).toHaveCount(3)
    await expect(page.locator('#projects [data-project-id="weapp-vite"] home-demos')).toHaveCount(1)
    await expect(page.locator('.home-hero home-demos')).toHaveCount(0)
    await button.click()
    await expect(button).toHaveText(copy.saved)
    await expect(hero.locator('code')).toContainText(copy.saved)
  })

  test(`${locale}: tabs support keyboard navigation and build targets stay aligned`, async ({ page }) => {
    await page.goto(route)
    const tabs = page.locator('home-demos [role="tab"]')
    const buildTab = page.getByRole('tab', { name: copy.tabs.build, exact: true })
    await buildTab.click()
    const build = page.locator('home-demos build-demo')
    await expect(build).toBeVisible()
    await build.getByRole('radio', { name: copy.targets[1] }).check()
    await expect(build.locator('pre code')).toContainText('targets: [\'alipay\']')
    await expect(build.locator('[data-directory]')).toHaveText('dist/alipay/dist/')
    await expect(build.locator('[data-output-file="0"]')).toHaveText('index.axml')
    await expect(build.locator('[data-build-command]')).toHaveText('pnpm exec wv build -p alipay')
    await buildTab.focus()
    await page.keyboard.press('End')
    await expect(tabs.last()).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.first()).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(tabs.last()).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tabs.first()).toBeFocused()
    await buildTab.click()
    await expect(build.locator('[data-directory]')).toHaveText('dist/alipay/dist/')
  })

  test(`${locale}: migration proof exposes Vite HMR boundary`, async ({ page }) => {
    await page.goto(route)
    const tabs = page.locator('home-demos [role="tab"]')
    await tabs.last().click()
    await expect(page.locator('home-demos [data-demo="migration"]')).toBeVisible()
    const proof = page.locator('home-demos [data-demo="migration"]')
    await expect(proof.locator('pre code')).toContainText('npm create vite-taro@latest my-app')
    await proof.getByRole('radio').last().check()
    await expect(proof.locator('figure:visible img')).toHaveJSProperty('src', new URL('/media/projects/vpt-hmr-after.webp', page.url()).href)
    await expect(proof.locator('figure:visible')).toContainText('5')
    await expect(page.locator('[data-migration-hmr]')).toContainText('HMR')
  })

  test(`${locale}: registry selection updates command and composition, preserving one choice`, async ({ page }) => {
    await page.goto(route)
    const tabs = page.locator('home-demos [role="tab"]')
    await tabs.nth(2).click()
    const registry = page.locator('home-demos registry-demo')
    await expect(registry).toBeVisible()
    await registry.getByRole('checkbox', { name: 'button', exact: true }).uncheck()
    await expect(registry.locator('[data-registry-button]')).toBeHidden()
    await expect(registry.locator('code')).not.toContainText('button')
    await registry.getByRole('checkbox', { name: 'card', exact: true }).uncheck()
    await expect(registry.getByRole('checkbox', { name: 'input', exact: true })).toBeDisabled()
    await expect(registry.locator('[data-registry-card]')).toBeHidden()
    await registry.getByRole('textbox', { name: copy.input }).fill('real-project')
    await registry.getByRole('checkbox', { name: 'button', exact: true }).check()
    await expect(registry.getByRole('checkbox', { name: 'input', exact: true })).toBeEnabled()
    await registry.locator('[data-registry-button]').click()
    await expect(registry.locator('[data-registry-button]')).toHaveAttribute('aria-pressed', 'true')
    await expect(registry).toContainText(copy.registryDone)
    await expect(registry).toContainText(copy.registryNote)
    await expect(registry.locator('code')).toContainText('button input')
  })
}

test('copy reports success and clipboard failures accessibly', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
      sessionStorage.setItem('copied-demo', text)
    } } })
  })
  await page.goto('/')
  await page.getByRole('tab', { name: '样式', exact: true }).click()
  const code = page.locator('home-demos style-demo demo-code')
  await code.getByRole('button', { name: '复制代码' }).click()
  await expect(code.getByRole('status')).toHaveText('已复制')
  expect(await page.evaluate(() => sessionStorage.getItem('copied-demo'))).toBe(await code.locator('code').textContent())
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {
      throw new Error('Permission denied')
    } } })
  })
  await code.getByRole('button', { name: '复制代码' }).click()
  await expect(code.getByRole('status')).toContainText('复制失败')
  await expect(code.locator('pre')).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(await code.locator('code').textContent())
})

test('default examples remain readable without JavaScript', async ({ browser, viewport }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport })
  const page = await context.newPage()
  for (const route of ['/', '/en/']) {
    await page.goto(route)
    await expect(page.locator('home-demos build-demo .demo-code pre code')).toContainText('defineConfig')
    await expect(page.locator('home-demos [data-demo="sqlite"]')).toContainText('CREATE TABLE notes')
    await expect(page.locator('home-demos [data-demo="sqlite"]')).toContainText(route === '/' ? '未运行数据库' : 'no database is running')
    await expect(page.locator('home-demos [data-demo="sqlite"]')).toContainText(route === '/' ? '不提供生产 API' : 'no production API')
    await expect(page.locator('home-demos [role="tablist"]')).toBeHidden()
    await expect(page.locator('.demo-controls:visible, [data-copy]:visible')).toHaveCount(0)
    await expect(page.locator('#projects .home-project-proof')).toHaveCount(3)
    await expect(page.locator('#projects .home-lab')).toHaveCount(1)
    await expect(page.locator('.home-hero home-demos')).toHaveCount(0)
  }
  await context.close()
})

test('reduced motion updates results without motion or layout shifts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const hero = page.locator('home-demos')
  const box = await hero.boundingBox()
  for (const tab of await hero.getByRole('tab').all()) {
    await tab.click()
    const next = await hero.boundingBox()
    expect(next?.width).toBe(box?.width)
    expect(next?.height).toBe(box?.height)
    await tab.hover()
    await tab.focus()
    const animated = await hero.evaluate(element => [...element.querySelectorAll('*')].filter((child) => {
      const style = getComputedStyle(child)
      return style.transform !== 'none' || style.transitionDuration !== '0s' || style.animationName !== 'none'
    }).length)
    expect(animated).toBe(0)
  }
  await hero.getByRole('tab', { name: '组件', exact: true }).click()
  await hero.locator('input[value="card"]').uncheck()
  const after = await hero.boundingBox()
  expect(after?.width).toBe(box?.width)
  expect(after?.height).toBe(box?.height)
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
})

test('all demo states fit at 320 through 1440px without resizing the lab', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const route of ['/', '/en/']) {
    await page.goto(route)
    for (const width of [320, 390, 620, 720, 900, 1100, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      const hero = page.locator('home-demos')
      const box = await hero.boundingBox()
      for (const tab of await hero.getByRole('tab').all()) {
        await tab.click()
        const next = await hero.boundingBox()
        expect(next?.width, `${route} ${width} width`).toBe(box?.width)
        expect(next?.height, `${route} ${width} height`).toBe(box?.height)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(overflow, `${route} ${width}`).toBe(false)
        const clipped = await hero.locator('button:visible, select:visible, .demo-pane-heading:visible').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent))
        expect(clipped, `${route} ${width}`).toEqual([])
      }
    }
  }
})
