# Shared site UI

Private Astro workspace package for the two independently composed websites. It owns HomeHero, HomeProjectRow, their particle renderer and demo controls, home styles, neutral class helpers and the clipboard fallback. Demo labels describe browser examples only; each app owns site and section copy.

HomeHero receives wordmark, overviewLabel, railLabel, locale, railGroups and constellation links. HomeProjectRow receives labels, detailsUrl, locale, public project data and metrics; no site-profile lookup occurs inside the package. The exported home-projects assembler joins an app-owned placement list to catalog facts without deciding service coverage.

Only project-catalog and third-party libraries may be dependencies. Never add pricing, contact information, sponsorship, fund content, application imports or deployment-target selection. The catalog must not depend on this package. App routes, layouts, navigation, SEO, analytics configuration, base theme tokens and service mappings stay local.

Consumers import explicit package exports and register their installed UI source directory with Tailwind. Both CI workflows validate this package. Changes here require both applications to pass their build and browser checks, including no-JavaScript and reduced-motion fallback.
