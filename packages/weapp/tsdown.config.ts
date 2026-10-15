import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'tsdown'
import { bundledDependencies, bundlePolicyPlugin } from './scripts/bundle-policy.ts'

export default defineConfig([
  {
    name: 'cli',
    entry: { cli: 'src/cli.ts', index: 'src/index.ts', terminal: 'src/terminal/session.ts' },
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outExtensions: () => ({ js: '.js' }),
    clean: false,
    dts: false,
    exports: false,
    deps: {
      neverBundle: true,
      alwaysBundle: id => Object.keys(bundledDependencies).some(name => id === name || id.startsWith(`${name}/`)),
      onlyBundle: Object.keys(bundledDependencies),
      onlyImport: ['open'],
    },
    plugins: [bundlePolicyPlugin()],
    outputOptions: { chunkFileNames: '[name]-[hash].js', comments: { legal: true } },
  },
  {
    name: 'lab',
    tsconfig: 'tsconfig.browser.json',
    entry: { app: 'lab/app.ts' },
    outDir: 'dist/lab',
    platform: 'browser',
    target: 'es2022',
    format: 'esm',
    outExtensions: () => ({ js: '.js' }),
    clean: false,
    dts: false,
    exports: false,
  },
  {
    name: 'artifact-smoke',
    entry: { 'artifact-smoke': 'scripts/artifact-smoke.ts' },
    outDir: '.cache/validation',
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outExtensions: () => ({ js: '.mjs' }),
    clean: true,
    dts: false,
    exports: false,
    // The validation runner is uploaded independently of the npm tarball.
    outputOptions: {
      banner: `/*! jsQR 1.4.0 - Apache-2.0 - https://github.com/cozmo/jsQR\n${readFileSync(createRequire(import.meta.url).resolve('jsqr/LICENSE'), 'utf8')}\n*/`,
    },
  },
])
