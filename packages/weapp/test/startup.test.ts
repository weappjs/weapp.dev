import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
let directory: string
let loader: string
let preload: string
let hallHarness: string

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-startup-'))
  loader = path.join(directory, 'guard-loader.mjs')
  preload = path.join(directory, 'guard-data.mjs')
  hallHarness = path.join(directory, 'hall.mjs')
  await Promise.all([
    writeFile(loader, `
      const denied = new Set(JSON.parse(process.env.WEAPP_TEST_DENIED_IMPORTS || '[]'));
      const allowedFeatures = new Set(JSON.parse(process.env.WEAPP_TEST_ALLOWED_FEATURES || '[]'));
      export async function resolve(specifier, context, next) {
        if (denied.has(specifier.replace(/^node:/, ''))) {
          throw new Error('Startup loaded an unrelated module: ' + specifier);
        }
        const result = await next(specifier, context);
        const filename = result.url.split('/').at(-1);
        const feature = filename.match(/^(catalog|create|doctor|lab|palette|qr|terminal|session)(?:-[\\w-]+)?\\.js$/)?.[1];
        if (feature && !allowedFeatures.has(feature)) {
          throw new Error('Startup loaded an unrelated feature: ' + feature);
        }
        return result;
      }
    `),
    writeFile(preload, `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.readFile;
      fs.readFile = function (file, ...args) {
        const name = String(file).replaceAll('\\\\', '/');
        if (process.env.WEAPP_TEST_ALLOW_VISUAL !== '1' && /\\/data\\/(?:logo|catalog)\\.json$/.test(name)
          && !(process.env.WEAPP_TEST_ALLOW_CATALOG === '1' && name.endsWith('/catalog.json'))) {
          throw new Error('Startup read unrelated data: ' + name);
        }
        return original.call(this, file, ...args);
      };
      syncBuiltinESMExports();
    `),
    writeFile(hallHarness, `
      import { PassThrough } from 'node:stream';
      import { runCli } from ${JSON.stringify(pathToFileURL(path.join(path.dirname(cli), 'index.js')).href)};
      const input = new PassThrough();
      input.isTTY = true;
      input.setRawMode = () => {};
      const output = {
        isTTY: true, columns: 100, rows: 30,
        write(value) {
          process.stdout.write(value);
          if (value.includes('WORKBENCH')) setImmediate(() => input.emit('keypress', 'q', { name: 'q' }));
          return true;
        },
      };
      process.exitCode = await runCli(['--lang', 'en', '--no-motion'], {
        stdin: input, stdout: output, interactive: true, color: false,
      });
    `),
  ])
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

function guarded(args: string[], { catalog = false, execution = false, hall = false } = {}) {
  const feature = catalog ? 'catalog' : args[0]
  return spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(loader).href, '--import', pathToFileURL(preload).href, ...(hall ? [hallHarness] : [cli, ...args])], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WEAPP_TEST_ALLOW_CATALOG: catalog ? '1' : '0',
      WEAPP_TEST_ALLOW_VISUAL: hall ? '1' : '0',
      WEAPP_TEST_ALLOWED_FEATURES: JSON.stringify(hall ? ['terminal', 'session', 'catalog'] : args.includes('--help') ? [] : [feature]),
      WEAPP_TEST_DENIED_IMPORTS: JSON.stringify(['open', 'http', 'https', ...(hall ? [] : ['readline']), ...(execution ? [] : ['child_process'])]),
    },
  })
}

describe('fresh-process command loading boundaries', () => {
  it('opens the hall without importing scaffold execution, QR, diagnostics, the lab or browser launching', () => {
    const result = guarded([], { hall: true })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('WORKBENCH')
    expect(result.stdout).toContain('Create with weapp-vite')
  })

  it.each([['--help'], ['--version'], ['create', '--help'], ['play', '--help']].map(args => ({ args })))('keeps $args independent of terminal, execution and visual data', ({ args }) => {
    const result = guarded(args)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.length).toBeGreaterThan(0)
  })

  it('reports an invalid option through the lightweight error path', () => {
    const result = guarded(['--unknown', '--lang', 'en'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown option: --unknown')
    expect(result.stderr).not.toMatch(/unrelated (?:module|data)/)
  })

  it.each([['palette', '#07c160', '--json'], ['qr', 'https://weapp.js.org/']].map(args => ({ args })))('runs $args without loading the catalog, Logo or terminal', ({ args }) => {
    const result = guarded(args)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.length).toBeGreaterThan(0)
  })

  it.each([['projects', '--json'], ['info', 'weapp-vite', '--json'], ['docs', 'weapp-vite']].map(args => ({ args })))('loads only catalog data for $args', ({ args }) => {
    const result = guarded(args, { catalog: true })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.length).toBeGreaterThan(0)
  })

  it('previews an explicit creation without loading the terminal or visual data', () => {
    const result = guarded(['create', 'weapp-vite', 'new-project', '--dry-run', '--lang', 'en'], { execution: true })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('create-weapp-vite@latest')
  })

  it('diagnoses a missing directory without loading visual data', () => {
    const result = guarded(['doctor', 'missing-project', '--json'], { execution: true })
    expect(result.status, result.stderr).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false })
    expect(result.stderr).not.toMatch(/unrelated (?:module|data)/)
  })
})
