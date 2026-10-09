import { expectSiteLink } from './site-target'
import { expect, test } from './test'

const stylingProjects = [
  { id: 'weapp-tailwindcss', docs: 'https://tw.weapp.dev/', status: 'stable', command: 'pnpm add -D weapp-tailwindcss' },
  { id: 'weapp-pandacss', docs: 'https://panda.weapp.dev/', status: 'stable', command: 'pnpm add -D @pandacss/dev@2.1.2 @pandacss/preset-base@2.1.2 @pandacss/preset-panda@2.1.2 weapp-pandacss postcss' },
  { id: 'weapp-stylex', docs: 'https://stylex.weapp.dev/', status: 'beta', command: 'pnpm add weapp-stylex' },
]

for (const prefix of ['', '/en']) {
  test(`offers three independent styling paths on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/?role=styling`)
    const cards = page.locator('#toolchain-project-list [data-project-card]:visible')
    await expect(cards).toHaveCount(3)
    for (const project of stylingProjects) {
      const card = cards.filter({ has: page.locator(`[data-analytics-project="${project.id}"]`) })
      await expect(card.getByRole('heading')).toHaveText(project.id)
      await expect(card).toHaveAttribute('data-maturity', project.status)
    }
    await page.locator('[data-filter-maturity]').selectOption('beta')
    await expect(cards).toHaveCount(1)
    await expect(cards.getByRole('heading')).toHaveText('weapp-stylex')
    await page.goto(`${prefix}/`)
    const section = page.getByRole('region', { name: prefix ? 'Choose how you write styles' : '选择适合你的样式写法', exact: true })
    await expect(section).toHaveAttribute('id', 'styling')
    expect(await section.locator('[data-project-row]').evaluateAll(rows => rows.map(row => row.getAttribute('data-project-id'))))
      .toEqual(stylingProjects.map(project => project.id))
    expect(await page.locator('#projects [data-project-row]').evaluateAll(rows => rows.map(row => row.getAttribute('data-project-id'))))
      .toEqual(['weapp-vite', 'varo', 'weapp-sqlite'])
    const jump = page.getByRole('link', { name: prefix ? 'Explore styling tools' : '查看样式工具', exact: true })
    await jump.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${prefix}/#styling$`))
    await expect(section.getByRole('heading', { level: 2 })).toBeInViewport()
    const comparison = section.getByRole('link', { name: prefix ? 'Compare the three styling projects' : '比较三个样式项目', exact: true })
    await expectSiteLink(comparison, `${prefix}/projects/?role=styling`)
    await comparison.click()
    await expect(cards).toHaveCount(3)
    await page.goto(`${prefix}/`)
    await expect(page.locator('home-demos [role="tab"]')).toHaveCount(5)
    for (const project of stylingProjects) {
      const row = page.locator(`#styling [data-project-row][data-project-id="${project.id}"]`)
      await expect(row.getByRole('heading')).toHaveText(project.id)
      if (project.id === 'weapp-tailwindcss') {
        await expect(row.locator('.home-project-proof pre')).toBeVisible()
      }
      else {
        await expect(row.locator('.home-project-proof-list li')).toHaveCount(3)
      }
      await expect(row.locator('a[data-analytics-target="docs"]')).toHaveAttribute('href', project.docs)
      const link = row.locator('a[data-analytics-event="select_project"]')
      await expectSiteLink(link, `${prefix}/projects/${project.id}/`)
      await link.click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.id)
      await expect(page.locator(`a[href="https://www.npmjs.com/package/${project.id}"]`).first()).toBeVisible()
      await expect(page.locator('main')).toContainText(project.command)
      if (project.id === 'weapp-stylex') {
        await expect(page.locator('main')).toContainText(prefix ? 'Not available' : '暂无数据')
        await expect(page.locator('main')).toContainText(prefix ? 'ordinary subpackages' : '普通分包')
      }
      await page.goto(`${prefix}/`)
    }
  })
}

test.describe('styling projects without scripts', () => {
  test.use({ javaScriptEnabled: false, reducedMotion: 'reduce' })
  for (const prefix of ['', '/en']) {
    test(`keeps all three styling routes usable on ${prefix || 'zh-CN'}`, async ({ page }) => {
      for (const project of stylingProjects) {
        await page.goto(`${prefix}/`)
        await expect(page.locator('#styling h2')).toHaveText(prefix ? 'Choose how you write styles' : '选择适合你的样式写法')
        const row = page.locator(`#styling [data-project-row][data-project-id="${project.id}"]`)
        await expect(row.locator('.home-project-proof')).toBeVisible()
        await row.locator('a[data-analytics-event="select_project"]').click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.id)
        await expect(page.locator('main')).toContainText(project.command)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await expect(page.locator(`a[href="${project.docs}"]`).first()).toBeVisible()
      }
    })
  }
})
