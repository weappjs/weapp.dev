# 独立样式章节验证

2026-10-09，weapp.dev 与 weapp.js.org 的中英文首页新增独立的 #styling 章节，集中展示 weapp-tailwindcss、weapp-pandacss 和 weapp-stylex。工程、组件与数据保留在 #projects；样式章节使用柔和背景分区，提供直接跳转和同语种样式目录对比入口。首页阅读顺序与交互演示 tab 顺序分别维护。

## 本地检查

- `pnpm check:boundaries`：应用、目录和 UI 包依赖边界通过，6 个边界测试通过。
- `pnpm exec turbo run lint lint:styles check test --force`：16 个任务无缓存通过，140 个单元测试通过；两应用和 UI 包的 Astro 检查均为 0 errors、0 warnings、0 hints。
- `pnpm exec turbo run build --force`：两站构建、必需资产、SEO 与内部链接验证通过。
- `git diff --check`：通过。

## 无头 E2E

两应用依次运行桌面与移动端测试，使用 4 个 worker 和默认无头配置。

| 应用         | 项目    | 通过 | 跳过 |
| ------------ | ------- | ---: | ---: |
| weapp.dev    | desktop |  195 |    1 |
| weapp.dev    | mobile  |  167 |   29 |
| weapp.js.org | desktop |  165 |   15 |
| weapp.js.org | mobile  |  165 |   15 |

合计 692 项通过。跳过项沿用环境门禁、移动端限制和已退役页面的现有配置。更新的回归检查覆盖独立样式 region、三个项目的归属与顺序、键盘 Enter 跳转、样式目录筛选、详情和官方文档入口、无 JavaScript 阅读，以及演示 tab 的键盘与控件行为。既有 axe 检查覆盖双站首页和项目详情的浅深主题；Pages 子路径 E2E 通过，新增跳转及对比链接在两语种根路径和 /weapp.dev 挂载路径的产物解析也通过。

## 视觉复核与资源清理

以显式 `headless: true` 的 Playwright 浏览器复核两站中英文、浅深主题、320/390/1280/1440px 共 32 组样式章节。全部无横向溢出，章节链接达到 44px 触控目标；390/1440px 的样式区域 axe 检查无违规。截图包含章节完整内容、开始与结束边界、三个项目行。复核后修正了相邻 Taro 章节过时的英文数量描述，并重新构建、截图和测试。

本地截图及 manifest 位于 `.impeccable/review/styling-section-2026-10-09/`，按既有规则不提交截图产物。原始检查日志位于 `/tmp/weapp-styling-section-20261009/`。视觉复核使用一个自建 browser/context/page；复核与 E2E 的临时浏览器和两站测试服务器均已关闭。本轮手动操作止于验证、提交与推送。
