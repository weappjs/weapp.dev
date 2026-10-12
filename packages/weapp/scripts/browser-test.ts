import type { Browser, BrowserContext } from '@playwright/test'
import type { CatalogProject, LogoData } from '../src/types.js'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { startLab } from '../src/lab.js'

declare global {
  interface Window {
    __labFrames: number
    __labWordmarkColor: string | CanvasGradient | CanvasPattern
  }
}

const root = new URL('../', import.meta.url)
const evidence = new URL('.cache/qa/', root)
await mkdir(evidence, { recursive: true })
const catalog = JSON.parse(await readFile(new URL('dist/data/catalog.json', root), 'utf8')) as CatalogProject[]
const logo = JSON.parse(await readFile(new URL('dist/data/logo.json', root), 'utf8')) as LogoData
const server = await startLab({ lang: 'zh-CN', motion: true, catalog, logo })
let browser: Browser | undefined
let context: BrowserContext | undefined
const failures: string[] = []
const wordmarkContrasts: Record<string, { ink: string, contrast: number }> = {}
function contrastOnStage(color: string) {
  const rgb = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16))
  const luminance = (channels: number[]) => channels.map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return (luminance(rgb) + 0.05) / (luminance([4, 6, 7]) + 0.05)
}
try {
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__labFrames = 0
    const request = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => request((time) => {
      window.__labFrames++
      callback(time)
    })
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (text === 'weapp') {
        window.__labWordmarkColor = this.fillStyle
      }
      return fillText.call(this, text, x, y, maxWidth)
    }
  })
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(message.text())
    }
  })
  page.on('request', (request) => {
    assert.equal(new URL(request.url()).hostname, '127.0.0.1', 'Lab must stay offline')
  })
  const ready = () => page.waitForSelector('html[data-ready="true"]')
  const screenshot = (name: string) => page.screenshot({ path: fileURLToPath(new URL(name, evidence)), fullPage: true })
  const selected = (slug: string) => page.locator('#project-select').selectOption(slug)
  const fact = (slug: string) => {
    const project = catalog.find(project => project.slug === slug)
    assert.ok(project, `Catalog project: ${slug}`)
    return project
  }
  const canvasImage = () => page.locator('#canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await page.goto(server.url)
  await ready()
  assert.equal(await page.locator('#palette').inputValue(), 'project')
  const entrance = await canvasImage()
  await page.waitForFunction(() => document.querySelector('#phase')?.textContent === '由你来玩')
  assert.notEqual(await canvasImage(), entrance, 'Brand particles must unfold into the project orbits')
  assert.equal(await page.locator('[name="scene"][value="orbit"]').isChecked(), true)
  assert.equal(await page.locator('#scope').inputValue(), 'weapp')
  assert.equal(await page.locator('#project-select option').count(), 6)
  assert.equal(await page.locator('#canvas').getAttribute('data-project'), 'weapp-vite')
  assert.equal(await page.locator('#project-command').textContent(), 'npx weapp create weapp-vite my-app')
  assert.equal(await page.locator('#project-docs').getAttribute('href'), fact('weapp-vite').docsUrl)
  assert.equal(await page.locator('#project-repo').getAttribute('href'), `https://github.com/${fact('weapp-vite').github}`)
  assert.deepEqual(await page.locator('#project-capabilities li').allTextContents(), fact('weapp-vite').locales['zh-CN'].capabilities)
  assert.equal(await page.locator('#project-logo').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true)
  await page.locator('#copy-command').click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'npx weapp create weapp-vite my-app')
  await page.locator('#pause').click()
  assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('#canvas').evaluate((canvas: HTMLCanvasElement) => {
    const drawing = canvas.getContext('2d')
    return drawing ? new Set(drawing.getImageData(0, 0, canvas.width, canvas.height).data).size > 10 : false
  }), true)
  await screenshot('lab-desktop.png')
  await page.locator('#scope').selectOption('all')
  assert.equal(await page.locator('#project-select option').count(), 11)
  for (const project of catalog) {
    await selected(project.slug)
    const renderedInk = await page.evaluate(() => window.__labWordmarkColor)
    assert.equal(typeof renderedInk, 'string')
    assert.ok(typeof renderedInk === 'string')
    const ratio = contrastOnStage(renderedInk)
    assert.ok(ratio >= 3.5, `${project.slug} large wordmark contrast: ${ratio.toFixed(2)}:1`)
    wordmarkContrasts[project.slug] = { ink: renderedInk, contrast: Number(ratio.toFixed(2)) }
    assert.equal(await page.locator('#project-description').textContent(), project.locales['zh-CN'].description)
    assert.equal(await page.locator('#project-logo').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true)
    if (project.status === 'planned') {
      assert.equal(await page.locator('#command-action').isVisible(), false)
      assert.equal(await page.locator('#planned-notice').isVisible(), true)
      assert.equal(await page.locator('#logo-note').isVisible(), true)
      assert.equal(await page.locator('#project-logo').getAttribute('src'), '/logos/miniprogram.svg')
    }
    else {
      assert.equal(await page.locator('#project-command').textContent(), project.slug === 'weapp-vite' ? 'npx weapp create weapp-vite my-app' : project.quickStart?.command || project.installCommand)
      assert.equal(await page.locator('#copy-command').isVisible(), true)
      assert.equal(await page.locator('#logo-note').isVisible(), false)
    }
  }
  await selected('vite-plugin-taro')
  await page.waitForFunction(() => document.querySelector('#phase')?.textContent === '由你来玩')
  await screenshot('lab-vpt.png')
  await selected('weapp-sqlite')
  await page.waitForFunction(() => document.querySelector('#phase')?.textContent === '由你来玩')
  await screenshot('lab-planned.png')
  await selected('weapp-vite')
  await page.locator('#pause').click()
  await screenshot('lab-orbit.png')
  await page.locator('#canvas').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('#project-select').inputValue(), 'weapp-tailwindcss')
  await selected('weapp-vite')
  await page.locator('[name="scene"][value="particles"]').check()
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('#canvas')?.dataset.morph === 'wordmark')
  const wordmark = await canvasImage()
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('#canvas')?.dataset.morph === 'project')
  assert.notEqual(await canvasImage(), wordmark, 'Wordmark must morph into the selected project logo')
  await page.locator('#pause').click()
  await screenshot('lab-particles.png')
  const downloaded = page.waitForEvent('download')
  await page.locator('#download').click()
  const download = await downloaded
  await download.saveAs(fileURLToPath(new URL('particles-export.png', evidence)))
  const png = await readFile(new URL('particles-export.png', evidence))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.ok(png.readUInt32BE(16) > 500)
  await page.locator('#canvas').focus()
  await page.keyboard.press('3')
  assert.equal(await page.locator('[value="flow"]').isChecked(), true)
  const bounds = await page.locator('#canvas').boundingBox()
  assert.ok(bounds)
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.5)
  await page.locator('#palette').selectOption('ice')
  await page.locator('#density').evaluate((input: HTMLInputElement) => {
    input.value = '100'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator('#speed').evaluate((input: HTMLInputElement) => {
    input.value = '200'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator('#replay').click()
  assert.equal(await page.locator('#density-output').textContent(), '100%')
  assert.equal(await page.locator('#speed-output').textContent(), '2×')
  assert.equal(await page.locator('#palette').inputValue(), 'ice')
  assert.equal(await page.locator('#project-select').inputValue(), 'weapp-vite')
  await page.waitForTimeout(300)
  await screenshot('lab-flow.png')
  // Exercise the exact visibilitychange boundary and verify RAF cancellation.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hiddenFrames = await page.evaluate(() => window.__labFrames)
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate(() => window.__labFrames), hiddenFrames, 'Hidden documents must stop RAF')
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(frames => window.__labFrames > frames, hiddenFrames)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('#pause')?.disabled)
  assert.equal(await page.locator('#motion-notice').isVisible(), true)
  await page.locator('#canvas').focus()
  await page.keyboard.press('1')
  const first = await canvasImage()
  await page.waitForTimeout(200)
  assert.equal(await canvasImage(), first, 'Reduced motion must not animate')
  await selected('weapp-pandacss')
  assert.notEqual(await canvasImage(), first, 'Project selection must update the particle logo')
  await selected('weapp-vite')
  await page.locator('[name="scene"][value="orbit"]').check()
  const orbitBounds = await page.locator('#canvas').boundingBox()
  assert.ok(orbitBounds)
  const nodesJson = await page.locator('#canvas').getAttribute('data-nodes')
  assert.ok(nodesJson)
  const nodes = JSON.parse(nodesJson) as { slug: string, x: number, y: number }[]
  const node = nodes.find(node => node.slug === 'weapp-vite')
  assert.ok(node)
  const starX = orbitBounds.x + node.x
  const starY = orbitBounds.y + node.y
  await page.mouse.move(starX, starY)
  await page.mouse.down()
  await page.mouse.move(starX + 45, starY + 35, { steps: 5 })
  await page.mouse.up()
  assert.equal(await page.locator('#project-select').inputValue(), 'weapp-vite')
  const moved = await canvasImage()
  await page.locator('#replay').click()
  assert.notEqual(await canvasImage(), moved, 'Replay must reset planet drag offsets')
  assert.equal(await page.locator('#density').inputValue(), '100')
  assert.equal(await page.locator('#speed').inputValue(), '200')
  assert.equal(await page.locator('#palette').inputValue(), 'ice')
  await page.locator('#scope').selectOption('weapp')
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await screenshot(`lab-mobile-${width}.png`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`)
    for (const selector of ['#pause', '#replay', '#download', '#palette', '#density', '#speed', '#scope', '#project-select', '#copy-command', '#project-docs', '#project-repo']) {
      const rect = await page.locator(selector).boundingBox()
      assert.ok(rect)
      assert.ok(rect.height >= 44, `Touch target: ${selector}`)
    }
  }
  await page.goto(new URL('/?lang=en&motion=0', server.url).href)
  await ready()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  assert.equal(await page.locator('#pause').isDisabled(), true)
  assert.equal(await page.getByRole('heading', { name: 'Make room for play.' }).count(), 1)
  assert.equal(await page.locator('#project-status').textContent(), 'Stable')
  await screenshot('lab-english.png')
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null
  })
  await page.reload()
  await ready()
  assert.equal(await page.locator('#fallback').isVisible(), true)
  assert.equal(await page.locator('#download').isDisabled(), true)
  assert.equal(await page.locator('#project-name').textContent(), 'weapp-vite')
  assert.equal(await page.locator('#project-docs').isVisible(), true)
  assert.deepEqual(failures, [])
  process.stdout.write(`Project wordmark contrast on #040607: ${JSON.stringify(wordmarkContrasts)}\n`)
  process.stdout.write(`Headless lab checks passed: default orbit, 6/11 scope, all official logos/facts/actions, project morph, drag/replay, settings, visibility RAF pause, PNG, 1440/390/320px, English, reduced motion, fallback. Evidence: ${fileURLToPath(evidence)}\n`)
}
finally {
  try {
    await context?.close()
  }
  finally {
    try {
      await browser?.close()
    }
    finally {
      await server.close()
    }
  }
}
