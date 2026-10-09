# 双应用维护手册

## 所有权

- apps/web（@weapp.dev/web）：项目体验、完整项目资料、工程服务、赞助与贡献者基金；固定域名 https://weapp.dev。
- apps/open-source（@weapp/open-source）：十一个项目、文档、源码、发布与贡献；固定域名 https://weapp.js.org。
- packages/project-catalog（@weapp/project-catalog）：公开项目定义、类型、schema、项目素材、原始 media-source 截图和指标快照。只能通过包 exports 使用，禁止跨应用导入或直接读取另一个应用的目录。

- packages/site-ui（@weapp/site-ui）：粒子与星球、项目展示基础组件、演示、样式和交互辅助函数。应用通过公共导出传入品牌、文案、数据和链接；UI 包可以依赖 catalog，catalog 不得依赖 UI，两个包都不得依赖应用。

两应用各自维护页面编排、主题、文案、配置和测试。共享包不得包含联系方式、商业服务映射、报价、赞助或基金模块。两站继续共享统计账号和开发工具，不构成仓库权限隔离。文档子域名和各项目源码仓库保持原样。

## 命令

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm dev:pages
pnpm build:cloudflare
pnpm build:pages
pnpm preview
pnpm preview:pages
pnpm check
pnpm --filter @weapp.dev/web exec playwright test
pnpm --filter @weapp/open-source exec playwright test
pnpm metrics:sync
```

两个应用分别生成自己的 dist。开发与构建前将本应用 public 和共享项目素材合并到本应用 .cache/public，Astro 只读取这份可重建缓存。开源应用的 public 不包含商业联系资源；不允许先混入后删除。构建固定读取已提交的指标快照，无须访问 GitHub/npm。metrics:sync 才请求公共 API，成功后更新共享包快照；现有每周同步工作流为变更创建 PR。

开发服务器由 Astro 选择空闲端口。E2E 使用专用静态服务：商业站 4321、开源站 45322。不要以另一进程的预览替代验收服务器。

## 依赖维护

[2026-10-09 依赖升级验收](dependency-upgrade-2026-10-09.md) 记录本轮版本变化、限定 overrides 的删除条件、安全审计剩余告警、上游 peer 冲突和双站验证结果。后续升级应复查这些上游约束，满足删除条件后移除对应 override。

## 内容与路由

商业站首页保留粒子字标、项目星球、完整项目介绍与演示，先呈现工具链与发布数据，再介绍独立开源站、服务及协作流程；/projects/ 和十一个详情保留完整资料，额外说明实施范围并链接同语种开源详情。只有 services.ts 中明确列出的项目可显示实施 CTA 和 Service schema，目前为 weapp-vite、weapp-tailwindcss。第三方工具仅说明评估范围，规划中工具不承诺交付。

商业站 /pricing/、/sponsors/、/contributors/ 及英文页面保留原有报价、权益与 60/25/15 分配规则。服务费用和自愿赞助分别说明。

开源站保留完整项目资料、演示与贡献路径。六个历史资金路径仅提供同语种项目目录的 noindex 静态跳转，禁用 JavaScript 时仍可访问。官方文档可以使用现有 weapp.dev 子域名，但不得链接商业主域名作为服务入口。

两站独立生成 canonical、hreflang、OG、JSON-LD、robots、sitemap、RSS 与 LLM 资源。商业项目页使用 WebPage 和经确认的 Service；开源项目页使用 SoftwareSourceCode。

## 统计与隐私

百度统计和 GA 继续使用现有账号。每个应用只允许自己的生产 hostname 加载脚本，本地和预览环境默认不加载；测试通过专门开关模拟统计。保留 opt-out、重新启用、Global Privacy Control 和 Do Not Track。

两个应用分别维护隐私说明。商业站说明 Cloudflare 可能独立记录托管指标；开源站不宣称存在 Cloudflare 托管统计。共享账号中的数据通过 hostname 区分。

## CI 与发布

Commercial CI 和 Open source CI 独立验证、部署和并发控制。各应用路径改动只触发自身流程；共享包、锁文件、根配置和边界检查工具变更触发两站。单站失败不阻塞另一站。按新的工作流检查名称更新 GitHub branch protection；路径过滤的工作流不应被设为对所有 PR 无条件必需的检查。

商业站继续发布到 Worker weapp-dev，域名为 weapp.dev 和 www.weapp.dev。Cloudflare 凭据只注入商业部署任务；www 的现有 Redirect Rule 保留。PR 保留 Worker Version 预览。

开源站使用 GitHub Pages，产物带 CNAME 和 .nojekyll，并改写相对资源链接以兼容 /weapp.dev/ 子路径。Pages 发布权限仅出现在该部署任务。保留现有仓库 Pages 设置与域名申请，不通过此次代码变更迁移域名。

每站仅在该站 lint、类型、单测、产物验证、桌面/移动 E2E 通过后发布。依赖边界检查阻止跨应用导入。开源验证同时扫描 HTML、JS、JSON、SVG 和文本资源，防止商业文案及联系方式进入产物。

## 发布与回滚验收

每次通过验证的产物保存 30 天，名称分别为 web-dist 和 open-source-dist。发布前记录上一成功部署对应的运行号与提交；若接近保留期，先下载该运行的产物备份，再发布。

商业站回滚可使用 Cloudflare 中上一 Worker 版本，或下载上一成功运行的 web-dist，放到 apps/web/dist 后直接部署该产物。不要先重新构建覆盖回滚文件。开源站回滚使用上一成功运行的 open-source-dist 重新发布到 Pages，或回退相关应用提交并由该站 CI 发布。两站可分别回滚；共享包回退前需评估两站影响。

上线后核对中英文首页、项目目录、一个确认服务项目与规划中项目、隐私页、sitemap、静态资源和统计请求；开源站额外验证 /weapp.dev/ 子路径及历史跳转，商业站额外验证联系方式与赞助页面。只有真实部署后的检查通过，才能报告线上验收完成。
