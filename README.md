# weapp websites

Two independent bilingual Astro applications in one monorepo.

| Application                           | Audience                                                                               | Hosting                          |
| ------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| [weapp.dev](https://weapp.dev/)       | Mini-app tools, project demos, engineering services, sponsorship and contributors fund | Cloudflare Workers Static Assets |
| [weapp.js.org](https://weapp.js.org/) | Open-source projects, documentation, releases and contributions                        | GitHub Pages                     |

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev                         # commercial application
pnpm dev:pages                   # open-source application
pnpm check                       # boundaries, lint, types and unit tests
pnpm build:cloudflare            # apps/web/dist
pnpm build:pages                 # apps/open-source/dist
pnpm --filter @weapp.dev/web exec playwright test
pnpm --filter @weapp/open-source exec playwright test
```

Each application owns its routes, localized copy, page composition, analytics host allowlist, tests, and deployment workflow. There is no environment variable that switches one application into the other. App-to-app imports are prohibited.

packages/project-catalog owns the nine public project definitions, schemas, project media and metrics snapshot. Catalog inclusion is independent of commercial service coverage. Existing documentation domains and project repositories remain unchanged.

packages/site-ui provides the shared particle hero, project presentation, interactive demos and supporting styles. Site identity, navigation, commercial content and page composition remain application-owned. Shared components receive explicit props and never read an application directory.

weapp.dev preserves the original constellation homepage and complete project introductions, followed by an introduction to weapp.js.org and scoped commercial services.

The open-source site publishes no service prices, fundraising content, personal contact assets, or commercial referrals. weapp.dev retains sponsorship and the contributors fund, including the published 60/25/15 allocation. Voluntary sponsorship does not purchase services.

Both apps still share this repository, development tooling, public project facts and existing analytics accounts. Separate applications do not create separate repository permissions.

See [maintenance](docs/maintenance.md), [product boundaries](PRODUCT.md), and [contributors fund](docs/contributors-fund.md).

[MIT](LICENSE) © 2026 sonofmagic
