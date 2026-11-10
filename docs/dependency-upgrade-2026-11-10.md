# 2026-11-10 全仓依赖兼容升级

本轮覆盖六个 workspace，按评估时已发布满 24 小时的版本升级，保留公共 API、CLI 的 Node >=18 契约、网站路由及现有稳定发布流程。同名直接依赖在各 workspace 使用相同精确版本。

## 版本与供应链策略

| 依赖或工具           | 升级前  | 升级后  |
| -------------------- | ------- | ------- |
| Astro                | 7.4.1   | 7.4.7   |
| @astrojs/check       | 0.9.11  | 0.9.12  |
| @lucide/astro        | 1.61.0  | 1.70.0  |
| Wrangler             | 4.151.3 | 4.158.0 |
| weapp-tailwindcss    | 5.6.3   | 5.7.2   |
| Tailwind CSS         | 4.3.3   | 4.3.5   |
| Playwright           | 1.64.1  | 1.65.0  |
| Vitest / coverage-v8 | 5.0.5   | 5.1.0   |
| ESLint               | 10.13.0 | 10.14.0 |
| repoctl              | 6.0.1   | 6.4.0   |
| node-html-parser     | 9.0.5   | 9.0.7   |
| tsdown               | 0.23.1  | 0.23.7  |
| semver               | 7.8.5   | 7.8.6   |
| pnpm                 | 12.14.0 | 12.18.0 |
| 默认及 CI Node 24    | 24.22.1 | 24.22.2 |
| 发布工作流 npm       | 11.16.0 | 11.21.2 |

使用目标 pnpm 更新 manifests、锁文件及兼容范围内的传递依赖；显式设置 `minimumReleaseAge: 1440`，删除八条已经过期的精确版本豁免。保留现有 allowBuilds，不新增冷却豁免、审计忽略或跨主版本 override。测试 fixture 和历史记录中的旧版本不批量替换。

保留 TypeScript 6.0.3、Stylelint 17.16.0 和 @types/node 24.19.2，分别维持检查器 peer、现有样式配置及 Node 类型系列。repoctl 6.4.1 起间接要求 Stylelint 18，因此本轮停在 6.4.0。open 10.2.0、string-width 7.2.0 的新主版本要求 Node >=20，保留当前版本以维持 CLI Node 18 支持；open 仍为唯一外部运行时依赖，其余既有依赖按原有 bundle 边界打包。

## 必要兼容修复

### Vite 多环境会话

weapp-tailwindcss 5.7.2 的延迟插件为每个 resolved config 创建独立会话，但处理构建钩子时使用 `environment.config` 查找。Vite 8 的环境配置与初始化时的顶层 resolved config 身份不同，查找失败后退回最后激活的会话。Astro 依次构建 prerender、SSR 与 client 时，前一阶段关闭会话，下一阶段误用该会话并抛出“Vite 编译会话已关闭”。

`patches/weapp-tailwindcss@5.7.2.patch` 对 ESM 和 CommonJS 两份发布产物修正相同一行：优先通过 Vite 的 `environment.getTopLevelConfig()` 获取会话所属配置，保留旧上下文的 fallback、独立会话和关闭流程。两站继续使用原有 Vite 集成配置，不屏蔽关闭错误、不跳过清理。上游完成相同配置身份映射后删除补丁，并重跑双站 stable / preview 构建和开发态 HMR。

### 图标的开发态导入边界

首次 HMR 验收反复停在开发首页编译，Vite load / transform 追踪确认 `@lucide/astro` 总入口在开发 SSR 中逐个加载整套图标，而不是只处理页面用到的图标。生产构建的 tree shaking 不能解决开发态的模块加载成本。

将两站及共享 UI 的 35 处组件导入改为该包公开的 `@lucide/astro/icons/*` 默认导出，路径按已安装版本的官方 export 映射核对，保留组件名和全部使用参数。没有引用未导出的内部文件、改变 SVG 或页面行为；后续新增图标同样使用公开子路径。修复后重新执行双站构建、类型检查、HMR 和完整浏览器矩阵。

### Astro 检查器依赖元数据

`@astrojs/astro2tsx@0.1.3` 发布产物使用 `@emnapi/core@1.11.3`，但漏报对应的 runtime 依赖。传递依赖可解析出不兼容的 `@emnapi/runtime@2.0.0-beta.2`，触发 `this.bridge.setLastError/deleteEnv is not a function`，Astro 随后错误地提示安装已存在的检查器。

上游 0.1.4 已补充 runtime 声明，但在本轮评估时尚未满 24 小时。使用限定到 0.1.3 的 `packageExtensions` 补全 `@emnapi/runtime: 1.11.3`，不替换其他依赖链的版本。0.1.4 满足冷却并进入后续升级后删除此扩展，再验证 Astro 检查器。

### repoctl 状态与部署契约

409 补丁迁移至 `@icebreakers/monorepo@6.4.0` 的实际发布文件。Contents API 的共享分支推进可能产生 409；仅在重新读取后目标 revision 未变时有限重试，目标已变即停止。四项状态并发测试覆盖这两种分支、重试上限及已接受但丢失响应的恢复。上游原生实现此行为后删除补丁。

repoctl 6.4.0 安装生命周期不再继承 `REPO_DOCS_*` 部署身份，并通过 `DocsDeploymentError.report` 返回失败阶段和原因码。适配测试按此契约验证 install 隔离、build / deploy 身份、缺失结果的 pending 保留、相同发布源恢复及 main 推进时禁止上传；没有放宽业务断言。

审查 `repo upgrade --dry-run` 后更新四份模板基线，保留本仓库的 main 发布、nightly、双站部署和 hooks 定制。新模板包含 bootstrap 发布流程，本仓库仍使用既有 main-only 稳定发布流程。最终 dry-run 四个文件均为 `identical`、无 blocker；doctor 为 34 pass、4 warn、0 fail，建议涉及已审查的本地模板定制及保留的 nightly 路由。配置校验和 workflow actionlint 另行验证。

继续保留 source-scan 0.1.2 的 Astro 扩展名扫描补丁；上游原生支持 Astro 候选扫描及 HMR 后删除。继续保留 `tinypool@2.1.0: 2.1.2` override，原因是 eslint-plugin-format 的 oxfmt 范围仍精确引入 2.1.0；兼容上游解除锁定后删除。

## 安全审计

| 严重级别 | 升级前 | 升级后 |
| -------- | ------ | ------ |
| 高危     | 4      | 0      |
| 中危     | 6      | 2      |
| 低危     | 1      | 1      |
| 合计     | 11     | 3      |

Wrangler 4.158.0 经 Miniflare 引入 undici 7.30.1，消除全部八项 undici 告警。剩余三项均被审计标记为开发依赖：

| 依赖                     | 告警与修复版本                                                                           | 当前依赖链及上游限制                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| KaTeX 0.16.47            | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)，低危，>=0.18.2 | repoctl → ESLint 配置 → @eslint/markdown → micromark-extension-math 3.1.0 仍要求 ^0.16.0；等待其范围接受修复版本。                       |
| glob 10.5.0 / 13.0.7     | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)，中危，>=14.0.2 | @actions/artifact → archiver / archiver-utils，以及 repoctl → @npmcli/config / package-json / map-workspaces；各范围尚不能选择 glob 14。 |
| minimatch 9.0.9 / 10.2.6 | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)，中危，>=11.0.1 | ESLint / @eslint/config-array、repoctl 配置链及 artifact → glob；各范围尚不能选择 minimatch 11。                                         |

不通过跨主版本强制替换隐藏这些告警。后续升级先检查对应上游范围，再运行完整工具链与构建验证。

## 验收记录

日志及运行时校验保存在忽略目录 `.cache/dependency-upgrade-2026-11-10/`。使用任务专属、核对官方 SHA256 的 Node 24.22.2；Node 18.20.8 和 22.23.4 复用已下载的官方归档并重新核对 SHA256，没有替换全局运行时。

- pnpm 12.18.0 的全新源码目录 frozen install、严格 peer 检查和最终 frozen install 通过；43 种直接依赖跨六份 manifest 无版本差异。临时安装目录已清理。
- 全仓边界与 tooling lint 通过；75 项工具链测试通过，包括 409 并发、原生版本 intent、发布恢复和双站部署适配。`turbo run lint lint:styles check test --force --concurrency=1` 完成 19 项任务、0 缓存命中，568 项 workspace 单测通过；合计 643 项单测通过。保留既有 CLI 四条 use-before-define warning 和两站各一条 CSS clip 弃用 hint，无错误。首次并行检查的 CLI waitFor 就绪断言曾失败，隔离复核及完整串行检查均按原断言、原超时通过。
- 双站 stable 构建通过：商业站 37 页、43 项必需产物，开源站 38 页、45 项必需产物；SEO、内部链接、CSS 展开及站点内容边界校验通过。
- 双站开发态 HMR 共 14 项检查通过，覆盖新增 Astro 类名、共享样式、主题状态、明暗主题和断点。图标子路径导入后，两个开发首页首次编译分别为 16.63 秒和 9.65 秒；先完成首页冷编译再执行原有热更新断言，没有修改断言或超时。临时源码与探针均恢复，浏览器和开发服务已关闭。
- 双站后台完整 Playwright 矩阵通过：商业站 535 passed、65 skipped，开源站 491 passed、65 skipped，覆盖双语、主题、无障碍、无脚本及 Pages 子路径。使用原配置的两个 worker、零重试，均无 flaky。首次双站并行运行曾出现一次英文服务页 axe 超时和一次移动端 Logo 宽度断言失败；最终按站点顺序运行完整矩阵，两项均通过，没有修改断言、重试或超时。临时浏览器和测试服务器已关闭。
- stable 商业站产物在两份 Wrangler 配置下共 26 项 HTTP 回归通过，覆盖错误页全部别名、GET / HEAD、查询参数、未知路径、语言、noindex 及正常页面和资源。Wrangler 正式配置 dry-run 读取 188 个静态文件，未上传。
- 双站 preview 构建通过：商业站 37 页、44 项必需产物，开源站 38 页、45 项必需产物。preview 商业站产物在两份 Wrangler 配置下另有 26 项 HTTP 回归通过，保留 `X-Robots-Tag: noindex, nofollow`；正式与预览构建合计 52 项 HTTP 回归。商业站预览配置 dry-run 读取 189 个静态文件，开源站预览配置 dry-run 读取 171 个静态文件，均未上传。
- CLI preflight、bundle 边界和无头浏览器实验室通过。工作区外安装同一个 tarball，Node 18.20.8、22.23.4、24.22.2 的 artifact smoke 均通过；产物 315738 压缩 bytes、1126858 解包 bytes，外部运行时依赖 10 个包名 / 10 个版本。
- 原脚本真实 PTY 的 28 项检查通过，没有修改脚本或门槛。首次 PTY 与 CLI 重建并行导致 dist 入口短暂缺失，后续串行运行曾报告一次进程树清理失败；原始输出分别保留。独立源码探针、带信号追踪的完整 PTY 及最终无追踪完整 PTY 均通过，追踪只记录进程退出后的正常 ESRCH，没有修改进程清理实现。
- repoctl 配置校验通过；原生 `pnpm change check` 和发布计划通过，计划仅包含 weapp 0.4.0 → 0.4.1 的 patch。workflow actionlint 通过，Git hooks 保留原门禁。

推送后的 CI 和双站预览另外核对新提交 SHA，以及预览部署身份文件中的 `site`、`channel`、`sourceSha`；部署结果以这些身份和工作流记录为准。

通过原生 `pnpm change` 记录 CLI patch intent，不手改 0.4.0 版本。此次只提交推送代码；不合并版本 PR、不发布 npm 包、不部署正式站。main 预览验收不代表生产已更新。
