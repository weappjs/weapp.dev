# weapp 项目工作台与终端性能验收（2026-10-22）

本轮保留动态工作台、Node 18 契约、双语和无遥测能力，按终端调度、项目识别与诊断、创建与执行三个阶段实现。未发布 npm，也未改动浏览器实验室界面或跨平台 CI 矩阵。

## 调度与性能边界

终端将画面生产函数推迟到可输出时调用；暂停且无变化时跳过绘制，背压仅保留最新请求，drain 后按最新状态与尺寸生成一帧。20 FPS 上限、按行差分、终端恢复、逻辑时钟和退出时限保留。静态菜单、搜索、换行和布局只缓存当前屏幕，输入与状态变化显式失效，resize 使用新尺寸。`--no-motion` 原本就是事件驱动，本轮保持该行为。

性能基线为同一 macOS arm64 工作区的构建产物，Node 24.22.1、文件系统缓存已热、15 次独立进程：空 Node 23.89ms、版本 28.66ms、帮助 28.00ms、离线创建预览 33.39ms（中位数）。这不包含 npm 在 CLI 启动前的全局扫描、包下载或脚手架网络等待；不将这些外部耗时计为本轮收益。机器时间仅记录，不加入 CI 毫秒门槛。

最终构建在其他验证任务结束后用相同脚本复测（15 个独立进程，中位数）：

| 短命令             | 基线    | 本轮    |
| ------------------ | ------- | ------- |
| 空 Node            | 23.89ms | 24.40ms |
| `--version`        | 28.66ms | 28.34ms |
| `--help`           | 28.00ms | 28.26ms |
| `create --dry-run` | 33.39ms | 33.02ms |

帮助／版本仍约 28ms，没有将小幅波动当作提速收益。一次与类型检查／打包并发的测量中，空 Node 已升至 41.52ms，因此不用于对比；完成这些任务后才得到上表。原始基线和最终结果分别在 `.cache/weapp-performance-review-2026-10-22/startup-node24.json`、`startup-after-node24.json`。运行 `node --import tsx packages/weapp/scripts/benchmark-startup.ts` 时应从可解析 tsx 的工作目录执行，或使用 `pnpm --filter weapp exec tsx scripts/benchmark-startup.ts`，并确保 Node 路径指向所比较的版本。

终端对比使用基线 `cd72b2f` 的隔离 git archive 与候选源码，Node 24、120×30、相同菜单／catalog／Logo、400ms 预热后采样 1 秒，每状态 5 个独立进程样本交替运行，报告中位数：

| 场景     | Node CPU 时间，前 → 后 | 帧计算，前 → 后 | 输出字节，前 → 后 |
| -------- | ---------------------- | --------------- | ----------------- |
| 活跃动画 | 104.99 → 61.13ms       | 20 → 19         | 22,121 → 21,128   |
| 暂停空闲 | 104.01 → 1.54ms        | 20 → 0          | 0 → 0             |
| 输出背压 | 104.40 → 1.76ms        | 20 → 0          | 0 → 0             |

活跃动画的静态菜单计算从 20 次降为 0 次（缓存已预热）。活跃帧 20／19 是采样边界差异，20 FPS 上限保持。CPU 为 Node 进程自身时间，背压由模拟输出流注入，不代表终端模拟器 CPU 或 npm 冷启动速度。行为回归另外断言：drain 后只生成最新状态的一帧、resize 使用最新尺寸、暂停后输入和进度仍能刷新。原始 JSON：`.cache/weapp-performance-review-2026-10-22/terminal-node24.json`。

## 项目发现与只读诊断

共享 `ProjectContext` 从输入目录向上找到最近的 Node／原生微信／混合项目，在 Git 或文件系统根停止。损坏 manifest 是错误，不能退化为空目录。workspace 只读取当前路径上的声明，校验 pnpm/npm/Yarn 包含、排除及真实路径，不扫描全部成员，不执行配置。YAML 与 glob 使用 Node 18 兼容的精确版本 yaml 2.9.1、picomatch 4.0.7；许可证随 bundle 交付，运行时外部依赖仍只有 open。

大厅首帧后异步发现；不探测包管理器版本，不延迟执行识别期间的 Enter，不重置用户已经移动的焦点。已有项目展示状态、诊断与真实脚本；没有 manifest 的原生项目不提供安装和脚本入口。C 保持明确的创建快捷键。

Doctor 始终只读。它报告输入目录和识别根，检查实际 Node／包管理器版本、可检查的已安装依赖版本和 workspace 提升布局。weapp-vite 与原生微信提供静态配置检查，其他框架提供通用检查及官方链接。`workspace:`、`catalog:`、Git／路径／标签和无法可靠检查的 PnP 显式列为未判定，不运行 PnP 加载器。版本探测禁用 Corepack 网络、自动 pin 及 pnpm 自动下载管理器。

## 创建与执行边界

`create --install` 是明确的创建后安装意图，默认创建不安装。`--package-manager npm|pnpm|yarn|bun` 不能覆盖 workspace／项目声明冲突；无声明时按显式选择、唯一锁文件、npm 默认值决定。多种锁文件通过工作台选择或命令参数解决。`--dry-run` 即使带 `--install` 仍离线、不写文件、不执行安装，产物信息留待创建后判断。

创建结果使用实际 manifest，列出包管理器、脚本和 doctor。安装失败独立于创建成功报告，文件保留，可再次选择操作。工作台安装／脚本共享执行器：确认页显示 cwd、argv 对应命令和脚本内容；安装在已验证 workspace 根，脚本在当前包。确认后先检查版本约束，再重读项目；声明、依赖或脚本变化会要求重新确认。

进程通过参数数组启动。外部任务独占输入，结束后恢复页面与焦点；Ctrl+C 取消本次安装／脚本，Unix 清理专用进程组，Windows 使用定向 `taskkill /T /F`，等待 close 和清理结束后恢复。SIGTERM 保留全局退出约定。不会自动运行长期开发服务。

## 验证与交付

- CLI：17 个测试文件、334 项测试全部通过；包含发现中 Enter／焦点、离开页面后的晚到结果、workspace 与原生项目边界、损坏 manifest、已安装版本、安装／脚本确认及进程清理回归。
- 类型检查、构建、ESLint、Stylelint 通过；ESLint 保留未改动实验室文件中的 4 条已有 no-use-before-define warning，没有错误。
- 最终构建真实 PTY：28 个场景通过。输入先等待可见就绪标记；覆盖三种尺寸、暂停／resize／搜索、实际子进程继承输入、脚本运行、OS SIGINT 取消、PID 消失、恢复焦点，以及 raw mode／cursor／alternate screen 清理。证据为 `packages/weapp/.cache/qa/terminal-*.txt` 与 `terminal-metrics.json`。
- 独立 tarball：在 workspace 外安装同一发布包，Node 18.20.8／22.23.4／24.22.1 的 artifact smoke 全部通过，包含新 doctor 上下文、协议／版本、workspace、原生项目及 `--dry-run --install`。压缩体积 311,233 bytes，解包 1,113,061 bytes，10 个外部运行时包名／版本；bundled 许可与图完整匹配。
- frozen install：pnpm 12.14.0 通过，锁文件及 24 小时冷却策略保留。
- 边界及原生发布流程：10 项测试通过。
- 后台浏览器实验室：1440／390／320px、双语、6／11 项生态、官方资源与动作、动画暂停、重播、PNG、减少动态效果和 Canvas 降级通过；临时浏览器、context 和 loopback 服务由 finally 关闭。
- 新增 minor change intent，保留代码版本 0.3.0；只读 release plan 状态 ready、无 blocker。最终版本由后续版本流程确定。

本机执行平台是 macOS arm64；Unix 子进程树清理同时经过真实进程回归，Windows taskkill 使用注入测试，既有 Linux／macOS／Windows CI 矩阵保留，未声称已在本机执行另外两个系统。脚手架 PTY 使用受控的真实子进程模拟官方交互；本轮未重新下载五套官方脚手架，也不评估 registry／npm 启动前扫描的速度。新版保留创建流程各阶段实际耗时输出。

本轮所有测试进程和临时浏览器资源已关闭。失败迭代的断言均按根因修复，未降低断言或加重试。原始缓存不进入发布包；双语 README／help、维护入口和 minor intent 已同步，无生产部署或 npm 发布。
