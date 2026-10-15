# 2026-10-15 依赖升级与样式构建迁移

本轮选择满足现有 engines、peer 与默认 1440 分钟发布冷却期的最新兼容稳定版本，同名直接依赖在所有工作区同步更新。样式工作限定于依赖和构建链路，保留现有 CSS、类名与界面行为。

## 直接依赖与工具链

| 依赖或工具          | 升级前  | 升级后  |
| ------------------- | ------- | ------- |
| @playwright/test    | 1.64.0  | 1.64.1  |
| vitest              | 5.0.3   | 5.0.4   |
| @vitest/coverage-v8 | 5.0.3   | 5.0.4   |
| repoctl             | 5.10.2  | 5.10.3  |
| turbo               | 2.11.7  | 2.11.8  |
| @lucide/astro       | 1.55.0  | 1.57.0  |
| weapp-tailwindcss   | 5.6.1   | 5.6.2   |
| semver              | 7.7.3   | 7.8.5   |
| Wrangler            | 4.149.0 | 4.151.0 |
| CLI CI 的 Node 24   | 24.18.0 | 24.22.0 |

`pnpm@12.11.2`、`.node-version` 的 Node 22.23.3、发布工作流的 npm 12.2.0，以及现有 Actions 引用均已是各自采用系列的最新稳定版本。CLI 的 Node 24 构建及 Windows/macOS tarball 验证更新为 24.22.0；Node 18.20.8 和 Node 22.23.3 的 tarball 兼容验证保留。Actions 继续锁定完整提交 SHA，仅更正发布工作流 upload-artifact 的版本注释为 7.0.2。

保留以下直接依赖版本：

- TypeScript 6.0.3：最新 7.0.2 的默认导出与编译器 API 已改变，现有边界检查依赖 `createSourceFile` 等 API；`@astrojs/check` 和 repoctl 的 peer 仍只支持 TypeScript 5/6。
- @types/node 24.19.2：这是 24.x 系列最新版本，与现有运行环境对齐，不追随 Node 26 类型。
- open 10.2.0、string-width 7.2.0：分别是 Node 18 兼容系列的最新版本；新主版本均要求 Node >=20，超出 `weapp` 包的 Node >=18 约定。
- tailwindcss 4.3.3：已是最新稳定版本，且 weapp-tailwindcss 的 peer 要求保留 Tailwind CSS 4 作为底层依赖。

2026-10-15 查询官方 npm registry 时，weapp-tailwindcss 的 `latest` 已为 5.6.3，发布时间为当日 18:46（北京时间）。该版本尚未满足 24 小时冷却期，因此本轮选择 5.6.2，不新增 `minimumReleaseAgeExclude` 豁免。其他依赖按相同冷却与兼容约束更新，不通过强制升级或忽略 peer 改变约束。

## 样式构建迁移

两站继续由 `weapp-tailwindcss/vite` 的 `WeappTailwindcss({ generator: { target: 'web' }, cssEntries })` 独占 Tailwind 生成。保留 `tailwindcss` 底层依赖、`@import 'tailwindcss'`、共享 UI 的 source 扫描、主题与暗色变体，以及现有 CSS 和类名。CLI 浏览器实验室保留原生 CSS，本轮没有改写其样式。

计划中的 `weapp-tailwindcss/vite/web` 专用入口在实际 Astro 构建中未能正确处理共享 CSS 导入：双站主 CSS 各残留 1 个 `@theme inline` 和 11 个 `@apply`，Lightning CSS 发出 unknown at rule 警告，但原有构建校验仍返回成功。切回同版本通用入口并明确 `target: 'web'` 后，所有这些指令均完整展开。因此本轮保留经实测兼容的通用入口，不叠加第二生成器或自行实现 CSS 展开。

对 5.6.2 实现的复查表明，专用入口在 Vite 展开共享 CSS 导入前生成样式，公开配置未提供延迟生成或普通 CSS 导入展开选项；`rewriteCssImports` 和 `generator.importFallback` 均不能解决该顺序问题。[官方 Web demo](https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/main/demo/web/README.md) 仍使用通用入口。后续升级应先验证专用入口能完整展开共享 CSS，再切换配置。

两站构建校验新增对全部 CSS 产物的检查，拒绝未编译的 `@theme`、`@apply`、`@source`、`@tailwind`、`@custom-variant`、`@utility`、`@variant`、`@config`、`@plugin` 和 `@reference`，忽略注释、字符串、URL 和转义的选择器文本，保留原生 CSS at-rule。双站原有坏产物均已被新校验正确拒绝。

## 上游限制与安全审计

安装后重新运行 `pnpm audit --json`，仍为 2 项开发依赖告警：1 项高危、1 项低危，没有新增告警。以下结论来自对官方 registry、实际依赖链和上游版本范围的检查。

| 依赖          | 告警                                                                          | 保留原因                                                                                                       |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| braces 3.0.3  | 高危 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 官方最新仍为 3.0.3，尚无已发布修复；由 micromatch 引入，涉及 weapp-tailwindcss、stylelint 与 repoctl。         |
| KaTeX 0.16.47 | 低危 [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | 修复要求 >=0.18.2，但最新 micromark-extension-math 3.1.0 仍声明 `katex: ^0.16.0`，0.16.47 已是该范围最新版本。 |

保留原有 `tinypool@2.1.0: 2.1.2` override。repoctl 的 ESLint 工具链仍使用 eslint-plugin-format 2.0.1，其 `oxfmt: ^0.35.0` 只能解析到 0.35.0，后者精确依赖 tinypool 2.1.0。较新的 oxfmt 虽已解除旧版本锁定，但超出现有上游范围；待兼容上游升级后复查并删除 override。本轮不新增安全审计忽略项，也不添加跨范围 KaTeX 或 oxfmt override。

## 本地验收

本地使用 Node 24.21.0、pnpm 12.11.2；原始日志保存在忽略目录 `.cache/dependency-upgrade-2026-10-15/`。

- `pnpm update -r --include-workspace-root` 刷新全部 6 个工作区及兼容范围内的间接依赖；随后 `pnpm install --frozen-lockfile` 与供应链策略检查通过，`pnpm peers check` 无冲突。
- `pnpm check:boundaries` 的 10 项测试通过；`pnpm exec turbo run lint lint:styles check test --force` 的 19 项任务无缓存通过，另有 399 项单测通过，合计 409 项。CLI lab 保留 4 项 use-before-define lint warning；两站各保留 1 项测试中旧 CSS clip 属性的弃用 hint，无检查错误。
- 最终两站分别执行完整 `build`：商业站 43 项必需产物、37 页，开源站 45 项必需产物、38 页，SEO、内部链接及内容边界检查均通过。最终 7 个 CSS 文件没有未编译的 Tailwind 指令，也没有 unknown at rule 构建警告。
- CSS 产物校验的最终注入验收共 26 项通过，覆盖双站合法原生规则、注释、字符串、URL、转义选择器，以及 10 种指令逐项拒绝；URL 用例包含未引号路径、data URL 和转义右括号。临时文件删除后，SHA256 确认产物逐字节恢复。结果见缓存中的 `css-guard-qa-final/results.json`。
- 双站开发态 HMR 共 10 类检查通过：Astro 新任意值类、共享 TypeScript 新类、入口主题 token 更新且文档状态保留，以及移动断点和暗色变体；浏览器 pageerror 和 console error 均为零。临时源码逐字节恢复，临时页面已删除，开发服务器已关闭。结果见 `tailwind-hmr-results.json`。
- Wrangler 4.151.0 对最终商业站产物执行 `deploy --dry-run` 通过，未部署。
- CLI 浏览器脚本全部断言通过，覆盖双语、1440/390/320px、reduced motion、离线请求、PNG 导出和 canvas fallback；15 项真实 PTY 检查通过。真实 tarball 在工作区外安装后，Node 18.20.8 smoke 通过，压缩包为 181148 bytes；Node 18 运行时已核对官方 SHA256。
- 两份改动 workflow 的 YAML 解析和 Node 兼容矩阵断言通过；环境未安装 actionlint。两份改动构建校验脚本的 ESLint 与两站 TypeScript 检查通过。

Playwright 1.64.1 的 Chromium 1248 下载速度实测约 58 KB/s，已停止该下载。本轮浏览器验证使用本机 Google Chrome 155.0.8059.41，均为 headless；站点通过现有 `PLAYWRIGHT_CHANNEL=chrome` 选择，CLI 通过忽略目录的临时 preload 选择同一 channel，原测试脚本及断言不变，未伪造 Playwright 浏览器缓存或版本。

依赖复查 `pnpm outdated -r --format json` 只剩前述 TypeScript、Node 类型、open 和 string-width 四项有意保留的兼容版本；同名直接依赖跨工作区无版本差异。

### 完整浏览器回归

双站均以两个 worker、零重试执行完整 desktop/mobile 回归，覆盖双语、主题、无 JavaScript、无障碍和 Pages 子路径。首次运行结果如下，未通过项均为原有 30 秒测试总预算超时：

| 站点   | 总项数 | 通过 | 既有条件跳过 | 超时                            |
| ------ | ------ | ---- | ------------ | ------------------------------- |
| 商业站 | 588    | 525  | 59           | 4：服务页双语 × desktop/mobile  |
| 开源站 | 544    | 483  | 59           | 2：全部项目详情页双语 × desktop |

首次运行的日志与全部失败 trace 已分别保留在 `web-e2e.log`、`open-source-e2e.log`、`web-e2e-first-run/` 和 `open-source-e2e-first-run/`。跳过项来自原有站点适用范围、视口矩阵去重和需要显式启用的实时分析协议测试，本轮未新增跳过。

超时发生在一个测试连续执行多页、多主题 Axe 扫描的过程中，没有无障碍违例断言失败。商业站 desktop 中文完成 8 次空 violations 断言，Axe 累计耗时 34.219 秒；英文完成前 6 次后被超时清理中断。开源站两项均完成 7 个项目 × 2 个主题的 14 次空 violations 断言，最后断言分别在测试开始后约 30.5 和 30.7 秒完成，超过总预算。首次并行运行与串行复核的结果存在差异，但未单独证明并行负载是根因。

两站完整运行及其浏览器退出后，逐站以一个 worker、零重试、原有断言和原有 30 秒限制复核全部 6 项，全部通过；仅开启 trace 保留证据，没有修改测试源码或提高超时：

```sh
PLAYWRIGHT_CHANNEL=chrome pnpm --filter @weapp-io/web exec playwright test tests/e2e/services.spec.ts --grep 'service pages are accessible in both themes' --workers=1 --retries=0 --trace=on
PLAYWRIGHT_CHANNEL=chrome pnpm --filter @weapp-io/open-source exec playwright test tests/e2e/projects.spec.ts --grep 'audits all project detail pages' --project=desktop --workers=1 --retries=0 --trace=on
```

商业站复核 4 项通过（1.0 分钟），开源站复核 2 项通过（30.1 秒）；日志与 trace 保留在 `web-services-serial.log`、`web-services-serial/`、`open-source-projects-serial.log` 和 `open-source-projects-serial/`。双站共 1014 项有效用例完成验证；首次全量存在上述 6 项超时，不能表述为首次全量全部通过。

本轮不声明线上验收，不执行生产部署或 npm 发布。
