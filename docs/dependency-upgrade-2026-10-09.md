# 2026-10-09 依赖兼容升级验收

本轮升级保留现有 Node 引擎约定、TypeScript 6.0.3、公共 API 和双站部署配置。选择同主版本内、满足 pnpm 默认 1440 分钟发布冷却期的稳定版本，不增加发布冷却豁免。

## 直接依赖

| 依赖                                    | 升级前  | 升级后  |
| --------------------------------------- | ------- | ------- |
| Astro                                   | 7.3.5   | 7.3.7   |
| repoctl                                 | 5.7.1   | 5.8.1   |
| weapp-tailwindcss                       | 5.5.11  | 5.5.12  |
| @lucide/astro                           | 1.52.0  | 1.53.0  |
| @playwright/test                        | 1.63.0  | 1.64.0  |
| Wrangler                                | 4.147.0 | 4.148.0 |
| @types/node（project-catalog 直接依赖） | 24.13.3 | 24.19.1 |
| pnpm                                    | 12.8.1  | 12.10.1 |

同名直接依赖在各工作区保持一致。TypeScript 7 暂不采用：`@astrojs/check@0.9.10` 和 `repoctl@5.8.1` 的 peer 声明仍只支持 TypeScript 5/6。`.node-version` 仍为 22.23.2；本地验证使用 Node 24.18.0，满足现有 engines。

## 间接依赖与限定 overrides

刷新声明范围内的间接依赖后，repoctl 移除了旧 `@pnpm/workspace.find-packages` 依赖链。锁文件包含 `fast-uri@3.1.8`、`source-map-js@1.2.2`、`http-cache-semantics@4.3.0`、`brace-expansion@5.0.12`、`devalue@5.9.4` 和 `undici@8.11.2` 等兼容修复。

两条 overrides 只替换已确认的漏洞版本：

- `tinypool@2.1.0` → `2.1.2`：修复 GHSA-5gmw-xhrv-c9v3 和 GHSA-85c8-ppgw-ccpr。上游 oxfmt 不再精确锁定 2.1.0 后删除此 override。
- `miniflare@5.20261006.0-alpha>sharp` → `0.35.5`：修复 GHSA-wq5f-xc86-pv6w。Wrangler 引入的 Miniflare 自身锁定 sharp 0.35.5 或更高安全版本后删除此 override。

## 安全审计

以下是 2026-10-09 对锁文件执行 `pnpm audit --json` 的结果。计数为审计告警数量，不代表不同依赖包的数量。

| 严重程度         | 升级前 | 升级后 |
| ---------------- | ------ | ------ |
| 严重（critical） | 4      | 2      |
| 高危（high）     | 26     | 3      |
| 中危（moderate） | 19     | 0      |
| 低危（low）      | 5      | 1      |
| 合计             | 54     | 6      |

剩余告警没有加入忽略列表：

| 依赖与来源                                                   | 告警                                                                                                                                                                                                                                     | 本轮保留原因                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `braces@3.0.3`，micromatch/样式与源码扫描工具链              | 高危，[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)                                                                                                                                                           | registry 最新版仍为 3.0.3，暂无修复版。                    |
| `simple-git@3.36.0`，`repoctl → @icebreakers/monorepo`       | 严重，[GHSA-x6jw-m9v5-85vh](https://github.com/advisories/GHSA-x6jw-m9v5-85vh)；高危，[GHSA-g4wm-2vf7-vfgr](https://github.com/advisories/GHSA-g4wm-2vf7-vfgr)、[GHSA-858h-whjf-mvg5](https://github.com/advisories/GHSA-858h-whjf-mvg5) | 完整修复需要 4.0.1 或更高版本，超出上游声明的 `^3.36.0`。  |
| `@simple-git/argv-parser@1.1.1`，simple-git 的间接依赖       | 严重，[GHSA-v5rq-49vh-5v5c](https://github.com/advisories/GHSA-v5rq-49vh-5v5c)                                                                                                                                                           | 修复版为 2.0.1，需随 simple-git 的兼容迁移一并处理。       |
| `katex@0.16.47`，`repoctl → ESLint 配置 → Markdown 数学语法` | 低危，[GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)                                                                                                                                                           | 修复版为 0.18.2 或更高版本，超出调用方的 0.16.x 兼容范围。 |

## Peer 依赖检查

`pnpm peers check` 仍返回退出码 1：已有的 `@pnpm/logger` 冲突尚未完全被上游解决。`repoctl → @icebreakers/monorepo → @pnpm/fs.find-packages@1000.0.24 → @pnpm/read-project-manifest@1001.2.6 → @pnpm/manifest-utils@1002.0.5 → @pnpm/core-loggers@1001.0.9` 要求 logger 1001.x，而当前工具链安装 logger 1100.0.0。

这条冲突升级前已存在；受影响的消费者从旧 pnpm 安装链缩减到上述三个包。原有 `@pnpm/worker` 冲突已消除，没有新增 peer 冲突。本轮不通过全局改写 logger 主版本或忽略 peer 检查掩盖上游约束。

## 上游问题跟踪

已在独立目录确认 repoctl 5.8.1 和最新 5.9.0 均存在以下问题，并提交上游 issue：

- [repoctl #1053：公开安全告警依赖](https://github.com/icelib/repoctl/issues/1053)，覆盖 simple-git、argv-parser、tinypool、KaTeX 的修复路径，以及 braces 尚无修复版本的状态。
- [repoctl #1054：pnpm logger peer 冲突](https://github.com/icelib/repoctl/issues/1054)，记录工作区查找链要求 logger 1001.x、直接依赖和 worker 链使用 1100.x 的约束冲突。

两项共用[最小复现](https://gist.github.com/sonofmagic/384d7a9eed232a8ec81daddf0a3280bb)，包含 package.json、锁文件、复现命令和实际输出。未添加 overrides 的隔离项目审计为 4 项严重、3 项高危、1 项低危；这是依赖图告警，未验证漏洞的业务可利用性。

## 已完成的本地验证

- `pnpm install --frozen-lockfile`：通过，pnpm 12.10.1 可按锁文件安装。
- `pnpm check:boundaries`：边界检查和 6 个测试通过。
- `pnpm exec turbo run lint lint:styles check test --force`：16 项任务通过，0 项使用缓存；其余 137 个单元测试通过，合计 143 个。
- `pnpm build:cloudflare`：通过；验证 38 个必需输出、33 个页面、SEO 资源和内部链接。
- `pnpm build:pages`：通过；验证 41 个必需输出、34 个页面、SEO 资源、内部链接和 GitHub Pages 资源路径改写。
- `pnpm --filter @weapp.dev/web exec wrangler deploy --dry-run`：通过；Wrangler 4.148.0 读取 173 个静态资源后正常退出，仅完成本地检查。

## 浏览器验收

使用 Playwright 1.64.0，按商业站桌面、商业站移动、开源站桌面、开源站移动的顺序运行。每组通过 `--project=desktop` 或 `--project=mobile` 选择现有配置，使用 `--workers=2 --reporter=json`，不传 `--headed`；运行中的浏览器进程已核对为 headless。

| 应用         | 项目    | 通过 | 按现有条件跳过 | 失败 | 重试后通过 |
| ------------ | ------- | ---- | -------------- | ---- | ---------- |
| weapp.dev    | desktop | 191  | 1              | 0    | 0          |
| weapp.dev    | mobile  | 163  | 29             | 0    | 0          |
| weapp.js.org | desktop | 161  | 15             | 0    | 0          |
| weapp.js.org | mobile  | 161  | 15             | 0    | 0          |
| 合计         |         | 676  | 60             | 0    | 0          |

跳过项由既有测试条件决定，包括专用线上统计测试、桌面专用视口矩阵以及不属于开源站的商业页面场景；本轮没有修改测试或增加跳过条件。覆盖中英文路由、主题、响应式布局、键盘与无障碍检查、交互演示、无 JavaScript 内容、统计隐私行为、商业站赞助图表，以及开源站 GitHub Pages 子路径和历史静态跳转。

每组运行使用 Playwright 管理的临时浏览器和静态测试服务。结束后确认所有记录的任务进程已经退出，4321 和 45322 均无监听者；没有保留临时浏览器或预览页面。
