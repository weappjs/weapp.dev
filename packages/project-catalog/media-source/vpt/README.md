# VPT project media

The logo and screenshots come from [sep2/vite-plugin-taro](https://github.com/sep2/vite-plugin-taro/tree/9a060a23181351da64c2db8c65aa13391c02e42f), licensed under MIT. No generated product UI is used.

- `public/brands/vpt.svg`: unchanged copy of `docs/public/brand/vpt-mark.svg`. Preserve its proportions and transparent background per the upstream brand guidelines.
- `public/media/projects/vpt-hmr-before.{webp,avif}`: frame at 4 seconds of `docs/public/vpt-hmr-demo.mp4`, resized to 1280 × 1046. The counter is at 5 before the heading edit.
- `public/media/projects/vpt-hmr-after.{webp,avif}`: frame at 10 seconds of the same video, cropped to the simulator content at `left: 1226, top: 250, width: 734, height: 1000`. The heading now reads `Hello`; the counter is still 5.

These stills document the upstream demonstration, not a new runtime verification. They are separate from the existing `media:generate` inputs and do not add a video-processing dependency to normal builds.

## Reproduce

With the upstream repository checked out at the commit above and FFmpeg installed, run from `apps/web`:

```bash
export VPT_SOURCE=/path/to/vite-plugin-taro
export VPT_MEDIA_TMP=$(mktemp -d)
cp "$VPT_SOURCE/docs/public/brand/vpt-mark.svg" public/brands/vpt.svg
ffmpeg -hide_banner -loglevel error -ss 4 -i "$VPT_SOURCE/docs/public/vpt-hmr-demo.mp4" -frames:v 1 "$VPT_MEDIA_TMP/before.png"
ffmpeg -hide_banner -loglevel error -ss 10 -i "$VPT_SOURCE/docs/public/vpt-hmr-demo.mp4" -frames:v 1 "$VPT_MEDIA_TMP/after.png"
pnpm exec node --input-type=module <<'NODE'
import sharp from 'sharp'

const before = sharp(`${process.env.VPT_MEDIA_TMP}/before.png`).resize({ width: 1280 })
const after = sharp(`${process.env.VPT_MEDIA_TMP}/after.png`).extract({ left: 1226, top: 250, width: 734, height: 1000 })
for (const [name, image] of [['before', before], ['after', after]]) {
  await image.clone().webp({ quality: 82, effort: 5 }).toFile(`public/media/projects/vpt-hmr-${name}.webp`)
  await image.clone().avif({ quality: 55, effort: 5 }).toFile(`public/media/projects/vpt-hmr-${name}.avif`)
}
NODE
```
