import { expectStaticStarfield } from './hero-fallback'
import { expect, test } from './test'

const viewports = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 600 },
  { width: 1280, height: 600 },
  { width: 1440, height: 500 },
  { width: 1024, height: 400 },
  { width: 820, height: 1180 },
  { width: 844, height: 390 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]

const cases = viewports.flatMap(viewport => ['logo', 'wordmark'].map(phase => ({ viewport, phase })))

for (const { viewport, phase } of cases) {
  test(`planet targets, names and descriptions stay clear around the ${phase} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: phase === 'logo' ? 'reduce' : 'no-preference' })
    for (const path of ['/', '/en/']) {
      await page.goto(path)
      const planets = page.locator('.home-hero-planet')
      await expect(planets).toHaveCount(10)
      await expect(page.locator('hero-planets')).toHaveAttribute('data-planets-ready', '')
      if (phase === 'wordmark') {
        await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-ready', '')
        await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-hero-phase', 'ready')
        await expect(page.locator('hero-planets')).toHaveJSProperty('inert', false)
        await expect(page.locator('[data-hero-logo]')).toHaveCount(0)
        await expect(page.locator('[data-hero-particle-logo]')).toBeHidden()
        const screen = page.locator('.home-hero-screen')
        await expect.poll(() => screen.evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--hero-planet-reveal')))).toBe(1)
        // Animation has dedicated regressions. Freeze its public settled state
        // before checking every orbital position so large mobile-DPR canvases
        // do not keep rendering while the geometry traversal forces layout.
        const pause = page.locator('[data-planet-toggle]')
        await expect(pause).toHaveAttribute('aria-pressed', 'false')
        await pause.click()
        await expect(pause).toHaveAttribute('aria-pressed', 'true')
        await expect(screen).toHaveAttribute('data-hero-motion-paused', '')
        await expect(screen).toHaveAttribute('data-particles-paused', '')
      }
      else {
        await expectStaticStarfield(page)
        const layout = await page.locator('[data-hero-starfield]').evaluate((element) => {
          const screen = element.closest('.home-hero-screen')!.getBoundingClientRect()
          const stars = element.getBoundingClientRect()
          return {
            clipped: stars.left < screen.left - 0.5 || stars.right > screen.right + 0.5
              || stars.top < screen.top - 0.5 || stars.bottom > screen.bottom + 0.5,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          }
        })
        expect(layout, `${path} stars ${viewport.width}px`).toEqual({ clipped: false, overflow: false })
        continue
      }
      await planets.first().focus()
      for (let step = 0; step < 72; step += 1) {
        // Exercise the entire path, including positions between automatic stops.
        await page.locator('.home-hero-planet, .home-hero-planet-name').evaluateAll((elements, turn) => {
          for (const element of elements) {
            const node = element as HTMLElement
            node.style.animation = 'none'
            node.style.setProperty('--orbit-turn', String(turn))
          }
        }, step / 72)
        const collisions = await page.evaluate(() => {
          const stage = document.querySelector<HTMLElement>('.home-hero-screen')!
          const word = document.querySelector('#home-hero-title')!.getBoundingClientRect()
          const screen = stage.getBoundingClientRect()
          const links = [...document.querySelectorAll<HTMLElement>('.home-hero-planet')]
          const planets = links.map(element => ({ id: element.dataset.analyticsProject, element, box: element.getBoundingClientRect() }))
          const names = links.map(element => ({
            id: element.dataset.analyticsProject,
            element: element.nextElementSibling!,
            box: element.nextElementSibling!.getBoundingClientRect(),
          })).filter(name => getComputedStyle(name.element).display !== 'none')
          const overlaps = (a: DOMRect, b: DOMRect) => a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5
          const outside = (box: DOMRect) => box.left < screen.left - 0.5 || box.right > screen.right + 0.5 || box.top < screen.top - 0.5 || box.bottom > screen.bottom + 0.5
          const bounds = (box: DOMRect) => [box.left, box.top, box.right, box.bottom].map(value => Number(value.toFixed(2)))
          const clippedGeometry = (element: Element, box: DOMRect) => {
            const style = getComputedStyle(element)
            const constellation = stage.querySelector<HTMLElement>('hero-planets')!
            const constellationStyle = getComputedStyle(constellation)
            const offsetParent = element instanceof HTMLElement ? element.offsetParent : null
            return JSON.stringify({
              screen: bounds(screen),
              box: bounds(box),
              constellation: {
                rect: bounds(constellation.getBoundingClientRect()),
                offsetWidth: constellation.offsetWidth,
                offsetHeight: constellation.offsetHeight,
                display: constellationStyle.display,
                width: constellationStyle.width,
                height: constellationStyle.height,
              },
              offsetParent: offsetParent && {
                tag: offsetParent.tagName,
                rect: bounds(offsetParent.getBoundingClientRect()),
              },
              offsetPath: style.offsetPath,
              offsetDistance: style.offsetDistance,
              offsetAnchor: style.offsetAnchor,
              translate: style.translate,
              orbitTurn: style.getPropertyValue('--orbit-turn'),
              scroll: [scrollX, scrollY],
            })
          }
          const collisions: string[] = []
          for (const [index, planet] of planets.entries()) {
            if (outside(planet.box)) {
              collisions.push(`${planet.id}: clipped ${clippedGeometry(planet.element, planet.box)}`)
            }
            if (overlaps(planet.box, word)) {
              collisions.push(`${planet.id}: wordmark`)
            }
            for (const other of planets.slice(index + 1)) {
              if (overlaps(planet.box, other.box)) {
                collisions.push(`${planet.id}: ${other.id}`)
              }
            }
          }
          for (const [index, name] of names.entries()) {
            if (outside(name.box)) {
              collisions.push(`${name.id} name: clipped ${clippedGeometry(name.element, name.box)}`)
            }
            if (overlaps(name.box, word)) {
              collisions.push(`${name.id} name: wordmark`)
            }
            for (const other of planets) {
              if (other.id !== name.id && overlaps(name.box, other.box)) {
                collisions.push(`${name.id} name: ${other.id}`)
              }
            }
            for (const other of names.slice(index + 1)) {
              if (overlaps(name.box, other.box)) {
                collisions.push(`${name.id} name: ${other.id} name`)
              }
            }
          }
          const caption = document.querySelector<HTMLElement>('[data-planet-caption]')!
          if (!caption.hidden) {
            const box = caption.getBoundingClientRect()
            if (outside(box)) {
              collisions.push(`description: clipped ${clippedGeometry(caption, box)}`)
            }
            if (overlaps(box, word)) {
              collisions.push('description: wordmark')
            }
            for (const other of [...planets, ...names]) {
              if (overlaps(box, other.box)) {
                collisions.push(`description: ${other.id}`)
              }
            }
          }
          if (document.documentElement.scrollWidth > innerWidth + 1) {
            collisions.push('horizontal overflow')
          }
          return collisions
        })
        expect(collisions, `${path} ${phase} ${viewport.width}px at step ${step}`).toEqual([])
      }
    }
  })
}
