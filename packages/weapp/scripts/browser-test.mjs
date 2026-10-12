import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the exact assets and runtime shipped by the build.
import { startLab } from '../dist/src/lab.js'

const root = new URL('../', import.meta.url)
const evidence = new URL('.cache/qa/', root)
await mkdir(evidence, { recursive: true })
const catalog = JSON.parse(await readFile(new URL('dist/data/catalog.json', root), 'utf8'))
const logo = JSON.parse(await readFile(new URL('dist/data/logo.json', root), 'utf8'))
const server = await startLab({ lang: 'zh-CN', motion: true, catalog, logo })
let browser
let context
const failures = []
try {
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(message.text())
    }
  })
  page.on('request', (request) => {
    assert.equal(new URL(request.url()).hostname, '127.0.0.1', 'Lab must stay offline')
  })
  await page.goto(server.url)
  await page.waitForSelector('html[data-ready="true"]')
  await page.waitForFunction(() => document.querySelector('#phase').textContent === '由你来玩')
  await page.locator('#pause').click()
  assert.equal(await page.locator('#pause').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('#canvas').evaluate(canvas => new Set(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).size > 10), true)
  await page.screenshot({ path: fileURLToPath(new URL('lab-desktop.png', evidence)), fullPage: true })
  const downloaded = page.waitForEvent('download')
  await page.locator('#download').click()
  const download = await downloaded
  await download.saveAs(fileURLToPath(new URL('particles-export.png', evidence)))
  const png = await readFile(new URL('particles-export.png', evidence))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.ok(png.readUInt32BE(16) > 500)
  await page.locator('[name="scene"][value="orbit"]').check()
  await page.locator('#canvas').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('#project-name').textContent(), catalog[0].locales['zh-CN'].name)
  await page.screenshot({ path: fileURLToPath(new URL('lab-orbit.png', evidence)), fullPage: true })
  await page.keyboard.press('3')
  assert.equal(await page.locator('[value="flow"]').isChecked(), true)
  const bounds = await page.locator('#canvas').boundingBox()
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.5)
  await page.locator('#palette').selectOption('ice')
  await page.locator('#density').evaluate((input) => {
    input.value = '100'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(await page.locator('#density-output').textContent(), '100%')
  await page.locator('#speed').evaluate((input) => {
    input.value = '200'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(await page.locator('#speed-output').textContent(), '2×')
  await page.locator('#replay').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: fileURLToPath(new URL('lab-flow.png', evidence)), fullPage: true })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.screenshot({ path: fileURLToPath(new URL(`lab-mobile-${width}.png`, evidence)), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`)
    for (const selector of ['#pause', '#replay', '#download', '#palette', '#density', '#speed']) {
      const rect = await page.locator(selector).boundingBox()
      assert.ok(rect.height >= 44, `Touch target: ${selector}`)
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector('#pause').disabled)
  assert.equal(await page.locator('#pause').isDisabled(), true)
  assert.equal(await page.locator('#motion-notice').isVisible(), true)
  await page.keyboard.press('1')
  const first = await page.locator('#canvas').evaluate(canvas => canvas.toDataURL())
  await page.waitForTimeout(200)
  assert.equal(await page.locator('#canvas').evaluate(canvas => canvas.toDataURL()), first, 'Reduced motion must not animate')
  await page.locator('[name="scene"][value="orbit"]').check()
  const orbitBounds = await page.locator('#canvas').boundingBox()
  const starX = orbitBounds.x + orbitBounds.width / 2
  const starY = orbitBounds.y + orbitBounds.height * 0.254
  await page.mouse.move(starX, starY)
  await page.mouse.down()
  await page.mouse.move(starX + 40, starY + 30, { steps: 5 })
  await page.mouse.up()
  assert.equal(await page.locator('#project-name').textContent(), catalog[0].locales['zh-CN'].name)
  const moved = await page.locator('#canvas').evaluate(canvas => canvas.toDataURL())
  await page.locator('#replay').click()
  assert.notEqual(await page.locator('#canvas').evaluate(canvas => canvas.toDataURL()), moved, 'Dragging must move a planet; replay resets it')
  await page.goto(new URL('/?lang=en&motion=0', server.url).href)
  await page.waitForSelector('html[data-ready="true"]')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  assert.equal(await page.locator('#pause').isDisabled(), true)
  assert.equal(await page.getByRole('heading', { name: 'Make room for play.' }).count(), 1)
  await page.screenshot({ path: fileURLToPath(new URL('lab-english.png', evidence)), fullPage: true })
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null
  })
  await page.reload()
  assert.equal(await page.locator('#fallback').isVisible(), true)
  assert.equal(await page.locator('#download').isDisabled(), true)
  assert.deepEqual(failures, [])
  process.stdout.write(`Headless lab checks passed: 1440/390/320px, all scenes, controls, PNG, localization, reduced motion, fallback. Evidence: ${fileURLToPath(evidence)}\n`)
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
