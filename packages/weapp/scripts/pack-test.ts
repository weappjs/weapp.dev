import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Windows npm.cmd support on the minimum supported Node.
import spawn from 'cross-spawn'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = await mkdtemp(join(tmpdir(), 'weapp-pack-'))
function execute(command: string, args: string[], cwd = root) {
  const result = spawn.sync(command, args, { cwd, encoding: 'utf8', timeout: 120000 })
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message)
  return result.stdout
}
try {
  execute('pnpm', ['build'])
  const result: unknown = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp]))
  assert.ok(Array.isArray(result) && result.length === 1, 'Expected one packed artifact')
  const packed: unknown = result[0]
  assert.ok(isRecord(packed) && typeof packed.filename === 'string' && typeof packed.size === 'number'
    && Array.isArray(packed.files), 'Valid npm pack metadata')
  const paths = packed.files.map((file: unknown) => {
    assert.ok(isRecord(file) && typeof file.path === 'string', 'Valid package file path')
    return file.path
  })
  for (const path of ['dist/cli.js', 'dist/index.js', 'dist/terminal.js', 'dist/lab/app.js', 'dist/data/catalog.json', 'dist/data/logo.json', 'dist/data/project-logos.json', 'dist/data/meta.json', 'dist/lab/index.html']) {
    assert.ok(paths.includes(path), `Missing published file: ${path}`)
  }
  assert.ok(!paths.some(path => path.startsWith('src/') || path.startsWith('test/') || path.startsWith('scripts/') || path.startsWith('bin/') || path.startsWith('dist/src/') || path.endsWith('.ts')))
  await readFile(join(temp, packed.filename))
  execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', join(temp, packed.filename)], temp)
  const smoke = execute(process.env.WEAPP_TEST_NODE || process.execPath, [fileURLToPath(new URL('../.cache/validation/artifact-smoke.mjs', import.meta.url)), join(temp, 'node_modules/weapp')], temp)
  process.stdout.write(smoke)
  process.stdout.write(`Tarball verified outside the workspace: ${packed.filename}, ${packed.size} compressed bytes\n`)
}
finally {
  await rm(temp, { recursive: true, force: true })
}
