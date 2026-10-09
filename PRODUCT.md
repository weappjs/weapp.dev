# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

This monorepo contains two independent bilingual Astro applications. weapp.dev serves teams buying migration, training, and template customization. weapp.js.org helps developers discover open-source mini-program projects, read documentation, and contribute.

## Application boundaries

- apps/web: the commercial website, deployed to Cloudflare. The original particle wordmark, constellation, project demos and complete project reference lead the homepage. Services and a dedicated open-source introduction follow the project experience. Project routes also describe implementation scope. Sponsorship and the contributors fund remain here, separate from purchased services.
- apps/open-source: the open-source portal, deployed to GitHub Pages. Its source and published assets contain no commercial offers, fundraising content, contact QR codes, or referrals to the commercial root domain.
- packages/project-catalog: neutral project definitions, schemas, types, project assets, and versioned metrics. Neither application imports the other. Shared project membership is not a promise of commercial implementation.
- packages/site-ui: neutral hero, project presentation, demo renderers, styles and helpers. Applications supply identity, display labels, links and data; the package never imports an application.
- Both applications have fixed identities, independent page composition, localization, builds, tests, and deployment workflows. There is no deployment-target switch.
- The repository, development tooling, public project catalog, and analytics accounts remain shared by choice. This does not provide repository-level access isolation.

## Product truth

The catalog retains eleven projects and their actual maintainers, repositories, documentation URLs, and maturity. weapp-sqlite remains planned. Documentation domains including tw.weapp.dev, vite.weapp.dev, and varo.weapp.dev are unchanged. Only weapp-vite and weapp-tailwindcss currently have confirmed migration/training coverage; other projects need assessment.

Commercial prices, sponsorship recognition, and the 60/25/15 fund allocation remain as published. Planned cloud builds, templates, and private registries are not purchasable products. Do not invent customers, metrics, partnerships, launch dates, or support promises.

## Experience requirements

Chinese at / and English at /en/ remain first-class. Core content, navigation, and contribution/contact paths work without JavaScript. Preserve theme controls, visible keyboard focus, reduced motion, and responsive accessibility. Each application owns its SEO and privacy statements.

The open-source site's six historical pricing/sponsors/contributors URLs are noindex static redirects to its own same-language project catalog. Never redirect them to the commercial website.

## Evidence and operations

Project facts and metrics live in packages/project-catalog; service scope lives only in apps/web. Each production deployment requires that application's checks, artifact validation, and desktop/mobile E2E. Shared changes trigger both independent pipelines. See docs/maintenance.md for commands, publishing, and rollback.
