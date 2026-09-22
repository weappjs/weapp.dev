import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const browserChannel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  webServer: {
    // The CLI detaches in agent environments; Playwright needs a foreground server.
    command: `node --input-type=module -e "import { preview } from 'astro'; await preview({ server: { host: '127.0.0.1', port: 4321 } })"`,
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:4321',
    locale: 'zh-CN',
    ...(browserChannel ? { channel: browserChannel } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], locale: 'zh-CN' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], locale: 'zh-CN' } },
  ],
})
