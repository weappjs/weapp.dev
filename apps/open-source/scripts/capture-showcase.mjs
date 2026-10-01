import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { projectMediaSourceDirectory } from '@weapp/project-catalog/paths'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(projectMediaSourceDirectory, 'showcase')
const viteSource = process.env.WEAPP_VITE_SOURCE
const varoSource = process.env.VARO_SOURCE
assert(viteSource && varoSource, 'Set WEAPP_VITE_SOURCE and VARO_SOURCE to the installed source checkouts.')
const retailPath = 'apps/tdesign-miniprogram-starter-retail'
const revision = directory => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
const native = await import(pathToFileURL(path.join(viteSource, 'packages/miniprogram-automator/dist/index.mjs')).href)
const launcher = new native.Launcher()
const mp = process.env.WEAPP_DEVTOOLS_WS
  ? await launcher.connect({ wsEndpoint: process.env.WEAPP_DEVTOOLS_WS })
  : await launcher.launch({ projectPath: path.join(root, '.cache/retail-capture'), port: 9430, timeout: 60000 })
const captures = []
await mkdir(output, { recursive: true })

async function save(name, buffer, source) {
  const metadata = await sharp(buffer).metadata()
  const stats = await sharp(buffer).stats()
  assert(stats.entropy > 2, `${name}: blank or incomplete screenshot`)
  await writeFile(path.join(output, `${name}.png`), buffer)
  captures.push({ name, width: metadata.width, height: metadata.height, sha256: createHash('sha256').update(buffer).digest('hex'), ...source })
}

async function waitForState(predicate) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const data = await mp.evaluate('() => getCurrentPages().slice(-1)[0].data')
    if (predicate(data)) {
      return data
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('The retail scene did not become ready.')
}

async function nativeShot(name, route, state) {
  const urls = await mp.evaluate(`() => {
    const data = getCurrentPages().slice(-1)[0].data
    return data.goodsList
      ? [data.imgSrcs[0], ...data.goodsList.slice(0, 4).map(item => item.thumb)]
      : [data.primaryImage, ...data.details.images]
  }`)
  for (const url of urls) {
    const response = await fetch(url)
    assert(response.ok, `${name}: image request failed: ${url}`)
    const image = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    assert(image.width > 0, `${name}: image failed to decode: ${url}`)
  }
  await new Promise(resolve => setTimeout(resolve, 1800))
  const buffer = Buffer.from(await mp.screenshot(), 'base64')
  const { model, screenWidth, screenHeight, windowWidth, windowHeight, pixelRatio, SDKVersion } = await mp.systemInfo()
  await save(name, buffer, {
    repository: 'weapp-vite/weapp-vite',
    revision: revision(viteSource),
    source: retailPath,
    runtime: 'WeChat DevTools',
    route,
    state,
    viewport: { model, screenWidth, screenHeight, windowWidth, windowHeight, pixelRatio, SDKVersion },
    attribution: 'TDesign native retail reference example, built with weapp-vite. Not the Vue/Tailwind port.',
    fixture: 'prepare-showcase-retail.mjs restores the original allGoods fixture in an isolated copy, omitting performance-test image/price substitutions. No component markup or styles changed.',
  })
}

try {
  await mp.callWxMethod('reLaunch', { url: '/pages/home/home' })
  await waitForState(data => data.goodsList?.length >= 4 && data.pageLoading === false)
  await mp.evaluate('() => getCurrentPages().slice(-1)[0].setData({ autoplay: false, current: 0 })')
  await nativeShot('retail-home', '/pages/home/home', 'First banner and recommended goods; autoplay off.')
  await mp.callWxMethod('reLaunch', { url: '/pages/goods/details/index?spuId=0' })
  await waitForState(data => data.details?.title && data.skuArray?.length)
  await mp.evaluate(`() => {
    const page = getCurrentPages().slice(-1)[0]
    page.setData({ autoplay: false, current: 1 })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  }`)
  await nativeShot('retail-detail', '/pages/goods/details/index?spuId=0', 'Second original apparel product image (nz-09b.png), price and product information; autoplay off.')
  await mp.evaluate('() => getCurrentPages().slice(-1)[0].showSkuSelectPopup()')
  await waitForState(data => data.isSpuSelectPopupShow === true)
  await nativeShot('retail-specs', '/pages/goods/details/index?spuId=0', 'Actual showSkuSelectPopup action; color, sizes and quantity visible.')
}
finally {
  mp.disconnect()
}

// Resolve the docs packages from their own checkout, without adding site dependencies.
const varoRequire = createRequire(path.join(varoSource, 'apps/docs/package.json'))
const { resolveConfig, createServer } = await import(varoRequire.resolve('vitepress'))
const docsRoot = path.join(varoSource, 'apps/docs')
const config = await resolveConfig(docsRoot)
Object.assign(config.vite.resolve.alias, {
  '@varo/hooks': path.join(varoSource, 'packages/hooks/src/index.ts'),
  '@varo/primitives-weapp': path.join(varoSource, 'packages/primitives-weapp/src/index.ts'),
})
const server = await createServer(docsRoot, { host: '127.0.0.1', port: 0 }, undefined, config)
const browser = await chromium.launch()
try {
  await server.listen()
  const address = server.httpServer.address()
  const page = await browser.newPage({ viewport: { width: 860, height: 1300 }, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: 'light' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/ai/agent-chat`)
  const component = page.locator('[aria-label="Agent conversation"]')
  await component.waitFor()
  // Expand only the documentation viewport so the real component is not clipped.
  await page.locator('.agent-component-demo__stage').evaluate((element) => {
    element.style.maxHeight = 'none'
  })
  await page.evaluate(() => document.fonts.ready)
  await component.getByText('registry.inspect', { exact: true }).waitFor()
  await component.locator('textarea').waitFor()
  await page.waitForTimeout(500)
  assert.deepEqual(errors, [])
  assert((await component.textContent()).includes('请检查这次发布是否满足双端要求。'))
  await save('varo-agent-chat', await component.screenshot({ animations: 'disabled' }), {
    repository: 'daguanren21/Varo',
    revision: revision(varoSource),
    source: 'apps/docs/src/components/blocks/agent-chat.vue',
    runtime: 'Chromium',
    route: '/ai/agent-chat',
    viewport: { width: 860, height: 1300, deviceScaleFactor: 2 },
    state: 'Existing AgentComponentDemo messages and waiting event snapshot; documentation viewport expanded to show the entire component.',
    attribution: 'Varo AgentChat component demo, Chinese and light theme.',
  })
}
finally {
  await browser.close()
  await server.close()
}
await writeFile(path.join(output, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`)
console.log(`Captured ${captures.length} real scenes in ${output}`)
