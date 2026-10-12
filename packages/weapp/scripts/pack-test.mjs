import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Windows npm.cmd support on the minimum supported Node.
import spawn from 'cross-spawn'

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = await mkdtemp(join(tmpdir(), 'weapp-pack-'))
function execute(command, args, cwd = root) {
  const result = spawn.sync(command, args, { cwd, encoding: 'utf8', timeout: 120000 })
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message)
  return result.stdout
}
try {
  execute('pnpm', ['build'])
  const packed = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp]))[0]
  const paths = packed.files.map(file => file.path)
  for (const path of ['bin/weapp.js', 'dist/src/index.js', 'dist/data/catalog.json', 'dist/data/logo.json', 'dist/data/meta.json', 'dist/lab/index.html']) {
    assert.ok(paths.includes(path), `Missing published file: ${path}`)
  }
  assert.ok(!paths.some(path => path.startsWith('src/') || path.startsWith('test/') || path.startsWith('scripts/')))
  await readFile(join(temp, packed.filename))
  execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', join(temp, packed.filename)], temp)
  const smoke = execute(process.env.WEAPP_TEST_NODE || process.execPath, [fileURLToPath(new URL('./artifact-smoke.mjs', import.meta.url)), join(temp, 'node_modules/weapp')], temp)
  process.stdout.write(smoke)
  process.stdout.write(`Tarball verified outside the workspace: ${packed.filename}, ${packed.size} compressed bytes\n`)
}
finally {
  await rm(temp, { recursive: true, force: true })
}
