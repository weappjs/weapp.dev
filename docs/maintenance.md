# weapp.dev 维护手册

本文面向 weapp.dev 仓库维护者，记录本地开发、项目数据、部署、统计以及搜索可见性约定。

站点使用 Astro 6 和 TypeScript 生成完全静态的 HTML，由 Cloudflare Workers Static Assets 发布。页面和资源采用 assets-only 部署，直接由 Cloudflare Static Assets 返回，不经过用户 Worker。

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
pnpm check                                      # Lint、Astro、TypeScript 和单元测试
pnpm build                                      # 拉取指标、构建并检查静态产物
pnpm --filter @weapp.dev/web test:e2e           # Playwright 桌面端与移动端测试
pnpm --filter @weapp.dev/web deploy:dry-run     # Wrangler 生产部署预检
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

首页、导航、项目详情、RSS 与指标抓取会自动发现新定义，无需修改组件。GitHub 与 npm 指标只在构建时请求；请求失败或响应无效时使用 `apps/web/src/data/project-metrics.fallback.json`，不会因为外部 API 不可用而中断构建。

公开文案应以项目 JSON 和 `apps/web/src/i18n/ui.ts` 为事实来源。维护项目内容时，同步核对 README、中英文项目定义、适用对象、用例、安装命令和问答。

现有文档分别发布在 [`tw.weapp.dev`](https://tw.weapp.dev/) 和 [`vite.weapp.dev`](https://vite.weapp.dev/)。未来聚合文档使用 `/docs/<project>/`，届时再将 canonical 统一指向对应的 `weapp.dev` 路径。

## GitHub Actions 部署

站点仍发布到现有 Worker `weapp-dev`。同一份 `apps/web/dist` 还会发到 GitHub Pages，供 `weapp.js.org` 使用。构建、校验和 Wrangler 发布都在 GitHub Actions 工作流 `CI`（`.github/workflows/ci.yml`）里完成。Cloudflare 只作为 `weapp.dev` 的运行时，不再用 Workers Builds 的 Git 集成。

| 设置        | 值                                                                              |
| ----------- | ------------------------------------------------------------------------------- |
| 生产分支    | `main`                                                                          |
| 质量门      | `pnpm check` 和静态构建通过后发布；Playwright e2e 仍运行但不阻断生产            |
| 生产命令    | `pnpm exec wrangler deploy --message "$GITHUB_SHA"`（工作目录 `apps/web`）      |
| Pages 发布  | `actions/upload-pages-artifact` + `actions/deploy-pages`（`deploy-pages` 作业） |
| 预览命令    | `pnpm exec wrangler versions upload --preview-alias pr-<n>`                     |
| Node / pnpm | `.node-version`（22.23.2）和根目录 `packageManager`（pnpm@12.3.4）              |
| Secrets     | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`                                 |

`push` 到 `main` 或在 `main` 上 `workflow_dispatch` 会把 `verify` 产出的 `apps/web/dist` 同时激活为 Cloudflare 生产部署和 GitHub Pages。canonical、sitemap 和 JSON-LD 仍指向 `https://weapp.dev`。同仓库 PR 只上传 Worker Version，别名为 `pr-<number>`，不切换生产流量。Fork PR 没有仓库 secrets，跳过预览。

版本预览 URL 已启用，公开地址格式为：

```text
https://<version-prefix>-weapp-dev.<account>.workers.dev
```

Worker 的生产 `workers.dev` 地址保持关闭，版本预览保持开启。`apps/web/wrangler.jsonc` 中的 `preview_urls: true` 是 Wrangler 部署的配置事实来源。

断开 Cloudflare Dashboard 里 Worker `weapp-dev` 的 Git 连接，避免和 GitHub Actions 双发布。不要删除 Worker，也不要改自定义域或 Redirect Rules。

生产自定义域保持绑定现有 Worker 的生产部署：

- `weapp.dev`
- `www.weapp.dev`

`weapp.js.org` 不写进 `wrangler.jsonc`。js.org 的 DNS 在 js-org 的 Cloudflare 账号里，站点通过 GitHub Pages 提供内容：产物里有 `CNAME`（`weapp.js.org`）和 `.nojekyll`（避免 Jekyll 丢掉 `_astro/`）。GitHub 项目页挂在 `/weapp.dev/` 下，所以 Pages 产物会把根路径资源改成相对路径，`https://weappjs.github.io/weapp.dev/` 和以后的 `https://weapp.js.org/` 都能加载 `_astro` 与 logo。子域要在 [js-org/js.org](https://github.com/js-org/js.org) 的 `cnames_active.js` 登记 `"weapp": "weappjs.github.io/weapp.dev"`，仓库 Settings → Pages 的 Source 选 GitHub Actions。

`wrangler.jsonc` 只配置静态 Assets 和两个自定义域名，不包含 Worker 入口或 `run_worker_first`。`www.weapp.dev` 的 308 跳转在 Cloudflare Redirect Rules 中配置，条件为 `http.host eq "www.weapp.dev"`，目标为 `https://weapp.dev` 加原始路径，并保留查询参数。

## 访问统计

生产站点使用三层统计，并且不会在预览域名或本地开发环境加载第三方脚本：

- Cloudflare Web Analytics 提供无 Cookie 的基础流量与 Core Web Vitals。
- 正式域名（`weapp.dev` 和 `weapp.js.org`）访问同时加载百度统计和 Google Analytics 4；预览域名和本地开发不会加载生产统计。
- 首次访问不显示同意横幅，页脚的统计偏好入口可以随时关闭或重新开启两个平台。
- 浏览器启用 Global Privacy Control 或 Do Not Track 时不会加载百度统计或 GA4。

百度统计 ID 和 GA4 Measurement ID 是公开标识，直接由前端统计加载器使用，不作为 Secret，也不通过 Worker API 返回。

事件字典固定为 `select_project`、`click_outbound`、`switch_language`、`change_theme` 和 `navigate_section`。事件参数只允许项目 slug、目标类型、语言、主题或站内区块；页面 URL 仅保留 UTM 参数。统计运维分别在 Cloudflare Web Analytics、百度统计和 Google Analytics 中完成，搜索表现分别在百度搜索资源平台与 Google Search Console 中查看。

GA4 首屏浏览由一次 `config` 命令产生，`page_location`、`page_path` 和 `page_title` 在配置时写入；不要再追加手动 `page_view`，否则会产生重复浏览。`gtag` 包装器必须像 Google 标准片段一样向 `dataLayer` 压入函数的 `arguments` 对象，改成剩余参数数组会导致目标无法初始化。修改统计加载器后，先完成网站构建，再运行 `pnpm --filter @weapp.dev/web test:e2e:analytics-live`。该测试加载 Google 官方 `gtag.js`，但会在 `/g/collect` 请求离开浏览器前返回 `204`，用于验证衡量 ID、事件名和脱敏 URL，不会向生产数据流写入测试访问。

生产发布后先确认 GitHub Actions 的 `deploy-production` 成功，再使用未拒绝统计且未启用 Global Privacy Control 或 Do Not Track 的浏览器访问正式域名。Google Analytics 实时报告通常应在 5–30 分钟内出现访问；数据流首页的“未收到数据”状态可能最多延迟 24–48 小时，不能单独作为发布失败的判断依据。

## SEO 与 GEO

站点为中文默认、英文 `/en/` 的静态双语站点。语言跳转只在浏览器里完成：有保存的选择就用选择，否则看系统语言，服务端不判断。每个公开页面都会生成规范 canonical、双向 hreflang、Open Graph/Twitter 分享元数据和 JSON-LD；项目页的实体信息以仓库、文档和 npm 官方链接为准。404 页面使用 `noindex, follow`，不会进入 sitemap。

面向生成式搜索的可引用入口为 [`/llms.txt`](https://weapp.dev/llms.txt) 和 [`/llms-full.txt`](https://weapp.dev/llms-full.txt)。维护项目内容时应同步更新中英文的一句话定义、适用对象、用例、安装命令和问答，避免只增加关键词而没有可验证事实。

发布前运行 `pnpm build`，它会校验 title、description、canonical、hreflang、robots、JSON-LD、sitemap 和 LLM 资源。发布后在 Google Search Console、百度搜索资源平台、Rich Results Test 和 Schema Markup Validator 中检查收录与结构化数据；生成式搜索的引用效果按真实查询和来源链接持续观察，不以单一工具分数作为上线标准。
