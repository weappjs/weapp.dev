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

[2026-10-23 repoctl 6.0.1 迁移与上线记录](repoctl-migration-2026-10-23.md) 记录历史 0.3.0 补发、隔离 nightly 制品验证、部署环境配置以及仍待完成的真实上线验收。

版本与发布由 repoctl 6.0.1 统一管理，底层继续使用 pnpm 12 原生 versioning。开发分支用 `pnpm change weapp --bump minor --summary "变更说明"` 记录功能（修复用 `patch`）；`.changeset/*.md` 是 pnpm change intent，不使用 Changesets CLI/action。`pnpm release:plan --json` 只读预览，`pnpm change check` 检查 intent。`pnpm-workspace.yaml` 的 `versioning.ignore` 精确排除 root 与四个私有 workspace，新增私有包时同步名单。

受管 `.github/workflows/release.yml` 在 main push 时执行 repoctl 的 plan、verify、prepare、upload、confirm、finalize 阶段。有待处理 intent 时维护 `release/pnpm-version` → main 的版本 PR；审查并合并版本 PR 后，由下一次 main 运行完成 npm 正式发布、canonical tag、GitHub Release 和 release record。版本 PR 不自动合并，prepare 不发布包。`release:verify` 保留边界、类型、lint、单测和独立 tarball 检查；`afterVersion` 构建并检查新的 CLI 版本，避免 nightly 或正式版本号与 `dist/data/meta.json` 不一致。

开发者提交门禁统一使用 repoctl 的 Lefthook 配置，根目录 `prepare` 只在实际开发 checkout 安装 hooks：CI、`LEFTHOOK=0` 和没有自身 `.git` 的发布源码归档会跳过，开发环境中的真实安装错误仍会失败。CI 显式设置 `LEFTHOOK=0` 并执行质量脚本，不再依赖 Husky。默认 GitHub token 权限为 read，release job 单独授予 contents、pull-requests、actions 和 OIDC 权限。内置 token 创建的版本 PR 不会自动触发其他工作流，因此 release workflow 显式 dispatch `weapp-cli.yml` 验证该版本分支。受管模板保留可选 GitHub App 配置；无需为日常版本准备增加 PAT。

Nightly 每日北京时间 02:00（UTC `0 18 * * *`）检查 main，已经发布过相同来源提交与 nightly 构建身份时跳过，使用 npm `snapshot-nightly` dist-tag。也可手动运行 `release.yml` 的 `mode=nightly`；`dry-run=true` 只检查。repoctl 在隔离目录设置快照版本、重建并验证包，不消费正式 change intent、不修改 main 版本、不移动 `latest`、不创建正式 Release。试用命令为 `npx weapp@snapshot-nightly`，需要安装依赖时使用 `npm install weapp@snapshot-nightly`。

weapp CLI 单独由 `.github/workflows/weapp-cli.yml` 验证：目录与 Logo 构建、双语命令/只读诊断/脚手架适配单测、真实 PTY 恢复、后台浏览器实验室及独立 tarball。Node 18 的兼容任务只安装真实 tarball 并运行 plain ESM smoke，不运行要求新 Node 的 Vitest。CLI 开发与命令说明见 `packages/weapp/README.md`，新增项目能力应从中立 catalog 生成，不另写手工名单。交互默认六项由 `ecosystem=weapp` 筛选，查询和 JSON 保留十一项；真实 Logo 构建时由公共 assets 导出打包，运行时只允许固定资源表。大厅首帧后异步识别项目，识别期间 Enter 不排队、C 仍可创建；目录与模板驱动星图，创建成功展示实际包管理器和脚本；整个状态机保留单一输入所有者，20 FPS 上限同时约束按键更新，按行差分与背压避免输出积压。

CLI 命令与数据按需加载；QR core/SVG、semver、string-width、cross-spawn、yaml 和 picomatch 的纯 JavaScript 闭包打包进产物，仅 open 保留运行时外部依赖及平台资源。构建图、隔离安装和 `dist/THIRD_PARTY_NOTICES.txt` 一起验证依赖边界。创建查询在有效目录确认后与模板选择并行，与执行统一使用目标父目录的 npm 配置；本次调用结束即清理预取，不建立持久版本缓存。`--dry-run` 保持零联网。性能记录须区分 CLI 执行、npm 全局扫描、registry 请求和脚手架安装，避免把外部等待或动画时长统称为启动耗时。

[2026-10-22 项目工作台与终端性能验收](weapp-project-workbench-2026-10-22.md) 记录项目识别、只读诊断、确认执行边界、性能对比和本轮实际验证范围。

[2026-10-15 CLI 启动与创建验收](weapp-startup-2026-10-15.md) 记录本机基线、依赖闭包、npx 对比、真实创建和平台验证范围。构建后用 `pnpm --filter weapp exec tsx scripts/benchmark-startup.ts` 测新进程帮助/版本/dry-run；真实 PTY 的首个可操作帧记录在 `packages/weapp/.cache/qa/terminal-metrics.json`。CI 检查行为与结构，不给不同机器设置同一毫秒硬门槛。

本地 `pnpm --filter weapp preflight` 只验证包身份、Node 18、public access、资源清单、bundle policy 和构建版本；`--artifact <tarball>` 还会安装并 smoke 测试指定 tarball、确认验证前后 SHA256 不变。这些检查不请求发布凭据。npm registry 状态、认证、上传、确认与恢复由 repoctl 管理，不保留另一套手写 OIDC 或 tag 发布实现。

npm trusted publisher 必须配置 owner `weappjs`、repository `weapp.dev`、workflow filename `release.yml`、空 environment；release/nightly/audit 都通过同一文件和 GitHub 托管 runner 使用 OIDC。迁移前用旧发布身份补齐已有 0.3.0 的 npm、canonical tag 和 GitHub Release，再切换 publisher 身份和合并迁移。新身份可用 `gh workflow run release.yml --ref main -f mode=oidc-audit` 审计；`npm publish --dry-run` 不证明 OIDC 可用。异常恢复使用受管 `reconcile` 或 `publish-unpublished` 模式并明确 package/version/source-sha，不另行手工上传。

网站也由 repoctl 管理。`repoctl-docs.yml` 的 main push 为 `web` 和 `open-source` 分别部署固定 preview；正式网站由成功 release record 触发，或明确选择已完成的 release ID 重试。正式站不会因普通 main push 更新。`repoctl-docs-deploy.yml` 保持 `docs-<site>-<channel>` 环境与同名、不可取消的并发组；Cloudflare 与 Pages 分开授予权限。每个站在隔离源码中通过边界、lint、类型、单测、构建验证和桌面/移动 E2E 后，部署同一产物并核对部署身份。

商业正式站保留 Worker `weapp-dev`、`weapp.dev` 和 `www.weapp.dev` 以及现有 www Redirect Rule；固定预览使用独立 Worker `weapp-dev-preview`。开源正式站继续使用 GitHub Pages 和 `weapp.js.org`，固定预览使用 `weapp-open-source-preview`。预览产物包含 noindex、禁用生产统计、保留生产 canonical；Pages 正式产物继续包含 CNAME、兼容 `/weapp.dev/` 路径、不生成 `.nojekyll`。两个 preview Worker 先完成 main 预览部署，后续 PR 才能上传 Worker Version。

Commercial CI 和 Open source CI 保留独立验证以及同仓 PR 的临时 Worker Version 预览。PR 构建完成后记录 site、PR head SHA、deployment ID，再执行 E2E；部署任务只下载并验证该产物，不重新构建。fork PR 只运行验证，不注入 Cloudflare 凭据。PR 关闭不会改变固定预览或正式流量。Cloudflare 凭据在对应 docs 环境中配置；PR 任务使用 repo-level 凭据。GitHub Pages 的 `pages: write`、`id-token: write` 只授予开源正式部署 job；其 JavaScript action 将 artifact 服务环境传给 repoctl，避免独立 shell 丢失上传上下文。

站点配置的 `releaseInputs` 除 `weapp` 本身外，也包含 CLI 打包所需的中立 catalog、Logo 与共享 UI 输入，以及根 `package.json`、锁文件、workspace 配置和 dependency patches。`patchPaths` 为空，尚不允许绕过正式发布追加文档修补提交。普通站点内容更新可先在 main preview 验收，正式上线绑定下一条已完成 release record。首条受管正式部署必须来自包含本次迁移配置、构建脚本和 adapter 的新版本 release record；补齐历史 0.3.0 发布只完成 npm 基线，不会把新部署代码加入历史源码。不要以旧 0.3.0 记录启动新网站部署，也不要修改旧 tag。双站互不导入，开源产物继续扫描商业文案、联系方式与私有资源。

上线前建立 `docs-web-preview`、`docs-web-stable`、`docs-open-source-preview`、`docs-open-source-stable` 四个 GitHub environment。正式环境继承原 production/github-pages 的审批与分支限制，保留或收紧已有规则；当前原 github-pages 仅允许 main。Cloudflare secrets 只配置到对应部署环境及同仓 PR 所需的仓库级入口，不向 fork PR 开放。环境缺失时不要依赖 workflow 自动创建无保护环境。

受管文件通过 `repo upgrade --dry-run` 检查三方合并，确认后 `repo upgrade --apply` 更新；保留 `.repoctl/baselines/root`，不将应用 CI 的本地定制覆盖成上游源码仓库工作流。受管目标仅包含 release 与两条 repoctl docs workflow。路径过滤的应用 CI 不应设为所有 PR 无条件必需的检查。

## 发布与回滚验收

PR 验证产物仍为 web-dist 和 open-source-dist；受管部署产物名称包含 site、channel、run ID 与 attempt，保存 30 天，测试和部署证据保存 7 天。发布前记录上一成功部署对应的运行号与提交；若接近保留期，先下载该运行的产物备份，再发布。

同一条失败或未完成的部署可按其 release ID 重试；repoctl 6 不允许较旧来源覆盖已完成的新来源，因此选择旧 release record 不能用于常规回滚。需要恢复旧行为时，在 main 提交 forward revert 并完成新的稳定发布，保留来源单调前进。紧急情况下可在 Cloudflare 回滚至上一 Worker Version，或把已归档的开源产物重新部署到 Pages；这属于平台直接恢复，必须记录实际版本、产物身份及与 repoctl 状态的差异，随后用新的稳定发布重新对齐。不要重新构建覆盖待回滚文件。两站可分别恢复；共享包回退前评估两站影响。

上线后核对中英文首页、项目目录、一个确认服务项目与规划中项目、隐私页、sitemap、静态资源和统计请求；开源站额外验证 /weapp.dev/ 子路径及历史跳转，商业站额外验证联系方式与赞助页面。只有真实部署后的检查通过，才能报告线上验收完成。
