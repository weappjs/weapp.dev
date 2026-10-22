# 2026-10-22 全仓依赖与工具链升级

本轮覆盖全部六个 workspace、37 种直接依赖及兼容范围内的传递依赖。目标版本以 2026-10-22 的评估结果固定，保留现有 engines、公共 API、CLI 的 Node 18 支持和 1440 分钟发布冷却期。

## 直接依赖与工具链

| 依赖或工具                   | 升级前  | 升级后  |
| ---------------------------- | ------- | ------- |
| Astro                        | 7.3.8   | 7.4.1   |
| @astrojs/check               | 0.9.10  | 0.9.11  |
| @lucide/astro                | 1.57.0  | 1.61.0  |
| weapp-tailwindcss            | 5.6.2   | 5.6.3   |
| @axe-core/playwright         | 4.13.0  | 4.14.0  |
| node-html-parser             | 9.0.4   | 9.0.5   |
| Vitest / @vitest/coverage-v8 | 5.0.4   | 5.0.5   |
| ESLint                       | 10.12.0 | 10.13.0 |
| @commitlint/cli              | 21.2.3  | 21.2.4  |
| Turbo                        | 2.11.8  | 2.11.10 |
| Wrangler                     | 4.151.0 | 4.151.3 |
| pnpm                         | 12.11.2 | 12.14.0 |
| 发布工作流 npm               | 12.2.0  | 12.2.1  |
| 默认 Node / CLI Node 22 验证 | 22.23.3 | 22.23.4 |
| CLI 构建及 Node 24 验证      | 24.22.0 | 24.22.1 |

同名依赖在所有 workspace 使用相同精确版本，ECharts 从 `^6.1.0` 收敛为 `6.1.0`。Node 22.23.4 和 24.22.1 均为 2026-10-20 的官方安全发布，Node 18 tarball 验证继续使用 18.20.8。现有 GitHub Actions 引用已是最新稳定版本，保留完整提交 SHA。

删除全部 25 条历史 `minimumReleaseAgeExclude` 精确版本豁免：这些版本均已超过发布冷却期。现有 `allowBuilds` 保留，不新增冷却豁免、审计忽略或跨范围强制升级。锁文件通过目标 pnpm 更新，不手工修改依赖解析结果。

## 兼容性保留项

- TypeScript 6.0.3：`@astrojs/check` 和 repoctl 的 peer 仍只支持 TypeScript 5/6；边界及 bundle 检查还依赖默认导出和 `createSourceFile` 等编译器 API。
- @types/node 24.19.2：保持当前运行时对应的类型系列，不追随 Node 26 类型。
- open 10.2.0、string-width 7.2.0：两者的新主版本均要求 Node >=20，超出发布包的 Node >=18 契约。open 继续是唯一外部运行时依赖，其他既有 CLI 依赖按原有边界打包。
- Astro 7.4.2、@astrojs/check 0.9.12：分别发布于北京时间 2026-10-21 22:18:56 和 22:13:59，评估时未满 24 小时。本轮固定采用已评估且满足冷却期的 7.4.1 / 0.9.11。未来采用 Astro 7.4.2 时还需复查其 Node >=22.23.4 要求与根 engines 的关系。

两站保留 `weapp-tailwindcss/vite` 的通用 `WeappTailwindcss({ generator: { target: 'web' }, cssEntries })` 入口。5.6.3 没有确认修复上轮专用 Web 入口的共享 CSS 导入顺序问题，因此继续使用既有入口及 CSS 产物校验。

## Astro 源文件热更新修复

真实开发态验收发现：在 `.astro` 页面中将一个任意值宽度类改为新值后，DOM 已更新，但对应 CSS 没有生成。初次构建正常并不能证明后续类名热更新正常。

根因是 `@weapp-tailwindcss/source-scan@0.1.2` 的 `FULL_SOURCE_SCAN_EXTENSIONS` 没有 `astro`，而 Vite 插件的 `isSourceCandidateRequest` 直接使用该集合生成的正则。现有显式 `@source` 可参与初始 Tailwind 扫描，但不能越过热更新入口的文件分类，新增类因此没有进入候选同步及 CSS 失效流程。公开配置没有扩展这个判定集合的选项；实际候选提取器可以正确处理 Astro 模板。

升级前已使用同一个 source-scan 版本，weapp-tailwindcss 5.6.2 / 5.6.3 的相关热更新实现也一致，因此将此问题记录为本轮验收发现的既有兼容缺口。使用 pnpm 的限定版本补丁，仅为该依赖的 ESM 和 CommonJS 发布产物各增加一项 `astro` 扩展名；不新增生成器，不通过修改 CSS 或强制刷新页面掩盖问题。补丁路径为 `patches/@weapp-tailwindcss__source-scan@0.1.2.patch`，上游原生支持 Astro 扫描及热更新后删除，并再次验证新增类、共享类和主题 token 的热更新。

三条验证工作流的 push / pull_request 路径过滤均纳入 `patches/**`，保证仅修改补丁也会触发 CI。原生 pnpm 发布测试的隔离 fixture 同时复制 workspace 配置引用的补丁；补丁目录将来整体移除时仍可运行，存在目录时的复制错误会正常暴露。

补丁后的双站共 14 组真实浏览器检查通过：初始编译、Astro 新任意值类、共享 TypeScript 新类、入口主题 token 更新并保留 document / input / 内存状态、暗色变体、移动断点及零浏览器错误。测试页面在 dev 启动后新建；路由注册就绪后再开始断言。所有临时源文件均经 SHA256 确认恢复，临时页面、浏览器和开发服务器已清理。

## 语言切换标签的无障碍修复

axe 4.14 的 `label-content-name-mismatch` 检查发现桌面语言链接显示 `EN` / `中`，但可访问名称是 `English` / `中文`。新版按词元匹配，缩写不能代替完整可见标签。两站 Header 改用同一个 `copy.alternateLanguage` 输出可见文本及可访问名称，移动端继续隐藏文字并通过 `aria-label` 为图标命名。

保留语言切换、持久化选择、统计和 Pages 子路径逻辑，也保留已有 `English` / `中文` 的精确可访问名称断言。没有禁用 axe 规则、隐藏可见缩写来规避检查或修改零违规断言。修复前的商业站回归发现 5 个同源 axe 失败，310 项通过、32 项跳过；为修复并重建而主动中断 1 项，240 项未运行。失败 trace 和中断记录保留在 `web-e2e-before-label-fix.*`，最终结果单独记录。

## 安全审计与上游限制

升级后的审计仍为两项告警：braces 高危、KaTeX 低危，没有新增告警；审计将两项均标记为开发依赖。以下上游限制已在本轮查询官方 registry 复核。

| 依赖          | 告警                                                                           | 保留原因                                                                                                       |
| ------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| braces 3.0.3  | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，高危 | 官方最新仍为 3.0.3，尚无已发布修复；由 micromatch 引入，涉及 repoctl、Stylelint 和 weapp-tailwindcss。         |
| KaTeX 0.16.47 | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)，低危 | 修复要求 >=0.18.2，但最新 micromark-extension-math 3.1.0 仍依赖 `katex: ^0.16.0`，0.16.47 已是该范围最新版本。 |

审计中的实际引入链包括：

- 两站 `weapp-tailwindcss → micromatch → braces`，以及 source-scan、fast-glob 等支路；根工具链也通过 repoctl 的 Stylelint 配置引入。解除条件是 braces 发布修复，且相关上游依赖范围可以解析到该修复。
- 根目录 `repoctl → @icebreakers/monorepo → @icebreakers/eslint-config → @antfu/eslint-config → @eslint/markdown → micromark-extension-math → katex`。解除条件是上游 micromark-extension-math 允许修复后的 KaTeX，随后配置链能解析到该版本。

保留 `tinypool@2.1.0: 2.1.2` override：最新 eslint-plugin-format 2.0.1 仍依赖 `oxfmt: ^0.35.0`，该范围使用的 oxfmt 0.35.0 精确锁定 tinypool 2.1.0。待兼容上游解除锁定后删除此 override，不跨范围替换 oxfmt。

## 本地验收

本轮日志、测试结果及运行时校验记录保存在忽略目录 `.cache/dependency-upgrade-2026-10-22/`。首次全仓检查使用本机 Node 24.18.0；后续验证使用本任务下载并核对官方 SHA256 的 Node 24.22.1，未替换全局运行时。

- pnpm 12.14.0 更新依赖，正常及补丁后的 frozen install 均通过供应链策略检查；peer 检查无冲突。同名直接依赖跨 workspace 无版本差异，`outdated` 仅剩前述四项兼容保留依赖。
- 边界及原生版本发布流程 10 项测试通过；`turbo run lint lint:styles check test --force` 在补丁后完成 19 项任务，0 项命中缓存，包含 484 项单元测试，合计 494 项测试。保留既有的 4 条 CLI use-before-define 警告和两站各 1 条 CSS `clip` 弃用提示，没有错误。
- 补丁后的完整构建通过：商业站 37 页、43 项必需产物；开源站 38 页、45 项必需产物。两站 CSS 指令展开、SEO、内部链接及内容边界检查均通过。
- 最终商业站 Playwright 完整矩阵：529 项通过、59 项按既有条件跳过，0 失败、0 flaky；单 worker、零重试，耗时 10.1 分钟。覆盖桌面与移动端、双语、明暗主题、无障碍、无脚本行为及交互回归。浏览器与测试服务器退出已核对。
- 最终开源站 Playwright 完整矩阵：485 项通过、59 项按既有条件跳过，0 失败、0 flaky；单 worker、零重试，耗时 9.5 分钟。覆盖桌面与移动端、双语、明暗主题、无障碍及 Pages `/weapp.dev/` 子路径的资源、语言切换、重定向和无脚本导航。两站合计 1014 项通过、118 项既有跳过；临时浏览器、测试及开发服务器均已核对关闭，没有保留临时页面。
- CLI 无头浏览器实验室全部断言通过，覆盖双语、1440 / 390 / 320px、项目切换、reduced motion、离线请求、PNG 导出和 canvas fallback；日志记录真实 `--headless` 启动及正常退出。
- 同一真实 tarball 在工作区外安装后，分别使用 Node 18.20.8、22.23.4、24.22.1 完成 plain ESM smoke。三个官方 macOS arm64 archive 均核对 SHA256，产物为 227320 压缩 bytes，包含 10 个外部依赖包名和 97 个安装文件。
- PTY 首次运行的固定时刻输入早于 CLI 就绪，原始日志中按键先被终端回显，随后才出现 WORKBENCH。保留首次日志与终端输出，按原脚本、原断言和原时间限制复核后，26 项全部通过；没有修改断言或扩大等待时间。
- Wrangler 4.151.3 对最终商业站产物执行 `deploy --dry-run` 通过，读取 188 个静态文件，未上传。工作流 actionlint、YAML、平台矩阵及 Actions SHA 一致性检查通过，repoctl 配置校验通过。

本轮不执行生产部署或 npm 发布；本地结果不替代尚未运行的跨平台 CI 或线上验收。

浏览器矩阵的既有跳过项包括仅适用桌面或移动端的交互、避免重复执行的显式视口矩阵、仅属于商业站的联系方式，以及需要专门命令开启的真实 Google Analytics 协议测试。常规统计偏好、隐私信号和脚本失败回归仍在完整矩阵中执行；本轮没有改动 skip 条件、断言、超时或重试配置。

主要验收证据位于上述缓存目录：`check-final.log`、`boundaries-final.log`、`build-web-final.log`、`build-open-source-final.log`、`web-e2e.json`、`open-source-e2e.json`、`hmr-driver-patched.log`、`cli-pack.log`、`cli-pty-repeat.log`、`cli-browser.log` 和 `wrangler-dry-run-final.log`。失败和主动中断的首次记录单独保留，未用最终结果覆盖；浏览器和服务器归属及清理核验记录在 `browser-resources.json` 与 `hmr-server-resources.json`。
