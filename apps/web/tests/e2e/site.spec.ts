import AxeBuilder from '@axe-core/playwright'
import { siteCopy } from '../../src/i18n/ui'
import { heroWordmark, isOpenSourceSite, siteOrigin } from './site-target'
import { expect, test } from './test'

const retiredVisuals = 'canvas:not(.home-hero-particle-canvas), [data-shader-canvas], [data-shader], [data-shader-frame], [data-webgl-fallback], [data-art], .project-art, [class^="art-"], [class*=" art-"]'
const constellationLinks = [
  { href: 'https://vite.weapp.dev/', target: '_blank', rel: 'noopener noreferrer' },
  { href: 'https://tw.weapp.dev/', target: '_blank', rel: 'noopener noreferrer' },
  { href: 'https://varo.weapp.dev/', target: '_blank', rel: 'noopener noreferrer' },
  { href: 'https://vpt.js.org/', target: '_blank', rel: 'noopener noreferrer' },
  { href: 'https://vuemini.org/', target: '_blank', rel: 'noopener noreferrer' },
  { href: 'https://uni-helper.cn/', target: '_blank', rel: 'noopener noreferrer' },
  { href: 'https://wot-ui.cn/', target: '_blank', rel: 'noopener noreferrer' },
]
const railLinks = [
  'https://vite.weapp.dev/',
  'https://tw.weapp.dev/',
  'https://varo.weapp.dev/',
  'https://sqlite.weapp.dev/',
  'https://vpt.js.org/',
  'https://vuemini.org/',
  'https://github.com/rezorjs/rezor',
  'https://uni-helper.cn/',
  'https://wot-ui.cn/',
]

async function expectHomeVisuals(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })).toBeAttached()
  await expect(page.locator('#home-hero-title')).toHaveText(heroWordmark)
  await expect(page.locator('.home-hero-screen')).toBeVisible()
  await expect(page.locator('.home-hero-constellation .home-hero-tile')).toHaveCount(7)
  await expect(page.locator('.home-hero-orbit-inner, .home-hero-orbit-mid, .home-hero-orbit-outer, .home-hero-planet--ring')).toHaveCount(0)
  await expect(page.locator('.home-hero-constellation a.home-hero-tile').evaluateAll(links => links.map(link => ({
    href: link.getAttribute('href'),
    target: link.getAttribute('target'),
    rel: link.getAttribute('rel'),
  })))).resolves.toEqual(constellationLinks)
  await expect(page.locator('.home-hero-copy')).toHaveCount(0)
  await expect(page.locator(retiredVisuals)).toHaveCount(0)
  await expect(page.locator('#projects [data-project-visual]')).toHaveCount(0)
  await expect(page.locator('#projects [data-project-row]')).toHaveCount(4)
  await expect(page.locator('#ecosystem-taro [data-project-row]')).toHaveCount(1)
  await expect(page.locator('[data-scroll-proof]')).toHaveCount(4)
  await expect(page.locator('.home-project-rail-group')).toHaveCount(5)
}

async function enableAnalyticsTestMode(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__WEAPP_ANALYTICS_TEST__', { value: true })
  })
}

async function mockAnalyticsScripts(
  page: import('@playwright/test').Page,
  options: { failGa4Attempts?: number } = {},
) {
  let ga4Attempts = 0
  await page.route('https://www.googletagmanager.com/**', async route => route.fulfill({
    status: ga4Attempts++ < (options.failGa4Attempts ?? 0) ? 503 : 200,
    body: '',
    contentType: 'text/javascript',
  }))
  await page.route('https://hm.baidu.com/**', async route => route.fulfill({
    body: '',
    contentType: 'text/javascript',
    status: 200,
  }))
}

test('renders the bilingual ecosystem home with valid metadata', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })).toBeVisible()
  await expectHomeVisuals(page)
  await expect(page.getByRole('heading', { name: 'Uni Helper 和 Wot UI' })).toBeVisible()
  await expect(page.locator('#projects').getByRole('heading', { name: 'weapp-tailwindcss' })).toBeVisible()
  await expect(page.locator('#projects').getByRole('heading', { name: 'weapp-vite' })).toBeVisible()
  await expect(page.locator('#projects').getByRole('heading', { name: 'Varo' })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}/`)
  await expect(page.locator('link[hreflang="en-US"]')).toHaveAttribute('href', `${siteOrigin}/en/`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${siteOrigin}/og.png`)
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(4)
  await expect(page.locator('#about')).toContainText(isOpenSourceSite ? 'JavaScript 与 TypeScript 项目' : 'weapp-tailwindcss')
  if (isOpenSourceSite) {
    await expect(page.locator('#about')).toContainText('weappjs')
  }
  const docsLinks = page.locator('#projects').getByRole('link', { name: '阅读文档' })
  await expect(docsLinks).toHaveCount(4)
  await expect(docsLinks.evaluateAll(links => links.map(link => link.getAttribute('href')))).resolves.toEqual([
    'https://vite.weapp.dev/',
    'https://tw.weapp.dev/',
    'https://varo.weapp.dev/',
    'https://sqlite.weapp.dev/',
  ])
  const projectHomeLinks = page.locator('.home-project-rail a')
  await expect(projectHomeLinks.evaluateAll(links => links.map(link => ({ href: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel') })))).resolves.toEqual(
    railLinks.map(href => ({ href, target: '_blank', rel: 'noopener noreferrer' })),
  )
  await expect(page.locator('#projects a[data-analytics-event="select_project"]').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname))).resolves.toEqual([
    '/projects/weapp-vite/',
    '/projects/weapp-tailwindcss/',
    '/projects/varo/',
    '/projects/weapp-sqlite/',
  ])

  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\/$/)
  await expect(page.getByRole('heading', { name: 'Uni Helper and Wot UI' })).toBeVisible()
  if (isOpenSourceSite) {
    await expect(page.locator('#about')).toContainText('JavaScript and TypeScript projects')
    await expect(page.locator('#about')).toContainText('weappjs')
  }
  await expectHomeVisuals(page)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}/en/`)
  await expect(page.locator('link[hreflang="zh-CN"]')).toHaveAttribute('href', `${siteOrigin}/`)
  await expect(page.locator('#projects a[data-analytics-event="select_project"]').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname))).resolves.toEqual([
    '/en/projects/weapp-vite/',
    '/en/projects/weapp-tailwindcss/',
    '/en/projects/varo/',
    '/en/projects/weapp-sqlite/',
  ])
  await expect(page.locator('.home-project-rail a').evaluateAll(links => links.map(link => link.getAttribute('href')))).resolves.toEqual(railLinks)
})

test('renders the bilingual pricing and delivery page', async ({ page }) => {
  test.skip(isOpenSourceSite, 'Sponsorship and services belong to weapp.dev')
  await page.goto('/pricing/')
  await expect(page.getByRole('heading', { level: 1, name: '围绕真实项目的迁移与培训' })).toBeVisible()
  await expect(page.locator('#plans')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^(Community|Pro|Team|Enterprise)$/ })).toHaveCount(0)
  await expect(page.getByText('¥20', { exact: true })).toBeVisible()
  await expect(page.getByText('¥200', { exact: true })).toBeVisible()
  await expect(page.getByText('¥1,000', { exact: true })).toBeVisible()
  await expect(page.getByText('¥2,000 起', { exact: true })).toBeVisible()
  await expect(page.locator('#sponsor')).toContainText('60% 核心维护')
  await expect(page.locator('#sponsor')).toContainText('25% 贡献者基金')
  await expect(page.locator('#sponsor')).toContainText('15% 周边开源')
  await expect(page.locator('#sponsor')).toContainText('赞助不是购买服务')
  await expect(page.locator('#sponsor')).toContainText('weapp.dev、tw.weapp.dev、vite.weapp.dev')
  await expect(page.locator('#sponsor')).toContainText('Easysearch')
  await expect(page.locator('#roadmap')).toContainText('建设中的能力')
  await expect(page.locator('#cloud-build')).toContainText('仍在建设中')
  await expect(page.locator('#services')).toContainText('¥8,000-15,000')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://weapp.dev/pricing/')
  await expect(page.locator('link[hreflang="en-US"]')).toHaveAttribute('href', 'https://weapp.dev/en/pricing/')
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2)
  await expect(page.locator('script[type="application/ld+json"]').nth(1)).not.toContainText('Offer')

  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\/pricing\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Migration and training for your project' })).toBeVisible()
  await expect(page.locator('#sponsor')).toContainText('¥1,000')
  await expect(page.locator('#sponsor')).toContainText('60% Core maintenance')
  await expect(page.locator('#sponsor')).toContainText('25% Contributors fund')
  await expect(page.locator('#sponsor')).toContainText('15% Adjacent open source')
  await expect(page.locator('#plans')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^(Community|Pro|Team|Enterprise)$/ })).toHaveCount(0)
})

test('home commercial entry points reach pricing and services', async ({ page }) => {
  test.skip(isOpenSourceSite, 'Sponsorship and services belong to weapp.dev')
  await page.goto('/')
  await expect(page.locator('#commercial')).toContainText('迁移与培训')
  await expect(page.locator('#commercial')).toContainText('自愿赞助用于维护、文档和贡献者基金，不购买实施服务。')
  await page.getByRole('link', { name: '支持开源' }).click()
  await expect(page).toHaveURL(/\/pricing\/#sponsor$/)
  await page.goto('/')
  await page.getByRole('link', { name: '查看可交付服务' }).click()
  await expect(page).toHaveURL(/\/pricing\/#services$/)
})

test('light and dark headers keep readable flyouts', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript(selectedTheme => localStorage.setItem('weapp-theme', selectedTheme), theme)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await page.locator('[data-project-menu] summary').click()
    const flyout = page.locator('[data-header-flyout]').first()
    await expect(flyout).toBeVisible()
    const colors = await flyout.evaluate((element) => {
      const panel = getComputedStyle(element)
      const link = getComputedStyle(element.querySelector('a')!)
      const parse = (value: string) => value.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
      const [pr, pg, pb] = parse(panel.backgroundColor)
      const [lr, lg, lb] = parse(link.color)
      const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      return {
        panel: luminance(pr, pg, pb),
        link: luminance(lr, lg, lb),
      }
    })
    if (theme === 'light') {
      expect(colors.panel, theme).toBeGreaterThan(0.7)
      expect(colors.link, theme).toBeLessThan(0.45)
    }
    else {
      expect(colors.panel, theme).toBeLessThan(0.25)
      expect(colors.link, theme).toBeGreaterThan(0.55)
    }
    await page.keyboard.press('Escape')
  }
})

test('theme control changes and persists the selected theme', async ({ page }) => {
  await page.goto('/')
  const initial = await page.locator('html').getAttribute('data-theme')
  await page.getByRole('button', { name: '切换主题' }).click()
  const next = initial === 'dark' ? 'light' : 'dark'
  await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', next)
})

test('home hero keeps a cosmic first screen while the rest of the page follows theme', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(selectedTheme => localStorage.setItem('weapp-theme', selectedTheme), theme)
    await page.goto('/')
    const screen = page.locator('.home-hero-screen')
    await expect(screen).toBeVisible()
    const background = await screen.evaluate(element => getComputedStyle(element).backgroundColor)
    expect(background, theme).toBe('rgb(2, 3, 8)')
    await expect(page.locator('[data-hero-particles] canvas')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })).toBeAttached()
    await page.locator('#about').scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator('html').evaluate(element => element.hasAttribute('data-hero-cosmos'))).toBe(false)
  }
})

test('hero planets stay between the wordmark and the first-screen edges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const planets = page.locator('.home-hero-planet')
  await expect(planets).toHaveCount(7)
  for (const turn of [0, 0.25, 0.5, 0.75]) {
    await planets.evaluateAll((elements, value) => {
      for (const element of elements) {
        const node = element as HTMLElement
        node.style.animation = 'none'
        node.style.setProperty('--orbit-turn', String(value))
      }
    }, turn)
    const stray = await page.evaluate(() => {
      const word = document.querySelector('#home-hero-title')!.getBoundingClientRect()
      const screen = document.querySelector('.home-hero-screen')!.getBoundingClientRect()
      return [...document.querySelectorAll('.home-hero-planet')].flatMap((element) => {
        const box = element.getBoundingClientRect()
        const hitsWord = !(box.right < word.left || box.left > word.right || box.bottom < word.top || box.top > word.bottom)
        const outside = box.left < screen.left - 4 || box.right > screen.right + 4 || box.top < screen.top - 4 || box.bottom > screen.bottom + 4
        if (!hitsWord && !outside) {
          return []
        }
        return [{ id: (element as HTMLElement).dataset.analyticsProject, hitsWord, outside }]
      })
    })
    expect(stray, String(turn)).toEqual([])
  }
})

test('reduced motion keeps content visible and product interactions stationary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const movingOrHidden = () => page.locator('[data-reveal], [data-hero-enter], [data-project-visual] img, [data-scroll-proof]').evaluateAll(elements => elements.filter((element) => {
    const style = getComputedStyle(element)
    return style.opacity !== '1' || style.transform !== 'none' || style.animationName !== 'none' || style.transitionDuration !== '0s'
  }).map(element => element.tagName))
  expect(await movingOrHidden()).toEqual([])
  for (const row of await page.locator('#projects [data-project-row]').all()) {
    await row.hover()
    expect(await movingOrHidden()).toEqual([])
    await row.locator('a').first().focus()
    expect(await movingOrHidden()).toEqual([])
  }
  if (!isOpenSourceSite) {
    await page.locator('[data-principle-card]').first().hover()
  }
  expect(await movingOrHidden()).toEqual([])
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
})

test('disables proof motion when reduced motion changes at runtime', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-project-proof-motion', '')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('html').getAttribute('data-project-proof-motion')).toBeNull()
  await expect.poll(() => page.locator('[data-scroll-proof]').first().evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  }))).toEqual({ opacity: '1', transform: 'none' })
})

test('scrolls project proof cards into place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const proof = page.locator('[data-scroll-proof]').first()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(50)
  const initial = await proof.evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  }))
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await page.waitForTimeout(100)
  const settled = await proof.evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  }))
  expect(Number(settled.opacity)).toBeGreaterThan(Number(initial.opacity))
  expect(settled.transform).not.toBe(initial.transform)
})

test('keeps project proof cards within responsive viewports', async ({ page }) => {
  for (const viewport of [1440, 700, 390]) {
    await page.setViewportSize({ width: viewport, height: 900 })
    await page.goto('/')
    const layout = await page.locator('[data-scroll-proof]').evaluateAll(elements => ({
      cards: elements.length,
      boxes: elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right, width: box.width }
      }),
    }))
    expect(layout.cards, `${viewport}px proof card count`).toBe(4)
    expect(layout.boxes.every(box => box.width > 0 && box.left >= -1 && box.right <= viewport + 1), `${viewport}px proof card bounds`).toBe(true)
  }
})

test('reveals content after the timeout when the observer never reports visibility', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.addInitScript(() => {
    window.IntersectionObserver = class extends IntersectionObserver {
      observe() {}
    }
  })
  await page.goto('/')
  await expect(page.locator('[data-reveal][data-visible]')).toHaveCount(0)
  await page.clock.fastForward(4000)
  await expect(page.locator('[data-reveal]:not([data-visible])')).toHaveCount(0)
  await expect.poll(() => page.locator('[data-reveal]').evaluateAll(elements => elements.filter(element => getComputedStyle(element).opacity !== '1').length)).toBe(0)
})

test('project detail exposes docs, source, metrics, and future path', async ({ page }) => {
  await page.goto('/projects/weapp-vite/')
  await expect(page.getByRole('heading', { level: 1, name: 'weapp-vite' })).toBeVisible()
  await expect(page.getByRole('link', { name: '阅读文档' }).first()).toHaveAttribute('href', 'https://vite.weapp.dev/')
  await expect(page.getByText('/docs/weapp-vite/')).toBeVisible()
  await expect(page.getByText('GitHub Stars')).toBeVisible()
  await expect(page.getByRole('heading', { name: '常见问题' })).toBeVisible()
  await expect(page.getByLabel('安装命令', { exact: true })).toContainText('pnpm add -D weapp-vite')
  await expect(page.getByRole('link', { name: '查看 npm' })).toHaveAttribute('href', 'https://www.npmjs.com/package/weapp-vite')
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(3)
})

test('publishes indexable SEO resources and keeps 404 out of the index', async ({ page, request }) => {
  const llms = await request.get('/llms.txt')
  expect(llms.ok()).toBeTruthy()
  expect(await llms.text()).toContain('weapp-tailwindcss')

  const sitemap = await request.get('/sitemap-index.xml')
  expect(sitemap.ok()).toBeTruthy()
  expect(await sitemap.text()).not.toContain('/404')

  await page.goto('/404/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('published Varo project exposes current release data', async ({ page }) => {
  await page.goto('/projects/varo/')
  await expect(page.getByRole('heading', { level: 1, name: 'Varo' })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看源码' })).toHaveAttribute('href', 'https://github.com/daguanren21/Varo')
  await expect(page.getByRole('link', { name: '阅读文档' }).first()).toHaveAttribute('href', 'https://varo.weapp.dev/')
  await expect(page.getByLabel('安装命令', { exact: true })).toContainText('pnpm dlx @varo-ui/cli add --target weapp button input card')
  await expect(page.getByText('v2.1.0')).toBeVisible()
  await expect(page.getByText('/docs/varo/')).toBeVisible()
  await expect(page.getByText('GitHub Stars')).toBeVisible()
})

test('passes automated accessibility checks in light and dark themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(selectedTheme => localStorage.setItem('weapp-theme', selectedTheme), theme)
    for (const path of (isOpenSourceSite ? ['/', '/en/', '/projects/', '/en/projects/'] : ['/', '/en/', '/pricing/', '/en/pricing/'])) {
      await page.goto(path)
      await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(element => element.hasAttribute('data-visible')))
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations, `${path} ${theme} theme violations`).toEqual([])
    }
  }
})

test('supports keyboard navigation and activation', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main-content$/)

  const themeToggle = page.getByRole('button', { name: '切换主题' })
  await themeToggle.focus()
  const initial = await page.locator('html').getAttribute('data-theme')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial === 'dark' ? 'light' : 'dark')
})

test('has no horizontal overflow or clipped interactive labels', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    controls: [...document.querySelectorAll<HTMLElement>('a, button, summary')]
      .filter(element => Boolean(element.textContent?.trim()) && element.scrollWidth > element.clientWidth + 1)
      .map(element => element.textContent?.trim() || element.getAttribute('aria-label')),
  }))
  expect(overflow).toEqual({ document: false, controls: [] })
})

test('keeps every key route stable across responsive viewports', async ({ page }) => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 },
  ]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const layout = await page.evaluate(() => {
      const title = document.querySelector('#home-hero-title')
      const box = title?.getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroTitleVisible: Boolean(box && box.top >= 0 && box.bottom <= innerHeight),
        wrappedControls: [...document.querySelectorAll<HTMLElement>('a, button, summary')]
          .filter(element => Boolean(element.textContent?.trim()) && element.scrollWidth > element.clientWidth + 1)
          .map(element => element.textContent?.trim() || element.getAttribute('aria-label')),
      }
    })
    expect(layout, `${viewport.width}px layout`).toEqual({ overflow: false, heroTitleVisible: true, wrappedControls: [] })
  }
})

test('copies the install command and expands project FAQ content', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/projects/weapp-vite/')
  const copyButton = page.locator('button[data-copy-command]')
  await expect(copyButton).toHaveAttribute('aria-label', '复制安装命令')
  await copyButton.click()
  await expect(copyButton).toHaveAttribute('aria-label', '已复制')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm add -D weapp-vite')

  const faq = page.locator('main details').first()
  await expect(faq).not.toHaveAttribute('open', '')
  await faq.locator('summary').click()
  await expect(faq).toHaveAttribute('open', '')
  await expect(faq.getByText('Vite 驱动的开发和构建流程')).toBeVisible()
})

test('provides a working mobile navigation menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.locator('summary[aria-label="打开导航"]')
  await menu.click()
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(mobileNav).toBeVisible()
  await expect(mobileNav.getByRole('link', { name: 'weapp-vite' })).toBeVisible()
  await menu.click()
  await expect(mobileNav).not.toBeVisible()
})

test('opens analytics preferences directly from the privacy page', async ({ page }) => {
  await page.goto('/privacy/')
  await page.getByRole('button', { name: '打开统计偏好' }).click()
  await expect(page.getByRole('dialog', { name: '统计偏好' })).toBeVisible()
})

test('loads all local product visuals on key pages', async ({ page }) => {
  for (const path of ['/', '/en/', '/projects/weapp-tailwindcss/', '/projects/weapp-vite/', '/projects/varo/', '/en/projects/weapp-tailwindcss/', '/en/projects/weapp-vite/', '/en/projects/varo/', ...(isOpenSourceSite ? [] : ['/pricing/', '/en/pricing/']), '/privacy/', '/en/privacy/', '/404/']) {
    await page.goto(path)
    await expect(page.locator(retiredVisuals)).toHaveCount(0)
    await page.locator('img').evaluateAll(images => images.forEach((image) => {
      (image as HTMLImageElement).loading = 'eager'
    }))
    await page.waitForFunction(() => [...document.images].every(image => image.complete))
    const unloaded = await page.locator('img').evaluateAll(images => images
      .map(image => image as HTMLImageElement)
      .filter(image => image.naturalWidth === 0 || image.naturalHeight === 0)
      .map(image => image.getAttribute('src')))
    expect(unloaded, `${path} unloaded images`).toEqual([])
  }
})

test('publishes only the official project destinations', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page.locator('a[href]').evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href')))
  expect(hrefs).toContain('https://tw.weapp.dev/')
  expect(hrefs).toContain('https://vite.weapp.dev/')
  expect(hrefs).not.toContain('https://tw.icebreaker.top/')
  expect(hrefs).not.toContain('https://vite.icebreaker.top/')
})

test('keeps core content and links available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const locale of ['zh-CN', 'en'] as const) {
    await page.goto(locale === 'en' ? '/en/' : '/')
    await expect(page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: siteCopy[locale].projects.documentation }).first()).toBeVisible()
    await expectHomeVisuals(page)
  }
  await context.close()
})

test('loads both analytics providers by default without a consent banner', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page)

  const configRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/analytics/config')) {
      configRequests.push(request.url())
    }
  })

  await page.goto('/?token=secret&utm_source=e2e#projects')
  await expect(page.locator('#weapp-ga4')).toHaveCount(1)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)
  await expect(page.locator('[data-analytics-banner]')).toHaveCount(0)
  expect(configRequests).toEqual([])

  const dataLayer = await page.evaluate(() => (window.dataLayer ?? []).map(command => Array.from(command as ArrayLike<unknown>)))
  expect(dataLayer.filter(command => command[0] === 'config')).toEqual([[
    'config',
    'G-P7XL4TEVNM',
    expect.objectContaining({
      page_location: 'http://127.0.0.1:4321/?utm_source=e2e',
      page_path: '/?utm_source=e2e',
      send_page_view: true,
    }),
  ]])
  expect(dataLayer.filter(command => command[0] === 'event' && command[1] === 'page_view')).toEqual([])
})

test('supports a persistent opt-out and re-enable for both providers', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page)

  await page.goto('/')
  await expect(page.locator('#weapp-ga4')).toHaveCount(1)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)

  await page.getByRole('button', { name: '统计偏好' }).click()
  const dialog = page.getByRole('dialog', { name: '统计偏好' })
  await expect(dialog).toBeVisible()
  const enabled = dialog.getByRole('checkbox')
  await expect(enabled).toBeChecked()
  await enabled.uncheck()
  await dialog.getByRole('button', { name: '保存偏好' }).click()

  await page.waitForLoadState('load')
  await expect(page.locator('#weapp-ga4')).toHaveCount(0)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('weapp-analytics-consent:v1')))
    .toBe('{"choice":"denied","version":1}')

  await page.getByRole('button', { name: '统计偏好' }).click()
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '保存偏好' }).click()
  await expect(page.locator('#weapp-ga4')).toHaveCount(1)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)
})

test('honors browser privacy signals', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true })
  })
  await mockAnalyticsScripts(page)

  await page.goto('/')
  await expect(page.locator('#weapp-ga4')).toHaveCount(0)
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(0)
  await page.getByRole('button', { name: '统计偏好' }).click()
  await expect(page.getByText('浏览器已启用全局隐私控制')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('checkbox')).toBeDisabled()
})

test('keeps the other provider working when GA4 fails to load', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page, { failGa4Attempts: Number.POSITIVE_INFINITY })

  await page.goto('/')
  await expect(page.locator('#weapp-baidu-tongji')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: heroWordmark, exact: true })).toBeVisible()
})

test('retries a failed GA4 script without duplicating its configuration', async ({ page }) => {
  await enableAnalyticsTestMode(page)
  await mockAnalyticsScripts(page, { failGa4Attempts: 1 })

  await page.goto('/?token=secret&utm_source=retry')
  await expect(page.locator('#weapp-ga4[data-failed="true"]')).toHaveCount(1)

  await page.getByRole('button', { name: '统计偏好' }).click()
  const dialog = page.getByRole('dialog', { name: '统计偏好' })
  await dialog.getByRole('button', { name: '保存偏好' }).click()
  await expect(page.locator('#weapp-ga4[data-loaded="true"]')).toHaveCount(1)

  const dataLayer = await page.evaluate(() => (window.dataLayer ?? []).map(command => Array.from(command as ArrayLike<unknown>)))
  expect(dataLayer.filter(command => command[0] === 'config')).toHaveLength(1)
  expect(dataLayer.filter(command => command[0] === 'event' && command[1] === 'page_view')).toEqual([])
})
