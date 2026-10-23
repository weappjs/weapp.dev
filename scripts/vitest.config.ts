import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Exercise installed release tooling using its published Node exports.
  // ATTW's development export is raw TypeScript inside node_modules.
  plugins: [{
    name: 'published-node-exports',
    configResolved(config) {
      // Vitest appends development|production after user resolve.conditions.
      // Its native workers must use the same exports as the installed CLI.
      config.ssr.resolve!.conditions = ['node']
    },
  }],
  test: { include: ['scripts/**/*.test.mjs'] },
})
