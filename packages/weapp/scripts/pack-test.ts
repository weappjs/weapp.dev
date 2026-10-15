import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Windows npm.cmd support on the minimum supported Node.
import spawn from 'cross-spawn'
import { bundledDependencies, validatePublishedBundle } from './bundle-policy.js'
import { validateManifest, validatePaths } from './preflight.js'

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
    && typeof packed.unpackedSize === 'number' && Array.isArray(packed.files), 'Valid npm pack metadata')
  const paths = packed.files.map((file: unknown) => {
    assert.ok(isRecord(file) && typeof file.path === 'string', 'Valid package file path')
    return file.path
  })
  validatePaths(paths)
  assert.ok(!paths.some(path => path.startsWith('src/') || path.startsWith('test/') || path.startsWith('scripts/') || path.startsWith('bin/') || path.startsWith('dist/src/') || path.endsWith('.ts')))
  await readFile(join(temp, packed.filename))
  execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', join(temp, packed.filename)], temp)
  const installedRoot = join(temp, 'node_modules/weapp')
  validateManifest(JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8')) as unknown)
  await validatePublishedBundle(join(installedRoot, 'dist'))
  const tree: unknown = JSON.parse(execute('npm', ['ls', '--all', '--omit=dev', '--json'], temp))
  const installed = new Set<string>()
  const installedVersions = new Set<string>()
  function inspectDependencies(value: unknown): void {
    assert.ok(isRecord(value), 'Valid installed dependency tree')
    if (isRecord(value.dependencies)) {
      for (const [name, dependency] of Object.entries(value.dependencies)) {
        assert.ok(name !== 'pngjs' && name !== 'yargs' && !Object.hasOwn(bundledDependencies, name), `Bundled or unused package installed at runtime: ${name}`)
        assert.ok(isRecord(dependency) && typeof dependency.version === 'string', `Valid installed dependency version: ${name}`)
        installed.add(name)
        installedVersions.add(`${name}@${dependency.version}`)
        inspectDependencies(dependency)
      }
    }
  }
  inspectDependencies(tree)
  assert.ok(installed.has('open'), 'Platform browser launcher must remain installed')
  const runtimes = process.env.WEAPP_TEST_NODES?.split(delimiter).filter(Boolean) || [process.env.WEAPP_TEST_NODE || process.execPath]
  assert.ok(runtimes.length, 'At least one artifact validation runtime is required')
  for (const runtime of runtimes) {
    const smoke = execute(runtime, [fileURLToPath(new URL('../.cache/validation/artifact-smoke.mjs', import.meta.url)), join(temp, 'node_modules/weapp')], temp)
    process.stdout.write(smoke)
  }
  let installedBytes = 0
  let installedFiles = 0
  async function countFiles(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = join(directory, entry.name)
      if (entry.isDirectory()) {
        await countFiles(filename)
      }
      else if (entry.isFile()) {
        installedBytes += (await stat(filename)).size
        installedFiles++
      }
    }
  }
  await countFiles(join(temp, 'node_modules'))
  const externalVersions = [...installedVersions].filter(dependency => !dependency.startsWith('weapp@')).length
  process.stdout.write(`Tarball verified outside the workspace: ${packed.filename}, ${packed.size} compressed bytes, ${packed.unpackedSize} unpacked bytes, ${installed.size - 1} external package names / ${externalVersions} external package versions, ${installed.size} total package names / ${installedVersions.size} total package versions including weapp, ${installedFiles} installed files / ${installedBytes} file bytes\n`)
}
finally {
  await rm(temp, { recursive: true, force: true })
}
