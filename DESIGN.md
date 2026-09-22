---
name: weapp.dev
description: Shared bilingual design system for the weapp.dev service and ecosystem site and the weapp.js.org open-source portal.
colors:
  brand: "#0e7958"
  brand-hover: "#096646"
  brand-contrast: "#ffffff"
  brand-on-dark: "#69c7a5"
  brand-on-dark-hover: "#86d7b9"
  brand-on-dark-contrast: "#07130e"
  hub-mark: "#07C160"
  highlight: "#f2c94c"
  demo-keyword: "#91431a"
  demo-keyword-dark: "#f3b58d"
  demo-string: "#176181"
  demo-string-dark: "#85c9e6"
  canvas: "#f4f7f5"
  panel: "#ffffff"
  panel-soft: "#edf2ef"
  panel-strong: "#dfe8e3"
  ink: "#0d1712"
  muted: "#5a6861"
  line: "#d5ddd8"
  canvas-dark: "#0b110e"
  panel-dark: "#111914"
  panel-soft-dark: "#15211b"
  panel-strong-dark: "#1a2a22"
  ink-dark: "#edf5f0"
  muted-dark: "#aab8b0"
  line-dark: "#304039"
typography:
  display:
    fontFamily: "Sora Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 4vw, 4.5rem)"
    fontWeight: 740
    lineHeight: 1.08
    letterSpacing: "normal"
  page:
    fontFamily: "Sora Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 6vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "normal"
  headline:
    fontFamily: "Sora Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 3vw, 2.75rem)"
    fontWeight: 680
    lineHeight: 1.08
    letterSpacing: "normal"
  featured:
    fontFamily: "Sora Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 680
    lineHeight: 1.08
    letterSpacing: "normal"
  title:
    fontFamily: "Sora Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 660
    lineHeight: 1.2
    letterSpacing: "normal"
  wordmark:
    fontFamily: "Sora Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "normal"
  lead:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.58
    letterSpacing: "normal"
  small:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  control: "6px"
  panel: "8px"
  demo: "4px"
spacing:
  shell-gutter: "1.5rem"
  shell-gutter-mobile: "1rem"
  shell-max: "1240px"
  section-y: "7rem"
  section-y-mobile: "5rem"
  control-x: "1rem"
  control-y: "0.625rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-contrast}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
    textColor: "{colors.brand-contrast}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  icon-control:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "2.5rem"
  platform-pill:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0.375rem 0.625rem"
  panel-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: weapp.dev and weapp.js.org

## Overview

**Creative North Star: "The Build Lens"**

weapp.dev looks through an engineering lens: cool, focused, and allergic to ecosystem-portal theatrics. The interface is neutral, technical, and product-led. Real project marks, interactive demos, metrics, and source links do the persuading; decoration stays secondary.

Surfaces stay calm across light and dark themes. A mint-sage canvas carries WeUI-adjacent forest green as the single ecosystem accent, with Signal Amber reserved for focus and selection. Motion is restrained—reveal fades and 200ms state transitions only, and reduced-motion users get an immediate static state.

**Key Characteristics:**

- Emblem-plus-wordmark lockup with a fixed green Hub mark
- One accent family, dual-theme surfaces, bilingual Chinese/English parity
- Flat tonal layering by default; shadows only for floating chrome
- Small radii (6–8px), solid primary actions, 1px press feedback
- Evidence-first: demos, metrics, and project marks beat stock illustration

Confirmed visual rejections: TanStack palm/beach composition, platform-logo collages, mascots, decorative gradients/glows, and the discarded three-column project-card layout.

## Site identity and content boundaries

Both sites share the project marks, typography, colors, layouts, demos, nine-project catalog, and real project status. `getSiteProfile()` selects the site identity at build time. Header and footer wordmarks use `weapp.dev` on the service site and `weapp.js.org` on the open-source site; the latter uses the short `weapp` wordmark in its homepage hero.

weapp.dev preserves the ecosystem story and makes services, sponsorship, and the contributors fund easy to find. weapp.js.org navigation leads to projects, ecosystem introduction, releases, and contribution. Its homepage and shared pages exclude commercial sections, funding graphs, sponsorship prompts, and referrals to the commercial site. Contribution links lead to open-source issues, code, tests, and documentation. The organization entry is `https://github.com/weappjs`; the site-source entry is `https://github.com/weappjs/weapp.dev`.

The six retired funding routes on weapp.js.org use a small standalone redirect page with noindex metadata and a visible same-language project-directory link. They do not retain the funding-page shell or copy. Every link remains usable without JavaScript and below the GitHub Pages `/weapp.dev/` prefix.

## Colors

A cool mint-sage field with one forest-green accent and an amber inspection signal. Dark theme keeps the same roles, lifting the accent for contrast on near-black greens.

### Primary

- **WeUI Forest Green** (`{colors.brand}` / dark `{colors.brand-on-dark}`): Ecosystem accent for eyebrows, links on hover, hero dots, index marks, and primary buttons. Hover deepens to `{colors.brand-hover}` (light) or `{colors.brand-on-dark-hover}` (dark).
- **Hub Mark Green** (`{colors.hub-mark}`): Fixed badge fill for `/logo.svg`. Does not theme-flip; the same green/white emblem sits on light and dark chrome.

### Secondary

Omit. The system runs on one accent family plus neutrals.

### Tertiary

- **Signal Amber** (`{colors.highlight}`): Selection fill and `:focus-visible` outline only. Never a second brand color for large fills.

### Demo chrome (labs only)

Syntax colors inside Style/Build/Registry demos. Not brand accents; do not use on marketing chrome.

- **Demo Keyword** (`{colors.demo-keyword}` / dark `{colors.demo-keyword-dark}`)
- **Demo String** (`{colors.demo-string}` / dark `{colors.demo-string-dark}`)

### Neutral

- **Mint Canvas** (`{colors.canvas}` / dark `{colors.canvas-dark}`): Page background.
- **Panel White / Panel Night** (`{colors.panel}` / `{colors.panel-dark}`): Cards, menus, dialogs.
- **Panel Soft** (`{colors.panel-soft}` / `{colors.panel-soft-dark}`): Footer, hover rows, subdued wells.
- **Panel Strong** (`{colors.panel-strong}` / `{colors.panel-strong-dark}`): Stronger tonal steps inside dense clusters.
- **Ink** (`{colors.ink}` / `{colors.ink-dark}`): Primary text.
- **Muted Copy** (`{colors.muted}` / `{colors.muted-dark}`): Supporting copy and quiet controls.
- **Hairline** (`{colors.line}` / `{colors.line-dark}`): Borders and section rules.

### Named Rules

**The One Accent Rule.** WeUI Forest Green is the only brand accent on a screen. Signal Amber is inspection-only (focus/selection), never a second marketing color.

**The Honest Mark Rule.** Project logos and the Hub mark stay true to source assets. Do not recolor, glow, or collage platform logos into the Hub mark.

## Typography

**Display Font:** Sora Variable (with PingFang SC / Microsoft YaHei / system-ui)
**Body Font:** Geist Variable (with PingFang SC / Microsoft YaHei / system-ui)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace)

**Character:** Sora carries confident product titles; Geist keeps long bilingual reading calm; Mono marks engineering metadata—eyebrows, indices, pills, language switches.

### Hierarchy

- **Display** (740, `clamp(2.125rem, 4vw, 4.5rem)` / 1.08): Hero wordmark titles such as the homepage `weapp.dev` or `weapp` lockup.
- **Page title** (700, `clamp(2.125rem, 6vw, 4rem)` / 1.12): Pricing, contributors, privacy, and 404 heroes (`pageTitle`).
- **Headline** (680, `clamp(2.125rem, 3vw, 2.75rem)` / 1.08): Section titles (`sectionTitle`).
- **Featured** (680, 2.125rem → 1.5rem on small screens): Featured project names in proof rows and compact banner titles.
- **Title** (660–680, 1.5rem): Card and dialog headings.
- **Wordmark** (720, 0.9375rem): Header/footer site-name lockup text.
- **Lead** (400, 1.125rem / 1.6): Marketing leads and hero description.
- **Body** (400, 1rem / 1.58): Running copy; keep readable measure near 40–65ch on marketing leads.
- **Small** (400, 0.875rem): Dense UI chrome, buttons, and demo controls.
- **Label** (650, 0.75rem / 1.4 mono): Eyebrows, rail indices, platform pills, footer group labels.

### Named Rules

**The Mono-Means-Meta Rule.** Geist Mono is for metadata and controls, not paragraphs. If it is a sentence, it is Geist Sans.

**The Balanced Head Rule.** Headings use `text-wrap: balance`; body uses `pretty`. Do not add letter-spacing tricks to display type.

## Layout

The shell is a centered rail: `max-width: 1240px`, horizontal inset `1.5rem` (desktop) / `1rem` (≤720px). Sections breathe with `7rem` vertical padding (`5rem` on small screens). Homepage project proof uses one project per row (copy + demo), not a three-column card grid. Dense index rails (three equal columns with hairline dividers) appear only as secondary navigation strips.

Breakpoints observed in the incumbent system: `720px` (phone), `900px` / `960px` (tablet nav collapse). Hero display type scales via clamp rather than discrete breakpoint steps. Sticky header is `64px` (`58px` on small screens) with `scroll-padding-top: 84px`.

**The Single-Target Row Rule.** Featured projects present as full-width rows with optional reversed demo/copy order. Do not revive the discarded three-column project card board.

## Elevation & Depth

Depth is tonal first. Most surfaces are flat panels separated by hairlines and soft/strong background steps. Shadows appear only when chrome floats above the page.

### Shadow Vocabulary

- **Floating panel** (`box-shadow: 0 24px 70px var(--shadow)`): Dropdown menus, mobile nav sheets, dialogs, and rare featured figures. Light shadow tint `rgb(25 60 45 / 12%)`; dark `rgb(0 0 0 / 34%)`.
- **Header veil** (`background: var(--header)` + `backdrop-filter: blur(24px)` equivalent via `backdrop-blur-xl`): Sticky header translucency; falls back to solid canvas when reduced transparency is requested.
- **Dialog scrim** (`rgb(5 13 9 / 72%)` + `blur(6px)`): Modal backdrop only.

### Named Rules

**The Flat-By-Default Rule.** Content cards and section blocks stay flat. If it is not floating UI chrome, it does not cast `shadow-panel`.

## Shapes

Corners stay modest and product-like: controls and pills at gently squared `6px`, larger panels/dialogs/media frames at `8px`, dense demo chrome sometimes `4px`. No pill-shaped primary buttons. The Hub mark is a fixed green superellipse with three white facets; do not invent alternate geometries.

Hairline borders (`1px solid` line token) define structure more often than fills. Focus rings are a `3px` Signal Amber outline with `3px` offset.

**The Small-Radius Rule.** Prefer 6–8px. Large squircles and fashion-soft 16–24px radii are out of system.

## Components

### Buttons

- **Shape:** Gently squared (`6px`), min-height `2.75rem`, padding `0.625rem 1rem`, weight 680.
- **Primary:** Brand fill + brand-contrast text; hover uses brand-hover; active translates `1px` down.
- **Secondary / Ghost:** Panel fill, hairline border, ink text; hover softens border toward muted and fills `panel-soft`.
- **Icon control:** `2.5rem` square, transparent by default, muted icon; hover `panel-soft` + ink.

### Chips

- **Platform pill:** Mono 11px, panel background, hairline border, `6px` radius—status/platform metadata only, not primary actions.

### Cards / Containers

- **Corner Style:** Panel radius (`8px`) for framed media and dialogs; many homepage content blocks are square-edged with hairline dividers instead.
- **Background:** Panel / panel-soft on canvas.
- **Shadow Strategy:** None at rest; floating chrome only (see Elevation).
- **Border:** Hairline line token.
- **Internal Padding:** Commonly `1.75rem` (`p-7`) on principle/commercial cards; denser rails use ~`1–1.3rem`.

### Inputs / Fields

Sparse on the marketing site. When present (demo controls, analytics dialog toggles), match control radius (`6px`), hairline borders, and Signal Amber focus. Do not introduce heavy Material-style underlines.

### Navigation

- Sticky translucent header with emblem + profile-selected site wordmark (Sora 15px / 720).
- Desktop links: 14px, weight 590, muted → ink on hover.
- Project dropdown / mobile sheet: panel surface, hairline, `shadow-panel`, soft row hover.
- Language and theme sit as icon controls; language exposes mono `EN` / `中` where space allows.

### Signature: Project proof row

Homepage project rows pair editorial copy with project proof under a shared `--project-accent`. The weapp-vite row in `HomeProjects` contains the interactive labs. Other rows use static proof cards with default markup, a build or install command, or planned capability boundaries. Each row exposes one primary docs CTA and one secondary details CTA.

### Signature: Interactive demos

Style / Build / Registry demos use an `8px` framed stage, mono headings, and tighter `4px` inner controls. They demonstrate toolchain behavior in the weapp-vite project row, selected through `HomeDemos`. The hero contains the site wordmark and project constellation; other project rows use static proof rather than repeating the labs.

## Do's and Don'ts

### Do:

- **Do** keep Chinese and English surfaces visually paired—same hierarchy, marks, and spacing.
- **Do** ship static-first: default content and demo output readable with JS disabled.
- **Do** use real project marks, metrics, and demos as proof.
- **Do** preserve light/dark token roles rather than inventing a third theme.
- **Do** honor reduced-motion and reduced-transparency by dropping reveal motion and header blur.

### Don't:

- **Don't** introduce a second brand accent or gradient wash across hero/marketing bands.
- **Don't** cast content-card drop shadows; reserve `shadow-panel` for floating chrome.
- **Don't** recolor the Hub mark or collage platform logos into it.
- **Don't** revive the three-column project card board.
- **Don't** fabricate testimonials, download counts, or sponsor proof in the visual layer.
