# weapp 0.2 动态工作台

本次扩展把创建 weapp-vite 作为默认入口，让项目选择贯穿终端工作台和本地视觉实验室。设计沿用 [DESIGN.md](../DESIGN.md) 的绿色品牌、中性深色、Syne 字标与 Geist 阅读字体；范围记录在 [CLI / lab surface brief](../.impeccable/surfaces/weapp-cli.md)。终端使用 Operate 模式，实验室使用 Experience 模式。

## 产品与资产边界

主项目由中立目录的 `ecosystem=weapp` 筛选，包含 weapp-vite、weapp-tailwindcss、weapp-pandacss、weapp-stylex、Varo 和 weapp-sqlite。终端交互目录和实验室均可切换全部十一项；关键词、精确查询和 JSON 继续覆盖完整目录。项目名称、说明、能力、状态、文档与仓库地址来自同一目录。weapp-sqlite 保持 `planned`，不提供安装或创建命令。

构建将公开目录、标准粒子 Logo 几何和项目标记写入 `dist`。运行时使用 Node 18 兼容的原生 ESM；字体、字体许可与 Logo 随 npm 包交付。实验室的 [Logo 映射](../packages/weapp/lab/project-logos.js) 是固定资源表，SQLite 唯一使用明确标注的共享小程序标记。原始标记在星系与项目说明中保持不变，来源记录在 [资产署名](../packages/weapp/lab/logos/ATTRIBUTION.md)。

## 终端工作台

默认焦点为“创建 weapp-vite 项目”，后续入口依次为生态、只读体检、实验室和更多工具。游戏通过显式 `play` 命令进入。约 1.2 秒的粒子开场可按任意键跳过，随后收拢到同一工作台。视觉区使用 Braille 点阵、短轨迹和项目焦点；菜单、项目事实和键盘提示有各自稳定的阅读位置。

[Workbench](../packages/weapp/src/terminal/workbench.js) 根据可用列宽与行高调整构图：至少 87 列、24 行时采用动作 / 星轨双列；普通终端上下排列；小于 60 列或 18 行时缩短视觉区。项目焦点用约 250ms 的平滑过渡连接选择。输入、创建摘要和结果页为任务内容让出视觉区。关闭动态效果后保留静态构图；关闭颜色后仍通过选择箭头、字形与文本表达状态。

`create` 无参或仅指定路线时，在 TTY 进入目录 → 模板 → 创建摘要。weapp-vite 默认选择官方 `default` 模板；模板用途由共享数据维护。返回上一步保留已输入的目录与模板。显式创建命令和离线 dry-run 保持兼容，非 TTY 缺目录在联网前报错。实际创建继续检查官方版本、Node engines、目标目录、退出码及生成项目内容。

[TerminalSession](../packages/weapp/src/terminal/session.js) 统一拥有 raw mode、光标、alternate screen、按键、resize 与清理。所有帧路径至少间隔 50ms，按行差分输出；背压时只保留最新待绘帧，收到 `drain` 后继续。脚手架执行前恢复普通终端输入，结束后回到原工作台页面和焦点。退出、信号与失败路径恢复先前输入状态并释放所属监听器和计时器。

## 实验室组件与响应式布局

实验室默认选择六项目“生态星系”与 weapp-vite。上方场景切换器提供粒子字标、生态星系和指针流场；探索范围与项目选择是原生 select。画布是主要体验区域，项目说明和控制均位于画布之外。桌面说明采用项目摘要 / 能力说明 / 操作三列，在 1080px 以下先收为两列，在 760px 以下纵向展开。390px 以下进一步收窄页边并让场景选项等宽。

[本地样式](../packages/weapp/lab/style.css) 将中性深色细分为页面与更暗的画布，阅读文字沿用 Geist 与中文系统回退，画布字标使用本地 Syne 700。绿色用于主要导出动作与有效状态，项目配色服务于场景焦点；项目 Logo 保留原始颜色。画布采用宽阔圆角容器（桌面 20px，手机 16px），说明区以空白和一条分隔线组织内容。44px 的按钮、select、range 与官方链接提供稳定操作目标，键盘焦点使用琥珀描边。这些尺寸属于 lab 组件，不改写网站全局 token。

选择项目同时更新星系焦点、粒子目标、项目配色、名称、成熟度、能力、官方链接和开始命令。开始命令只提供复制；复制失败时提示手动选中文字。SQLite 显示“规划中，暂无安装或创建命令”和共享标记说明。移动端只显示选中星体的画布标签，完整项目名称和事实仍在原生选择器与下方说明中可读。

## 动态状态与可访问性

星系由粒子 Logo 展开，以近远缩放、淡轨迹和选择环表达项目位置；粒子场景在 WEAPP 与选中项目标记间聚合；指针流场响应指针方向。拖拽偏移按项目保存。重播保留项目、密度、速度和配色，重置动画时间、拖拽偏移和指针状态。切换场景使用同一重播边界。

空格暂停、R 重播、1 / 2 / 3 切换场景，星系方向键选择项目；快捷键不会接管 input、select、button 或链接的原生键盘操作。暂停按钮同步图标、文案与 `aria-pressed`，操作结果通过 status 区宣布。`prefers-reduced-motion`、`motion=0` 和 CLI motion 设置均可静态预览，保留选项目、拖拽、重播和导出；隐藏文档取消 RAF，恢复可见后继续已有场景。

Canvas 不可用时显示清晰回退并禁用绘制相关操作，已加载的项目说明与官方链接仍可使用。无 JavaScript 时显示中英说明，提示启用脚本体验实验室。数据或资源加载失败另有错误提示。实验室只监听 `127.0.0.1`，用封闭路由表提供自身资源与数据，不读取任意项目文件；页面启动与绘制无需外部请求。

## 源码与视觉证据

下面记录已经核对的源码契约与本次截图。截图是本地 QA 产物，完整行为断言由 [浏览器验收脚本](../packages/weapp/scripts/browser-test.mjs) 和相应测试维护。

| 证据                                                                                                    | 可核对内容                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [桌面 1440px](design/weapp-cli-0.2-desktop.png)                                                         | 默认六项目星系、选中 weapp-vite、三列事实与操作、复制成功状态、画布外控制                                                   |
| [手机 390px](design/weapp-cli-0.2-mobile.png) / [320px](../packages/weapp/.cache/qa/lab-mobile-320.png) | 单列说明、完整项目名称和命令、静态预览提示、密度 / 速度 / 配色控制换行                                                      |
| [粒子场景](../packages/weapp/.cache/qa/lab-particles.png)                                               | 选中 weapp-vite 的粒子标记与下方同一项目事实                                                                                |
| [规划项目](../packages/weapp/.cache/qa/lab-planned.png)                                                 | 十一项目双轨、SQLite 共享标记说明、规划状态和无创建命令                                                                     |
| [英文手机](../packages/weapp/.cache/qa/lab-english.png)                                                 | 同一层级与控件、英文项目事实、静态预览和 reduced-motion 状态                                                                |
| [lab 测试](../packages/weapp/test/lab.test.js)                                                          | loopback、固定资源与许可、十一标记、封闭路由、同会话服务复用和取消清理                                                      |
| [终端测试](../packages/weapp/test/terminal.test.js)                                                     | 输入所有权、50ms 帧节流、行差分、背压、创建流程及退出恢复                                                                   |
| [浏览器验收脚本](../packages/weapp/scripts/browser-test.mjs)                                            | 6 / 11 范围、真实事实与链接、复制、项目变形、拖拽 / 重播、隐藏暂停、PNG、窄屏溢出与 44px 目标、英文、减少动态和 Canvas 回退 |

## 验证记录

全仓 `pnpm check` 的 18 项任务通过。最后一次 `release:verify` 包含边界检查及 10 项边界/版本流程测试、CLI lint、stylelint、7 个测试文件的 167 项测试和仓库外真实 tarball 安装 smoke，全部通过。最终包也在 Node 18.20.8 独立安装并通过 plain ESM smoke；Vitest 运行于当前 Node 24，不用其工具链限制推断发布包的 Node 18 兼容性。

终端 42 项单测覆盖统一帧率、差分输出、背压、延迟 drain 写入异常、取消信号、暂停时的项目焦点和向导边界。15 项真实 PTY 验收通过：持续大厅、开场跳过、内部页返回、宽窄 resize、暂停、特效/游戏控制、Ctrl+C、目录 → 模板 → 摘要、取消与离线预览、脚手架继承输入以及异常恢复。假脚手架实际收到 `accepted`；启动时父进程 raw=false、flowing=false、keypress listeners=0，完成后工作台恢复一次。24 份中英宽屏、普通、窄屏帧快照保存在本地 QA 目录。

后台浏览器验收覆盖桌面 1440px、手机 390/320px、中英文、6/11 项切换、真实标记、项目事实与操作、剪贴板、粒子变形、拖拽与重播、后台暂停、PNG、减少动态和 Canvas 回退。页面资源请求均为 loopback。独立视觉审查发现 VPT 字标显示颜色的对比度为 2.94:1；仅在显示层提升至 3.54:1，原始 catalog 配色和 Logo 保留。实际 `fillText` 色值的独立断言确认全部十一项字标至少为 3.5:1。修正后的审查结论为 ship，没有遗留视觉修复。

浏览器验收显式使用 `headless: true`，复用一个页面，并在 `finally` 中关闭自身 context、browser 与 loopback 服务，所有资源已关闭。完整截图与 PTY 输出保存在 `packages/weapp/.cache/qa/`，桌面与手机代表截图同步提交到 `docs/design/`。没有保留临时页面。

## 版本交付

通过 pnpm 原生 minor change intent 驱动既有 repoctl 流程。已发布基线为 0.1.0，`release:plan --json` 预览为 0.2.0，未手工修改版本号。自动版本 PR 运行 CLI CI 和实际 npm OIDC exchange 预检；发布由单独的版本合并与 canonical GitHub Release 流程触发。
