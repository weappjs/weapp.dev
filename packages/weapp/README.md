# weapp

`weapp` is a small navigation CLI for the [weapp.js.org](https://weapp.js.org/) JavaScript mini-program open-source ecosystem.

It gives you one stable entry point to the project catalog. The package does not bundle `weapp-vite`, `weapp-tailwindcss`, Varo, or any other project listed below. Each project keeps its own repository, documentation, release cadence, and API contract.

## Quick start

```bash
npx weapp
```

The command prints the official website, project index, GitHub organization, and issue tracker. It works without a network request and does not open a browser.

## Choose a project

The catalog is organized by the responsibility a project owns. Projects can be adopted independently or combined when their boundaries fit your application.

### Engineering

#### [weapp-vite](https://weapp.js.org/en/projects/weapp-vite/)

**Stable** · Vite builds for mini-app projects. It owns dependencies, routes, subpackages, and single-target multi-platform builds.

- **Best for:** Mini-app teams that want a modern Vite workflow, Vue SFC, and multi-platform output.
- **Start with:** `pnpm add -D weapp-vite`
- **Links:** [Docs](https://vite.weapp.dev/) · [Source](https://github.com/weapp-vite/weapp-vite) · [npm](https://www.npmjs.com/package/weapp-vite)

### Styling

#### [weapp-tailwindcss](https://weapp.js.org/en/projects/weapp-tailwindcss/)

**Stable** · Tailwind CSS utilities for mini-app templates and cross-platform projects. It handles template transforms and style generation without owning your routing or bundler lifecycle.

- **Best for:** Teams that want one Tailwind CSS workflow across WeChat, Alipay, Douyin, Taro, uni-app, or Mpx projects.
- **Start with:** `pnpm add -D weapp-tailwindcss`
- **Links:** [Docs](https://tw.weapp.dev/) · [Source](https://github.com/sonofmagic/weapp-tailwindcss) · [npm](https://www.npmjs.com/package/weapp-tailwindcss)

### Components

#### [Varo](https://weapp.js.org/en/projects/varo/)

**Stable** · Registry-first mobile UI for H5 and Wevu mini-program projects. It delivers editable component source, business Blocks, and Agent UI while preserving native rendering on each target.

- **Best for:** Vue 3 teams that share interaction semantics, component source, or business Blocks between H5 and mini-program products.
- **Start with:** `pnpm dlx @varo-ui/cli add --target weapp button input card`
- **Links:** [Docs](https://varo.weapp.dev/) · [Source](https://github.com/daguanren21/Varo) · [npm](https://www.npmjs.com/package/@varo-ui/cli)

### Local data

#### [weapp-sqlite](https://weapp.js.org/en/projects/weapp-sqlite/)

**Planned** · A planned SQLite capability for structured local data in mini-app projects. Runtime boundaries, synchronization strategy, and cross-platform APIs are still being defined.

- **Best for:** Teams evaluating structured local storage, offline behavior, or a controlled migration path.
- **Start with:** No install command is available yet.
- **Links:** [Project docs](https://sqlite.weapp.dev/) · [Source](https://github.com/weapp-sqlite/weapp-sqlite)

### Migration

#### [VPT](https://weapp.js.org/en/projects/vite-plugin-taro/)

**Stable** · `vite-plugin-taro` brings a Vite development and build workflow to existing Taro and React projects.

- **Best for:** Teams that want to keep Taro components and APIs while adopting Vite, faster HMR, and modern build tooling.
- **Start with:** `npm install -D vite-plugin-taro`
- **Links:** [Docs](https://vpt.js.org/) · [Source](https://github.com/sep2/vite-plugin-taro) · [npm](https://www.npmjs.com/package/vite-plugin-taro)

### Frameworks

#### [Vue Mini](https://weapp.js.org/en/projects/vue-mini/)

**Stable** · Vue 3 reactivity and Composition API for mini-program pages, with compatibility for native mini-program syntax and gradual adoption.

- **Best for:** Vue teams that want Vue page patterns while keeping a native mini-program project boundary.
- **Start with:** `pnpm add @vue-mini/core` or `npm create vue-mini@latest`
- **Links:** [Docs](https://vuemini.org/) · [Source](https://github.com/vue-mini/vue-mini) · [npm](https://www.npmjs.com/package/@vue-mini/core)

#### [Rezor](https://weapp.js.org/en/projects/rezor/)

**Beta** · A React Hooks mini-program runtime that aims to stay close to native performance.

- **Best for:** Teams evaluating a React runtime designed specifically for mini-program projects.
- **Start with:** `npm create rezor@latest`
- **Links:** [Docs and source](https://github.com/rezorjs/rezor) · [npm](https://www.npmjs.com/package/rezor)

### Ecosystem

#### [Uni Helper](https://weapp.js.org/en/projects/uni-helper/)

**Stable** · A uni-app ecosystem of tooling, conventions, and project creation helpers.

- **Best for:** uni-app teams that want maintained project tooling and a consistent community entry point.
- **Start with:** `pnpm dlx create-uni`
- **Links:** [Docs](https://uni-helper.cn/) · [Source](https://github.com/uni-helper/create-uni) · [npm](https://www.npmjs.com/package/create-uni)

#### [Wot UI](https://weapp.js.org/en/projects/wot-ui/)

**Stable** · Vue 3 components for uni-app, published on npm as `wot-design-uni`.

- **Best for:** uni-app products that need a production-ready mobile component library.
- **Start with:** `pnpm add wot-design-uni`
- **Links:** [Docs](https://wot-ui.cn/) · [Source](https://github.com/wot-ui/wot-ui) · [npm](https://www.npmjs.com/package/wot-design-uni)

## How the projects fit together

Start with the responsibility your project needs:

1. **Build:** use `weapp-vite` for dependencies, routing, subpackages, and platform builds.
2. **Style:** add `weapp-tailwindcss` when Tailwind utilities should reach mini-app templates.
3. **Compose:** use Varo when your team wants editable component source and shared H5/mini-app Blocks.
4. **Choose a runtime or migration path:** use VPT for Taro/React migration, Vue Mini for Vue 3 pages, or Rezor for a React mini-program runtime.
5. **Choose an ecosystem layer:** use Uni Helper and Wot UI for uni-app projects.
6. **Evaluate local data:** follow weapp-sqlite while its runtime and API boundaries are being specified.

These are separate projects. Combining them is an architectural choice made by the application team, not a requirement of the `weapp` package.

## Official links

- [weapp.js.org](https://weapp.js.org/) — Chinese homepage
- [Project index](https://weapp.js.org/en/projects/) — English catalog
- [GitHub organization](https://github.com/weappjs) — project repositories and contributions
- [Repository](https://github.com/weappjs/weapp.dev) — this catalog website and the `weapp` package
- [Issues](https://github.com/weappjs/weapp.dev/issues) — report problems with this package or the catalog

Project-specific bugs and feature requests should be filed in the repository linked from that project's catalog page.

## License

MIT

<details>
<summary>中文说明</summary>

## 中文说明

`weapp` 是 [weapp.js.org](https://weapp.js.org/) JavaScript 小程序开源生态的轻量导航 CLI。

它为项目目录提供统一入口。这个包不会捆绑 `weapp-vite`、`weapp-tailwindcss`、Varo 或下面列出的其他项目。每个项目都保留自己的源码仓库、文档、发布节奏和 API 约定。

## 快速开始

```bash
npx weapp
```

命令会输出官网、项目目录、GitHub 组织和 issue 入口。它不发起网络请求，也不会自动打开浏览器。

## 选择项目

项目按各自负责的工程边界组织。你可以独立采用某个项目，也可以根据应用架构组合使用。

### 工程构建

#### [weapp-vite](https://weapp.js.org/projects/weapp-vite/)

**稳定版** · 面向小程序项目的 Vite 构建工具，负责依赖、路由、分包和多平台单目标构建。

- **适合：** 需要现代 Vite 工作流、Vue SFC 和多平台输出的小程序团队。
- **开始：** `pnpm add -D weapp-vite`
- **链接：** [文档](https://vite.weapp.dev/) · [源码](https://github.com/weapp-vite/weapp-vite) · [npm](https://www.npmjs.com/package/weapp-vite)

### 样式

#### [weapp-tailwindcss](https://weapp.js.org/projects/weapp-tailwindcss/)

**稳定版** · 将 Tailwind CSS 原子类带到小程序模板和跨端项目，负责模板转换与样式生成，不接管路由或打包生命周期。

- **适合：** 希望在微信、支付宝、抖音、Taro、uni-app 或 Mpx 项目中复用 Tailwind CSS 工作流的团队。
- **开始：** `pnpm add -D weapp-tailwindcss`
- **链接：** [文档](https://tw.weapp.dev/) · [源码](https://github.com/sonofmagic/weapp-tailwindcss) · [npm](https://www.npmjs.com/package/weapp-tailwindcss)

### 组件

#### [Varo](https://weapp.js.org/projects/varo/)

**稳定版** · 面向 H5 与 Wevu 小程序的 Registry-first 移动 UI，交付可编辑组件源码、业务 Blocks 和 Agent UI，同时保留各端原生渲染。

- **适合：** 需要在 H5 与小程序产品间共享交互语义、组件源码或业务 Blocks 的 Vue 3 团队。
- **开始：** `pnpm dlx @varo-ui/cli add --target weapp button input card`
- **链接：** [文档](https://varo.weapp.dev/) · [源码](https://github.com/daguanren21/Varo) · [npm](https://www.npmjs.com/package/@varo-ui/cli)

### 本地数据

#### [weapp-sqlite](https://weapp.js.org/projects/weapp-sqlite/)

**规划中** · 面向小程序项目的 SQLite 结构化本地数据能力。运行时边界、同步策略和跨平台 API 仍在设计中。

- **适合：** 需要评估结构化本地存储、离线行为或可控迁移路径的团队。
- **开始：** 当前还没有安装命令。
- **链接：** [项目文档](https://sqlite.weapp.dev/) · [源码](https://github.com/weapp-sqlite/weapp-sqlite)

### 迁移

#### [VPT](https://weapp.js.org/projects/vite-plugin-taro/)

**稳定版** · `vite-plugin-taro` 为已有 Taro 与 React 项目提供 Vite 开发和构建工作流。

- **适合：** 希望保留 Taro 组件和 API，同时采用 Vite、更快 HMR 与现代构建工具的团队。
- **开始：** `npm install -D vite-plugin-taro`
- **链接：** [文档](https://vpt.js.org/) · [源码](https://github.com/sep2/vite-plugin-taro) · [npm](https://www.npmjs.com/package/vite-plugin-taro)

### 运行时框架

#### [Vue Mini](https://weapp.js.org/projects/vue-mini/)

**稳定版** · 为小程序页面提供 Vue 3 响应式数据和组合式 API，兼容原生小程序写法，支持渐进接入。

- **适合：** 希望使用 Vue 页面模式，同时保留原生小程序工程边界的团队。
- **开始：** `pnpm add @vue-mini/core` 或 `npm create vue-mini@latest`
- **链接：** [文档](https://vuemini.org/) · [源码](https://github.com/vue-mini/vue-mini) · [npm](https://www.npmjs.com/package/@vue-mini/core)

#### [Rezor](https://weapp.js.org/projects/rezor/)

**Beta** · 使用 React Hooks 编写小程序的运行时，目标是接近原生性能。

- **适合：** 评估面向小程序项目的 React 运行时的团队。
- **开始：** `npm create rezor@latest`
- **链接：** [文档与源码](https://github.com/rezorjs/rezor) · [npm](https://www.npmjs.com/package/rezor)

### 生态工具

#### [Uni Helper](https://weapp.js.org/projects/uni-helper/)

**稳定版** · uni-app 工具、约定和项目创建工具组成的生态组织。

- **适合：** 需要稳定项目工具和统一社区入口的 uni-app 团队。
- **开始：** `pnpm dlx create-uni`
- **链接：** [文档](https://uni-helper.cn/) · [源码](https://github.com/uni-helper/create-uni) · [npm](https://www.npmjs.com/package/create-uni)

#### [Wot UI](https://weapp.js.org/projects/wot-ui/)

**稳定版** · 面向 uni-app 的 Vue 3 组件库，在 npm 上的发布名为 `wot-design-uni`。

- **适合：** 需要生产级移动组件库的 uni-app 产品。
- **开始：** `pnpm add wot-design-uni`
- **链接：** [文档](https://wot-ui.cn/) · [源码](https://github.com/wot-ui/wot-ui) · [npm](https://www.npmjs.com/package/wot-design-uni)

## 项目如何组合

根据项目需要选择对应边界：

1. **构建：** 使用 `weapp-vite` 处理依赖、路由、分包和平台构建。
2. **样式：** 使用 `weapp-tailwindcss` 将 Tailwind 原子类带到小程序模板。
3. **组装：** 使用 Varo 将可编辑组件源码和 H5/小程序业务 Blocks 安装到项目中。
4. **选择运行时或迁移路径：** Taro/React 项目选择 VPT，Vue 3 页面选择 Vue Mini，React 小程序运行时选择 Rezor。
5. **选择生态层：** uni-app 项目选择 Uni Helper 和 Wot UI。
6. **评估本地数据：** 关注仍在定义运行时与 API 边界的 weapp-sqlite。

这些项目彼此独立。是否组合使用由应用团队的架构决定，不是 `weapp` 包的强制要求。

## 官方入口

- [weapp.js.org](https://weapp.js.org/) — 中文首页
- [项目目录](https://weapp.js.org/en/projects/) — 英文项目索引
- [GitHub 组织](https://github.com/weappjs) — 项目仓库与贡献入口
- [源码仓库](https://github.com/weappjs/weapp.dev) — 本项目目录站点和 `weapp` 包
- [Issues](https://github.com/weappjs/weapp.dev/issues) — 反馈本包或项目目录问题

具体项目的 bug 和功能请求，请提交到该项目目录页面链接的源码仓库。

## 许可证

MIT

</details>
