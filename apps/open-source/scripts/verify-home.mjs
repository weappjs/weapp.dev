import assert from 'node:assert/strict'
import { access, mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const output = new URL('../.cache/demo-qa/', import.meta.url)
const before = new URL('../.cache/showcase-qa/', import.meta.url)
const baseURL = process.env.SHOWCASE_BASE_URL ?? 'http://127.0.0.1:45322'
const routes = ['/', '/en/', '/projects/weapp-tailwindcss/', '/projects/weapp-vite/', '/projects/varo/', '/pricing/', '/en/pricing/']
const records = []
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce' })
      await context.addInitScript(value => localStorage.setItem('weapp-theme', value), theme)
      const page = await context.newPage()
      for (const route of routes) {
        const errors = []
        const onError = error => errors.push(error.message)
        page.on('pageerror', onError)
        await page.goto(new URL(route, baseURL).href)
        await page.evaluate(async () => {
          await document.fonts.ready
          for (const image of document.images) {
            image.loading = 'eager'
          }
          // Changing loading also changes sizes="auto"; let responsive sources settle first.
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          await Promise.all([...document.images].map(image => image.decode()))
        })
        const checks = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          clippedControls: [...document.querySelectorAll('a, button, summary')].filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim()),
          hiddenReveals: [...document.querySelectorAll('[data-reveal]')].filter(element => getComputedStyle(element).opacity !== '1').length,
          canvasCount: document.querySelectorAll('canvas').length,
          animations: document.getAnimations().length,
        }))
        const name = `${route === '/' ? 'home-zh' : route === '/en/' ? 'home-en' : route.split('/').filter(Boolean).join('-')}-${viewport.width}-${theme}`
        await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) })
        await page.screenshot({ path: fileURLToPath(new URL(`${name}-full.png`, output)), fullPage: true })
        if (route === '/' || route === '/en/') {
          const box = await page.locator('#projects').boundingBox()
          await sharp(fileURLToPath(new URL(`${name}-full.png`, output))).extract({ left: Math.floor(box.x), top: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height) }).toFile(fileURLToPath(new URL(`${name}-projects.png`, output)))
          const baseline = new URL(`${name}.png`, before)
          if (await access(baseline).then(() => true, () => false)) {
            await sharp({ create: { width: viewport.width * 2, height: viewport.height, channels: 3, background: '#fff' } }).composite([
              { input: fileURLToPath(baseline), left: 0, top: 0 },
              { input: fileURLToPath(new URL(`${name}.png`, output)), left: viewport.width, top: 0 },
            ]).png().toFile(fileURLToPath(new URL(`${name}-comparison.png`, output)))
          }
          const lab = page.locator('hero-demos')
          for (const kind of ['style', 'build', 'registry']) {
            await lab.locator(`[role="tab"][aria-controls="hero-panel-${kind}"]`).click()
            if (kind === 'style') {
              await lab.locator('style-demo .demo-swatch').nth(1).click()
              await lab.locator('style-demo select').selectOption('2')
              await lab.locator('[data-compact]').check()
            }
            if (kind === 'build') {
              await lab.locator('build-demo .demo-segments label').nth(1).click()
            }
            if (kind === 'registry') {
              await lab.locator('registry-demo .demo-check').nth(2).click()
              await lab.locator('[data-registry-button]').click()
            }
            await page.screenshot({ path: fileURLToPath(new URL(`${name}-${kind}.png`, output)) })
            await lab.screenshot({ path: fileURLToPath(new URL(`${name}-${kind}-detail.png`, output)) })
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false)
          }
        }
        records.push({ route, viewport, theme, name, ...checks, errors })
        page.off('pageerror', onError)
      }
      await context.close()
    }
  }
  await writeFile(new URL('results.json', output), `${JSON.stringify(records, null, 2)}\n`)
  assert.deepEqual(records.filter(record => record.overflow || record.clippedControls.length || record.hiddenReveals || record.canvasCount || record.animations || record.errors.length), [])
  console.log(`PASS: ${records.length} route/viewport/theme combinations. Screenshots: ${fileURLToPath(output)}`)
}
finally {
  await browser.close()
}
