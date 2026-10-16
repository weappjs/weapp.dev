# weapp

A project-driven, offline-first workbench for mini-app developers. Create weapp-vite first, explore six weapp projects through a living particle stage, and open the same ecosystem in a local browser lab.

```bash
npx weapp                     # immediately usable animated workbench
npx weapp fx fireworks        # terminal fireworks
npx weapp create              # directory → template → creation summary
npx weapp lab                 # offline ecosystem galaxy, weapp-vite selected
npx weapp projects vue
npx weapp info tw
npx weapp create weapp-vite my-app --template wevu
npx weapp doctor .
npx weapp qr https://weapp.js.org/ --output weapp.svg
npx weapp palette '#07c160' --format css
```

Node.js 18 or newer is supported by the toolkit. Each upstream scaffold may require a newer version; `create` checks that before running it. No telemetry, account, API key, or network is needed for effects, games, the lab, the catalog, diagnostics, QR codes, or palettes. Creation queries npm and downloads the selected official scaffold. Documentation and repository commands open external links only with `--open`.

On npm versions that spend time searching globally installed commands, an explicit package can start sooner:

```bash
npx --package=weapp@latest -- weapp
```

This keeps npm's latest-version lookup and normal installation prompt. `npx weapp` remains supported. The benefit depends on your npm version, global dependency tree and cache; the CLI cannot draw a loading indicator before npm starts it. First-time downloads also depend on your registry and connection.

## Commands

| Command                               | What it does                                                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fx [logo\|orbit\|matrix\|fireworks]` | Terminal effects; Space pauses, R replays, Left/Right switches, Q/Esc exits. `--seed 42`, `--duration 5` (seconds).                                                                                                        |
| `lab`                                 | Six-project galaxy with original logos, project actions, morphing particles, and pointer flow. Toggle all ecosystems, adjust controls, or download PNG. `--no-open` prints the local URL without opening it.               |
| `projects [query]`                    | Interactive browsing starts with six weapp projects; Tab or `--all` shows all eleven. Queries and JSON search all eleven; `--ecosystem weapp\|taro\|vue-mini\|rezor\|uni-app`, `--status stable\|beta\|planned`, `--json`. |
| `info <project>`                      | Purpose, scope, platforms, official quick start, and related projects; `--json`.                                                                                                                                           |
| `docs <project>` / `repo <project>`   | Print the official link; `--open` opens it.                                                                                                                                                                                |
| `create [route] [directory]`          | Guided weapp-vite setup when a directory is omitted in a TTY; explicit route/directory remains supported. `--dry-run` previews offline.                                                                                    |
| `doctor [directory]`                  | Read-only environment, manifest, lockfile, installed-dependency, and mini-app configuration checks; `--json`. Never loads project config or runs project scripts.                                                          |
| `qr <text\|->`                        | Scannable terminal QR, or SVG with `--output file.svg`. `-` reads stdin.                                                                                                                                                   |
| `palette <hex>`                       | Five shades and black/white text contrast. `--format css`, `--json`, or `--output file`.                                                                                                                                   |

Global options: `--lang zh-CN|en`, `--no-color`, `--no-motion`, `--help`, `--version`. Language follows `LC_ALL`, `LC_MESSAGES`, or `LANG`, with Chinese as fallback. `NO_COLOR` is honored. `--no-motion` removes decorative animation; snake movement remains part of gameplay. Redirected output, CI, and `TERM=dumb` get bounded static output; JSON never contains terminal control sequences. Use `--force` to overwrite an exported QR/palette file; existing files are preserved otherwise.

The workbench starts on **Create weapp-vite**, with usable actions beside the assembling particle stage from its first frame. The first Enter opens creation; C is a creation shortcut only in the hall. Its other entries are weapp ecosystem, project doctor, visual lab, and more tools. Arrow keys and Enter select; Tab switches the ecosystem scope, Space pauses, Esc returns, and Q exits outside text entry. Wide windows use two columns; smaller windows stack the stage, and narrow windows prioritize actions and project status. `--no-motion` freezes the same layout. Frames are limited to 20 FPS, changed lines are written separately, and output backpressure drops intermediate frames. Official scaffolds temporarily receive the terminal input; returning restores the page and focus.

The lab defaults to the ecosystem galaxy with weapp-vite selected. Project selection changes the stage palette, focus, maturity, capabilities, and official actions. The particle scene morphs between WEAPP and the selected original project mark. Commands are copied, never executed in the browser. Replay preserves the project and controls while resetting animation and drag offsets. All logos and licensed fonts ship in the package. The lab listens only on a random loopback port and stops when this CLI exits; no project directory is served.

`weapp play snake` and `weapp play --help` remain available as a hidden extra; scores stay in memory.

## Official scaffolds

| Route        | Upstream creator    | Expected project dependency |
| ------------ | ------------------- | --------------------------- |
| `weapp-vite` | `create-weapp-vite` | `weapp-vite`                |
| `vue-mini`   | `create-vue-mini`   | `@vue-mini/core`            |
| `rezor`      | `create-rezor`      | `rezor`                     |
| `uni`        | `create-uni`        | `@dcloudio/uni-app`         |
| `taro`       | `create-vite-taro`  | `vite-plugin-taro`          |

`weapp create` and `weapp create weapp-vite` open the same directory → template → summary wizard. Non-interactive use requires both route and directory and fails without network access if either is missing. The default is the official `default` template. `--template` is supported only for weapp-vite:

| Template             | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `default`            | Native mini-app with Vite                                    |
| `wevu`               | Vue-style reactivity and single-file components with Wevu    |
| `react`              | React components for mini-apps                               |
| `tailwindcss`        | Native mini-app with Tailwind CSS integration                |
| `multi-platform-sfc` | Single-file components targeting multiple mini-app platforms |

The directory name seeds a repeatable star chart; choosing a template rearranges its orbits. After a valid directory is selected, version lookup runs while you choose the template and review the summary. Lookup and execution use the same target-parent working directory and its effective npm registry, proxy, CA and authentication settings. The result is reused only within that creation attempt; there is no persistent version cache. `--dry-run` stays offline.

Other creators retain their own prompts. A target must not exist and its parent must exist. The CLI resolves the latest creator version, checks its Node requirement, executes that exact version, and verifies the generated manifest and dependency before reporting success. Query, execution and validation show their actual stage and elapsed time. In the workbench, Esc cancels a pending creation without closing the hall, and success immediately displays the project badge and next commands. Standalone creation returns to your shell. The CLI does not install project dependencies or initialize an existing project. Partial output remains available if an upstream creator fails.

Each ecosystem project keeps its own release cadence and API. An install command is not a complete integration. weapp-sqlite is in beta: install its weapp-vite integration with `pnpm add @weapp-sqlite/weapp-vite`, then follow the [official guide](https://sqlite.weapp.dev/). The verified scope covers Web and WeChat DevTools; check the guide before using it on a physical device. This integration is available through `weapp info weapp-sqlite`; it has no `weapp create` route.

## Project catalog

Generated from the repository's neutral public project catalog during builds.

<!-- catalog:en:start -->

| Project                                                                  | Status | Purpose                                                  |
| ------------------------------------------------------------------------ | ------ | -------------------------------------------------------- |
| [weapp-vite](https://weapp.js.org/en/projects/weapp-vite/)               | stable | Vite builds for mini-app projects                        |
| [weapp-tailwindcss](https://weapp.js.org/en/projects/weapp-tailwindcss/) | stable | Use Tailwind classes in mini-app styles                  |
| [weapp-pandacss](https://weapp.js.org/en/projects/weapp-pandacss/)       | stable | Bring Panda CSS generation to mini-apps                  |
| [weapp-stylex](https://weapp.js.org/en/projects/weapp-stylex/)           | beta   | Compile official StyleX to WeChat WXSS                   |
| [Varo](https://weapp.js.org/en/projects/varo/)                           | stable | Registry-first mobile UI for two runtimes                |
| [weapp-sqlite](https://weapp.js.org/en/projects/weapp-sqlite/)           | beta   | A local data layer for mini-app projects                 |
| [VPT](https://weapp.js.org/en/projects/vite-plugin-taro/)                | stable | Vite for Taro projects                                   |
| [Vue Mini](https://weapp.js.org/en/projects/vue-mini/)                   | stable | A Vue 3 framework for mini programs                      |
| [Rezor](https://weapp.js.org/en/projects/rezor/)                         | beta   | A React framework for mini programs                      |
| [Uni Helper](https://weapp.js.org/en/projects/uni-helper/)               | stable | Better DX for the uni-app family                         |
| [Wot UI](https://weapp.js.org/en/projects/wot-ui/)                       | stable | A light, polished, AI-friendly uni-app component library |

<!-- catalog:en:end -->

## Development

```bash
pnpm --filter weapp build
pnpm --filter weapp check
pnpm --filter weapp lint
pnpm --filter weapp test
pnpm --filter weapp test:e2e
pnpm --filter weapp test:pack
node packages/weapp/dist/cli.js
```

The CLI, lab, tests, and validation scripts are written in strict TypeScript. `tsdown` bundles the Node CLI for Node 18 and the browser lab separately; the artifact smoke script is also compiled so it can run directly on Node 18. `check` validates the Node/tooling and browser types. Static catalog snapshots, logos, fonts, and licenses are copied alongside the bundles.

The published tarball contains runtime JavaScript, an embedded catalog and Logo point cloud, the lab's licensed assets, and `dist/THIRD_PARTY_NOTICES.txt` for bundled libraries. Commands and their data load on demand. Pure JavaScript tools are bundled; `open@10` remains an installed dependency to preserve its platform resources. The package does not depend on the monorepo, Astro, or either website. `test:pack` installs the actual tarball in a temporary directory and runs artifact smoke checks. Release tags use `weapp@<version>`; legacy `weapp-v<version>` tags remain accepted.

Versions and changelogs are prepared by repoctl using pnpm's native change intents. Record `pnpm change weapp --bump patch --summary "Describe the fix"` on your development branch, commit the intent, and merge it into `main`. Use `minor` for new features and `pnpm release:plan --json` for a read-only preview. The Version Packages workflow creates or updates `release/pnpm-version`, then runs CLI CI and OIDC preflight on that PR. Private workspaces are excluded explicitly. This minor intent prepares `0.3.0` from the published `0.2.0` baseline; version PRs are reviewed and merged separately from publication.

## Release preflight

After building, `pnpm --filter weapp preflight` checks package identity, Node 18 support, public access, the unpublished npm version, and the pack dry-run's resources. This local check does **not** check CI OIDC or prove permission to publish.

The `publish-weapp.yml` manual workflow defaults to `mode=preflight`, `tag=main`. On a GitHub-hosted runner it tests and installs one exact tarball, validates its manifest and resources, and explicitly requests a GitHub JWT for `npm:registry.npmjs.org` before exchanging it with npm. Missing credentials or a failed exchange stop the run. The JWT and exchange token are masked, never saved or passed to `npm publish`, and the run uploads the validated artifact without publishing. A successful exchange verifies that exchange only; it does not independently prove publishing permission.

After merging the version PR, publish a GitHub Release named `weapp@<version>` with its tag pointing to the merge commit. This triggers the existing publishing workflow. An explicit `mode=publish` dispatch from that tag remains available; repoctl requires the canonical tag and GitHub Release as well as the npm version before preparing the next release. The workflow's GitHub ref, provenance commit, checked-out commit, and resolved tag commit must agree, and the version must still be unpublished. Publication uses the validated tarball with lifecycle scripts disabled and npm's own trusted-publishing authentication. The npm trusted publisher must match `weappjs/weapp.dev`, workflow filename `publish-weapp.yml`, and the workflow's environment (currently empty). `npm publish --dry-run` is not an OIDC authentication check.

```bash
# Validate the prepared version PR without publishing:
gh workflow run publish-weapp.yml --ref release/pnpm-version -f mode=preflight -f tag=release/pnpm-version
# Only after authorizing publication and creating the matching release tag:
gh workflow run publish-weapp.yml --ref weapp@0.1.0 -f mode=publish -f tag=weapp@0.1.0
```

[Website](https://weapp.js.org/) · [Projects](https://weapp.js.org/en/projects/) · [GitHub](https://github.com/weappjs) · [Issues](https://github.com/weappjs/weapp.dev/issues)

MIT

<details>
<summary>中文说明</summary>

## 中文说明

`weapp` 是以项目为核心的小程序动态工作台。默认优先创建 weapp-vite；终端与离线浏览器实验室由项目选择驱动粒子、星轨、配色与能力信息。二维码、配色、项目体检和官方脚手架保留独立命令。

直接运行 `npx weapp`，第一帧即可操作，Braille 粒子在操作区旁组装。默认焦点为「创建 weapp-vite」，首个 Enter 直接进入创建，大厅可按 C 快速创建；其后是 weapp 生态、项目体检、视觉实验室和更多工具。方向键与 Enter 选择，Tab 切换全部生态，空格暂停，Esc 返回，非文本输入页按 Q 退出。宽窗口双栏、普通窗口上下排列、窄窗口优先保留操作与状态。统一最高 20 FPS，按行差分输出并处理背压；脚手架期间释放终端输入，返回后恢复页面和焦点。管道、CI 与不支持交互的终端输出静态命令清单。

部分 npm 版本会在运行 CLI 前扫描全局依赖树，此时可尝试 `npx --package=weapp@latest -- weapp`，继续保留 latest 查询和正常安装提示。普通 `npx weapp` 仍支持。收益取决于 npm 版本、全局依赖树及缓存；首次下载还受 registry 和网络影响。

```bash
npx weapp --lang zh-CN
npx weapp create
npx weapp fx orbit --seed 42
npx weapp lab --no-open
npx weapp projects --status stable --json
npx weapp docs vite --open
npx weapp create weapp-vite my-app --template tailwindcss
npx weapp doctor . --json
printf 'https://weapp.js.org/' | npx weapp qr -
npx weapp palette '#07c160' --output colors.css --format css
```

默认无遥测，无账号或 API key。除主动创建项目和访问外部链接外，功能均离线可用。`--no-color` / `NO_COLOR` 禁用颜色，`--no-motion` 禁用装饰动画（贪吃蛇仍保留游戏移动），`--lang en` 切换英文。二维码和配色文件默认不覆盖，明确传 `--force` 才覆盖。

交互运行 `weapp create` 或 `weapp create weapp-vite` 直接进入「目录 → 模板 → 创建摘要」，默认官方 `default` 模板；非 TTY 缺目录报用法错误，不联网。项目名决定可复现的星图，选择模板会重组轨道。有效目录确认后，版本查询与模板选择、摘要阅读并行；查询和执行统一使用目标父目录生效的 npm 源、代理、CA 和认证配置，仅在本次创建内复用结果。进度显示真实阶段和耗时。在工作台内，Esc 可取消等待并返回大厅，产物验证成功后立即显示徽章与后续命令；独立创建命令完成后回到 shell。

五个模板分别用于原生 Vite、Wevu 单文件组件、React、Tailwind CSS 和多平台单文件组件。显式 `create <路线> <目录>` 与离线 `--dry-run` 保持兼容。创建支持 weapp-vite、Vue Mini、Rezor、Uni Helper 和 VPT 的官方入口。新目录必须不存在且父目录已存在；运行前核验 Node 要求、固定解析版本，运行后检查 manifest 和框架依赖。上游选项仍由官方工具询问，项目依赖由你随后安装。`doctor` 只读取文件，不执行配置或脚本。已有项目的接入请参考 `info` 与官方文档。

交互浏览默认展示 weapp-vite、weapp-tailwindcss、weapp-pandacss、weapp-stylex、Varo 和 weapp-sqlite 六项；Tab 或 `projects --all` 展示全部十一项。关键词搜索、JSON 与精确项目查询始终覆盖十一项。

实验室默认进入生态星系并选中 weapp-vite，打包真实 Logo、字体和固定资源表，离线可用。选中项目同步更新成熟度、能力、配色和操作；weapp-vite 可复制创建命令，其他已发布项目可复制官方开始命令，浏览器不会执行本地脚手架。规划项目没有安装或创建操作。粒子场景在 WEAPP 与项目标识之间变形，保留指针流场与拖拽；重播保留项目和控制设置，重置动画与偏移。支持手机、减少动态效果、后台暂停、Canvas 降级与 PNG 下载。`weapp play snake` 和专属帮助仍可使用，游戏从主大厅和总帮助隐藏。

每个项目保留自己的仓库、发布节奏和 API 边界。安装依赖不代表已经完成接入。weapp-sqlite 处于测试阶段：运行 `pnpm add @weapp-sqlite/weapp-vite` 安装 weapp-vite 集成包，再按[官方指南](https://sqlite.weapp.dev/)完成接入。目前验证范围为 Web 和微信开发者工具；真机使用前请核对官方边界说明。通过 `weapp info weapp-sqlite` 查看接入资料，CLI 不提供它的 `weapp create` 路线。

开发代码、实验室、测试和验收脚本统一使用严格 TypeScript，`pnpm --filter weapp check` 检查 Node／工具脚本和浏览器类型。`tsdown` 分别打包 Node 18 CLI、浏览器实验室及可直接在 Node 18 执行的 artifact smoke。运行 `pnpm --filter weapp build` 后可执行 `node packages/weapp/dist/cli.js`；npm 包只交付 JavaScript bundles 与目录、Logo、字体和许可证等静态资源。

构建后执行 `pnpm --filter weapp preflight` 可本地检查包身份、Node 18、公开访问、版本未发布和打包资源；它不会检查 CI OIDC，也不证明发布权限。`publish-weapp.yml` 手动运行默认 `mode=preflight`、`tag=main`：在 GitHub 托管 runner 上安装并测试同一 tarball，显式请求 GitHub JWT 并调用 npm OIDC exchange。凭据缺失或 exchange 失败即终止；JWT 与 token 仅掩码后丢弃，不落盘、不交给发布命令。交换成功只证明该交换完成，预检上传验证后的 tarball，整个模式不会发布 npm 包。

版本与 changelog 由 repoctl 和 pnpm 原生 change intents 管理。在开发分支运行 `pnpm change weapp --bump patch --summary "修复说明"`，提交 intent 并合入 main；新功能使用 `minor`，`pnpm release:plan --json` 可只读预览。Version Packages 工作流维护 `release/pnpm-version` → main 的版本 PR，主动运行该分支的 CLI CI 和 OIDC 预检，明确排除私有 workspace。已发布 `0.1.0` 后的下一份 minor intent 准备 `0.2.0`；main 仍为已发布基线时，应预检版本分支，而不是重复预检 main。版本 PR 需要单独审查、合并，不会自动发布。

合并版本 PR 后，发布 `weapp@<version>` 的 GitHub Release，标签指向合并提交，再由既有工作流发布 npm。旧 `weapp-v<version>` 标签保持兼容；新的自动版本流程使用 canonical 名称，因为 repoctl 消费下一批 intent 前要求上一版本的 npm、canonical tag 和 GitHub Release 完整。手动发布仍须明确 `mode=publish`，使用 `--ref weapp@0.1.0 -f mode=publish -f tag=weapp@0.1.0`；仅手动发布 npm 时还须补齐 canonical Release。GitHub ref、provenance SHA、检出的 HEAD 与 tag 对应提交必须一致。npm trusted publisher 应匹配 `weappjs/weapp.dev`、`publish-weapp.yml` 及当前空 environment。`npm publish --dry-run` 不能作为 OIDC 认证证明。

<!-- catalog:zh-CN:start -->

| 项目                                                                  | 状态   | 定位                                 |
| --------------------------------------------------------------------- | ------ | ------------------------------------ |
| [weapp-vite](https://weapp.js.org/projects/weapp-vite/)               | stable | 用 Vite 做小程序工程构建             |
| [weapp-tailwindcss](https://weapp.js.org/projects/weapp-tailwindcss/) | stable | 把 Tailwind 写进小程序样式里         |
| [weapp-pandacss](https://weapp.js.org/projects/weapp-pandacss/)       | stable | 把 Panda CSS 的生成样式带进小程序    |
| [weapp-stylex](https://weapp.js.org/projects/weapp-stylex/)           | beta   | 把官方 StyleX 编译为微信小程序 WXSS  |
| [Varo](https://weapp.js.org/projects/varo/)                           | stable | 双端移动 UI Registry                 |
| [weapp-sqlite](https://weapp.js.org/projects/weapp-sqlite/)           | beta   | 面向小程序工程的本地数据层           |
| [VPT](https://weapp.js.org/projects/vite-plugin-taro/)                | stable | 给 Taro 接上 Vite                    |
| [Vue Mini](https://weapp.js.org/projects/vue-mini/)                   | stable | 基于 Vue 3 的小程序框架              |
| [Rezor](https://weapp.js.org/projects/rezor/)                         | beta   | 基于 React 的小程序框架              |
| [Uni Helper](https://weapp.js.org/projects/uni-helper/)               | stable | 增强 uni-app 系列产品的开发体验      |
| [Wot UI](https://weapp.js.org/projects/wot-ui/)                       | stable | 轻量、美观、AI 友好的 uni-app 组件库 |

<!-- catalog:zh-CN:end -->

[官网](https://weapp.js.org/) · [项目目录](https://weapp.js.org/projects/) · [GitHub](https://github.com/weappjs) · [反馈](https://github.com/weappjs/weapp.dev/issues)

MIT

</details>
