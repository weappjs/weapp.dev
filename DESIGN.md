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
  canvas: "#ffffff"
  panel: "#ffffff"
  panel-soft: "#f5f5f7"
  panel-strong: "#e8e8ed"
  ink: "#1d1d1f"
  muted: "#626266"
  line: "#d2d2d7"
  canvas-dark: "#000000"
  panel-dark: "#111112"
  panel-soft-dark: "#1c1c1e"
  panel-strong-dark: "#29292c"
  ink-dark: "#f5f5f7"
  muted-dark: "#a1a1a6"
  line-dark: "#38383c"
typography:
  display:
    fontFamily: "Syne, sans-serif"
    fontSize: "clamp(4.25rem, 14vw, 11rem)"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  page:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 5rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4.5vw, 4rem)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  featured:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 3.5vw, 3.25rem)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 660
    lineHeight: 1.2
    letterSpacing: "normal"
  wordmark:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
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
  action:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Variable, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  control: "999px"
  panel: "20px"
  compact: "12px"
  demo-control: "4px"
spacing:
  shell-gutter: "1.5rem"
  shell-gutter-mobile: "1rem"
  shell-max: "1240px"
  section-y: "7rem"
  home-section-y: "6rem"
  grouped-section-y: "5rem"
  grouped-section-y-mobile: "3.5rem"
  section-y-mobile: "4rem"
  control-x: "1.5rem"
  control-y: "0.75rem"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-contrast}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1.5rem"
    height: "2.75rem"
    typography: "{typography.action}"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
    textColor: "{colors.brand-contrast}"
  button-secondary:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1.5rem"
    height: "2.75rem"
  icon-control:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "2.75rem"
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

**Creative North Star: "The Product Stage"**

The approved direction is an Apple product website-style presentation of real mini-program tools: large type, generous chapters, neutral surfaces, and clear green actions. The shared language supports two independent identities, weapp.dev and weapp.js.org. It borrows presentation principles, not Apple logos, proprietary fonts, product imagery, or private assets.

White and light gray alternate with black and dark gray. The original particle wordmark and project planets remain the recognizable opening; real demos, project assets, source links, and release data carry the product explanation. Both applications default to dark when no valid saved theme exists, then honor the saved light or dark choice in `weapp-theme`. This is not system-theme selection. Core content is visible before JavaScript or entrance observers run.

**Key Characteristics:**

- Neutral light and dark surfaces with green primary actions
- Geist display and body typography with Chinese system fallbacks
- Large headlines, spacious chapters, wide demos, and quiet information rows
- Pill actions and circular icon controls; rounded media and floating panels
- Independent application identities sharing neutral UI primitives
- Restrained particle motion and default-visible, static-first content

The normative token values above reflect `packages/site-ui/src/styles/foundation.css` and `classes.ts`; component-specific exceptions are described below. Application ownership is recorded in `apps/web/DESIGN.md` and `apps/open-source/DESIGN.md`. Homepage composition belongs to `.impeccable/surfaces/apple-product.md` and `docs/architecture/homepage.md`.

## Colors

The canvas is neutral, with one green action family and quiet tonal separation.

### Primary

- **Action Green** (`{colors.brand}` / `{colors.brand-on-dark}`): Primary actions and meaningful selected states. Use the corresponding hover and contrast tokens in each theme.
- **Hub Mark Green** (`{colors.hub-mark}`): The fixed emblem remains faithful to the supplied logo.

### Tertiary

- **Focus Amber** (`{colors.highlight}`): Visible keyboard focus and selection, not a second marketing accent.
- **Demo syntax**: Keyword and string colors remain confined to code demonstrations; they are not page-chrome accents.

### Neutral

- **White / Black Canvas** (`{colors.canvas}` / `{colors.canvas-dark}`): Page backgrounds.
- **Panel** (`{colors.panel}` / `{colors.panel-dark}`): Media, dropdowns, dialogs, and fields.
- **Soft Gray** (`{colors.panel-soft}` / `{colors.panel-soft-dark}`): Quiet chapter bands and secondary controls.
- **Strong Gray** (`{colors.panel-strong}` / `{colors.panel-strong-dark}`): Hover and nested tonal steps.
- **Ink**, **Muted Copy**, and **Hairline**: Primary reading, supporting text, and restrained structural boundaries respectively.

**The Action Color Rule.** Use green for primary actions and meaningful states; project marks and demo syntax retain their factual colors.

**The Honest Asset Rule.** Use actual project assets and evidence. Do not introduce Apple assets or fabricate customer, release, or performance proof.

## Typography

**Display Font:** Geist Variable, with PingFang SC, Microsoft YaHei, system-ui, and sans-serif fallbacks. The homepage particle wordmark alone uses self-hosted Syne 700 with -0.02em tracking; all reading typography retains Geist.
**Body Font:** The same Geist stack.
**Label/Mono Font:** Labels use Geist Sans; code and technical evidence use Geist Mono Variable with ui-monospace and monospace fallbacks.

One family gives Chinese and English pages a consistent reading rhythm. Headings use balanced wrapping and restrained negative tracking; paragraphs use pretty wrapping.

### Hierarchy

- **Display**: The oversized site wordmark on the black particle stage. Hero-specific responsive overrides reduce its size on tablet, mobile, and short screens.
- **Page**: Broad page titles, scaling from 40px to 80px; project detail titles have their own 36px lower bound.
- **Headline**: Chapter titles, scaling from 36px to 64px.
- **Featured**: Homepage project names, scaling from 30px to 52px. Directory names use a smaller 24–32px scale.
- **Title**: Compact headings and dialog titles.
- **Lead / Body / Small**: Readable prose and supporting UI. Long explanatory copy keeps a controlled measure rather than spanning the full shell.
- **Label**: Quiet sans-serif eyebrows and section metadata. Platform pills use smaller sans-serif text; technical values remain monospaced.

**The One Reading Voice Rule.** Use Geist for headings, prose, navigation, and labels. Reserve Geist Mono for code, commands, versions, and numerical evidence.

## Layout

The centered content shell is capped at 1240px with 24px gutters, reducing to 16px at 720px. General sections use 112px vertical spacing, homepage chapters 96px, and grouped project evidence 80px; phone chapters use 56–64px. Start/end groups adjust their top and bottom space to preserve continuity.

Project proof pairs copy and a real visual, with the interactive lab occupying a full-width row. Rows stack at 900px. Wide product chapters alternate with quiet bands, reference rows, and long-form detail. Desktop navigation changes to the mobile menu at 960px; the sticky header is 64px high and 58px on phones.

**The Chapter Rule.** Let headings, whitespace, broad demos, and information rows establish hierarchy; do not wrap every section in a card.

## Elevation & Depth

Neutral surface steps and whitespace carry most hierarchy. Floating dropdowns and dialogs use the shared panel shadow (`0 18px 48px var(--shadow)`); the light shadow is neutral black at 10% and the dark shadow at 34%. The translucent header uses the theme header surface and a 24px blur, with a solid fallback for reduced transparency. Modal backdrops use a dark scrim and 6px blur. Project planets retain their small internal shading as part of the existing signature.

**The Quiet Depth Rule.** Use neutral tonal steps for content hierarchy and shadows for floating navigation or dialogs.

## Shapes

Main actions are fully rounded pills, icon controls are circles, and large media, lab frames, dialogs, and flyouts use the panel radius (20px). Compact proof frames, native filter selects, and menu rows use 12px corners. Dense inner demo controls retain local 4–6px corners; these do not define the marketing interface. Information rows can remain unboxed with simple hairlines.

## Components

### Buttons

Calm, legible pill actions use a minimum 44px height, 24px horizontal and 12px vertical padding, and 14px semibold text. The primary uses the theme green and its contrast color; secondary actions use soft gray and ink, becoming strong gray on hover. Shared states transition over 200ms, with a 1px press offset. Keyboard focus uses the global amber outline (3px with 3px offset).

### Chips

Platform metadata uses small sans-serif text, a panel surface, hairline border, and full pill corners. Its visual role is supporting evidence, not a competing primary action.

### Cards / Containers

Wide demos and project media carry the evidence. Use the large panel radius for principal media and floating containers, and compact corners for smaller proof frames. Content surfaces remain flat; menu and dialog shadows communicate actual layering. Quiet chapter bands are allowed to span the viewport without an enclosing card.

### Inputs / Fields

Directory filters are native selects with 12px corners, a hairline border, panel fill, and at least 44px height. Their labels use small sans-serif text. Preserve native behavior, explicit labels, visible focus, and the disabled state (reduced opacity with a not-allowed cursor). Reset controls use pill corners.

### Navigation

The sticky translucent header combines the fixed Hub emblem with the application’s own wordmark. Desktop links use 14px medium text, muted at rest and ink on hover. Project dropdowns and mobile navigation use 20px panels and 12px rows. Language and theme controls use shared 44px circular targets. No runtime or deployment variable switches the application identity.

### Particle wordmark and project planets

The hero keeps the original wordmark and clickable project planets on a near-black stage in both themes. Grid and orbit lines are restrained and decorative glow is disabled. The opening shows a mini-program Logo drawn entirely from tiny particles against a dim static starfield. Once the font and WebGL are ready, the Logo holds for 700ms and morphs into the wordmark over 1500ms, then continues flowing within the actual wordmark silhouette. Project planets, their names, and the orbit fade in over the next 320ms using the same active clock. About one third of glyph particles move locally, with a 4px desktop / 1px mobile flow amplitude; their safe radius from the sampled glyph mask limits movement and preserves readable letter boundaries. Desktop pointer input creates a local response within a 120px radius, smooths contact and release, and keeps up to four trails that fade within 600ms. Links and animation controls do not trigger that pointer response. Drawing is capped at 60fps during desktop entrance or pointer interaction, 30fps during desktop idle, and 10fps at every stage below 1024px. Background stars continue after assembly with staggered 6–12-second brightness cycles bounded within ±25% of their starting light and 45–75-second slow drift. Rare soft star cores and fine rays remain subordinate to the Logo, wordmark and project entries. These effects use the same active clock, frame budgets and pause rules; finishing the wordmark does not freeze or restart the field. Each application supplies its own identity, labels, links, and project data to the neutral shared component.

At desktop widths of at least 1024px, planet visuals are 80px, reducing to 72px at 1024–1279px or viewport heights below 720px, and 64px at heights of 500px or less. A spotlight scales only the inner visual by 1.35, or 1.25 on the shortest screens, within a stable link target sized for the enlarged planet. A clear ring marks selection. Each planet has a neutral spherical body with a fixed upper-left highlight, lower-right shadow, and subtle project-color reflection that strengthens during selection. A separate opaque pale face preserves the original Logo colors. The dim ellipse has restrained near-side depth; selecting a planet also brightens a short arc at its current orbital position. Desktop planets use equal distances along the elliptical path to prevent crowding at its ends. Small project names remain visible outside the orbit, above its upper half and below its lower half; they share the orbit without expanding the circular link or intercepting its pointer input. The selected project's name and existing localized catalog tagline appear below the wordmark, switching to a compact horizontal layout on desktop screens no taller than 700px. A missing optional tagline leaves the name alone. Official links, original logos, analytics attributes, visible keyboard focus, and stable accessible purpose descriptions remain intact.

The independent shared planet controller starts a desktop spotlight 3 seconds after the wordmark is assembled and the hero is visible, holds it for 4 seconds, then waits another 3 seconds before advancing through the existing ten-project order. Only one planet is selected at a time, and its spotlight pauses the entire orbit while particle flow continues. The selected arc follows the stable native link center: show immediate feedback, then remeasure after the actual CSS orbit animation's `Animation.ready` confirms its paused position. Selection changes and disconnect invalidate that deferred measurement. Keyboard focus takes priority over hover, followed by automatic selection. Ending manual interaction restarts the 3-second delay without changing the fair automatic order. The lower-right pause/resume button controls all hero animation, with a minimum 44px target, a localized action label ("Pause hero animation" / "Resume hero animation"), a pressed state, and a matching pause/play icon. On mobile it is a 44px icon control with the full accessible action name. User pause freezes particle phase and orbit, holds the current automatic selection, and survives component reconnection; resume clears automatic selection and restarts its delay. Automatic selection never moves focus or announces caption changes.

The first HTML frame displays a deterministic inline SVG particle Logo and low-brightness starfield, with an accessible but visually hidden brand H1. The Logo uses 900 tiny points below 720px and 2400 otherwise, generated offline from the canonical outline with a fixed seed, 7 viewBox-pixel contour clearance and at least 0.5 viewBox-pixel separation between source discs. The mobile set is a uniform prefix of the same cloud. Jade (#71d6ae), ice blue (#87bdec), champagne (#f2c28a), and pearl (#d7e8e5) give the cloud a restrained cool/warm range: jade favors the lower mark, blue the upper right, and champagne the upper left, with indexed variation avoiding solid bands. Three existing size and brightness levels remain intact. About 5–6% of source points are fine four-point stars whose tips stay within the original source discs. Points are grouped by color, size, light, and shape into independent-point paths rather than a filled silhouette; non-overlap preserves source brightness across the additive GL handoff. SSR and WebGL use one shared palette and identical circle/star geometry, and smoothly blend source color and shape into the existing wordmark sprites. Source shapes scale with their interpolated sprites during morphing rather than clipping against a smaller target quad. SSR and WebGL share the Logo point source, rendered size and center, and the normalized background-star positions, sizes and brightness. Only a successful first GL draw hides both static layers, so font loading and renderer failure never create a blank or duplicate foreground. The renderer uses the neutral stage anchor for the brand center and the actual SVG Logo bounds for source size. The Syne Latin 700 WOFF2 from @fontsource/syne 5.3.0 is preloaded only on homepage routes and ships with its OFL license. Wait up to 3 seconds for an actual loaded Syne FontFace before sampling; failure or timeout retains the static particle Logo and starfield for that mount, and late font completion never changes the picture. Async startup is canceled on disconnect, does not advance active time, and reads current pause and reduced-motion state. DOM and Canvas share -0.02em tracking; fit and center actual ink bounds, including dots and descenders, within the orbit with at least 16px clearance. The absolute stage has an explicit height. A separate track owns the desktop ellipse dimensions and defines the motion-path center using its rx/ry lengths. Desktop reserves a permanent 64px bottom strip. Once assembled, captions sit below the measured wordmark; screens at most 700px tall use the bottom strip to keep the orbit clear.

The shared hero phase is logo, assembling, or ready. After successful startup, logo lasts through the first 700 active milliseconds, assembling continues until 2200ms, and ready begins at 2200ms. Planet reveal finishes at 2520ms; desktop automatic spotlight timing starts from ready, not from the end of the fade. Only successful GL drawing advances the animated phase. Before ready, planets, labels, orbit and captions are invisible, planet links are inert and absent from the accessibility tree, and automatic spotlight timing and orbit animation are stopped. The pause button works independently during font loading. At ready, native project links become available and the 320ms reveal follows active particle time, so pause, offscreen and background states freeze the reveal as well. No separate animation loop is created.

Offscreen, background, reduced-motion, and non-desktop states cancel automatic timing and clear automatic selection; eligible re-entry begins a fresh 3-second delay without catching up. Offscreen, background, reduced-motion, and user pause also stop particle scheduling and its active clock. Resume continues the same phase without replaying assembly or counting hidden wall-clock time; a paused resize may draw one static frame to fit the stage. Disconnect removes timers, observers, listeners, and GL resources while retaining elapsed time for reconnection. Live reduced-motion changes clear the canvas and immediately reveal the static particle Logo and starfield, hiding the animated wordmark, planets, captions and animation control. Turning reduced motion off resumes the saved phase after a valid draw. Below 1024px, revealed planets retain 44px phone / 52px tablet sizes with no automatic spotlight or caption. WebGL failure, font failure or timeout, and no JavaScript keep the static particle Logo and starfield in the central stage; orbital links remain hidden and inert. The accessible H1 and project links in the rail below remain available in every fallback state.

### Project proof and interactive demos

Project rows retain actual documentation links, source references, metrics, and scope boundaries. The weapp-vite row contains the Style / Build / Registry demos in a wide 20px frame. Other projects use factual static proof or explicitly planned capability boundaries. Do not turn the demo’s syntax palette or compact inner controls into the page design language.

### Entrance motion

Content remains visible before observers run. The optional chapter entrance is a short 8px translation over 420ms with `cubic-bezier(0.16, 1, 0.3, 1)`; reduced-motion users receive the immediate state.

**The Visible Content Rule.** Entrance motion enhances content that is already visible; JavaScript, observers, and animation must not gate reading or navigation.

## Do's and Don'ts

### Do:

- **Do** pair Chinese and English with the same hierarchy, spacing, and real project assets.
- **Do** preserve the dark default and explicit saved theme selection in each application.
- **Do** keep core content, links, and default demo output usable without JavaScript.
- **Do** keep primary actions and shared icon controls at least 44px high.
- **Do** honor reduced motion, reduced transparency, visible focus, and narrow screens.
- **Do** preserve each application’s fixed identity and ownership of page composition.

### Don't:

- **Don't** restore the Build Lens, sage canvas, Sora display type, or a system-wide small squared radius rule.
- **Don't** make every chapter a card or add decorative marketing gradients and glows.
- **Don't** hide ordinary content until a reveal observer or animation completes.
- **Don't** use private Apple assets, recolor project marks, or invent product evidence.
- **Don't** infer commercial service availability from catalog membership or project maturity.
