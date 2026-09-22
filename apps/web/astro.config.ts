import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { getSiteProfile, isRetiredOpenSourcePath } from './src/lib/deployment'

const cssEntry = fileURLToPath(new URL('./src/styles/global.css', import.meta.url))
const site = getSiteProfile()

export default defineConfig({
  site: site.origin,
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
      filter: page => !page.includes('/404') && (site.features.sponsorship || !isRetiredOpenSourcePath(new URL(page).pathname)),
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
    experimental: {
      // Dynamic import preloads must work under a GitHub Pages repository path too.
      renderBuiltUrl: site.target === 'github-pages' ? () => ({ relative: true }) : undefined,
    },
    define: {
      'process.env.WEAPP_DEPLOY_TARGET': JSON.stringify(process.env.WEAPP_DEPLOY_TARGET ?? ''),
    },
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
