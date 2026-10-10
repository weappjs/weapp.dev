import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { heroWordmark } from './site-target'

export async function expectGatedPlanets(page: Page) {
  const constellation = page.locator('hero-planets')
  await expect(constellation).toHaveJSProperty('inert', true)
  await expect(constellation).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.home-hero-planet')).toHaveCount(10)
  for (const planet of await page.locator('.home-hero-planet').all()) {
    await expect(planet).toBeHidden()
  }
  for (const name of await page.locator('.home-hero-planet-name').all()) {
    await expect(name).toBeHidden()
  }
  await expect(page.locator('.home-hero-orbit')).toBeHidden()
  await expect(page.locator('[data-planet-caption]')).toBeHidden()
  await expect(page.locator('.home-hero-planet[data-planet-active]')).toHaveCount(0)
  await expect(constellation).not.toHaveAttribute('data-planets-orbit-running', '')
  const planet = page.locator('.home-hero-planet').first()
  await planet.evaluate((element: HTMLAnchorElement) => element.focus({ preventScroll: true }))
  await expect(planet).not.toBeFocused()
  expect(await planet.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return target === element || element.contains(target)
  }), 'An unrevealed planet must not receive pointer hits').toBe(false)
}

export async function expectStaticStarfield(page: Page, scriptsEnabled = true) {
  if (scriptsEnabled) {
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('hero-particles')))).toBe(true)
  }
  const screen = page.locator('.home-hero-screen')
  await expect(screen).toHaveAttribute('data-hero-phase', 'stars')
  await expect(screen).not.toHaveAttribute('data-particles-active', '')
  await expect(screen).not.toHaveAttribute('data-particles-ready', '')
  const heading = page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })
  await expect(heading).toHaveCount(1)
  await expect(heading).toHaveText(heroWordmark)
  const accessibleText = page.locator('#home-hero-title > .sr-only')
  await expect(accessibleText).toHaveText(heroWordmark)
  expect(await accessibleText.evaluate((element) => {
    const style = getComputedStyle(element)
    return style.clipPath !== 'none' || style.getPropertyValue('clip') !== 'auto'
  }), 'The accessible brand heading must not paint a central text opening').toBe(true)
  await expect(page.locator('[data-hero-logo], .home-hero-letter')).toHaveCount(0)
  const stars = page.locator('[data-hero-starfield]')
  await expect(stars).toBeVisible()
  await expect(stars).toHaveCSS('visibility', 'visible')
  await expect(stars.locator('circle')).toHaveCount(400)
  const visibleStars = await stars.locator('circle').evaluateAll(elements => elements.filter(element => getComputedStyle(element).display !== 'none').length)
  expect(visibleStars, 'The fallback must paint the same star budget as the renderer').toBe((page.viewportSize()?.width ?? 0) < 720 ? 160 : 400)
  await expectGatedPlanets(page)
  const rail = page.locator('.home-project-rail a').first()
  await expect(rail).toBeVisible()
  await expect(rail).toHaveAttribute('href', /^https:\/\//)
  expect(await rail.evaluate((element: HTMLAnchorElement) => element.closest('[inert]') === null)).toBe(true)
}
