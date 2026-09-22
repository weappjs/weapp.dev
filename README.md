<div align="center">
  <img src="./apps/web/public/logo.svg" width="96" height="96" alt="weapp.dev" />
  <h1>weapp.dev</h1>
  <p>从 Tailwind CSS 样式、Vite 构建到可编辑双端组件，用一套开放工具链交付小程序与 H5。</p>
  <p>
    <a href="https://weapp.dev/">中文官网</a> ·
    <a href="https://weapp.dev/en/">English</a> ·
    <a href="https://weapp.js.org/">weapp.js.org</a> ·
    <a href="https://github.com/sonofmagic/weapp.dev">GitHub</a>
  </p>
</div>

## 保留你的写法，升级交付链路

weapp.dev 汇集面向真实小程序工程的开源项目。工具分别接管样式转换、工程构建与组件源码，让现有小程序可以渐进接入，也让 H5 与新项目共享现代开发体验。

- **编写：** 继续使用原生小程序、Vue SFC 或跨端框架，保留团队熟悉的页面与组件边界。
- **构建：** 让 weapp-tailwindcss 处理样式与类名，让 weapp-vite 处理依赖、路由和多平台构建生命周期。
- **组装：** 从 Varo Registry 安装可编辑的双端组件、业务 Blocks 与 Agent UI，并在真实运行时中验证交付。

## 三个项目，三层清晰边界

这些项目可以按需独立采用，也可以组合成从样式、构建到 H5 与小程序组件源码的完整工程。

### 01 / 样式 · weapp-tailwindcss

<img src="./apps/web/public/brands/weapp-tailwindcss.svg" width="56" height="56" alt="weapp-tailwindcss" />

**稳定版 · 把 Tailwind CSS 的原子化体验带到全端**

在小程序和跨端框架中使用熟悉的 Tailwind CSS 工作流，覆盖样式生成、转义、运行时变量与多平台差异。

- **适合谁：** 需要在微信、支付宝、抖音小程序或跨端框架中复用 Tailwind CSS 工作流的前端团队。
- **常见用法：** 在小程序模板中使用 Tailwind CSS 原子类；处理多平台模板和样式差异；在 Taro、uni-app 等跨端项目中统一样式构建。
- **支持平台：** WeChat、Alipay、Douyin、uni-app、Taro、Mpx。

```bash
pnpm add -D weapp-tailwindcss
```

[文档](https://tw.weapp.dev/) · [源码](https://github.com/sonofmagic/weapp-tailwindcss) · [npm](https://www.npmjs.com/package/weapp-tailwindcss)

### 02 / 构建 · weapp-vite

<img src="./apps/web/public/brands/weapp-vite.svg" width="56" height="56" alt="weapp-vite" />

**稳定版 · 面向小程序的现代 Vite 工程化工具链**

用 Vite 驱动小程序开发、构建和多平台输出，并提供 Vue SFC、Wevu 运行时、自动路由与工程扩展能力。

- **适合谁：** 需要现代 Vite 开发体验、Vue SFC 和多平台构建能力的小程序团队。
- **常见用法：** 用 Vite 启动和构建小程序项目；使用 Vue SFC 和自动路由组织页面；向微信、支付宝、抖音等平台输出同一套工程。
- **支持平台：** WeChat、Alipay、Douyin、Baidu、Kuaishou、Web。

```bash
pnpm add -D weapp-vite
```

[文档](https://vite.weapp.dev/) · [源码](https://github.com/weapp-vite/weapp-vite) · [npm](https://www.npmjs.com/package/weapp-vite)

### 03 / 组件 · Varo

<img src="./apps/web/public/brands/varo.svg" width="56" height="56" alt="Varo" />

**稳定版 · 跨运行时组件系统的生产底座**

为 H5 与 weapp-vite 小程序提供 registry-first primitives、组件封装、主题 token、业务 Blocks 和 Agent UI，通过 CLI 交付可编辑源码与校验能力。

- **适合谁：** 需要在 H5 与小程序之间共享交互语义、组件源码和业务 Blocks 的 Vue 3 团队。
- **常见用法：** 从 Registry 安装可编辑的 H5 或小程序组件源码；复用双端业务 Blocks 与 Agent UI；基于 primitives 和主题 token 构建企业设计系统。
- **支持范围：** H5、WeChat、Vue 3、weapp-vite、Tailwind CSS。

```bash
pnpm dlx @varo-ui/cli add --target weapp button input card
```

[文档](https://varo.weapp.dev/) · [源码](https://github.com/daguanren21/Varo) · [npm](https://www.npmjs.com/package/@varo-ui/cli)

## 更多生态项目

### React 跨端开发 · VPT

<img src="./apps/web/public/brands/vpt.svg" width="56" height="56" alt="VPT" />

**稳定版 · 用 Vite 和 React 开发小程序与 Web 应用**

[VPT（vite-plugin-taro）](https://weapp.dev/projects/vite-plugin-taro/) 基于 Vite 8、React 19 和 Taro 4，提供保留状态的热更新、微信小程序全自动分包和开箱即用的 Tailwind CSS v4。

- **适合谁：** 希望复用 React 与 Taro 组件和 API，并采用现代 Vite 工具链的前端团队。
- **常见用法：** 创建跨端 React 项目；在微信开发者工具中热更新并保留组件状态；通过标准导入自动规划微信小程序分包。
- **支持平台：** WeChat、Alipay、Web。

```bash
npm create vite-taro@latest my-app
```

[文档](https://vpt.js.org/) · [源码](https://github.com/sep2/vite-plugin-taro) · [npm](https://www.npmjs.com/package/vite-plugin-taro)

## 工程约束比演示效果更重要

- **多平台是构建目标：** 每次显式选择一个目标平台，避免用模糊兼容掩盖真实差异。
- **渐进接入：** 先稳定构建链路，再按页面引入新写法，不要求一次性重写业务。
- **结果可验证：** 源码、发布记录、运行日志与截图链路公开，构建结果可以复现。

## 赞助与贡献者计划

已确认的开源赞助按净额拆成三桶：60% 核心维护、25% 贡献者基金、15% 周边开源。贡献者基金按季发放给有效合并的修复、功能、测试和文档，不是工资或兼职。

[中文规则](https://weapp.dev/contributors/) · [English](https://weapp.dev/en/contributors/) · [赞助页](https://weapp.dev/pricing/#sponsor)

## 维护者与许可

weapp.dev 由 [sonofmagic](https://github.com/sonofmagic) 发起并持续维护，汇集面向小程序开发的开源项目、文档与实践。

[MIT](LICENSE) © 2026 sonofmagic
