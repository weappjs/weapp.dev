import AxeBuilder from '@axe-core/playwright'
import { expectSiteLink, isOpenSourceSite, siteName, siteOrigin } from './site-target'
import { expect, test } from './test'
import { applyTheme } from './theme'

for (const prefix of ['', '/en']) {
  test(`does not fetch sponsor chart runtime on ${prefix || 'zh-CN'} project routes`, async ({ page }) => {
    const chartRequests: string[] = []
    page.on('request', (request) => {
      if (/\/_astro\/(?:core|charts|components|renderers|SponsorGraphs)\./.test(request.url())) {
        chartRequests.push(request.url())
      }
    })
    await page.goto(`${prefix}/projects/`)
    await page.goto(`${prefix}/projects/weapp-vite/`)
    expect(chartRequests).toEqual([])
  })

  test(`keeps the homepage toolchain map in flow order on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/`)
    await expect(page.locator('.toolchain-map header p')).toHaveText(prefix ? 'WEAPP TOOLCHAIN' : 'weapp 工具链')
    await expect(page.getByRole('navigation', { name: prefix ? 'Homepage project links' : '首页项目入口' })).toBeVisible()
    const ids = ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite']
    const links = page.locator('.toolchain-map-list li a')
    await expect(links).toHaveCount(4)
    const statusLabels = prefix ? { stable: 'Stable', planned: 'Planned' } : { stable: '稳定', planned: '规划中' }
    for (const id of ['weapp-vite', 'weapp-tailwindcss', 'varo']) {
      const node = page.locator(`.toolchain-map-list li[data-project-id="${id}"]`)
      await expect(node.locator('.toolchain-status')).toHaveText(statusLabels.stable)
      await expect(node.locator('.toolchain-status')).toHaveAttribute('aria-label', prefix ? 'Project status: Stable' : '项目状态: 稳定')
    }
    for (const id of ['weapp-sqlite']) {
      const node = page.locator(`.toolchain-map-list li[data-project-id="${id}"]`)
      await expect(node.locator('.toolchain-status')).toHaveText(statusLabels.planned)
      await expect(node.locator('.toolchain-status')).toHaveAttribute('aria-label', prefix ? 'Project status: Planned' : '项目状态: 规划中')
    }
    await expect(links.evaluateAll(items => items.map(item => new URL((item as HTMLAnchorElement).href).pathname))).resolves.toEqual(ids.map(id => `${prefix}/projects/${id}/`))
    for (const id of ids) {
      const node = page.locator(`.toolchain-map-list li[data-project-id="${id}"]`)
      await expect(node).toHaveAttribute('aria-labelledby', `toolchain-project-${id}`)
      await expect(node.locator(`#toolchain-project-${id}`)).toBeVisible()
      await expect(node).toHaveAttribute('aria-describedby', `toolchain-description-${id} toolchain-role-${id} toolchain-status-${id}`)
      await expect(node.locator('a')).toHaveAttribute('data-analytics-event', 'select_project')
    }
  })

  const zh = prefix === ''
  test(`filters project rows and recovers from an empty intersection on ${prefix}/projects/`, async ({ page }) => {
    await page.goto(`${prefix}/projects/`)
    await expect(page.locator('section[aria-labelledby="projects-index-title"]')).toHaveCount(1)
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', prefix ? `${siteName} ecosystem projects map` : `${siteName} 生态项目地图`)
    await expect(page.locator('section[aria-label]')).toHaveCount(1)
    const role = page.locator('[data-filter-role]')
    const maturity = page.locator('[data-filter-maturity]')
    const platform = page.locator('[data-filter-platform]')
    const visible = page.locator('#toolchain-project-list [data-project-card]:visible')
    await expect(page.locator('[data-project-filters]')).toHaveAttribute('aria-label', zh ? '筛选工具链项目' : 'Filter toolchain projects')
    await expect(page.locator('[data-project-filters]')).toHaveAttribute('aria-controls', 'toolchain-project-list')
    await expect(page.locator('[data-project-filters]')).toHaveAttribute('aria-describedby', 'project-filter-count')
    await expect(page.locator('#project-filter-count')).toHaveAttribute('aria-live', 'polite')
    await expect(page.locator('#toolchain-project-list')).toBeVisible()
    await expect(page.locator('[data-project-card]').first().locator('[role="list"]').first()).toHaveAttribute('aria-label', zh ? '平台与路线信息' : 'Platform and roadmap metadata')
    await expect(page.locator('[data-project-card]').first().locator('[role="list"] [role="listitem"]').first()).toBeVisible()
    for (const control of await page.locator('[data-project-filters] [aria-controls]').all()) {
      await expect(control).toHaveAttribute('aria-controls', 'toolchain-project-list')
    }
    await expect(role).toBeEnabled()
    await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(4)
    await expect(page.locator('[data-project-card]').first().locator('img')).toHaveAttribute('loading', 'eager')
    await expect(page.locator('[data-project-card]').first().locator('img')).toHaveAttribute('fetchpriority', 'high')
    await expect(page.locator('[data-project-card]').nth(1).locator('img')).toHaveAttribute('loading', 'lazy')
    await expect(page.locator('[data-project-card][data-project-id="weapp-sqlite"]')).toHaveAttribute('data-roadmap-count', '2')
    await expect(page.locator('[data-project-card][data-project-id="weapp-sqlite"]')).toContainText(zh ? '平台待确认' : 'Platforms pending')
    await expect(page.locator('#toolchain-project-list [data-project-card] [data-project-status]')).toHaveCount(4)
    for (const id of ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro']) {
      await expect(page.locator(`[data-project-card][data-project-id="${id}"]`)).toHaveAttribute('aria-labelledby', `project-card-${id}`)
      await expect(page.locator(`[data-project-card][data-project-id="${id}"]`)).toHaveAttribute('aria-describedby', new RegExp(`project-card-description-${id} project-card-audience-${id}`))
    }
    await expect(page.locator('[data-project-card]').filter({ hasText: 'weapp-sqlite' })).toContainText(zh ? '2 项路线' : '2 roadmap items')
    await expect(page.locator('[data-project-card][data-project-id="weapp-vite"] .projects-index-quickstart code')).toHaveText('pnpm add -D weapp-vite')
    await expect(page.locator('[data-project-card][data-project-id="weapp-sqlite"] .projects-index-quickstart')).toContainText(zh ? '资料待确认' : 'Details pending')
    await expect(page.locator('[data-project-card][data-project-id="weapp-vite"] .projects-index-audience')).toContainText(zh ? '适合' : 'For')
    await expect(page.locator('[data-project-card][data-project-id="weapp-vite"] .projects-index-runtime')).toContainText(zh ? '运行时' : 'Runtime')
    await expect(page.locator('[data-project-card][data-project-id="weapp-sqlite"] .projects-index-runtime')).toHaveCount(0)
    await role.selectOption('data')
    await expect(visible).toHaveCount(1)
    await expect(visible.getByRole('heading')).toHaveText('weapp-sqlite')
    await expect(page.locator('[data-filter-count]')).toHaveText(zh ? '1 个项目' : '1 project')
    await maturity.selectOption('stable')
    await expect(visible).toHaveCount(0)
    await expect(page.locator('[data-filter-empty]')).toBeVisible()
    await expect(page.locator('[data-filter-empty]')).toHaveAttribute('role', 'status')
    await expect(page.locator('[data-filter-empty]')).toHaveAttribute('aria-live', 'polite')
    await page.locator('[data-filter-clear]').focus()
    await page.keyboard.press('Enter')
    await expect(role).toBeFocused()
    await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(4)
    await expect(page.locator('[data-filter-empty]')).toBeHidden()
    await platform.selectOption('WeChat')
    expect(await visible.count()).toBeGreaterThan(0)
    for (const card of await visible.all()) {
      expect((await card.getAttribute('data-platforms'))?.split('|')).toContain('WeChat')
    }
    await page.locator('[data-filter-reset]').click()
    await expect(platform).toHaveValue('')
    await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(4)
  })

  test(`passes automated accessibility checks on ${prefix}/projects/`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${prefix}/projects/`)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations, `${prefix || 'zh-CN'} project index accessibility violations`).toEqual([])
  })

  test(`persists project filters in the URL on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/?role=engineering&platform=WeChat`)
    await expect(page.locator('[data-filter-role]')).toHaveValue('engineering')
    await expect(page.locator('[data-filter-platform]')).toHaveValue('WeChat')
    await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(1)
    await page.locator('[data-filter-maturity]').selectOption('planned')
    await expect(page).toHaveURL(/role=engineering&platform=WeChat&maturity=planned|role=engineering&maturity=planned&platform=WeChat/)
    await page.reload()
    await expect(page.locator('[data-filter-maturity]')).toHaveValue('planned')
    await page.goBack()
    await expect(page.locator('[data-filter-maturity]')).toHaveValue('')
  })

  test(`shows roadmap evidence for the planned data project on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/weapp-sqlite/`)
    await expect(page.locator('[data-project-status="planned"]')).toHaveAttribute('aria-label', prefix ? 'Project status: Planned' : '项目状态: 规划中')
    await expect(page.locator('[data-project-status="planned"]')).toHaveCount(1)
    await expect(page.locator('.roadmap-strip')).toBeVisible()
    await expect(page.locator('.roadmap-strip li')).toHaveCount(2)
    await expect(page.locator('.roadmap-status[aria-label]')).toHaveCount(2)
    await expect(page.locator('.roadmap-strip li').first()).toHaveAttribute('aria-labelledby', 'roadmap-item-weapp-sqlite-1')
    await expect(page.locator('.roadmap-strip li').first()).toHaveAttribute('aria-describedby', 'roadmap-status-weapp-sqlite-1')
    await expect(page.locator('.roadmap-status').first()).toHaveAttribute('aria-label', prefix ? 'Status: Planned' : '状态: 规划中')
    await expect(page.locator('[data-roadmap-status="planned"]')).toHaveCount(2)
    await expect(page.locator('.roadmap-strip li').first()).toContainText(prefix ? 'Confirm runtime and platform boundaries' : '确认运行时与平台边界')
    const readiness = page.getByText(prefix ? 'The first release is being specified; no install command or production API is available yet.' : '首版资料整理中，暂不提供安装命令或生产 API。', { exact: true })
    await expect(readiness).toBeVisible()
    await expect(readiness).toHaveAttribute('role', 'status')
    await expect(readiness).toHaveAttribute('aria-live', 'polite')
    await expect(page.locator('section[aria-labelledby="quick-start-title"]')).toHaveCount(1)
    await expect(page.locator('section[aria-labelledby="quick-start-title"]')).toHaveAttribute('aria-describedby', 'quick-start-audience-weapp-sqlite quick-start-note-weapp-sqlite')
    await expect(page.locator('.project-proof-list')).toContainText(prefix ? 'Runtime boundaries are still being confirmed' : '运行时边界待确认')
    await expect(page.locator('.project-proof-code-head span[aria-label]')).toHaveAttribute('aria-label', prefix ? 'Project status: Planned' : '项目状态: 规划中')
    await expect(page.locator('.project-proof-panel')).toHaveAttribute('aria-describedby', 'project-proof-description project-proof-status-weapp-sqlite')
    await expect(page.locator('.project-proof-panel')).toHaveAttribute('data-proof-count', '2')
  })

  test(`marks the current project navigation entry on ${prefix}/projects/`, async ({ page }) => {
    await page.goto(`${prefix}/projects/`)
    const current = page.locator('[data-site-header] a[aria-current="page"]')
    await expect(current).toHaveCount(2)
    await expectSiteLink(current.first(), `${prefix}/projects/`)
    const collectionSchema = await page.locator('script[type="application/ld+json"]').evaluateAll(elements => elements.map(element => JSON.parse(element.textContent || '{}')).find(schema => schema['@type'] === 'CollectionPage'))
    expect(collectionSchema).toMatchObject({ '@type': 'CollectionPage', 'url': `${siteOrigin}${prefix}/projects/` })
    expect(collectionSchema.mainEntity.numberOfItems).toBe(9)
  })

  test(`links the project catalog to sponsor support on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/`)
    const support = page.locator('[aria-labelledby="projects-support-title"]')
    if (isOpenSourceSite) {
      await expect(support).toHaveCount(0)
      return
    }
    await expect(support).toBeVisible()
    await expect(support).toContainText(prefix ? 'Support the toolchain maintenance' : '支持这套工具链继续维护')
    await expect(support.getByRole('link').nth(0)).toHaveAttribute('href', `${prefix}/sponsors/`)
    await expect(support.getByRole('link').nth(1)).toHaveAttribute('href', `${prefix}/contributors/`)
  })

  test(`decodes the project detail logo asynchronously on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/weapp-vite/`)
    await expect(page.locator('main#main-content > section').first().locator('img').first()).toHaveAttribute('decoding', 'async')
  })

  test(`labels the project detail audience in ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/weapp-vite/`)
    await expect(page.locator('.quick-start-audience')).toContainText(prefix ? 'For' : '适合')
    await expect(page.locator('#quick-start-note-weapp-vite')).toHaveCount(0)
    const metadata = page.locator(`[role="list"][aria-label="${prefix ? 'Platforms and runtimes' : '平台与运行时'}"]`)
    await expect(metadata).toHaveCount(1)
    await expect(metadata.locator('[role="listitem"]')).not.toHaveCount(0)
    await expect(metadata.locator('[role="listitem"]').first()).toHaveAttribute('aria-label', /^(Platform|平台): /)
  })

  test(`decodes the project detail hero visual asynchronously on ${prefix || 'zh-CN'}`, async ({ page }) => {
    await page.goto(`${prefix}/projects/weapp-vite/`)
    const heroVisual = page.locator('main#main-content > section').first().locator('figure img')
    await expect(heroVisual).toHaveAttribute('fetchpriority', 'high')
    await expect(heroVisual).toHaveAttribute('decoding', 'async')
  })

  test(`publishes toolchain and ecosystem projects in the localized ItemList schema on ${prefix}/projects/`, async ({ page }) => {
    await page.goto(`${prefix}/projects/`)
    const schema = await page.locator('script[type="application/ld+json"]').evaluateAll(scripts => scripts.map(script => JSON.parse(script.textContent ?? '{}')).find(value => value['@type'] === 'ItemList'))
    expect(schema).toBeTruthy()
    expect(schema.numberOfItems).toBe(9)
    expect(schema.itemListElement.map((item: { name: string }) => item.name)).toEqual(['weapp-vite', 'weapp-tailwindcss', 'Varo', 'weapp-sqlite', 'VPT', 'Vue Mini', 'Rezor', 'Uni Helper', 'Wot UI'])
  })

  test(`ignores unknown project filters on ${prefix}/projects/`, async ({ page }) => {
    await page.goto(`${prefix}/projects/?role=unknown&maturity=invalid&platform=not-real`)
    await expect(page.locator('[data-filter-role]')).toHaveValue('')
    await expect(page.locator('[data-filter-maturity]')).toHaveValue('')
    await expect(page.locator('[data-filter-platform]')).toHaveValue('')
    await expect(page.locator('[data-filter-count]')).toContainText(prefix ? '4 projects' : '4 个项目')
    await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(4)
    await expect(page).toHaveURL(`${prefix}/projects/`)
  })
}

for (const prefix of ['', '/en']) {
  test(`audits all project detail pages in ${prefix || 'zh-CN'} for accessibility`, async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await applyTheme(page, theme, { reducedMotion: 'reduce' })
      for (const slug of ['weapp-vite', 'weapp-tailwindcss', 'varo', 'weapp-sqlite', 'vite-plugin-taro']) {
        await page.goto(`${prefix}/projects/${slug}/`)
        await expectSiteLink(page.getByRole('link', { name: prefix ? 'Back to the stack' : '返回工具栈', exact: true }), `${prefix}/projects/`)
        await expect(page.locator('section[aria-labelledby="project-title"]')).toHaveCount(1)
        await expect(page.locator('section[aria-labelledby="project-faq-title"]')).toHaveCount(1)
        await expect(page.locator('section[aria-labelledby="project-future-docs-title"]')).toHaveCount(1)
        await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', prefix ? /logo and project overview$/ : /项目标识与项目概览$/)
        await expect(page.locator('section[aria-label]')).toHaveCount(2)
        await expect(page.getByRole('link', { name: prefix ? /Related project:/ : /相关项目:/ })).toHaveCount(2)
        await expect(page.getByRole('link', { name: prefix ? /Related project:/ : /相关项目:/ }).first()).toHaveAttribute('data-analytics-event', 'select_related_project')
        await expect(page.getByRole('link', { name: prefix ? /Related project:/ : /相关项目:/ }).first()).toHaveAttribute('data-analytics-from', slug)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(element => element.hasAttribute('data-visible')))
        const accessibility = await new AxeBuilder({ page }).include('main').analyze()
        expect(accessibility.violations, `${prefix || 'zh-CN'} ${theme} ${slug}`).toEqual([])
      }
    }
  })
}

test.describe('project catalog without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  for (const prefix of ['', '/en']) {
    test(`keeps all projects readable on ${prefix}/projects/`, async ({ page }) => {
      await page.goto(`${prefix}/projects/`)
      await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(4)
      await expect(page.locator('[data-project-card]:visible').first().locator('[data-analytics-event="select_project"]')).toHaveCount(1)
      await expect(page.locator('[data-project-card]:visible').first().locator('[data-analytics-event="click_outbound"]')).toHaveCount(1)
      for (const control of await page.locator('[data-project-filters] select, [data-filter-reset]').all()) {
        await expect(control).toBeDisabled()
      }
      await expect(page.locator('.projects-filter-note')).toContainText('JavaScript')
      await expect(page.locator('[data-filter-empty]')).toBeHidden()
      await page.locator('[data-project-card][data-role="data"] .projects-index-actions a').last().click()
      await expect(page).toHaveURL(`${prefix}/projects/weapp-sqlite/`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('weapp-sqlite')
      await expect(page.getByRole('region', { name: prefix ? 'Project data' : '项目数据', exact: true })).toBeVisible()
      await expect(page.locator('main figure')).toHaveCount(0)
      await expect(page.locator('.project-proof-panel')).toBeVisible()
      await expect(page.locator('.roadmap-strip')).toBeVisible()
      const back = page.getByRole('link', { name: prefix ? 'Back to the stack' : '返回工具栈', exact: true })
      await back.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(`${prefix}/projects/`)
      await expect(page.locator('#toolchain-project-list [data-project-card]:visible')).toHaveCount(4)
    })
  }
})

for (const width of [1440, 768, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`keeps the planned project detail compact at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      await applyTheme(page, theme, { reducedMotion: 'reduce' })
      await page.goto('/en/projects/weapp-sqlite/')
      await expect(page.getByRole('heading', { level: 1, name: 'weapp-sqlite' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Project data', exact: true })).toBeVisible()
      await expect(page.locator('main figure')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      const readiness = page.getByText('Stability and release status follow the project repository and version data.', { exact: true })
      await expect(readiness).toHaveCount(1)
      await page.screenshot({ path: testInfo.outputPath('planned-project-detail.png') })
    })

    test(`keeps project filters readable at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      await applyTheme(page, theme, { reducedMotion: 'reduce' })
      await page.goto('/en/projects/')
      await expect(page.locator('[data-filter-role]')).toBeEnabled()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      const results = await new AxeBuilder({ page }).include('main').analyze()
      expect(results.violations).toEqual([])
      await page.screenshot({ path: testInfo.outputPath('project-catalog.png'), fullPage: true })
    })
  }
}
