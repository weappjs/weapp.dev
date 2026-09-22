# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are frontend teams evaluating or adopting a mini-program / H5 toolchain. They arrive while selecting or migrating tooling, and need a clear map of project boundaries, credibility signals, and the right docs or repositories to continue.

Active users, maintainers, and contributors also use both sites to find releases and repositories. Service buyers and sponsors use weapp.dev; weapp.js.org has no commercial or fundraising audience path.

## Product Purpose

This repository builds two bilingual sites from one project catalog. weapp.dev keeps the ecosystem overview and gives migration, training, open-source sponsorship, and the contributors fund clear entry points. weapp.js.org is the open-source organization portal: it explains the related JavaScript mini-program projects, links their documentation and source, and helps visitors contribute. It contains no sponsorship, funding, paid-service content, or commercial referrals.

Both sites explain how engineering (weapp-vite), styling (weapp-tailwindcss), components (Varo), local data (weapp-sqlite), and the surrounding Taro, Vue Mini, React, and uni-app ecosystems relate. Project status and documentation domains remain shared facts; the site split does not imply that individual projects or their documentation have moved.

Success for this site means a visitor can quickly grasp the five-layer boundaries and leave into the correct docs or repositories.

## Positioning

The portal markets a progressive, composable toolchain: keep familiar native mini-program, Vue SFC, or cross-platform writing; upgrade delivery through specialized tools with clear ownership. Neighboring “all-in-one framework” sites cannot truthfully claim this same preserve-your-writing, layered-adoption story for the weapp.dev project set.

## Operating Context

- Developers compare tools before changing a production mini-program or H5 codebase.
- Discovery happens on both sites; deep docs remain on project sites such as `tw.weapp.dev` and `vite.weapp.dev`, with GitHub and npm as proof surfaces.
- Homepage interactive demos illustrate style, build, and registry behavior in the weapp-vite project row without pretending to run the full production toolchain in-browser. Local-data and migration capabilities use static proof with their current status and boundaries.
- Commercial and funding paths (migration/training, sponsorship, contributors fund) are published only on weapp.dev. Contribution on weapp.js.org means issues, code, tests, and documentation.

## Capabilities and Constraints

- This repository is the Astro monorepo for both websites (`apps/web`), not the individual tool runtimes. `WEAPP_DEPLOY_TARGET=weapp` writes `dist`; `github-pages` writes `dist-pages`. Identity, navigation, and feature availability come from `getSiteProfile()` in `src/lib/deployment.ts`.
- Published project catalog is grouped by ecosystem: the weapp native stack (weapp-vite, weapp-tailwindcss, Varo, weapp-sqlite), Taro (VPT), Vue Mini, Rezor, and uni-app (Uni Helper, Wot UI). Only the weapp stack appears in the weapp toolchain map.
- Site must stay bilingual: Chinese at `/`, English under `/en/`, with parity for key pages.
- Site must remain static-first: core content and default demos readable without client JavaScript; theme and navigation may enhance progressively.
- Metrics, sponsorship claims, customer stories, and case evidence must come from real sources already in the repo or confirmed program rules; future work must not fabricate them.
- Existing published engineering stance in site copy: multi-platform work is an explicit single-target build choice, and adoption is progressive rather than a forced rewrite.

## Brand Commitments

- Site brands: **weapp.dev** and **weapp.js.org**; the open-source homepage hero uses **weapp**.
- Maintainer attribution: initiated and maintained by [sonofmagic](https://github.com/sonofmagic)
- License: MIT
- Existing marks and logos live under `apps/web/public/logo.svg` and `apps/web/public/brands/`
- Voice in current site copy is technical, direct, and product-led; bilingual Chinese/English is part of the product surface, not optional decoration

## Evidence on Hand

- Live/public site and repo copy: README, homepage i18n, project JSON under `apps/web/src/content/`
- Brand and project marks: `apps/web/public/logo.svg`, `apps/web/public/brands/`
- Interactive homepage demos for style / build / registry under `apps/web/src/components/home/demos/`
- Media and showcase assets under `apps/web/public/media/`
- Committed metrics fallback: `apps/web/src/data/project-metrics.fallback.json`
- Contributors fund and sponsorship rules published on weapp.dev (`/contributors/`, `/pricing/`); these are not content sources for weapp.js.org
- Architecture and acceptance notes under `docs/`
- Absence to preserve: no fabricated testimonials, unnamed enterprise customers, or unverifiable download/sponsor claims

## Product Principles

1. **Boundary clarity first** — visitors should leave knowing which layer solves which job.
2. **Preserve the writing, upgrade the delivery** — migration cost stays low; tools take over engineering, styling, components, data, or migration without demanding a rewrite.
3. **Prove with real artifacts** — demos, metrics, releases, and source links beat category slogans.
4. **Bilingual and static-readable** — Chinese/English parity and no-JS readability are product requirements, not polish.
5. **Separate site purposes** — weapp.dev explains services and funding honestly. weapp.js.org stays focused on open-source projects and contribution, with no commercial referral path.

## Retired routes and publishing

On weapp.js.org, `/pricing/`, `/sponsors/`, and `/contributors/`, including their `/en/` equivalents, are noindex static redirects to the same-language project directory. They use a meta refresh and a visible relative link, work without JavaScript, and stay out of the sitemap. They do not redirect to weapp.dev.

Both deployment artifacts must pass their own static validation and desktop/mobile E2E suite before either site deploys. The Pages artifact is also tested below `/weapp.dev/` so its relative links and assets work on the GitHub project URL and the requested custom domain.

## Accessibility & Inclusion

No separate legal accessibility standard was newly committed in init. Existing product quality expectations already require keyboard access, localized metadata, light/dark themes, and reduced-motion-friendly behavior on public pages; preserve those unless explicitly changed.
