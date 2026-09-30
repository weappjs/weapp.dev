import type { Page } from '@playwright/test'

export async function applyTheme(
  page: Page,
  theme: 'light' | 'dark',
  media: { reducedMotion?: 'reduce' | 'no-preference' } = {},
) {
  await page.addInitScript(selected => localStorage.setItem('weapp-theme', selected), theme)
  await page.emulateMedia({ colorScheme: theme, ...media })
}
