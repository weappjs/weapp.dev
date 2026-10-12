# 2026-10-12 依赖升级与静态产物整理

本轮采用最新兼容稳定版本，同名直接依赖在所有工作区同步更新。保持现有 Node engines、公共 API、双站部署目标和默认 1440 分钟发布冷却期，不新增冷却豁免或审计忽略项。

## 直接依赖与工具链

| 依赖或工具                      | 升级前  | 升级后  |
| ------------------------------- | ------- | ------- |
| Astro                           | 7.3.7   | 7.3.8   |
| @lucide/astro                   | 1.53.0  | 1.55.0  |
| repoctl                         | 5.8.1   | 5.10.2  |
| weapp-tailwindcss               | 5.5.12  | 5.6.1   |
| Wrangler                        | 4.148.0 | 4.149.0 |
| @types/node（catalog 直接依赖） | 24.19.1 | 24.19.2 |
| pnpm                            | 12.10.1 | 12.11.2 |
| .node-version                   | 22.23.2 | 22.23.3 |
| npm（发布工作流）               | 11.6.0  | 12.2.0  |

TypeScript 保留 6.0.3：当前 `@astrojs/check` 和 repoctl 的检查工具仍未声明支持 TypeScript 7。直接 Node 类型保持 24.x，与现有支持环境兼容；不追随 latest 的 26.x。其余直接依赖已处于最新兼容版本。

四个工作流的 31 处 Actions 引用仍使用完整提交 SHA，版本分别为 checkout 7.0.1、setup-node 7.1.0、upload-artifact 7.0.2、download-artifact 8.0.2、upload-pages-artifact 5.0.0、deploy-pages 5.0.1、pnpm/action-setup 6.1.0 和 create-pull-request 8.1.1。Actions 自身的 Node 24 runtime 与项目 Node 22 独立。发布工作流使用 npm 12，但不更改 CLI 包的 Node >=18 运行约定，也不在本轮发布 npm 包。

## 间接依赖与安全审计

刷新兼容范围内的间接依赖后，repoctl 使用 simple-git 4.0.2 和 @simple-git/argv-parser 2.0.1，消除相关严重与高危告警。旧的直接 pnpm logger/worker 链已移除；剩余工作区查找链统一解析 @pnpm/logger 1001.0.1，`pnpm peers check` 返回 0，没有 peer 冲突。

Wrangler 使用 Miniflare 5.20261006.1-alpha，后者自行锁定安全的 sharp 0.35.5，因此删除针对旧 Miniflare 的 Sharp override。oxfmt 0.35.0 仍精确依赖 tinypool 2.1.0，保留原有 `tinypool@2.1.0: 2.1.2` patch override；待上游解除旧版本锁定后删除。

| 审计严重程度 | 升级前 | 升级后 |
| ------------ | ------ | ------ |
| 严重         | 2      | 0      |
| 高危         | 3      | 1      |
| 中危         | 0      | 0      |
| 低危         | 1      | 1      |
| 合计         | 6      | 2      |

剩余两项均来自开发工具链，未加入忽略列表，也未通过主版本 override 改写上游声明：

- braces 3.0.3：高危 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，当前无已发布修复版本。
- KaTeX 0.16.47：低危 [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)，修复需要 >=0.18.2，超出 Markdown 数学语法依赖声明的 ^0.16.0。

## BIMI 与发布产物

两站的 BIMI logo 从 `/.well-known/bimi/logo.svg` 迁到 `/bimi/logo.svg`，文件字节保持一致，SHA256 为 `44297acb2141db162ca3f952ff7d60900819317fd5f50684e56799d1b413146b`。仓库没有旧地址引用；本轮查询两站的 default._bimi TXT 均无记录。其他域名若在邮件 DNS 中引用旧地址，需改为新地址。

GitHub Pages 通过 Actions 直接发布已构建的 artifact，不运行 Jekyll；[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#static-site-generators)中的 `.nojekyll` 用于从 source branch 发布的场景。本轮停止生成该文件，资源准备时主动清理旧文件，构建验证拒绝其残留。

两站构建验证必须找到 `bimi/logo.svg`，并拒绝旧 `.well-known/bimi` 目录。商业、开源普通产物上传及最终 Pages 上传均显式设置 `include-hidden-files: false`，保留开源站 CNAME 与既有子路径资源改写。

## 本地验证

验证使用 Node 22.23.3、pnpm 12.11.2、npm 12.2.0。日志与结果存于仓库忽略的 `.cache/dependency-upgrade-2026-10-12/`。

- 冻结锁文件安装通过；供应链策略检查通过。
- 边界检查及 6 项测试通过；16 项 lint、样式、类型、单测任务全部无缓存通过，另有 215 项单测通过，合计 221 项。Astro 检查为 0 errors、0 warnings；两应用各保留一项测试中旧 CSS clip 属性的弃用 hint。
- 两站无缓存构建通过；商业站验证 43 项必需产物、37 页，开源站验证 45 项必需产物、38 页，SEO、内部链接及商业/开源内容边界有效。
- Wrangler 4.149.0 本地 `deploy --dry-run` 通过，未执行本地部署。
- actionlint、git diff --check 通过；npm 12 的 `pack --dry-run --json` 确认 CLI 包包含 README、入口与清单共 3 个文件。
- 静态打包验证：商业站 145 个文件、开源站 128 个文件，均无隐藏文件，新 BIMI 文件保留且内容一致，开源产物保留 CNAME。
- 负向检查确认两站构建拒绝缺失 BIMI 和旧 BIMI 目录，开源构建另拒绝残留 `.nojekyll`；资源准备能清理旧 `.nojekyll`。检查结束恢复产物，全部文件字节与打包前一致。

完整 Playwright 回归使用两个 worker，双站依次运行，不传 `--headed`，运行时已确认浏览器为 headless：

| 应用         | 项目    | 通过 | 既有条件跳过 | 失败 | 重试后通过 |
| ------------ | ------- | ---- | ------------ | ---- | ---------- |
| weapp.dev    | desktop | 268  | 3            | 0    | 0          |
| weapp.dev    | mobile  | 226  | 45           | 0    | 0          |
| weapp.js.org | desktop | 232  | 17           | 0    | 0          |
| weapp.js.org | mobile  | 218  | 31           | 0    | 0          |
| 合计         |         | 944  | 96           | 0    | 0          |

覆盖双语、主题、无 JavaScript、减少动画、字体和 WebGL 降级、交互演示、图表、无障碍，以及开源站 Pages 子路径和历史跳转。没有修改测试或增加跳过条件。测试结束确认记录的浏览器进程、两站静态服务器均已退出，没有保留临时页面。

推送 main 会触发两站独立 CI，验证通过后自动部署。推送前记录的上一成功运行分别为商业站 [38082297265](https://github.com/weappjs/weapp.dev/actions/runs/38082297265) 和开源站 [38082297240](https://github.com/weappjs/weapp.dev/actions/runs/38082297240)，均对应提交 `1ae506210e5e9b52aaab1544db439dbdd3c9983e`，其保留产物可用于回滚。
