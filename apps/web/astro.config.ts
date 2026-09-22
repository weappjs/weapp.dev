import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { getBuildOutputDir, isGithubPagesBuild } from './src/lib/deployment'

const cssEntry = fileURLToPath(new URL('./src/styles/global.css', import.meta.url))

export default defineConfig({
  site: 'https://weapp.dev',
  outDir: `./${getBuildOutputDir()}`,
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
    experimental: {
      // Dynamic import preloads must work under a GitHub Pages repository path too.
      renderBuiltUrl: isGithubPagesBuild() ? () => ({ relative: true }) : undefined,
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
