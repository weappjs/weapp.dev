import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { getSiteProfile } from './src/lib/deployment'

const cssEntry = fileURLToPath(new URL('./src/styles/global.css', import.meta.url))
const site = getSiteProfile()

export default defineConfig({
  site: site.origin,
  publicDir: './.cache/public',
  outDir: `./${site.outputDir}`,
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      filter: page => !page.includes('/404'),
      i18n: {
        defaultLocale: 'zh-CN',
        locales: {
          'zh-CN': 'zh-CN',
          'en': 'en-US',
        },
      },
    }),
  ],
  vite: {
    plugins: [
      ...(WeappTailwindcss({
        generator: {
          target: 'web',
        },
        cssEntries: [cssEntry],
      }) ?? []),
    ],
  },
})
