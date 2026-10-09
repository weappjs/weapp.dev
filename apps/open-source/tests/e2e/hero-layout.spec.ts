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

for (const viewport of viewports) {
  test(`planet targets, names and descriptions stay clear at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    for (const path of ['/', '/en/']) {
      await page.goto(path)
      const planets = page.locator('.home-hero-planet')
      await expect(planets).toHaveCount(10)
      await expect(page.locator('hero-planets')).toHaveAttribute('data-planets-ready', '')
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
          const word = document.querySelector('#home-hero-title')!.getBoundingClientRect()
          const screen = document.querySelector('.home-hero-screen')!.getBoundingClientRect()
          const links = [...document.querySelectorAll<HTMLElement>('.home-hero-planet')]
          const planets = links.map(element => ({ id: element.dataset.analyticsProject, box: element.getBoundingClientRect() }))
          const names = links.map(element => ({
            id: element.dataset.analyticsProject,
            element: element.nextElementSibling!,
            box: element.nextElementSibling!.getBoundingClientRect(),
          })).filter(name => getComputedStyle(name.element).display !== 'none')
          const overlaps = (a: DOMRect, b: DOMRect) => a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5
          const outside = (box: DOMRect) => box.left < screen.left - 0.5 || box.right > screen.right + 0.5 || box.top < screen.top - 0.5 || box.bottom > screen.bottom + 0.5
          const collisions: string[] = []
          for (const [index, planet] of planets.entries()) {
            if (outside(planet.box)) {
              collisions.push(`${planet.id}: clipped`)
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
              collisions.push(`${name.id} name: clipped`)
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
              collisions.push('description: clipped')
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
        expect(collisions, `${path} ${viewport.width}px at step ${step}`).toEqual([])
      }
    }
  })
}
