# Panda CSS / StyleX 双站接入验证

2026-10-09，weapp-pandacss 与 weapp-stylex 已加入 weapp.dev 和 weapp.js.org 的共享项目目录。两站均提供中英文详情、文档 / 源码 / npm 入口、首页项目行、项目导航、样式筛选与对应星球。目录现有 11 个项目；weapp 工具链包含 6 个项目；首页为 10 颗星球，规划中的 weapp-sqlite 不进入星球轨道。

资料来自各自官方 README、配置指南、品牌目录、GitHub 和 npm。Panda CSS 标记为稳定版，接入基线注明 Panda CSS 2.1.2；StyleX 0.1.0 标记为测试版，并明确当前支持微信主包、页面、组件和普通分包。项目行使用官方接入说明；它们没有复用 Tailwind 的交互演示。商业服务范围仍由 apps/web 的 services.ts 独立决定。

## 资料与素材

- weapp-pandacss：https://github.com/weapp-pandacss/weapp-pandacss ，文档 https://panda.weapp.dev/ 。本轮核对的 main 提交为 58d5aab5ba882ed6bb4fa490f8abd2897f45e495。
- weapp-stylex：https://github.com/weapp-stylex/weapp-stylex ，文档 https://stylex.weapp.dev/ 。本轮核对的 main 提交为 777f68bc63e402e4657f86b3e8360b168e0ee907。
- 两个 SVG 均原样使用上游 assets/brand/logo.svg；来源见 packages/project-catalog/public/brands/README.md。
- 新增指标快照使用真实 npm 版本与发布时间：Panda CSS 2.0.1，71 周下载、17 Stars；StyleX 0.1.0，0 Stars（首次采集时），npm 周下载接口返回 404。缺失下载数保存为 null，显示“暂无数据 / Not available”，与实测 0 区分。后续 metrics 同步可正常补全。

## 验证结果

| 检查                                                    | 结果                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| pnpm check:boundaries                                   | 通过；6 项边界测试                                                                            |
| pnpm exec turbo run lint lint:styles check test --force | 16 个任务全部通过，无缓存；140 项单元测试                                                     |
| pnpm exec turbo run build --force                       | 两站通过；商业站 42 项必需产物 / 37 页，开源站 45 项必需产物 / 38 页；内部链接和 SEO 资源有效 |
| 商业站 desktop E2E                                      | 195 通过，1 按配置跳过                                                                        |
| 商业站 mobile E2E                                       | 167 通过，29 按配置跳过                                                                       |
| 开源站 desktop E2E                                      | 165 通过，15 按配置跳过                                                                       |
| 开源站 mobile E2E                                       | 165 通过，15 按配置跳过                                                                       |
| generate-metrics.ts --require-fresh                     | 已成功刷新所有已发布项目的本地缓存；未重写其他项目的提交快照                                  |

E2E 依次运行，使用默认无头浏览器与 4 个 worker；合计 692 通过。跳过项沿用环境门禁、移动端限制和已退役页面的现有配置。新增回归覆盖三条独立样式路线、StyleX beta 筛选、官方链接、静态接入说明、无脚本详情和 Pages 子路径。既有 axe 检查覆盖新详情页及双站首页的两种主题；星球全轨道测试覆盖六种窗口尺寸、每圈 36 个位置。

## 视觉检查与资源收尾

已检查两站中英文、浅深主题和 320 / 390 / 1280 / 1440px 首页与新增详情，共 32 组视口配置，均无水平溢出。保留星球大小与轨道公式；新增标识正常解码、键盘可聚焦、减少动态效果时静止。

一次集中修正解决了 320px 英文工具链文字列过窄和黄色品牌混色导致状态文字对比度不足：窄屏项目链接移到文字下方并保持 44px 高度，状态文字采用可访问的主题色。品牌 SVG 未修改。修正后重新构建、截图并通过完整回归。

本地截图、清单、检查与 E2E 日志位于 .impeccable/review/styling-projects-2026-10-09/，不提交临时测试产物。截图脚本显式 headless: true，使用 try/finally 关闭自建浏览器及静态服务器；E2E 服务器由 Playwright 管理。结束时核对 4321 / 45322 测试端口已关闭。
