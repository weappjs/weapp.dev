import { expectSiteLink } from './site-target'
import { expect, test } from './test'

const runtimes = [
  { id: 'vue-mini', name: 'Vue Mini', runtime: 'Vue 3', status: 'stable', docs: 'https://vuemini.org/' },
  { id: 'rezor', name: 'Rezor', runtime: 'React', status: 'beta', docs: 'https://github.com/rezorjs/rezor' },
]

test.use({ reducedMotion: 'reduce' })

for (const prefix of ['', '/en']) {
  test(`compares Vue Mini and Rezor in one runtime chapter on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/`)
    const section = page.getByRole('region', { name: prefix ? 'Choose a mini-program runtime' : '选择小程序运行时', exact: true })
    await expect(section).toHaveAttribute('id', 'runtime')
    await expect(section.locator('header')).toContainText('Runtime')
    expect(await section.locator('article').evaluateAll(cards => cards.map(card => card.getAttribute('data-project-id'))))
      .toEqual(runtimes.map(project => project.id))
    await expect(page.locator('section#ecosystem-vue-mini, section#ecosystem-rezor')).toHaveCount(0)
    for (const project of runtimes) {
      const card = section.getByRole('article', { name: project.name, exact: true })
      await expect(card.locator('[data-runtime]')).toHaveText(`Runtime · ${project.runtime}`)
      await expect(card.locator('[data-project-status]')).toHaveAttribute('data-project-status', project.status)
      await expect(card.locator('a[data-analytics-target="docs"]')).toHaveAttribute('href', project.docs)
      const details = card.locator('a[data-analytics-event="select_project"]')
      await expectSiteLink(details, `${prefix}/projects/${project.id}/`)
      await details.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.name)
      await page.goto(`${prefix}/#ecosystem-${project.id}`)
      await expect(card).toBeInViewport()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test.describe('runtime chapter without scripts', () => {
  test.use({ javaScriptEnabled: false })
  for (const prefix of ['', '/en']) {
    test(`keeps both runtime choices readable and linked on ${prefix || 'zh-CN'}`, async ({ page }) => {
      for (const project of runtimes) {
        await page.goto(`${prefix}/#runtime`)
        const card = page.locator(`#runtime [data-project-id="${project.id}"]`)
        await expect(card.getByRole('heading', { level: 3 })).toHaveText(project.name)
        await expect(card.locator('[data-runtime]')).toBeVisible()
        await expect(card.locator('[data-project-status]')).toBeVisible()
        await card.locator('a[data-analytics-event="select_project"]').click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.name)
        await expect(page.locator(`a[href="${project.docs}"]`).first()).toBeVisible()
      }
    })
  }
})
