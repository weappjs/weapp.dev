# 双应用维护手册

## 所有权

- apps/web（@weapp-io/web）：项目体验、完整项目资料、工程服务、赞助与贡献者基金；固定域名 https://weapp.dev。
- apps/open-source（@weapp-io/open-source）：十一个项目、文档、源码、发布与贡献；固定域名 https://weapp.js.org。
- packages/project-catalog（@weapp-io/project-catalog）：公开项目定义、类型、schema、项目素材、原始 media-source 截图和指标快照。只能通过包 exports 使用，禁止跨应用导入或直接读取另一个应用的目录。

- packages/site-ui（@weapp-io/site-ui）：粒子与星球、项目展示基础组件、演示、样式和交互辅助函数。应用通过公共导出传入品牌、文案、数据和链接；UI 包可以依赖 catalog，catalog 不得依赖 UI，两个包都不得依赖应用。

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
pnpm --filter @weapp-io/web exec playwright test
pnpm --filter @weapp-io/open-source exec playwright test
pnpm metrics:sync
```

两个应用分别生成自己的 dist。开发与构建前将本应用 public 和共享项目素材合并到本应用 .cache/public，Astro 只读取这份可重建缓存。开源应用的 public 不包含商业联系资源；不允许先混入后删除。构建固定读取已提交的指标快照，无须访问 GitHub/npm。metrics:sync 才请求公共 API，成功后更新共享包快照；现有每周同步工作流为变更创建 PR。

开发服务器由 Astro 选择空闲端口。E2E 使用专用静态服务：商业站 4321、开源站 45322。不要以另一进程的预览替代验收服务器。

## 依赖维护

[2026-10-22 全仓依赖与工具链升级记录](dependency-upgrade-2026-10-22.md) 记录当前升级目标、兼容性保留项、发布冷却、限定 override 与补丁的删除条件和验收状态；[2026-10-15 记录](dependency-upgrade-2026-10-15.md) 保留上一轮基线与样式构建迁移结论。后续升级应复查上游约束，满足删除条件后移除对应 override 或补丁。

## 内容与路由

商业站首页保留粒子字标、项目星球、完整项目介绍与演示，先呈现工具链与发布数据，再介绍独立开源站、服务及协作流程；/projects/ 和十一个详情保留完整资料，额外说明实施范围并链接同语种开源详情。只有 services.ts 中明确列出的项目可显示实施 CTA 和 Service schema，目前为 weapp-vite、weapp-tailwindcss。第三方工具仅说明评估范围，规划中工具不承诺交付。

商业站 /pricing/、/sponsors/、/contributors/ 及英文页面保留原有报价、权益与 60/25/15 分配规则。服务费用和自愿赞助分别说明。

开源站保留完整项目资料、演示与贡献路径。六个历史资金路径仅提供同语种项目目录的 noindex 静态跳转，禁用 JavaScript 时仍可访问。官方文档可以使用现有 weapp.dev 子域名，但不得链接商业主域名作为服务入口。

两站独立生成 canonical、hreflang、OG、JSON-LD、robots、sitemap、RSS 与 LLM 资源。商业项目页使用 WebPage 和经确认的 Service；开源项目页使用 SoftwareSourceCode。

两站的 BIMI 标识文件由各自 public/bimi/logo.svg 发布到 /bimi/logo.svg。构建验证要求该文件存在，旧的 /.well-known/bimi/ 路径不得进入产物；更新 BIMI DNS 记录时使用新路径。

## 统计与隐私

百度统计和 GA 继续使用现有账号。每个应用只允许自己的生产 hostname 加载脚本，本地和预览环境默认不加载；测试通过专门开关模拟统计。保留 opt-out、重新启用、Global Privacy Control 和 Do Not Track。

两个应用分别维护隐私说明。商业站说明 Cloudflare 可能独立记录托管指标；开源站不宣称存在 Cloudflare 托管统计。共享账号中的数据通过 hostname 区分。

## CI 与发布

版本由 repoctl 5.10.3 和 pnpm 原生 versioning 管理。功能或修复在开发分支记录 `pnpm change weapp --bump minor --summary "变更说明"`（修复使用 `patch`），提交 `.changeset/*.md` 后合入 `main`。这只是 pnpm 的 change intent 目录，不使用 Changesets CLI 或 action。`pnpm release:plan --json` 只读预览版本和 release notes，`pnpm change check` 检查 intent。`pnpm-workspace.yaml` 的 `versioning.ignore` 使用精确包名，排除私有 root 与四个 `@weapp-io/*` workspace；该字段不支持通配符，新增私有包时必须同步名单。

`.github/workflows/version-packages.yml` 在 `main` push 或手动运行时调用 `repo release ci --mode prepare`，创建或更新 `release/pnpm-version` → `main` 的版本 PR。repoctl 执行 `release:verify`，pnpm 消费 intent、升版、生成包内 `CHANGELOG.md` 和 `.changeset/ledger.yaml`，然后 `afterVersion` 构建最新版本的 CLI 快照。自动任务禁用开发者 Git hooks，使用显式质量脚本和 PR 的 CLI CI。版本 PR 不自动合并，prepare job 没有 OIDC 权限且不会发布 npm。

仓库允许 GitHub Actions 创建 PR，但默认 token 权限仍为 read；只有 prepare job 授予 contents / pull-requests / actions write。它使用内置 `GITHUB_TOKEN`，不需要 PAT 或 npm token，并显式 dispatch 版本分支的 CLI CI 和 `publish-weapp.yml` 的 preflight，以便检查真正待合并的版本。后者的 `--ref` 与 `tag` 输入均为 `release/pnpm-version`。当前已发布基线为 `0.2.0`；本次 minor intent 的只读 release plan 预览为 `0.3.0`。版本 PR 与发布分别处理。

weapp CLI 单独由 `.github/workflows/weapp-cli.yml` 验证：目录与 Logo 构建、双语命令/只读诊断/脚手架适配单测、真实 PTY 恢复、后台浏览器实验室及独立 tarball。Node 18 的兼容任务只安装真实 tarball 并运行 plain ESM smoke，不运行要求新 Node 的 Vitest。CLI 开发与命令说明见 `packages/weapp/README.md`，新增项目能力应从中立 catalog 生成，不另写手工名单。交互默认六项由 `ecosystem=weapp` 筛选，查询和 JSON 保留十一项；真实 Logo 构建时由公共 assets 导出打包，运行时只允许固定资源表。大厅第一帧即可操作，目录与模板驱动星图，创建成功立即展示结果；整个状态机保留单一输入所有者，20 FPS 上限同时约束按键更新，按行差分与背压避免输出积压。

CLI 命令与数据按需加载；QR core/SVG、semver、string-width 和 cross-spawn 的纯 JavaScript 闭包打包进产物，仅 open 保留运行时外部依赖及平台资源。构建图、隔离安装和 `dist/THIRD_PARTY_NOTICES.txt` 一起验证依赖边界。创建查询在有效目录确认后与模板选择并行，与执行统一使用目标父目录的 npm 配置；本次调用结束即清理预取，不建立持久版本缓存。`--dry-run` 保持零联网。性能记录须区分 CLI 执行、npm 全局扫描、registry 请求和脚手架安装，避免把外部等待或动画时长统称为启动耗时。

[2026-10-15 CLI 启动与创建验收](weapp-startup-2026-10-15.md) 记录本机基线、依赖闭包、npx 对比、真实创建和平台验证范围。构建后用 `pnpm --filter weapp exec tsx scripts/benchmark-startup.ts` 测新进程帮助/版本/dry-run；真实 PTY 的首个可操作帧记录在 `packages/weapp/.cache/qa/terminal-metrics.json`。CI 检查行为与结构，不给不同机器设置同一毫秒硬门槛。

CLI 发布与预检共用 `.github/workflows/publish-weapp.yml` 和 GitHub 托管 runner，`id-token: write` 仅授予其 publish job，不新增 environment。手动运行默认 `mode=preflight`、`tag=main`，tag 字段此时可为 Git ref。预检检查 manifest 的 weapp 身份、仓库、Node 18、public access、npm 版本未发布及 tarball 的运行时与实验室资源，安装并 smoke 测试同一 tarball 后上传产物。构建后本地 `pnpm --filter weapp preflight` 仅执行 npm metadata 与 pack dry-run，明确不检查 CI OIDC。

CI 预检使用 GitHub ID token endpoint 显式请求 `audience=npm:registry.npmjs.org` JWT，再向 npm package OIDC exchange endpoint 发起无 body 的 POST；任何请求失败、非成功状态或缺少 token 均使工作流失败。JWT 与 token 掩码后丢弃，错误只报告阶段与 HTTP 状态，不写凭据文件、不把交换 token 传给发布命令。交换成功仅说明交换完成，不能单独证明允许发布；npm 页面上的 trusted publisher 配置与历史实际发布可辅助核对。`npm publish --dry-run` 无凭据时也可能仅警告，不作为认证验收。

合并版本 PR 后，正式发布使用 repoctl 的 canonical 标签 `weapp@<packages/weapp/package.json 的版本>`，指向该 PR 的合并提交；创建并发布同名 GitHub Release 才触发 npm 发布。旧 `weapp-v<version>` 仍接受用于兼容，但 repoctl 后续消费新 intent 前要求上一版本的 npm 包、canonical tag 和非 draft GitHub Release 均完成，因此新的自动版本流程应使用 canonical 名称。main 尚处于已发布基线时，npm 预检会按预期拒绝重复版本，应预检待发布的版本分支。

只有明确 `mode=publish` 或 `release: published` 才执行 npm 发布。标签的解引用提交必须等于检出的 HEAD；工作流的 `GITHUB_REF` 必须为同一 `refs/tags/...`，`GITHUB_SHA` 也必须等于 HEAD，以免 provenance 记录手动 dispatch 的另一个来源提交。版本仍须未发布。发布同一验证过的 tarball，禁用 lifecycle scripts，npm 自行获取 trusted-publishing 凭据。预检用 `gh workflow run publish-weapp.yml --ref release/pnpm-version -f mode=preflight -f tag=release/pnpm-version`；只有获准发布并创建正确 tag 后，才用 `gh workflow run publish-weapp.yml --ref weapp@0.1.0 -f mode=publish -f tag=weapp@0.1.0`。仅手动 dispatch 发布 npm 时还须补齐 canonical GitHub Release，才能开始下一轮版本 PR。npm trusted publisher 应匹配 owner `weappjs`、repository `weapp.dev`、workflow filename `publish-weapp.yml` 与当前空 environment；不要为预检创建 release/tag 或调用实际 publish。

Commercial CI 和 Open source CI 独立验证、部署和并发控制。各应用路径改动只触发自身流程；共享包、锁文件、根配置和边界检查工具变更触发两站。单站失败不阻塞另一站。按新的工作流检查名称更新 GitHub branch protection；路径过滤的工作流不应被设为对所有 PR 无条件必需的检查。

商业站继续发布到 Worker weapp-dev，域名为 weapp.dev 和 www.weapp.dev。Cloudflare 凭据只注入商业部署任务；www 的现有 Redirect Rule 保留。PR 保留 Worker Version 预览。

开源站使用 GitHub Pages，直接发布已构建的静态产物，不经过 Jekyll。产物保留 CNAME，不生成 .nojekyll，并改写相对资源链接以兼容 /weapp.dev/ 子路径；重复执行资源准备时会清理旧的 .nojekyll，产物验证也会拒绝该文件。Pages 发布权限仅出现在该部署任务。保留现有仓库 Pages 设置与域名申请，不通过此次代码变更迁移域名。

每站仅在该站 lint、类型、单测、产物验证、桌面/移动 E2E 通过后发布。依赖边界检查阻止跨应用导入。开源验证同时扫描 HTML、JS、JSON、SVG 和文本资源，防止商业文案及联系方式进入产物。

## 发布与回滚验收

每次通过验证的产物保存 30 天，名称分别为 web-dist 和 open-source-dist。发布前记录上一成功部署对应的运行号与提交；若接近保留期，先下载该运行的产物备份，再发布。

商业站回滚可使用 Cloudflare 中上一 Worker 版本，或下载上一成功运行的 web-dist，放到 apps/web/dist 后直接部署该产物。不要先重新构建覆盖回滚文件。开源站回滚使用上一成功运行的 open-source-dist 重新发布到 Pages，或回退相关应用提交并由该站 CI 发布。两站可分别回滚；共享包回退前需评估两站影响。

上线后核对中英文首页、项目目录、一个确认服务项目与规划中项目、隐私页、sitemap、静态资源和统计请求；开源站额外验证 /weapp.dev/ 子路径及历史跳转，商业站额外验证联系方式与赞助页面。只有真实部署后的检查通过，才能报告线上验收完成。
