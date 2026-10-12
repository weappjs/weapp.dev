# weapp

A playful, offline-first toolkit for mini-app developers. Run a particle wordmark in your terminal, explore a local visual lab, find projects, or create a real mini-app with an official scaffold.

```bash
npx weapp                     # short opening → interactive hub
npx weapp fx fireworks        # terminal fireworks
npx weapp play snake          # arrow keys / WASD
npx weapp lab                 # offline browser lab
npx weapp projects vue
npx weapp info tw
npx weapp create weapp-vite my-app --template wevu
npx weapp doctor .
npx weapp qr https://weapp.js.org/ --output weapp.svg
npx weapp palette '#07c160' --format css
```

Node.js 18 or newer is supported by the toolkit. Each upstream scaffold may require a newer version; `create` checks that before running it. No telemetry, account, API key, or network is needed for effects, games, the lab, the catalog, diagnostics, QR codes, or palettes. Creation queries npm and downloads the selected official scaffold. Documentation and repository commands open external links only with `--open`.

## Commands

| Command                               | What it does                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fx [logo\|orbit\|matrix\|fireworks]` | Terminal effects; Space pauses, R replays, Left/Right switches, Q/Esc exits. `--seed 42`, `--duration 5` (seconds).                                                   |
| `play snake`                          | Snake with arrows/WASD, Space pause, R restart. Scores stay in memory.                                                                                                |
| `lab`                                 | Particles, a draggable galaxy, and pointer flow. Adjust density, speed, palette, pause, replay, or download PNG. `--no-open` prints the local URL without opening it. |
| `projects [query]`                    | Search all eleven projects; `--ecosystem weapp\|taro\|vue-mini\|rezor\|uni-app`, `--status stable\|beta\|planned`, `--json`.                                          |
| `info <project>`                      | Purpose, scope, platforms, official quick start, and related projects; `--json`.                                                                                      |
| `docs <project>` / `repo <project>`   | Print the official link; `--open` opens it.                                                                                                                           |
| `create <route> <directory>`          | Create a new project through an official scaffold; `--dry-run` prints an offline execution plan.                                                                      |
| `doctor [directory]`                  | Read-only environment, manifest, lockfile, installed-dependency, and mini-app configuration checks; `--json`. Never loads project config or runs project scripts.     |
| `qr <text\|->`                        | Scannable terminal QR, or SVG with `--output file.svg`. `-` reads stdin.                                                                                              |
| `palette <hex>`                       | Five shades and black/white text contrast. `--format css`, `--json`, or `--output file`.                                                                              |

Global options: `--lang zh-CN|en`, `--no-color`, `--no-motion`, `--help`, `--version`. Language follows `LC_ALL`, `LC_MESSAGES`, or `LANG`, with Chinese as fallback. `NO_COLOR` is honored. `--no-motion` removes decorative animation; snake movement remains part of gameplay. Redirected output, CI, and `TERM=dumb` get bounded static output; JSON never contains terminal control sequences. Use `--force` to overwrite an exported QR/palette file; existing files are preserved otherwise.

The hub uses arrow keys and Enter; Esc returns and Q exits. The opening can be skipped with any key. Effects and games restore the original terminal state on exit. The lab listens only on a random loopback port and stops when this CLI exits; no project directory is served.

## Official scaffolds

| Route        | Upstream creator    | Expected project dependency |
| ------------ | ------------------- | --------------------------- |
| `weapp-vite` | `create-weapp-vite` | `weapp-vite`                |
| `vue-mini`   | `create-vue-mini`   | `@vue-mini/core`            |
| `rezor`      | `create-rezor`      | `rezor`                     |
| `uni`        | `create-uni`        | `@dcloudio/uni-app`         |
| `taro`       | `create-vite-taro`  | `vite-plugin-taro`          |

`weapp-vite --template` supports `default` (the default), `wevu`, `react`, `tailwindcss`, and `multi-platform-sfc`. Other creators retain their own prompts. A target must not exist and its parent must exist. The CLI resolves the latest creator version, checks its Node requirement, executes that exact version, and verifies the generated manifest and dependency before reporting success. It does not install project dependencies or initialize an existing project. Partial output remains available if an upstream creator fails.

Each ecosystem project keeps its own release cadence and API. An install command is not a complete integration. Planned SQLite has no install command or production API: **No install command is available yet.**

## Project catalog

Generated from the repository's neutral public project catalog during builds.

<!-- catalog:en:start -->

| Project                                                                  | Status  | Purpose                                                  |
| ------------------------------------------------------------------------ | ------- | -------------------------------------------------------- |
| [weapp-vite](https://weapp.js.org/en/projects/weapp-vite/)               | stable  | Vite builds for mini-app projects                        |
| [weapp-tailwindcss](https://weapp.js.org/en/projects/weapp-tailwindcss/) | stable  | Use Tailwind classes in mini-app styles                  |
| [weapp-pandacss](https://weapp.js.org/en/projects/weapp-pandacss/)       | stable  | Bring Panda CSS generation to mini-apps                  |
| [weapp-stylex](https://weapp.js.org/en/projects/weapp-stylex/)           | beta    | Compile official StyleX to WeChat WXSS                   |
| [Varo](https://weapp.js.org/en/projects/varo/)                           | stable  | Registry-first mobile UI for two runtimes                |
| [weapp-sqlite](https://weapp.js.org/en/projects/weapp-sqlite/)           | planned | A local data layer for mini-app projects                 |
| [VPT](https://weapp.js.org/en/projects/vite-plugin-taro/)                | stable  | Vite for Taro projects                                   |
| [Vue Mini](https://weapp.js.org/en/projects/vue-mini/)                   | stable  | A Vue 3 framework for mini programs                      |
| [Rezor](https://weapp.js.org/en/projects/rezor/)                         | beta    | A React framework for mini programs                      |
| [Uni Helper](https://weapp.js.org/en/projects/uni-helper/)               | stable  | Better DX for the uni-app family                         |
| [Wot UI](https://weapp.js.org/en/projects/wot-ui/)                       | stable  | A light, polished, AI-friendly uni-app component library |

<!-- catalog:en:end -->

## Development

```bash
pnpm --filter weapp build
pnpm --filter weapp lint
pnpm --filter weapp test
pnpm --filter weapp test:e2e
pnpm --filter weapp test:pack
node packages/weapp/bin/weapp.js
```

The published tarball contains runtime JavaScript, an embedded catalog and Logo point cloud, and the lab's licensed assets. It does not depend on the monorepo, Astro, or either website. `test:pack` installs the actual tarball in a temporary directory and runs artifact smoke checks. Release tags use `weapp@<version>`; legacy `weapp-v<version>` tags remain accepted.

Versions and changelogs are prepared by repoctl using pnpm's native change intents. Record `pnpm change weapp --bump patch --summary "Describe the fix"` on your development branch, commit the intent, and merge it into `main`. Use `minor` for new features and `pnpm release:plan --json` for a read-only preview. The Version Packages workflow creates or updates `release/pnpm-version`, then runs CLI CI and OIDC preflight on that PR. Private workspaces are excluded explicitly. The first intent proposes `0.0.1` → `0.1.0`; version PRs are reviewed and merged separately from publication.

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

`weapp` 是面向小程序开发者的工具箱：终端里能看粒子、玩贪吃蛇，浏览器里能体验离线视觉实验室，也能搜索生态、检查项目、调用官方脚手架、生成二维码与配色。

直接运行 `npx weapp`，约 1.2 秒的粒子 Logo 开场后进入交互大厅；任意按键跳过。方向键与 Enter 选择，Esc 返回，Q 退出。管道、CI 与不支持交互的终端输出静态命令清单。

```bash
npx weapp --lang zh-CN
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

创建支持 weapp-vite、Vue Mini、Rezor、Uni Helper 和 VPT 的官方入口。新目录必须不存在且父目录已存在；运行前核验 Node 要求、固定解析版本，运行后检查 manifest 和框架依赖。上游选项仍由官方工具询问，依赖安装按其说明执行。`doctor` 只读取文件，不执行配置或脚本。已有项目的接入请参考 `info` 与官方文档。

每个项目保留自己的仓库、发布节奏和 API 边界。安装依赖不代表已经完成接入。weapp-sqlite 仍在规划中：**当前还没有安装命令。**

构建后执行 `pnpm --filter weapp preflight` 可本地检查包身份、Node 18、公开访问、版本未发布和打包资源；它不会检查 CI OIDC，也不证明发布权限。`publish-weapp.yml` 手动运行默认 `mode=preflight`、`tag=main`：在 GitHub 托管 runner 上安装并测试同一 tarball，显式请求 GitHub JWT 并调用 npm OIDC exchange。凭据缺失或 exchange 失败即终止；JWT 与 token 仅掩码后丢弃，不落盘、不交给发布命令。交换成功只证明该交换完成，预检上传验证后的 tarball，整个模式不会发布 npm 包。

版本与 changelog 由 repoctl 和 pnpm 原生 change intents 管理。在开发分支运行 `pnpm change weapp --bump patch --summary "修复说明"`，提交 intent 并合入 main；新功能使用 `minor`，`pnpm release:plan --json` 可只读预览。Version Packages 工作流维护 `release/pnpm-version` → main 的版本 PR，主动运行该分支的 CLI CI 和 OIDC 预检，明确排除私有 workspace。首个 intent 提议 `0.0.1` → `0.1.0`；main 仍为已发布基线时，应预检版本分支，而不是重复预检 main。版本 PR 需要单独审查、合并，不会自动发布。

合并版本 PR 后，发布 `weapp@<version>` 的 GitHub Release，标签指向合并提交，再由既有工作流发布 npm。旧 `weapp-v<version>` 标签保持兼容；新的自动版本流程使用 canonical 名称，因为 repoctl 消费下一批 intent 前要求上一版本的 npm、canonical tag 和 GitHub Release 完整。手动发布仍须明确 `mode=publish`，使用 `--ref weapp@0.1.0 -f mode=publish -f tag=weapp@0.1.0`；仅手动发布 npm 时还须补齐 canonical Release。GitHub ref、provenance SHA、检出的 HEAD 与 tag 对应提交必须一致。npm trusted publisher 应匹配 `weappjs/weapp.dev`、`publish-weapp.yml` 及当前空 environment。`npm publish --dry-run` 不能作为 OIDC 认证证明。

<!-- catalog:zh-CN:start -->

| 项目                                                                  | 状态    | 定位                                 |
| --------------------------------------------------------------------- | ------- | ------------------------------------ |
| [weapp-vite](https://weapp.js.org/projects/weapp-vite/)               | stable  | 用 Vite 做小程序工程构建             |
| [weapp-tailwindcss](https://weapp.js.org/projects/weapp-tailwindcss/) | stable  | 把 Tailwind 写进小程序样式里         |
| [weapp-pandacss](https://weapp.js.org/projects/weapp-pandacss/)       | stable  | 把 Panda CSS 的生成样式带进小程序    |
| [weapp-stylex](https://weapp.js.org/projects/weapp-stylex/)           | beta    | 把官方 StyleX 编译为微信小程序 WXSS  |
| [Varo](https://weapp.js.org/projects/varo/)                           | stable  | 双端移动 UI Registry                 |
| [weapp-sqlite](https://weapp.js.org/projects/weapp-sqlite/)           | planned | 面向小程序工程的本地数据层           |
| [VPT](https://weapp.js.org/projects/vite-plugin-taro/)                | stable  | 给 Taro 接上 Vite                    |
| [Vue Mini](https://weapp.js.org/projects/vue-mini/)                   | stable  | 基于 Vue 3 的小程序框架              |
| [Rezor](https://weapp.js.org/projects/rezor/)                         | beta    | 基于 React 的小程序框架              |
| [Uni Helper](https://weapp.js.org/projects/uni-helper/)               | stable  | 增强 uni-app 系列产品的开发体验      |
| [Wot UI](https://weapp.js.org/projects/wot-ui/)                       | stable  | 轻量、美观、AI 友好的 uni-app 组件库 |

<!-- catalog:zh-CN:end -->

[官网](https://weapp.js.org/) · [项目目录](https://weapp.js.org/projects/) · [GitHub](https://github.com/weappjs) · [反馈](https://github.com/weappjs/weapp.dev/issues)

MIT

</details>
