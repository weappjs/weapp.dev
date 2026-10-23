# repoctl 6.0.1 迁移与上线记录

本次迁移统一 CLI 发布和双站部署，继续使用 pnpm 原生 versioning。开发与发布工具链使用 Node 24.22.1，发布的 `weapp` CLI 仍支持 Node 18。

本文记录迁移过程中的实际验证与外部状态。代码验证、发布身份配置和真实线上验收分别记录；待完成项不能视为已经上线。

## 发布与托管约定

- `release.yml` 管理版本 PR、正式 npm 发布、canonical tag、GitHub Release 和 release record。版本 PR 保留人工审核与合并。
- Nightly 每日北京时间 02:00（UTC `0 18 * * *`）检查 main，保留手动入口；npm dist-tag 为 `snapshot-nightly`，安装命令为 `npx weapp@snapshot-nightly`。
- 两站 main 预览使用精确源码 SHA，同仓 PR 保留各自预览 Worker 的 version alias；公开预览链接指向固定版本，绑定该次 PR head SHA。fork PR 仅验证，无部署凭据。
- 正式网站只接受完整稳定发布记录和对应源码、锁文件。`releaseInputs` 显式包含 CLI 所需的共享 catalog、Logo、构建输入，以及根 manifest、锁文件、workspace 配置和 dependency patches。每站独立构建、验证和部署同一产物，`patchPaths: []`。

| 站点          | main / PR 预览 Worker       | 正式托管                             |
| ------------- | --------------------------- | ------------------------------------ |
| `web`         | `weapp-dev-preview`         | `weapp-dev`，`https://weapp.dev`     |
| `open-source` | `weapp-open-source-preview` | GitHub Pages，`https://weapp.js.org` |

预览包含中英文提示、禁止索引并保持生产统计禁用。正式 canonical、Pages CNAME、`/weapp.dev/` 子路径兼容和双应用内容边界继续由构建与浏览器检查保护。

## 已完成的外部变更

历史 `weapp@0.3.0` 已从原始版本提交 `1fe201176b55f965e76bc81941a02edaed57553c` 补齐发布，未改写原 ledger：

| 验证或变更                            | 结果与证据                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原提交包预检与旧身份 OIDC 交换        | [预检运行 39936937257](https://github.com/weappjs/weapp.dev/actions/runs/39936937257) 成功                                                                                                                                                                                                                                             |
| 以原 `publish-weapp.yml` 身份发布 npm | [发布运行 39938924495](https://github.com/weappjs/weapp.dev/actions/runs/39938924495) 成功，运行 ref 为 `weapp@0.3.0`                                                                                                                                                                                                                  |
| canonical tag 与 GitHub Release       | [weapp@0.3.0](https://github.com/weappjs/weapp.dev/releases/tag/weapp%400.3.0)，指向原始版本提交                                                                                                                                                                                                                                       |
| npm 独立安装                          | `npm exec --yes --package=weapp@0.3.0 -- weapp --version` 返回 `0.3.0`                                                                                                                                                                                                                                                                 |
| 旧发布工作流                          | `publish-weapp.yml` 已停用，避免补建 GitHub Release 时重复发布                                                                                                                                                                                                                                                                         |
| GitHub 部署环境                       | 四个 `docs-<site>-<channel>` 环境已创建，均仅允许 main 分支                                                                                                                                                                                                                                                                            |
| Cloudflare 账号与部署凭据             | 仓库变量 `CLOUDFLARE_ACCOUNT_ID` 已设置；组织级 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 已继承，PR 部署请求得到 Cloudflare API 响应。复用现有组织凭据，无需创建新 token；未提交的创建表单已关闭                                                                                                                              |
| Cloudflare 旧 Git 构建                | 生产 Worker `weapp-dev` 的旧 `sonofmagic/weapp.dev` 构建已执行 Disable builds 并保存；截图 `.cache/repoctl-migration/cloudflare-builds-disabled.png`                                                                                                                                                                                   |
| Cloudflare 生产版本复核               | `.cache/repoctl-migration/production-cloudflare-after.json` 确认 `unchanged: true`，生产 Worker 版本与流量分配未变                                                                                                                                                                                                                     |
| CLI GitHub CI                         | [运行 39943800403](https://github.com/weappjs/weapp.dev/actions/runs/39943800403) 对 `818384680a37302b8a7351c1271754d41ae031d1` 成功；Linux Node 18/22、Windows Node 18/24、macOS Node 24 五项真实 tarball 安装均通过                                                                                                                  |
| web GitHub CI                         | [验证 job 120381392388](https://github.com/weappjs/weapp.dev/actions/runs/39943800404/job/120381392388) 成功，E2E 为 539 项通过、61 项跳过；证据 `ci-web-verify.log`。随后预览部署因 `weapp-dev-preview` 尚未初始化停止                                                                                                                |
| open-source GitHub CI                 | [验证 job 120381392718](https://github.com/weappjs/weapp.dev/actions/runs/39943800530/job/120381392718) 成功，E2E 为 495 项通过、61 项跳过；证据 `ci-open-source-verify.log`。随后[部署 job 120386447843](https://github.com/weappjs/weapp.dev/actions/runs/39943800530/job/120386447843) 因预览 Worker 尚未初始化失败，部署凭据已注入 |

补齐 0.3.0 只建立 npm 发布基线。它的原始源码没有本次网站部署适配器，不能作为两站首条受管正式部署记录。现有 `.changeset/thin-tables-boil.md` minor intent 保留；最终只读 release plan 为 `ready`、无 blocker，明确计划将 `weapp` 从 0.3.0 升到 0.4.0（`.cache/repoctl-migration/release-plan-final.json`）。此计划没有执行升版或合并版本 PR。

Cloudflare 旧 Git 账号虽已断连，原构建入口仍未禁用，因此本次明确关闭了该入口。此设置变更没有向生产 Worker 部署新版本，当前正式站内容保持原状。

## 本地验证

以下证据保存在本次工作目录的 `.cache/repoctl-migration/`，不包含发布凭据。

| 范围                           | 已验证结果                                                      | 证据                                             |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------ |
| repoctl 配置与升级幂等         | 配置有效；四个受管资产均 `identical`，无 blocker                | `config-final.json`、`upgrade-final.json`        |
| repoctl doctor                 | 34 pass、4 warn、0 fail                                         | `doctor-final.json`                              |
| 根工具与发布生命周期           | lint、包边界与 65 项测试通过                                    | `root-check-final.log`                           |
| 工作区 lint、样式、类型与单测  | 最终复验 19/19 个任务通过，CLI lab 保留 4 条非错误 lint warning | `workspace-check-final.log`                      |
| CLI 后台浏览器                 | 通过，含桌面、移动、减少动态效果与静态降级                      | `cli-browser.log`                                |
| CLI 真实终端                   | 28 个 PTY 场景通过，终端恢复正常                                | `cli-pty.log`                                    |
| CLI tarball                    | 独立安装与 artifact smoke 通过                                  | `cli-pack.log`                                   |
| CLI 发布前包检查               | 身份、资源、bundle、构建版本检查通过                            | `cli-preflight.log`                              |
| Nightly 隔离制品准备           | `prepared`、`published: false`，consumer smoke 通过             | `nightly/registry-fixed/validation-summary.json` |
| web 预览部署预演               | Wrangler `--dry-run` 通过，无真实上传                           | `wrangler-web-preview-dry-run.log`               |
| open-source 预览部署预演       | Wrangler `--dry-run` 通过，无真实上传                           | `wrangler-open-source-preview-dry-run.log`       |
| web 正式产物浏览器全量         | 535 项通过、65 项跳过                                           | `web-stable-e2e.log`                             |
| open-source 正式产物构建       | 45 项必需输出、38 个页面、SEO 资源和全部内部链接通过            | `open-source-stable-build.log`                   |
| open-source 正式产物浏览器全量 | 491 项通过、65 项跳过                                           | `open-source-stable-e2e.log`                     |

Doctor 的四条 warning 分别为三个受管工作流的本地定制，以及 nightly schedule 的触发与路由同步提示。升级复检保留这些本地变更，没有待写入的受管资产；nightly 的实际调度仍需在线工作流验证。

Nightly 验证使用独立源码快照，生成的 tarball manifest、`dist/data/meta.json` 与独立安装后的 `weapp --version` 完全一致。原仓库 manifest、intent、ledger、changelog、tags 和 HEAD 未改变。快照 tarball 的 SHA256 为 `49d1d88c87fc36e0522f04da5c7a3e368069efe9821cdc285e36bf52025d75bb`；临时源码与安装目录已清理。此项验证没有向 npm 发布 nightly 包。

真实预演发现并修复了两个发布入口问题：源码归档没有 `.git` 时跳过 Lefthook 安装，同时保持开发 checkout 的真实安装失败可见；包身份校验接受 npm 官方 registry 根 URL 有无尾斜杠的等价形式，仍拒绝其他来源或额外 URL 内容。

部署适配器回归覆盖 32 项测试，包括 PR 预览公开链接绑定固定 Worker version、Pages 回执写入响应丢失后回读确认，以及同一 workflow run 的 artifact 名称使用 UUID 防止碰撞。根检查日志中的模拟发布中断消息来自恢复测试，最终 65 项测试全部通过。

Web 预览首次全量测试报告 534 项通过、3 项失败。失败定位到提示条占用首屏空间后的几何布局，以及测试重挂载图表后未恢复其懒加载可见条件。修复按提示条实际高度扣除 hero 可用空间，并让 caption 根据实际 stage 容器高度响应；重挂载测试先恢复图表可见性，以遵守原有懒加载边界。

修复后的 hero layout 与 publication channel 复验为 56 项通过、2 项跳过（`web-preview-layout-final.log`）；图表重挂载和预览统计隔离复验为 4 项通过（`web-preview-remaining.log`）。首次全量运行中发现的三项失败均已通过针对性复验，没有已知未解决失败。

开源站预览首次全量测试为 491 项通过、61 项跳过、4 项失败（`open-source-preview-e2e.log`）。四项失败来自桌面和移动端复用的旧 SEO 断言，没有区分预览的 noindex 与正式站索引规则。断言按发布渠道修正后，四项定向复验全部通过（`open-source-preview-remaining.log`）。两站正式产物本地验证已通过；两站远程预览 E2E 均已通过，真实线上验收尚未完成。

## 待完成的上线步骤

| 步骤                                                       | 当前状态                                                                                                                                       | 完成时应记录                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| npm Trusted Publisher 切换为 `release.yml`、空 environment | 新连接保存再次要求 npm 二次验证；尚未确认生效                                                                                                  | 新连接状态与 OIDC audit 运行链接                           |
| 合并迁移并启用受管工作流                                   | [迁移草稿 PR #20](https://github.com/weappjs/weapp.dev/pull/20) 已创建；CLI 和两站验证均通过，待 npm 身份保存完成后合并激活                    | 合并 SHA 与最终检查结果                                    |
| 两站 main 预览初始化                                       | 待合并后先初始化两个 Worker；两站 PR 部署均按该前置条件停止，没有上传预览版本                                                                  | 各站精确 source SHA、version ID 与预览 URL                 |
| 同仓 PR 与 fork 检查                                       | web / open-source 预览 E2E 分别 539 / 495 项通过；PR 部署待 main 初始化后重试；fork 凭据隔离已由事件校验和工作流条件覆盖，尚未运行真实 fork PR | PR 运行链接、预览 URL、fork 无凭据结果                     |
| Nightly 真实发布与安装                                     | 待执行                                                                                                                                         | 发布版本、安装结果、重复来源跳过及 `latest` 保持不变的证据 |
| 重复正式自动部署排查                                       | Cloudflare 旧 Git 构建已禁用；旧 main 正式部署 workflow 待随迁移关闭                                                                           | 新工作流启用后核对仅保留受管正式部署入口                   |
| 下一版本 PR                                                | release plan 已确认 0.4.0 minor；待 repoctl 创建版本 PR                                                                                        | PR 链接与人工审核合并记录                                  |
| 首次受管正式网站部署                                       | 等待人工合并版本 PR 后的完整稳定发布                                                                                                           | release ID、两站独立部署回执和线上验收结果                 |

两个正式站在首条受管稳定部署完成前继续提供原有内容。上线后分别核对中英文页面、静态资源、canonical、统计隔离与预览禁止索引；开源站额外检查 Pages 子路径和历史跳转。失败重试、未知部署结果处理与两站独立恢复规则见[维护手册](maintenance.md#发布与回滚验收)和[部署适配器说明](../scripts/docs-deployment/README.md)。
