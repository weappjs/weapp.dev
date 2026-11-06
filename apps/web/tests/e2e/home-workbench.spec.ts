import { expect, test } from './test'

const coreIds = ['weapp-vite', 'weapp-tailwindcss', 'weapp-pandacss', 'weapp-stylex', 'varo', 'weapp-sqlite']
const coreDocs = {
  'weapp-vite': 'https://vite.weapp.dev/',
  'weapp-tailwindcss': 'https://tw.weapp.dev/',
  'weapp-pandacss': 'https://panda.weapp.dev/',
  'weapp-stylex': 'https://stylex.weapp.dev/',
  'varo': 'https://varo.weapp.dev/',
  'weapp-sqlite': 'https://sqlite.weapp.dev/',
} as const
const coreStatuses = {
  'weapp-vite': 'stable',
  'weapp-tailwindcss': 'stable',
  'weapp-pandacss': 'stable',
  'weapp-stylex': 'beta',
  'varo': 'stable',
  'weapp-sqlite': 'beta',
} as const

for (const prefix of ['', '/en']) {
  test(`renders the four-layer weapp workbench on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/`)
    const workbench = page.locator('[data-toolchain-workbench]')
    await expect(workbench).toBeVisible()
    await expect(workbench.getByRole('heading', { level: 2 })).toHaveText(prefix ? 'One toolchain, composed by responsibility' : '一条工具链，按职责组合')
    await expect(workbench.locator('[data-workbench-tab]')).toHaveCount(4)
    await expect(workbench.locator('[data-workbench-panel]')).toHaveCount(4)
    await expect(workbench.locator('[data-project-id]')).toHaveCount(6)
    await expect(workbench.locator('[data-project-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-project-id')))).resolves.toEqual(coreIds)
    for (const id of coreIds) {
      const product = workbench.locator(`[data-project-id="${id}"]`)
      await expect(product.locator('h4')).toHaveText(id === 'varo' ? 'Varo' : id)
      await expect(product.locator('[data-project-status]')).toHaveAttribute('data-project-status', coreStatuses[id as keyof typeof coreStatuses])
      await expect(product.locator('.workbench-metrics')).toBeAttached()
      await expect(product.locator('a[data-analytics-target="docs"]')).toHaveAttribute('href', coreDocs[id as keyof typeof coreDocs])
      await expect(product.locator('a[data-analytics-event="select_project"]')).toHaveAttribute('href', `${prefix}/projects/${id}/`)
    }
    await expect(workbench.locator('[data-workbench-tab="engineering"]')).toHaveAttribute('aria-selected', 'true')
    await expect(workbench.locator('[data-project-id="weapp-vite"]')).toBeVisible()
    await expect(workbench.locator('[data-project-id="weapp-vite"] a[data-analytics-target="docs"]')).toHaveAttribute('href', 'https://vite.weapp.dev/')
    await expect(workbench.locator('[data-project-id="weapp-vite"] a[data-analytics-event="select_project"]')).toHaveAttribute('href', `${prefix}/projects/weapp-vite/`)

    await workbench.locator('[data-workbench-tab="styling"]').click()
    await expect(workbench.locator('[data-workbench-panel="styling"]')).toBeVisible()
    await expect(workbench.locator('[data-workbench-panel="styling"] [data-project-id]')).toHaveCount(3)
    await expect(workbench.locator('[data-workbench-tab="engineering"]')).toHaveAttribute('aria-selected', 'false')
    await expect(workbench.locator('[data-workbench-panel="engineering"]')).toBeHidden()

    await workbench.locator('[data-workbench-tab="data"]').click()
    await expect(workbench.locator('[data-project-id="weapp-sqlite"]')).toContainText(prefix ? 'Beta' : '测试版')
    await expect(workbench.locator('[data-project-id="weapp-sqlite"]')).toContainText('pnpm add @weapp-sqlite/weapp-vite')
    await expect(workbench.locator('#workbench-lab home-demos')).toHaveCount(1)
  })

  test(`keeps workbench tabs keyboard accessible on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/`)
    const workbench = page.locator('[data-toolchain-workbench]')
    const tabs = workbench.locator('[data-workbench-tab]')
    await tabs.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toBeFocused()
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(tabs.last()).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tabs.first()).toBeFocused()
    await expect(workbench.locator('[data-workbench-panel="engineering"]')).toBeVisible()
  })
}

test.describe('workbench static fallback', () => {
  test.use({ javaScriptEnabled: false, reducedMotion: 'reduce' })

  for (const prefix of ['', '/en']) {
    test(`keeps every layer visible without JavaScript on ${prefix || 'zh-CN'}`, async ({ page }) => {
      await page.goto(`${prefix}/`)
      const workbench = page.locator('[data-toolchain-workbench]')
      await expect(workbench.locator('[data-workbench-tabs]')).toBeHidden()
      for (const role of ['engineering', 'styling', 'components', 'data']) {
        await expect(workbench.locator(`[data-workbench-panel="${role}"]`)).toBeVisible()
      }
      await expect(workbench.locator('[data-project-id]')).toHaveCount(6)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  }
})
