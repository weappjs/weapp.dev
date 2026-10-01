import { expect, test } from '@playwright/test'

test('project rows carry their own layout and keep filtered entries hidden', async ({ page }) => {
  await page.goto('/projects/')
  const card = page.locator('[data-project-card]').first()
  await expect(card).toHaveCSS('display', 'grid')
  await expect(card.locator('h2')).toHaveCSS('font-size', /(?:2[4-9]|3[0-2])px/)
  await page.locator('[data-filter-role]').selectOption('styling')
  await expect(card).toBeHidden()
})
