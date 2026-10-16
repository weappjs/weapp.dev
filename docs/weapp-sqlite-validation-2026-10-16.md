# 2026-10-16 weapp-sqlite 星球与资料同步验收

本次先将本地 `main` 快进到 `352764f36395d9f9e6338e243dc884b633b0b2eb`，再在 `codex/add-weapp-sqlite-planet` 分支实现。同步包含此前落后的依赖升级和 CLI 启动体验两个提交。本次把 weapp-sqlite 加入双站首页的第 11 颗项目星球，并同步公开资料、官方标识、安装指引和 CLI 内嵌目录。

本文日期与可读时间采用北京时间。验收针对本地构建产物与本次受影响范围。本次未执行生产部署、npm 发布或版本升版。

## 官方依据与能力边界

资料来源为 [官方文档](https://sqlite.weapp.dev/)、[官方仓库 README](https://github.com/weapp-sqlite/weapp-sqlite/blob/main/README.md) 和 [weapp-vite 集成包](https://github.com/weapp-sqlite/weapp-sqlite/tree/main/packages/weapp-vite)。2026-10-16 核对时，上游 `main` 为 `66ceb4530679aa5712edbf6c5dd8f620d7ac7167`。

- 项目 slug、显示名与现有中英文路由均保留 `weapp-sqlite`；`packageName` 改为推荐集成包 `@weapp-sqlite/weapp-vite`，npm 链接也指向该包。
- 目录按 `status=beta`、`maturity=beta`、`dataCompleteness=partial` 展示。Beta 是本站依据已发布包及验收边界采用的保守分类，不表示上游自称 Beta。Web 与真实微信开发者工具的自动验收来自上游公开资料；微信 iOS、Android 真机仍待上游验证。本次网站测试不构成对 SQLite 运行时的重新验收。
- 其他小程序平台目前仅有构建产物和 `unsupported` 契约，不据此宣传已支持对应平台运行。
- 安装入口为 `pnpm add @weapp-sqlite/weapp-vite`。安装后仍须在 Vite 配置注册 `weappSqlite()`，再从 `@weapp-sqlite/weapp-vite/runtime` 导入 `openSqlite`；双语快速开始说明保留这些前提和真机验证边界。
- 页面示例更新为官方运行时入口的异步查询与关闭代码，并明确标为静态代码示例；页面没有运行数据库。商业服务范围独立表述，不从开源包发布状态推导已经提供实施服务。

初版图标取自上游公开素材。按用户后续要求，已在 `weapp-sqlite` 仓库的 `codex/redesign-sqlite-logo` 分支重新设计为两片互扣的数据块与 S 形透明通道，并同步到 `packages/project-catalog/public/brands/weapp-sqlite.svg`。上游已提交并推送为 [`e1d370c`](https://github.com/weapp-sqlite/weapp-sqlite/blob/e1d370c7ef8a75185ca8c96dfd9abfca2a38f890/assets/weapp-sqlite-icon.svg)，素材来源固定到该提交。共享文件 SHA256 为 `fa28eedfa015b133b34a9baf47aa0b35c45fa76dc8d13cae76dfe2da8adaf90a`。新图标画布 64 × 64、有效图形 56 × 56；品牌规范建议导航/列表至少 32px，留白至少为画布宽度的八分之一，保持实色、比例与朝向。双站首页图标的 32px 下限、轨道布局和交互保持不变。CLI 轨道仍按相同比例绘制，图标至少为 32 CSS px 且完整位于球体内。

## 数据与下游一致性

中立 catalog 是双站及 CLI 的共同来源。首页删除 SQLite 专用排除名单，按项目 `order` 展示全部 11 项；现有星球控制器、选中反馈、官方文档链接、键盘操作和无 JavaScript 降级继续使用原有实现。

CLI 继续按 `ecosystem=weapp` 默认展示 6 项，全部目录与 JSON 保留 11 项。SQLite 使用固定 Logo 白名单中的 `/logos/weapp-sqlite.svg`，`fallback=false`；构建从 catalog 的公共品牌目录复制官方标识，打包与本地服务沿用固定资源边界。删除过时的共享 Logo 副本，旧 `/logos/miniprogram.svg` 路由返回 404。

`weapp create` 仍只接受原有五个官方脚手架适配器。`sqlite`、`weapp-sqlite`、`@weapp-sqlite/weapp-vite` 都不会成为创建路线；单测确认拒绝发生在元数据查询与执行前，真实 tarball smoke 同样验证拒绝。`info` 支持通过保留的 slug 和推荐包名查找 SQLite。测试使用独立 slug，不从包名推导项目身份；通用 planned 行为由独立 fixture 继续验证，不绑定 SQLite 的当前成熟度。

公开指标快照仅更新 SQLite，抓取时间为 **2026-10-16 11:48:21.857**（`2026-10-16T03:48:21.857Z`）。快照记录推荐集成包版本 `0.3.0`、发布时间 `2026-10-03T04:27:51.676Z`、仓库 2 stars、周下载量 21；这些数字属于该次快照，不代表实时值。

## 已完成验证

| 检查                             | 结果与范围                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 通过，锁文件未改变                                                                                                                                                                    |
| `pnpm check`                     | 最终 19/19 任务成功，其中 11 项命中缓存；日志为 `apps/web/.cache/qa/sqlite-check-final.log`                                                                                           |
| 双站正式构建                     | 商业站与开源站均通过各自构建及静态产物校验；商业站 43 项必需产物、37 页；最终日志为各应用 `.cache/qa/sqlite-build-final.log`；开源站 45 项必需产物、38 页                             |
| 商业站关联浏览器回归             | desktop/mobile 共 291 项通过、29 项条件跳过；结果为 `apps/web/.cache/qa/sqlite-initial-results.json`；最终页头修改另有 44 项 site 回归通过，结果为同目录 `sqlite-header-results.json` |
| 开源站关联浏览器回归             | desktop/mobile 共 367 项通过、29 项条件跳过、零失败；含 Pages 子路径与无 JavaScript，结果为 `apps/open-source/.cache/qa/sqlite-results.json`                                          |
| CLI 静态检查与单测               | 类型、ESLint、样式检查、构建通过；12 个测试文件、253 项单测通过                                                                                                                       |
| CLI README 同步                  | `scripts/build.ts --check-readme` 通过；双语表格保留原有排版，仅同步 SQLite 状态与资料                                                                                                |
| CLI 真实 tarball                 | 工作区外安装并 smoke 通过；本机 Node `v24.18.0`，压缩包 227537 bytes、解包 762139 bytes；含官方 Logo、目录、创建路线拒绝和离线实验室资源检查                                          |
| CLI 真实 PTY                     | 已通过；覆盖终端模式、光标、备用屏幕与输入所有权恢复，证据位于 `packages/weapp/.cache/qa/terminal-*.txt`                                                                              |

各包单测共 484 项通过（catalog 15、共享 UI 100、商业站 69、开源站 47、CLI 253）；边界检查与 10 项边界测试通过。`pnpm change check` 与只读 `pnpm release:plan --json` 通过，保留已有 minor 变更意图，仅新增本任务的 weapp patch 变更意图。

`pnpm check` 保留 CLI `lab/app.ts` 原有 4 条 use-before-define warning；两站各保留 1 项测试中旧 CSS `clip` 属性的弃用 hint，没有检查错误。两站浏览器均使用显式 `headless: true` 的临时配置。商业站首轮关联回归后，非变异排序修正重新构建的 146 份部署文件 SHA256 与已测试产物全部一致，指纹保存于 `apps/web/.cache/qa/sqlite-tested-artifact.json`；后续导航图标的 32px 修改已通过最终 44 项 site 回归。上述浏览器结果是本次选定的关联回归集，不等同于仓库所有浏览器用例。

tarball smoke 启动的随机端口 loopback 服务已按 `finally` 清理；未打开浏览器。现有 CI 的 Node 18/22 与 Windows/macOS 兼容矩阵保留，本机 Node 24 的结果不能替代尚未运行的 CI 平台验证。

## 浏览器与截图证据

关联浏览器回归覆盖 11 项准确顺序、SQLite 官方文档链接、Logo 解码、完整轮播及键盘访问；中英文、浅深主题、手机与短屏；轨道相位遍历中的碰撞、裁切、横向溢出；暂停、重播、减少动画和无 JavaScript 降级。开源站最终一轮已包含导航图标修正；测试清单直接共用完整 11 项链接，Pages 无 JavaScript 检查明确定位主内容图标。

CLI 浏览器已通过，使用 `chromium.launch({ headless: true })`。覆盖 SQLite 安装命令、所有官方图标和资料、独立 planned fixture、1440px 两种项目范围、320/390px 手机、Canvas `drawImage` 的 32px 下限与球体覆盖断言，同时验证拖拽、重播、键盘、设置、后台暂停、PNG、英文、减少动画和 Canvas 降级。[CLI 实验室截图](design/weapp-sqlite-cli-lab.webp)随文保存，完整过程证据位于 `packages/weapp/.cache/qa/`。

最终 12 张页面截图与 CLI 截图已集中审阅。截图脚本检查每站 11 颗星球、SQLite 图标至少 32px、无横向溢出，以及中英文 × 浅深主题 SQLite 详情页的安装前提；8 次详情页 Axe 扫描均为零违规。手机与窄屏图标实测均为 32×32 CSS px。记录位于 `apps/web/.cache/qa/sqlite-visual-qa.json`。

| 站点   | 首页截图                                                                                                                                                                                                              | 安装说明截图                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 商业站 | [桌面](design/weapp-sqlite-web-desktop.webp) · [手机](design/weapp-sqlite-web-mobile.webp) · [短屏](design/weapp-sqlite-web-short.webp) · [窄屏](design/weapp-sqlite-web-narrow.webp)                                 | [中文](design/weapp-sqlite-web-setup-zh-CN.webp) · [英文](design/weapp-sqlite-web-setup-en.webp)                 |
| 开源站 | [桌面](design/weapp-sqlite-open-source-desktop.webp) · [手机](design/weapp-sqlite-open-source-mobile.webp) · [短屏](design/weapp-sqlite-open-source-short.webp) · [窄屏](design/weapp-sqlite-open-source-narrow.webp) | [中文](design/weapp-sqlite-open-source-setup-zh-CN.webp) · [英文](design/weapp-sqlite-open-source-setup-en.webp) |

首页截图矩阵为中文深色 1440×900、英文浅色 390×844、英文深色 1024×400、中文浅色 320×568。短屏沿用既有 26rem 最小舞台高度，可纵向滚动；短屏证据保持 1024×400 CSS 视口，将截图范围扩展到页头和完整舞台（1024×480）。已修正截图脚本聚焦导致的自动滚动，并完成一次集中确认，没有改动舞台布局。

浏览器操作和清理由根代理统一负责。各轮 Playwright 均为后台无头模式；CLI 与截图脚本用 `finally` 关闭 context、browser 和所属 HTTP 服务，测试 runner 正常退出。最终核对 4321、45322 均无监听；CLI 随机端口服务已等待 `close()` 完成。未使用用户 Chrome，也未保留临时页面。本次交付为代码、检查结果与静态截图，不包含线上发布或 SQLite 真机验收。

## Logo 重设计后的补充验收

用户要求到 `weapp-sqlite` 仓库重新设计 Logo 后，本地上游分支已补齐透明符号、头像、横版、单色、反白和 favicon；本站只同步独立符号。两片数据块之间的 S 形留白在 32px 星球中保持可读；不再使用旧窗口/圆柱场景。

该变更后已重新通过双站完整构建（含 SEO、内部链接与 Pages 资源校验）、CLI 构建、CLI 后台浏览器测试和 tarball 外部安装 smoke。三处产物（双站 `dist/brands`、CLI `dist/lab/logos`）与 catalog 新来源的 SHA256 一致。十二张页面截图已用新图标重拍，手机/窄屏均为 32px、无横向溢出，八次详情页 Axe 扫描零违规；CLI 截图同步更新。此前整圈轨道、暂停/重播、减少动画和无 JavaScript 回归的逻辑没有变化。

本轮仍使用后台浏览器，全部 context、browser、HTTP 服务已按所属脚本关闭；未保留临时页面。Logo 重设计已推送到上游提交 `e1d370c7ef8a75185ca8c96dfd9abfca2a38f890`；本站图标、素材归属与截图随本分支提交。
