# 2026-10-15 weapp 启动与创建体验验收

本次范围为 `weapp` 终端工作台、命令加载和官方创建链路，浏览器实验室与小游戏的产品行为保留。包版本仍为 0.2.0，新增 minor change intent；`pnpm release:plan --json` 只读预览为 0.3.0，无 blocker，未升版或发布。

## 实现约定

- 第一帧显示大厅操作与粒子舞台，首个 Enter 创建，C 仅在大厅创建。项目名决定可复现的星图，五模板重组轨道；保留真实模板说明、约 250ms 过渡、单一调度器、20 FPS、差分输出和背压。无动画为静态构图。
- 工作台内创建期间 Esc 取消本次操作，保留大厅；Ctrl+C 和 SIGTERM 保留 130/143。查询、目录复验与产物验证都在局部取消范围内。执行前暂停父级输出并交还输入，官方脚手架继承终端；验证成功后立即显示徽章、阶段耗时及完整后续命令，结果页可滚动。独立创建完成后返回 shell。
- 入口保留参数解析和帮助/版本/错误短路径。命令动态加载；二维码、配色、诊断和显式创建不读 catalog/Logo，大厅并行读所需快照。轻量创建规划不引入查询、执行或 semver。
- 有效目录确认后开始本次内存预取，以 package/cwd 复用；换父目录取消旧任务，结束即清理，迟到响应不更新当前状态。查询与执行同用 `plan.cwd` 生效的 npm registry、代理、CA 和认证配置。确认后复验目录和 Node 要求，执行已解析的精确版本，再检查 manifest 和预期依赖。
- `--dry-run`、无效目录和非交互缺参数保持零联网、零创建。预取失败通过原错误路径报告，不静默回退或跨进程缓存。没有模拟下载百分比，也不自动安装新项目依赖。
- 选择性打包 QR core/SVG、semver、string-width、cross-spawn 及其纯 JavaScript 闭包。只保留 `open@10` 为外部运行时依赖，以保留 Linux `xdg-open` 布局。锁定 QR 内部入口，禁止 PNG/yargs 和意外裸模块引用；14 项完整许可证及 QR 历史版权随 `dist/THIRD_PARTY_NOTICES.txt` 交付，构建图与隔离安装共同校验。

## 测量方法与边界

本机为 macOS arm64，Node 24.21.0、npm 11.19.0、pnpm 12.11.2。直接启动均为新进程、热文件缓存；帮助/版本/dry-run 各取 15 次。计时包含 Node 启动，不把空 Node 开销相减。原始日志位于忽略目录 `.cache/weapp-startup-audit-2026-10-15/`，终端/浏览器证据位于 `packages/weapp/.cache/qa/`。CI 依赖结构和行为断言，不使用毫秒硬门槛。

| 直接命令             | 原中位耗时 | 本次中位耗时 | 本次范围 / 样本    |
| -------------------- | ---------: | -----------: | ------------------ |
| 空 Node              |    39.62ms |      30.75ms | 29.79–36.97ms / 15 |
| `--version`          |   120.32ms |      37.41ms | 34.97–46.89ms / 15 |
| `--help`             |   124.66ms |      36.66ms | 35.01–42.52ms / 15 |
| 显式创建 `--dry-run` |   268.58ms |      43.99ms | 41.31–56.80ms / 15 |

默认大厅由原来的首帧 118.57ms、可操作大厅 1356.89ms（4 次），改为首帧同时可操作。最终 120×30 PTY 的 15 个新进程中位 **73.39ms**，范围 68.93–246.67ms；保留这次高于 200ms 的离群样本，中位达到 ≤200ms 目标。独立布局单次检查分别为宽 82.96ms、普通 69.16ms、窄 63.65ms，均以菜单和可操作提示已经出现为界。数据见 `terminal-startup-benchmark.json`、`terminal-metrics.json`；9 份大厅、向导与成功页的宽/普通/窄终端帧均已检查。

帮助/版本已达到中位 ≤80ms 的本机目标。复测脚本为 `pnpm --filter weapp exec tsx scripts/benchmark-startup.ts`；性能随机器、系统负载和文件缓存变化。

### npm 启动前开销

以下是同一已发布 **0.2.0** 的离线缓存调用，均在工作区外新进程执行，不代表未发布改动或首次下载。显式 `@latest` 缓存先由 npm 正常填充一次，再测量；没有清除或修改全局安装。

| 入口                                                                   |      中位 |              范围 | 样本 |
| ---------------------------------------------------------------------- | --------: | ----------------: | ---: |
| `npx --offline --no-install weapp --version`                           | 3900.29ms | 3738.93–4925.29ms |    5 |
| `npx --offline --no-install --package=weapp@latest -- weapp --version` |  345.13ms |   326.57–373.28ms |    5 |

独立 npm Arborist 诊断中，普通入口总耗时 4702ms，其中 `/usr/local/lib` 全局树扫描 4012ms；显式 package 入口总耗时 343ms，没有该次扫描。本机全局依赖树约 2.8GB，因此这不是所有环境都有的固定收益。README 推荐日常使用 `npx --package=weapp@latest -- weapp`，保留正常 latest 查询与安装提示；首次联网下载仍取决于源、网络和缓存。CLI 不能为 npm 尚未启动它的阶段显示加载界面。

## 发布包与依赖闭包

| 同口径指标                         | 改动前 |   本次 |
| ---------------------------------- | -----: | -----: |
| 锁定外部运行时包版本数，不含 weapp |     51 |     10 |
| npm tarball 压缩字节               | 181148 | 226853 |
| npm tarball 解包字节               | 570796 | 758855 |

本次实际安装含 weapp 共 11 个包名 / 11 个包版本，97 个文件、858947 原始文件字节。打包库和完整许可证使 weapp 自身 tarball 增大；本次改动减少安装依赖、模块解析及 PNG/CLI 分支。旧 npx 缓存的 48 个包目录来自较早依赖树，不能与当前锁文件的 51 个外部包版本混用。

最终 `test:pack` 在工作区外安装真实产物，同一安装目录用 Node 18.20.8、22.23.3、24.21.0 全部 smoke 通过，均为本机 macOS arm64。Node 18 和 Node 22 二进制已核对官方 SHASUMS256；Node 22 压缩包 SHA256 为 `23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53`。日志为 `.cache/dependency-upgrade-2026-10-15/final-pack.log`。

Smoke 覆盖独立 jsQR 解码实际 CLI 二维码（含中文与 emoji）、SVG 防覆盖、仅 open 外部依赖、bundle 引用与 chunk 哈希、许可证、npm shim 的精确 argv、带空格/中文/& 的父目录、缺失 npm、离线实验室与资源。额外确认 open 10.2.0 的 `xdg-open` 文件字节和 Unix 可执行权限。本地验证平台为 macOS，Windows `.cmd` 与 Linux 平台运行由 CI 覆盖；矩阵保留 Linux Node 18/22、Windows Node 24、macOS Node 24，并增加 Windows Node 18。CI 的 Node 24 为 24.22.0，与本机 24.21.0 分别记录。

## 真实官方模板创建

使用最终 `dist/cli.js`、Node 24.21.0 和 `create-weapp-vite@3.1.0`，在工作区外临时父目录执行显式创建。目标父目录实际 npm registry 为 `https://registry.npmjs.org/`，没有给查询或执行额外强制 registry。每种模板使用各自独立的空 npm cache，随后复用该 cache 创建第二个项目；共四次真实创建，每行仅一个样本，不作固定网络性能承诺。

| 模板        | npm cache |     总耗时 | 版本查询 | 准备并运行脚手架 | 产物验证 |
| ----------- | --------- | ---------: | -------: | ---------------: | -------: |
| default     | 冷        | 46378.42ms |   2058ms |          44264ms |      1ms |
| default     | 暖        |  3429.12ms |   1240ms |           2140ms |      1ms |
| tailwindcss | 冷        | 48153.93ms |   1337ms |          46769ms |      1ms |
| tailwindcss | 暖        |  3426.86ms |    988ms |           2390ms |      1ms |

每次均成功生成有效 package.json 和 weapp-vite 依赖，未生成 node_modules 或安装锁文件，项目依赖留给用户随后安装。临时项目及独立 cache 已删除，逐次日志和 `real-create-results.json` 保留在验收缓存。冷缓存的主要成本是 npm 准备上游脚手架；本次 CLI 没有绕过其安装流程。交互向导的预取可与模板/摘要阅读重叠，显式命令没有用户阅读时间，因此表中未把查询时间扣除。

## 完整验证

- `pnpm install --frozen-lockfile`、供应链锁文件策略、`pnpm peers check` 通过；边界检查 10 项通过。
- CLI Node/browser 两份 TypeScript 检查、全包 ESLint、样式检查、最终 build 通过。ESLint 仅保留原 lab 的 4 项 use-before-define warning，无新增 warning 或 error。
- 最终 `vitest run`：12 个文件、244 项测试全部通过。13 项新进程加载边界检查包含可操作大厅、帮助/版本/错误短路径、轻命令的数据和功能隔离；字素宽度测试包含中文、组合音标、旗帜、肤色、keycap 与 ZWJ emoji。
- 创建 fixture 覆盖相同 npm cwd/配置、精确版本复用、父目录切换、早期失败、迟到响应、取消和监听清理、Node 不兼容、目录竞争、产物检查，以及显式 TTY/非 TTY 真实阶段输出。无效目录和 dry-run 零子进程；Node 18 toolkit 支持不代表上游 creator 必须支持 Node 18。
- 终端/预览 70 项定向检查、最终 26 项真实 PTY 通过，覆盖首个 Enter、大厅 C 作用域、目录/模板/摘要取消、查询与目录校验等待取消、快速 Enter+Esc、全局信号、继承输入、三阶段耗时、成功即时返回、无颜色/无动画、窗口变化、输出背压和终端恢复。宽/普通/窄结果页均保留完整长路径命令及滚动。
- 浏览器实验室原有回归全部通过：默认星轨、6/11 项目范围、Logo/事实/动作、形变、拖动/重放、设置、后台 RAF 暂停、PNG、双语、1440/390/320px、reduced motion 和 canvas fallback。使用 Playwright 1.64.1 + 本机 headless Chrome 155.0.8059.41，通过忽略目录的 preload 选择 channel；未改浏览器产品或原回归断言。
- 发布包专用检查 18 项、三个 Node 的实际安装 smoke、`pnpm change check`、只读 release plan 及 `git diff --check` 均通过。版本 intent 预览为 0.3.0，包 manifest 保持 0.2.0，未执行 npm 发布。
