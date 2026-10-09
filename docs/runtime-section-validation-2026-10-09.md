# Runtime 章节验证

2026-10-09，weapp.dev 与 weapp.js.org 的中英文首页将 Vue Mini 和 Rezor 合并到 #runtime 章节。章节以小程序运行时选型为核心，说明 Vue 3 响应式 / 组合式 API 和 React Hooks 两条路线；卡片展示目录中的真实运行时与稳定版 / Beta 状态，保留官方资料和站内详情入口。桌面并排比较，手机纵向阅读。

分组由应用按 Framework 角色维护，目录生态归属与项目星球保持现有约定。旧的 #ecosystem-vue-mini、#ecosystem-rezor 锚点落到各自项目卡片，既有链接仍能定位对应项目。

## 本地检查

- `pnpm check:boundaries`：依赖边界与 6 个边界测试通过。
- `pnpm exec turbo run lint lint:styles check test --force`：16 个任务无缓存通过，140 个单元测试通过；两应用和 UI 包的 Astro 检查均为 0 errors、0 warnings、0 hints。
- `pnpm exec turbo run build --force`：两站构建、必需资产、SEO 与内部链接验证通过。
- `git diff --check`：通过。

## 无头 E2E

按应用依次运行 desktop 与 mobile，使用 4 个 worker 和默认无头配置。

| 应用         | 项目    | 通过 | 跳过 |
| ------------ | ------- | ---: | ---: |
| weapp.dev    | desktop |  199 |    1 |
| weapp.dev    | mobile  |  171 |   29 |
| weapp.js.org | desktop |  169 |   15 |
| weapp.js.org | mobile  |  169 |   15 |

合计 708 项通过。跳过项沿用环境门禁、移动端限制和已退役页面的现有配置。新增回归覆盖同一 Runtime region 下的两个项目、运行时与成熟度、官方链接、键盘进入详情、旧锚点定位及无 JavaScript 阅读。既有首页和详情 axe、样式章节、交互演示与 Pages 子路径回归全部通过。

## 视觉复核与资源清理

以显式 `headless: true` 的 Playwright 浏览器检查两站中英文、浅深主题、320/390/1280/1440px 共 32 组布局。全部无横向溢出，章节链接达到 44px 触控目标；390/1440px 的 Runtime 区域 axe 检查无违规。复核后将项目卡片内部网格固定为标题、说明与操作的稳定排列，修正英文内容长度不同造成的对齐差异，并重新构建、截图和测试。

本地截图及 manifest 位于 `.impeccable/review/runtime-section-2026-10-09/`，按既有规则不提交截图产物；原始日志位于 `/tmp/weapp-runtime-section-20261009/`。视觉复核只使用一个自建 browser/context/page；复核与 E2E 的临时浏览器、两站测试服务器均已关闭。本轮手动操作止于验证、提交与推送。
