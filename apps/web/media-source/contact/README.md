# Contact assets

The maintainer supplied both original add-friend images on September 30, 2026:

- `public/contact/wechat-original.jpg`: WeChat, `SonOfMagic`.
- `public/contact/qq-original.jpg`: QQ, `1324318532` (also printed in the image).

The display images are lossless WebP crops at original resolution. They preserve
the QR marks, original colors and white quiet zones; no QR payload is regenerated.
With Sharp, extract `{ left: 70, top: 310, width: 680, height: 680 }` for WeChat and
`{ left: 20, top: 475, width: 900, height: 900 }` for QQ, then encode with
`.webp({ lossless: true, effort: 6 })`. The originals are retained byte for byte.

The two decorative SVG marks in `src/assets/contact/` are from
[Simple Icons](https://github.com/simple-icons/simple-icons), under CC0-1.0:

- `wechat.svg`: upstream `icons/wechat.svg`, blob `c3eb6c4a666f66fcda5df187936c5fee829d4ecb`.
- `tencentqq.svg`: upstream `icons/qq.svg`, blob `8690b359c7b19e5b623c08501f5916a8b4bb3765`.

Only the SVG accessibility attributes and fill were adapted: the contact control
provides its own localized accessible name, and the glyph follows `currentColor`.
The QR images always stay on white, including in dark mode.

Contact controls are rendered only for weapp.dev. The Pages preparation step
removes `contact/` from the weapp.js.org build output as well.
