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

export async function expectParticleLogo(page: Page) {
  const logo = page.locator('[data-hero-particle-logo]')
  await expect(logo).toHaveCount(1)
  await expect(logo).toBeVisible()
  await expect(logo).toHaveAttribute('aria-hidden', 'true')
  await expect(logo).toHaveAttribute('data-logo-count', '2400')
  await expect(logo).toHaveAttribute('data-logo-mobile-count', '900')
  const geometry = await logo.evaluate((element: SVGSVGElement) => {
    const screen = element.closest('.home-hero-screen')!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const pointPaths = [...element.querySelectorAll<SVGPathElement>('path[data-logo-points]')]
    const visible = pointPaths.filter((path) => {
      for (let node: Element | null = path; node && node !== element; node = node.parentElement) {
        if (getComputedStyle(node).display === 'none') {
          return false
        }
      }
      return true
    })
    return {
      points: visible.reduce((total, path) => total + Number(path.dataset.logoPoints), 0),
      pointShapes: pointPaths.every((path) => {
        const count = Number(path.dataset.logoPoints)
        const data = path.getAttribute('d') ?? ''
        return count > 0 && (data.match(/M/gi)?.length ?? 0) === count
          && /a/i.test(data)
      }),
      solidPaths: element.querySelectorAll('path:not([data-logo-points])').length,
      centered: Math.abs((box.left + box.right) / 2 - (screen.left + screen.right) / 2) <= 1,
      clipped: box.left < screen.left - 0.5 || box.right > screen.right + 0.5
        || box.top < screen.top - 0.5 || box.bottom > screen.bottom + 0.5,
    }
  })
  expect(geometry.points, 'SSR must display the real responsive Logo point budget').toBe((page.viewportSize()?.width ?? 0) < 720 ? 900 : 2400)
  expect(geometry.pointShapes, 'Each SSR Logo mark must be a separate tiny circular point').toBe(true)
  expect(geometry.solidPaths, 'The opening must not paint a filled mini-program outline').toBe(0)
  expect(geometry.centered, 'The Logo must stay horizontally centered in the hero').toBe(true)
  expect(geometry.clipped, 'The static Logo must fit within the hero').toBe(false)
}

export async function expectStaticStarfield(page: Page, scriptsEnabled = true) {
  if (scriptsEnabled) {
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('hero-particles')))).toBe(true)
  }
  const screen = page.locator('.home-hero-screen')
  await expect(screen).toHaveAttribute('data-hero-phase', 'logo')
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
  await expectParticleLogo(page)
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
