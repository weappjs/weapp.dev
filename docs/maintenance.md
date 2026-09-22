# weapp 双站维护手册

本仓库用同一套项目数据生成 weapp.dev 与 weapp.js.org。weapp.dev 保留生态介绍，并提供迁移与培训、开源赞助和贡献者基金入口；weapp.js.org 只展示开源项目、文档、源码、发布和贡献方式，不包含赞助、资金、基金、付费服务或商业导流。

两站使用 Astro 7 和 TypeScript 生成静态 HTML。weapp.dev 由 Cloudflare Workers Static Assets 发布，weapp.js.org 使用 GitHub Pages 产物；站点构建不会迁移 GitHub 仓库或各项目的文档域名。

## 本地开发

环境要求：

- Node.js 22.12.0 或更高版本，本仓库和 GitHub Actions 使用 22.23.2。
- pnpm 12.3.4（与根目录 `package.json` 的 `packageManager` 一致）。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

常用命令：

```bash
pnpm dev                                        # weapp.dev 本地开发
pnpm dev:pages                                  # weapp.js.org 本地开发
pnpm check                                      # Lint、Astro、TypeScript 和单元测试
pnpm build:cloudflare                           # 构建并校验 weapp.dev → dist
pnpm build:pages                                # 构建、改写相对路径并校验 weapp.js.org → dist-pages
pnpm preview                                    # 预览已有 weapp.dev 产物
pnpm preview:pages                              # 预览已有 weapp.js.org 产物
pnpm --filter @weapp.dev/web test:e2e             # 构建并测试 weapp.dev
pnpm --filter @weapp.dev/web test:e2e:pages       # 构建并测试 weapp.js.org，含 Pages 子路径
pnpm --filter @weapp.dev/web deploy:dry-run       # Wrangler 生产部署预检
pnpm repo:doctor                                # repoctl 工作区诊断
pnpm repo:check                                 # repoctl 提交前检查
```

提交部署相关改动前，再验证非生产版本上传：

```bash
cd apps/web
pnpm exec wrangler versions upload --dry-run
```

## 项目数据

项目定义位于 `apps/web/src/content/projects/`，并由 Astro Content Collection 校验。新增项目时：

1. 增加一份以项目 slug 命名的 JSON 定义。
2. 将品牌资源放入 `apps/web/public/brands/`。
3. 运行 `pnpm --filter @weapp.dev/web metrics:update-fallback`，提交最新的指标快照。

导航、项目目录、详情、RSS 与指标抓取会发现新定义；首页选品还需更新 `src/content/home-projects.ts`。GitHub 与 npm 指标只在构建时请求；请求失败或响应无效时使用 `apps/web/src/data/project-metrics.fallback.json`，不会因为外部 API 不可用而中断构建。

公开文案应以项目 JSON 和 `apps/web/src/i18n/ui.ts` 为事实来源。维护项目内容时，同步核对 README、中英文项目定义、适用对象、用例、安装命令和问答。

项目状态、官方文档和仓库链接由同一份项目 JSON 维护，九个项目在两站保持一致；weapp-sqlite 仍标为规划中。现有文档继续使用各自域名，包括 [`tw.weapp.dev`](https://tw.weapp.dev/)、[`vite.weapp.dev`](https://vite.weapp.dev/)、[`varo.weapp.dev`](https://varo.weapp.dev/) 和 [`vpt.js.org`](https://vpt.js.org/)。`/docs/<project>/` 只是资料中的未来路径，不表示文档已经迁移。

## GitHub Actions 部署

GitHub Actions 工作流 `CI`（`.github/workflows/ci.yml`）生成并验证两份独立产物。`WEAPP_DEPLOY_TARGET=weapp`（默认）使用 `https://weapp.dev` 身份并写入 `apps/web/dist`，发布到现有 Worker `weapp-dev`；`WEAPP_DEPLOY_TARGET=github-pages` 使用 `https://weapp.js.org` 身份并写入 `apps/web/dist-pages`，发布到 GitHub Pages。`src/lib/deployment.ts` 中的 `getSiteProfile()` 统一提供站名、规范域名、导航、组织与源码入口及服务/赞助开关。

| 设置        | 值                                                                              |
| ----------- | ------------------------------------------------------------------------------- |
| 生产分支    | `main`                                                                          |
| 质量门      | `pnpm check`、两站静态构建及两站桌面/移动 E2E 全部通过后发布                    |
| 生产命令    | `pnpm exec wrangler deploy --message "$GITHUB_SHA"`（工作目录 `apps/web`）      |
| Pages 发布  | `actions/upload-pages-artifact` + `actions/deploy-pages`（`deploy-pages` 作业） |
| 预览命令    | `pnpm exec wrangler versions upload --preview-alias pr-<n>`                     |
| Node / pnpm | `.node-version`（22.23.2）和根目录 `packageManager`（pnpm@12.3.4）              |
| Secrets     | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`                                 |

`verify` 上传 `web-dist` 与 `web-pages-dist`；`e2e` 矩阵分别下载对应产物并以相同 target 运行 Playwright。生产、Pages 和 PR 预览部署都依赖 `verify` 与整个 `e2e` 矩阵。`push` 到 `main` 或在 `main` 上 `workflow_dispatch` 才能激活生产；同仓库 PR 上传 Worker Version，别名为 `pr-<number>`，不切换生产流量。Fork PR 没有仓库 secrets，跳过预览。

Playwright 用 `scripts/serve-test-site.mjs` 直接服务已构建产物，不重新构建。Pages 测试同时覆盖域名根路径和 `/weapp.dev/` 子路径，验证资源加载、项目入口、语言切换、无 JavaScript 阅读及旧路径跳转。canonical、hreflang、sitemap、JSON-LD、RSS 与 LLM 资源必须使用各自站点身份，不能把 Pages 内容规范化到 weapp.dev。

版本预览 URL 已启用，公开地址格式为：

```text
https://<version-prefix>-weapp-dev.<account>.workers.dev
```

Worker 的生产 `workers.dev` 地址保持关闭，版本预览保持开启。`apps/web/wrangler.jsonc` 中的 `preview_urls: true` 是 Wrangler 部署的配置事实来源。

断开 Cloudflare Dashboard 里 Worker `weapp-dev` 的 Git 连接，避免和 GitHub Actions 双发布。不要删除 Worker，也不要改自定义域或 Redirect Rules。

生产自定义域保持绑定现有 Worker 的生产部署：

- `weapp.dev`
- `www.weapp.dev`

`weapp.js.org` 不写进 `wrangler.jsonc`。该域名申请由 js-org 维护者审核；站点通过 GitHub Pages 提供内容：产物里有 `CNAME`（`weapp.js.org`）和 `.nojekyll`（避免 Jekyll 丢掉 `_astro/`）。GitHub 项目页挂在 `/weapp.dev/` 下，所以 Pages 产物会把根路径资源改成相对路径，`https://weappjs.github.io/weapp.dev/` 和以后的 `https://weapp.js.org/` 都能加载 `_astro` 与 logo。域名接入需在 [js-org/js.org](https://github.com/js-org/js.org) 的 `cnames_active.js` 登记 `"weapp": "weappjs.github.io/weapp.dev"`，仓库 Settings → Pages 的 Source 选 GitHub Actions。

`wrangler.jsonc` 只配置静态 Assets 和两个自定义域名，不包含 Worker 入口或 `run_worker_first`。`www.weapp.dev` 的 308 跳转在 Cloudflare Redirect Rules 中配置，条件为 `http.host eq "www.weapp.dev"`，目标为 `https://weapp.dev` 加原始路径，并保留查询参数。

## 访问统计

两站的前端统计加载器使用百度统计和 Google Analytics 4：

- 正式域名（`weapp.dev` 和 `weapp.js.org`）默认加载这两个平台；预览域名和本地开发不会加载生产统计。
- 首次访问不显示同意横幅，页脚的统计偏好入口可以随时关闭或重新开启两个平台。
- 浏览器启用 Global Privacy Control 或 Do Not Track 时不会加载百度统计或 GA4。

仓库没有注入 Cloudflare Web Analytics 脚本，`wrangler.jsonc` 也没有声明其配置。weapp.dev 的 Cloudflare 托管与浏览器分析脚本是不同的配置；若在 Cloudflare 控制台启用额外统计，需单独核对线上行为并同步隐私说明。GitHub Pages 产物不包含 Cloudflare Web Analytics，不能宣称两站都有始终启用的基础统计层。

百度统计 ID 和 GA4 Measurement ID 是公开标识，直接由前端统计加载器使用，不作为 Secret，也不通过 Worker API 返回。

事件字典固定为 `select_project`、`select_related_project`、`click_outbound`、`copy_command`、`switch_language`、`change_theme` 和 `navigate_section`。事件参数只允许项目 slug、目标类型、语言、主题或站内区块；页面 URL 仅保留 UTM 参数。前端访问与交互统计在百度统计和 Google Analytics 中查看，Cloudflare 中的托管指标只对应 weapp.dev 的部署。搜索表现分别在百度搜索资源平台与 Google Search Console 中查看。

GA4 首屏浏览由一次 `config` 命令产生，`page_location`、`page_path` 和 `page_title` 在配置时写入；不要再追加手动 `page_view`，否则会产生重复浏览。`gtag` 包装器必须像 Google 标准片段一样向 `dataLayer` 压入函数的 `arguments` 对象，改成剩余参数数组会导致目标无法初始化。修改统计加载器后，先完成网站构建，再运行 `pnpm --filter @weapp.dev/web test:e2e:analytics-live`。该测试加载 Google 官方 `gtag.js`，但会在 `/g/collect` 请求离开浏览器前返回 `204`，用于验证衡量 ID、事件名和脱敏 URL，不会向生产数据流写入测试访问。

生产发布后先确认 GitHub Actions 的 `deploy-production` 成功，再使用未拒绝统计且未启用 Global Privacy Control 或 Do Not Track 的浏览器访问正式域名。Google Analytics 实时报告通常应在 5–30 分钟内出现访问；数据流首页的“未收到数据”状态可能最多延迟 24–48 小时，不能单独作为发布失败的判断依据。

## SEO 与 GEO

站点为中文默认、英文 `/en/` 的静态双语站点。语言跳转只在浏览器里完成：有保存的选择就用选择，否则在浏览器语言列表里看到中文就用中文，服务端不判断。每个公开页面都会生成规范 canonical、双向 hreflang、Open Graph/Twitter 分享元数据和 JSON-LD；项目页的实体信息以仓库、文档和 npm 官方链接为准。404 页面使用 `noindex, follow`，不会进入 sitemap。weapp.js.org 的 `/pricing/`、`/sponsors/`、`/contributors/` 及三个英文对应路径也不收录：六页只保留 `noindex` 静态跳转，目标是同语种 `/projects/`，使用 meta refresh 与可见的相对链接，禁用 JavaScript 时仍可打开。weapp.dev 保留这些页面的完整内容。

两站分别提供 `/llms.txt` 和 `/llms-full.txt`；开源站的资源只包含开源内容，不列旧资金页面。维护项目内容时应同步更新中英文的一句话定义、适用对象、用例、安装命令和问答，避免只增加关键词而没有可验证事实。

发布前分别运行 `pnpm build:cloudflare` 和 `pnpm build:pages`，校验两站各自的 title、description、canonical、hreflang、robots、JSON-LD、sitemap 和 LLM 资源。随后对已有产物执行 `WEAPP_DEPLOY_TARGET=weapp pnpm --filter @weapp.dev/web exec playwright test` 与 `WEAPP_DEPLOY_TARGET=github-pages pnpm --filter @weapp.dev/web exec playwright test`；这两条命令与 CI 使用相同的静态产物验收方式，不重复构建。

发布后在 Google Search Console、百度搜索资源平台、Rich Results Test 和 Schema Markup Validator 中分别检查两站的收录与结构化数据；生成式搜索的引用效果按真实查询和来源链接持续观察，不以单一工具分数作为上线标准。
