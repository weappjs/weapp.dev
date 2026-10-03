# weapp-booking 官网入口验证

日期：2026-10-03。

## 范围

商业站新增 `/products/weapp-booking/` 与 `/en/products/weapp-booking/`，并接入导航、首页服务区、方案页及 llms 发现资源。页面说明预约与报名流程、消费者入口、管理后台、服务端、私有部署、定制和源码授权范围。咨询使用已有的同语言 `/pricing/#contact`。

首屏明确“已实现，外部联调待验收”“可预约人工演示”“尚未正式商业发布”。页面没有标准价格、购买/下载入口、虚构演示地址或已完成真实微信验证的声明。多租户 SaaS 和自助订阅标为后续方向。

本仓库只有公开产品说明与官网组件，没有引入私有产品实现、私有仓库地址或部署凭据。产品源码及交付材料仍在独立私有仓库。

## 已完成验证

- `pnpm check` 通过：依赖边界、ESLint、Stylelint、Astro/TypeScript 与各工作区单元测试；商业站 69 项、开源站 43 项、项目目录 14 项、共享 UI 9 项、边界 7 项。
- `pnpm build:cloudflare` 通过，商业站构建与校验包含两个产品路由、SEO 元数据、语言链接、联系锚点和全部站内链接。
- `pnpm build:pages` 通过，开源站产物没有产品路由、产品内容或商业产品链接。开源站校验器增加了对此的拒绝规则。
- `pnpm exec playwright test tests/e2e/booking.spec.ts --project=desktop` 在 `apps/web` 中通过 2 项。用例只使用 HTTP request fixture，验证静态页面及真实联系入口，不启动浏览器。
- `git diff --check` 通过。

新增边界测试同时约束商业产品引用只能存在于 `apps/web/src`，开源应用和共享包不能引用该产品；两个源路由也只存在于商业应用。

## 浏览器证据归属

本次实现代理没有启动浏览器。以现有 `docs/design/web-introduction.webp` 对照当前样式，继承应用的设计语言；新页的桌面/移动端、浅深主题、键盘和可访问性验证由根任务指定的浏览器负责人完成，不能用本记录中的静态测试替代。

静态测试临时服务为 `apps/web/scripts/serve-test-site.mjs`，端口 `127.0.0.1:4321`，由 Playwright 创建并随用例结束关闭，结束后已核对无监听。没有保留测试页面或浏览器会话。
