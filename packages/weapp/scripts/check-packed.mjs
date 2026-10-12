import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Windows npm.cmd support on the minimum supported Node.
import spawn from 'cross-spawn'

const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = (await readdir(root)).filter(name => /^weapp-[\d.]+\.tgz$/.test(name))
assert.equal(artifacts.length, 1, 'Expected exactly one weapp publication artifact')
const target = await mkdtemp(join(tmpdir(), 'weapp-release-'))
try {
  const installed = spawn.sync('npm', ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', join(root, artifacts[0])], { cwd: target, encoding: 'utf8', timeout: 120000 })
  assert.equal(installed.status, 0, installed.stderr)
  const tested = spawn.sync(process.execPath, [fileURLToPath(new URL('./artifact-smoke.mjs', import.meta.url)), join(target, 'node_modules/weapp')], { cwd: target, encoding: 'utf8', timeout: 30000 })
  assert.equal(tested.status, 0, tested.stderr)
  process.stdout.write(tested.stdout)
}
finally {
  await rm(target, { recursive: true, force: true })
}
