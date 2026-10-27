# 2026-10-27 依赖升级与 repoctl 6.2.1

本轮以已经完成 repoctl 6.0.1 上线的 main 为基线，升级发布工具、双站 Astro 与构建依赖。继续保留现有发布来源、双站部署适配器、恢复回执和 CLI Node 18 契约。

## 精确版本

| 依赖           | 升级前  | 升级后  |
| -------------- | ------- | ------- |
| repoctl        | 6.0.1   | 6.2.1   |
| pnpm           | 12.14.0 | 12.15.0 |
| Astro          | 7.4.1   | 7.4.2   |
| @astrojs/check | 0.9.11  | 0.9.12  |
| Wrangler       | 4.151.3 | 4.153.0 |
| tsdown         | 0.23.1  | 0.23.2  |

同名依赖在所有 workspace 使用相同精确版本，pnpm 负责更新锁文件，不手工修改解析结果。开发和 CI 继续使用 Node 24.22.1；Astro 7.4.2 的 Node >=22.23.4 要求已被根 engines 覆盖。

## 发布冷却与兼容保留项

本次明确将依赖发布冷却调整为 0 小时：`pnpm-workspace.yaml` 固定 `minimumReleaseAge: 0`，不保留 `minimumReleaseAgeExclude`。移除了此前 8 条历史精确豁免，也没有保留升级解析自动添加的新豁免。

先前的 24 小时严格预检实际拒绝了 repoctl 6.2.1 及其 4 个配置/模板依赖、Wrangler 4.153.0 和 miniflare；该失败记录保存在 `lockfile-update-strict.log`。pnpm 12 默认会自动把过新的精确版本加入豁免，只有启用 `minimumReleaseAgeStrict` 才按门禁拒绝。本轮最终使用明确的 0 小时政策，恢复和 CI 不依赖交互批准、环境覆盖或时间调整。

- TypeScript 保留 6.0.3：最新 7.0.2 超出 repoctl 与 @astrojs/check 的 peer 范围，现有检查也使用 TypeScript 编译器 API。
- @types/node 保留 24.19.2：与当前 Node 24 开发运行时保持一致，不追随 Node 26 类型。
- open 保留 10.2.0、string-width 保留 7.2.0：新主版本要求 Node >=20，发布的 `weapp` 仍支持 Node >=18。
- 保留 Astro source-scan 0.1.2 的扫描/HMR 补丁和 tinypool 2.1.0 → 2.1.2 的安全 override；本次上游没有解除对应兼容边界。

## repoctl 补丁与受管资产

repoctl 6.2.1 的底层 `@icebreakers/monorepo` 尚未包含现有 GitHub Contents API HTTP 409 修复。本轮把补丁迁到 6.2.1 的实际发布 chunk，继续只在重新读取后确认目标 revision 未改变时执行有界重试；竞争更新不能被覆盖，响应丢失的已成功写入不能重复提交。原有四项并发回归继续约束实际安装的公开 API。

官方 6.2.1 tarball 的 SHA256 为 `a5abe0d6867e5d4ef8216ba7063465229e079b28423399e0f7bb1ce7786e9dd9`。补丁对该发布产物的 `patch --dry-run` 通过；最终再次下载并核对官方 tarball，将其全部发布文件与实际安装产物逐字节比较，唯一差异是 transient 状态增加 HTTP 409 及两行说明注释。完整记录位于 `monorepo-patch-check.json` 和 `final-patch-audit.json`。

保持现有 upgrade 目标和三方合并边界。四项受管资产的内容均为 `identical`，只将 retained baseline 的来源版本从 3.0.1 更新到 3.1.2，随后复检无待写入的内容或 baseline。6.1/6.2 新增的 Cloudflare provider、自动 change intent 与审批 PR snapshot 能力没有替换本仓库已验收的部署适配器、人工版本 PR 审核、nightly 或 release record 契约。

repoctl 6.1 把所选站点的 `REPO_DOCS_*` 从依赖安装环境移除，让 workspace 安装钩子按各站默认渠道构建；构建和 provider 阶段继续接收冻结的来源与 release 身份。本仓库的生命周期 fixture 按阶段验证这条边界，并继续检查临时 checkout 的实际 Git SHA 和文件内容。新版部署错误通过 `DocsDeploymentError.report` 的阶段及原因报告失败，回归改为验证 `script-result-invalid`、`deployment-unresolved` 和 `main-advanced` 等结构化原因，继续检查未知结果保留 pending、禁止任意切换来源和拒绝旧 main 上传。

## 验证

本轮证据保存于 `.cache/dependency-upgrade-2026-10-27/`。

| 范围                            | 结果                                                                                                         | 证据                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 正常安装与 frozen install       | pnpm 12.15.0 通过；冻结锁文件无需变更                                                                        | `install-completed.log`、`install-frozen.log`                                  |
| 版本与兼容边界                  | 实际安装版本全部匹配；TS 6、CLI Node 18、0 小时政策与补丁断言通过                                            | `installed-versions.json`、`manifest-invariants.json`                          |
| 最终锁文件与迁移边界复核        | 全部目标解析匹配；补丁仅增加 409；baseline 仅更新来源版本；部署适配器未改；0 项本地缓存路径或 alias 解析     | `final-lock-audit.json`、`final-patch-audit.json`、`final-boundary-audit.json` |
| repoctl 配置                    | 有效，diagnostics 为空                                                                                       | `repo-config.json`                                                             |
| 受管资产升级幂等                | 四项资产 identical，baseline 无变化，0 blocker                                                               | `repo-upgrade-applied.log`、`repo-upgrade-final.json`                          |
| doctor                          | 34 pass、4 warn、0 fail                                                                                      | `repo-doctor-final.json`                                                       |
| workspace peer 报告             | 0 冲突；当前 workspace 没有独立 peer 声明                                                                    | `repo-peers.json`                                                              |
| 根发布、nightly、来源与并发回归 | 5 个文件、24 项测试通过，包含安装的 6.2.1 公开 API 的四项 HTTP 409/响应丢失回归                              | `repoctl-regression-final.log`                                                 |
| CLI tarball 独立安装            | Node 18.20.8 / 22.23.4 / 24.22.1 plain ESM smoke 通过                                                        | `cli-validation/cli-pack-matrix.log`、`cli-validation/verified-runtimes.json`  |
| CLI 包预检                      | 本地与保留 tarball 的 preflight 均通过                                                                       | `cli-validation/preflight-local.log`、`cli-validation/preflight-artifact.log`  |
| 全仓 `pnpm check`               | 19/19 tasks 通过，其中 3 项使用缓存；653 项测试通过，包含 75 项根边界测试                                    | `full-check-final.log`                                                         |
| 全仓 `pnpm build`               | 3/3 tasks 无缓存通过，CLI preflight 通过；商业站 43 项必需产物 / 37 页、开源站 45 项必需产物 / 38 页验证通过 | `full-build-final.log`                                                         |
| 双站 HMR 与扫描补丁             | 14/14 通过；覆盖新增 Astro/共享 TypeScript class、主题令牌热更新、深浅色、桌面/移动端与浏览器错误检查        | `hmr-both.log`、`hmr-server-resources.json`                                    |
| Wrangler                        | 4.153.0 的 deploy dry-run 通过，没有上传                                                                     | `wrangler-dry-run.log`                                                         |
| 官网完整 E2E                    | 541 项通过、69 项按环境跳过；完整运行的两项旧断言修正后单独补跑通过                                          | `e2e-web.log`、`e2e-web-cold-cache-final.log`                                  |
| 开源站完整 E2E                  | 497 项通过、69 项按环境跳过                                                                                  | `e2e-open-source.log`                                                          |

Doctor 的四条 warning 是三个受管 workflow 的既有定制和 nightly schedule 的同步提示；本轮三方合并复检没有待应用变更。原生 pnpm 记录了 `weapp` patch intent `.changeset/modern-rabbits-try.md`，不直接修改版本或发布。

CLI 实际 tarball 为 310,962 压缩 bytes、1,109,904 解包 bytes、47 项文件；SHA256 为 `dfd1e775c9eb62dfdd60b7399939d59a03474240acdcac13659ab0fbe80160a3`，保留产物预检前后未改变。三个运行时均重新核对官方 archive 与可执行文件内容，smoke 在工作区外直接运行 `artifact-smoke.mjs`，不依赖 Vitest 或 TypeScript loader。临时安装目录已清理，未打开浏览器。

`pnpm audit --json` 返回既有 KaTeX 0.16.47 开发依赖低危 1 项，0 high、0 critical，退出码 1。来源是 `repoctl → @icebreakers/monorepo → @icebreakers/eslint-config → @antfu/eslint-config → @eslint/markdown → micromark-extension-math → katex`；上游仍限定 KaTeX ^0.16.0，修复要求 >=0.18.2。本轮没有新增 audit ignore 或跨范围 override。此前 braces 的 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 已于 2026-10-23 被上游撤回，实际版本仍为 3.0.3；本轮没有将告警消失记作代码修复。

本地网络下载 workerd 官方 tarball 多次响应超时，使用同一官方 URL 分段取回后核对 registry 的完整 SHA512，再用 pnpm 导入本地缓存。pnpm 12 的 file 与 registry snapshot 身份不同，仅为该已导入产物增加了一个 canonical cache alias；没有覆盖缓存条目，且逐个核对官方 tarball 的三个文件及 CAS 真实字节。随后原生 `store add <name>@<version> --offline`、正常安装和 frozen install 均通过；锁文件的 registry 来源与 integrity 保持官方值。记录见 `workerd-download.json`、`workerd-cache-alias.json` 和 `store-add-registry-offline-final.log`。

HMR 探针复用一个 headless browser context 和一个工作页面，顺序验证双站；探针的六次文件变更全部回收，既有文件恢复原始 SHA256，两项临时 Astro 页面已移除，两个开发端口和探针进程均已关闭。Astro 7 在 agent 环境默认后台运行，验证驱动使用官方 `--ignore-lock` 保持前台进程归属；首次启动的后台服务也已按站点定向停止，产品开发脚本无需改变。

双站 E2E 使用明确的 headless 配置，各站按现有两 worker 上限顺序执行。官网完整运行先得到 539 pass / 2 fail / 69 skip；两项失败均来自冷缓存回归读取未注册 CSS 变量中的 `calc()` 文本，且移动端采样尚未跨过新增的 60ms 星球入场延迟。断言改为读取实际绘制元素的 computed opacity，采样时间纳入 100ms 移动端帧预算后，桌面和手机两项补跑均通过。开源站随后用修正后的用例完整运行通过。69 项跳过由既有站点、发布渠道、设备适用条件及未启用的实时 analytics 检查决定；没有因本轮失败增加 skip。

本轮不执行生产部署或 npm 发布。
