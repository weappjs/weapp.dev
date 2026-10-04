# weapp-booking product page

Mode: Persuade. Routes: `/products/weapp-booking/` and `/en/products/weapp-booking/` in `apps/web` only.

Help a local-business owner or implementation team determine whether appointments and event registration fit their workflow, understand private deployment and licensing scope, and arrange a guided demo through the existing contact page.

Inherit the current commercial site's Geist typography, neutral light/dark surfaces, green actions, shared page shell, and spacious section rhythm. The incumbent visual reference is `docs/design/web-introduction.webp`, checked against the current shared styles. No new design tokens, product screenshots, customer evidence, or decorative media are introduced.

The page opens with the product purpose and pending external acceptance status. An ordered visit workflow explains the product, followed by semantic description lists for capabilities, delivery, deployment prerequisites, and licensing. One main action leads to the localized `/pricing/#contact` entry. Content is fully static and bilingual. The homepage and services page introduce the product through the same concise entry component.

Implementation and real-database checks are distinct from real WeChat/provider acceptance. The page must state that the product is not commercially released, and must not offer invented prices, online purchases, downloads, a public live demo, or active SaaS subscriptions.

Build and source isolation checks belong to this change. Browser, mobile, theme, and accessibility evidence are collected by the root task's designated browser owner; this implementation agent does not open a browser.
