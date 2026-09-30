import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { heroWordmark, isOpenSourceSite } from './site-target'

interface WordmarkSample {
  text: string
  width: number
  height: number
  fontSize: number
  left: number
  right: number
  top: number
  bottom: number
}

declare global {
  interface Window {
    __heroWordmarkSamples: WordmarkSample[]
  }
}

const homeRoutes = (isOpenSourceSite ? ['', '/weapp.dev'] : [''])
  .flatMap(mount => [`${mount}/`, `${mount}/en/`])
const resizeRoute = isOpenSourceSite ? '/weapp.dev/' : '/'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Keep direct English visits in English, including the Pages mount.
    localStorage.setItem('weapp-locale', /\/en\//.test(location.pathname) ? 'en' : 'zh-CN')
  })
})

async function captureWordmarkSamples(page: Page) {
  await page.addInitScript(() => {
    window.__heroWordmarkSamples = []
    const samples = new WeakMap<HTMLCanvasElement, WordmarkSample>()
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      let sample = samples.get(this.canvas)
      if (!sample) {
        sample = {
          text: '',
          width: this.canvas.width,
          height: this.canvas.height,
          fontSize: Number.parseFloat(this.font.match(/([\d.]+)px/)?.[1] ?? '0'),
          left: Infinity,
          right: -Infinity,
          top: Infinity,
          bottom: -Infinity,
        }
        samples.set(this.canvas, sample)
        window.__heroWordmarkSamples.push(sample)
      }
      const glyph = this.measureText(text)
      sample.text += text
      sample.left = Math.min(sample.left, x - glyph.actualBoundingBoxLeft)
      sample.right = Math.max(sample.right, x + glyph.actualBoundingBoxRight)
      sample.top = Math.min(sample.top, y - glyph.actualBoundingBoxAscent)
      sample.bottom = Math.max(sample.bottom, y + glyph.actualBoundingBoxDescent)
      if (maxWidth === undefined) {
        fillText.call(this, text, x, y)
      }
      else {
        fillText.call(this, text, x, y, maxWidth)
      }
    }
  })
}

async function expectActiveWordmark(page: Page) {
  await expect(page.locator('.home-hero-screen')).toHaveAttribute('data-particles-active', '')
  await expect(page.locator('[data-hero-particles]')).toHaveAttribute('data-wordmark', heroWordmark)
  await expect(page.locator('#home-hero-title')).toHaveText(heroWordmark)
  const samples = await page.evaluate(() => window.__heroWordmarkSamples)
  expect(samples.length, 'The active renderer must actually sample a canvas wordmark').toBeGreaterThan(0)
  for (const sample of samples) {
    expect(sample.text, 'Canvas text must match the deployment brand').toBe(heroWordmark)
    expect(sample.left, `${sample.width}px canvas: left ink edge`).toBeGreaterThanOrEqual(sample.width * 0.05 - 1)
    expect(sample.right, `${sample.width}px canvas: right ink edge`).toBeLessThanOrEqual(sample.width * 0.95 + 1)
    expect(sample.top).toBeGreaterThanOrEqual(0)
    expect(sample.bottom).toBeLessThanOrEqual(sample.height)
  }
}

async function expectStaticWordmark(page: Page, scriptsEnabled = true) {
  if (scriptsEnabled) {
    // Wait for component initialization so the assertion cannot pass on the
    // initial static title before a broken renderer hides it.
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('hero-particles')))).toBe(true)
  }
  await expect(page.locator('.home-hero-screen')).not.toHaveAttribute('data-particles-active', '')
  await expect(page.locator('#home-hero-title')).toHaveText(heroWordmark)
  await expect(page.locator('#home-hero-title > [aria-hidden]')).toBeVisible()
  await expect(page.locator('#home-hero-title > [aria-hidden]')).toHaveCSS('visibility', 'visible')
}

for (const route of homeRoutes) {
  test(`draws the deployment wordmark in the particle canvas at ${route}`, async ({ page }) => {
    await captureWordmarkSamples(page)
    await page.goto(route)
    await expect(page).toHaveURL(route)
    await expectActiveWordmark(page)
  })
}

test('fits the particle wordmark after desktop and mobile viewport changes', async ({ page }) => {
  await captureWordmarkSamples(page)
  await page.goto(resizeRoute)
  await expectActiveWordmark(page)

  for (const width of [320, 393, 1101, 1280, 1440, 320]) {
    const previousSamples = await page.evaluate(() => window.__heroWordmarkSamples.length)
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate((previousCount) => {
      const samples = window.__heroWordmarkSamples
      const latest = samples.at(-1)
      const screen = document.querySelector<HTMLElement>('.home-hero-screen')!
      const dpr = Math.min(1.75, window.devicePixelRatio || 1)
      return samples.length > previousCount && latest?.width === Math.floor(screen.clientWidth * dpr)
    }, previousSamples), { message: `Resample the wordmark at ${width}px` }).toBe(true)
    await expectActiveWordmark(page)
    const sizes = await page.evaluate(() => ({
      sampled: window.__heroWordmarkSamples.at(-1)!.fontSize,
      maximum: Number.parseFloat(getComputedStyle(document.querySelector('#home-hero-title')!).fontSize)
        * Math.min(1.75, window.devicePixelRatio || 1),
    }))
    expect(sizes.sampled, 'Fitting must not enlarge the existing title size').toBeLessThanOrEqual(sizes.maximum + 0.01)
  }
})

test.describe('static particle fallback without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('keeps the deployment wordmark visible in both languages', async ({ page }) => {
    for (const route of homeRoutes) {
      await page.goto(route)
      await expectStaticWordmark(page, false)
    }
  })
})

test('keeps the static wordmark visible with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const route of homeRoutes) {
    await page.goto(route)
    await expectStaticWordmark(page)
  }
})

test('keeps the static wordmark visible when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
        return null
      }
      return getContext.call(this, contextId, options)
    } as typeof getContext
  })
  for (const route of homeRoutes) {
    await page.goto(route)
    await expectStaticWordmark(page)
  }
})

for (const value of ['missing', 'blank'] as const) {
  test(`keeps the static wordmark visible with a ${value} particle brand`, async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.continue()
        return
      }
      const response = await route.fetch()
      const html = await response.text()
      const body = html.replace(/(<hero-particles\b[^>]*?)\sdata-wordmark="[^"]*"/, `$1${value === 'blank' ? ' data-wordmark="   "' : ''}`)
      expect(body, 'The fixture must alter the actual particle brand attribute').not.toBe(html)
      await route.fulfill({ response, body })
    })
    for (const route of homeRoutes) {
      await page.goto(route)
      await expectStaticWordmark(page)
    }
  })
}
