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

export async function particleLogoAppearance(page: Page) {
  return page.locator('[data-hero-particle-logo]').evaluate((element: SVGSVGElement) => {
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
    const palette = new Map<number, { rgb: number[], points: number }>()
    for (const path of visible) {
      const index = Number(path.dataset.logoColor)
      const fill = getComputedStyle(path).fill
      const match = fill.match(/^rgb\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)\s*\)$/)
      if (!match) {
        throw new Error(`A particle Logo tint must resolve to sRGB, received ${fill}`)
      }
      const rgb = match.slice(1).map(Number)
      const previous = palette.get(index)
      if (previous && previous.rgb.some((value, channel) => value !== rgb[channel])) {
        throw new Error('Each shared Logo palette index must paint a single color')
      }
      palette.set(index, { rgb, points: (previous?.points ?? 0) + Number(path.dataset.logoPoints) })
    }
    return {
      points: visible.reduce((total, path) => total + Number(path.dataset.logoPoints), 0),
      expectedPoints: screen.width < 720 ? 900 : 2400,
      pointShapes: pointPaths.every((path) => {
        const count = Number(path.dataset.logoPoints)
        const data = path.getAttribute('d') ?? ''
        const shapes = data.match(/M[^Mz]+z/g) ?? []
        const sparkle = path.dataset.logoSparkle === '1'
        return count > 0 && shapes.length === count && shapes.join('') === data
          && shapes.every(shape => sparkle
            ? (shape.match(/L/g)?.length ?? 0) === 7 && !/a/i.test(shape)
            : (shape.match(/a/g)?.length ?? 0) === 2 && !/L/i.test(shape))
      }),
      sparkles: visible.filter(path => path.dataset.logoSparkle === '1')
        .reduce((total, path) => total + Number(path.dataset.logoPoints), 0),
      palette: [...palette].sort(([left], [right]) => left - right).map(([index, color]) => ({ index, ...color })),
      solidPaths: element.querySelectorAll('path:not([data-logo-points])').length,
      centered: Math.abs((box.left + box.right) / 2 - (screen.left + screen.right) / 2) <= 1,
      clipped: box.left < screen.left - 0.5 || box.right > screen.right + 0.5
        || box.top < screen.top - 0.5 || box.bottom > screen.bottom + 0.5,
    }
  })
}

export async function expectParticleLogo(page: Page) {
  const logo = page.locator('[data-hero-particle-logo]')
  await expect(logo).toHaveCount(1)
  await expect(logo).toBeVisible()
  await expect(logo).toHaveAttribute('aria-hidden', 'true')
  await expect(logo).toHaveAttribute('data-logo-count', '2400')
  await expect(logo).toHaveAttribute('data-logo-mobile-count', '900')
  const geometry = await particleLogoAppearance(page)
  expect(geometry.points, 'SSR must display the real responsive Logo point budget').toBe(geometry.expectedPoints)
  expect(geometry.pointShapes, 'Each SSR Logo star must remain one separate circle or an eight-vertex fine sparkle').toBe(true)
  expect(geometry.sparkles, 'The opening should include a few independent fine star rays').toBeGreaterThan(0)
  expect(geometry.sparkles / geometry.points, 'Fine star rays must remain rare within the stable point cloud').toBeLessThanOrEqual(0.07)
  expect(geometry.palette.map(color => color.index), 'Both responsive clouds must use all four shared stellar tints').toEqual([0, 1, 2, 3])
  expect(new Set(geometry.palette.map(color => color.rgb.join(','))).size).toBe(4)
  for (const color of geometry.palette) {
    expect(color.rgb.every(channel => channel >= 0 && channel <= 255)).toBe(true)
    expect(new Set(color.rgb).size, 'The opening Logo must have real colored points rather than neutral white tiers').toBeGreaterThan(1)
    expect(color.points).toBeGreaterThan(0)
  }
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
