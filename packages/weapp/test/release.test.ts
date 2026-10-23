import { readFileSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bundledDependencies, bundleReportPath, noticesPath, thirdPartyNotices, validateBundleCode, validatePublishedBundle } from '../scripts/bundle-policy.js'
import {
  PreflightError,
  requiredPaths,
  validateBuiltVersion,
  validateManifest,
  validatePaths,
} from '../scripts/preflight.js'

const rawManifest: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const manifest = validateManifest(rawManifest)
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function changed(path: string, value: unknown): Record<string, unknown> {
  const cloned: unknown = structuredClone(rawManifest)
  if (!isRecord(cloned)) {
    throw new Error('Publication fixture must be an object')
  }
  let cursor = cloned
  const keys = path.split('.')
  for (const key of keys.slice(0, -1)) {
    const next = cursor[key]
    if (isRecord(next)) {
      cursor = next
    }
    else {
      const child: Record<string, unknown> = {}
      cursor[key] = child
      cursor = child
    }
  }
  cursor[keys[keys.length - 1]] = value
  return cloned
}
describe('weapp publication identity and artifact boundaries', () => {
  it('accepts only the public weapp package with the intended repository and minimum Node', () => {
    expect(validateManifest(rawManifest)).toEqual({
      name: 'weapp',
      version: manifest.version,
    })
    // repoctl normalizes a snapshot's npm registry URL with a root slash.
    for (const registry of [undefined, 'https://registry.npmjs.org', 'https://registry.npmjs.org/']) {
      expect(validateManifest(changed('publishConfig.registry', registry))).toEqual(manifest)
    }
    for (const [path, value] of [
      ['name', '@weapp-io/site-ui'],
      ['private', true],
      ['type', 'commonjs'],
      ['version', 'v0.1.0'],
      ['version', 'main'],
      ['repository.url', 'git+https://github.com/sonofmagic/weapp.dev.git'],
      ['repository.directory', 'packages/not-weapp'],
      ['repository.type', 'svn'],
      ['publishConfig.access', 'restricted'],
      ['publishConfig.registry', 'https://registry.example.test'],
      ['publishConfig.registry', 'http://registry.npmjs.org/'],
      ['publishConfig.registry', 'https://registry.npmjs.org/private/'],
      ['publishConfig.registry', 'https://user@registry.npmjs.org/'],
      ['publishConfig.registry', 'https://registry.npmjs.org/?registry=other'],
      ['publishConfig.registry', false],
      ['publishConfig.registry', ''],
      ['engines.node', '>=20'],
      ['engines.node', '>=16'],
      ['engines.node', 'invalid'],
      ['bin.weapp', '../bin/weapp.js'],
      ['dependencies.local', 'workspace:*'],
      ['dependencies.qrcode', '1.5.4'],
      ['optionalDependencies.extra', '1.0.0'],
      ['peerDependencies.extra', '1.0.0'],
      ['bundledDependencies', ['qrcode']],
      ['bundleDependencies', true],
      ['optionalDependencies.local', 'file:../local'],
      ['peerDependencies.@weapp-io/catalog', '*'],
    ] satisfies [string, unknown][]) {
      expect(() => validateManifest(changed(path, value)), path).toThrow(
        PreflightError,
      )
    }
  })

  it('requires runtime data, lab fonts and licenses, and rejects path leaks', () => {
    expect(() => validatePaths([...requiredPaths])).not.toThrow()
    for (const required of requiredPaths) {
      expect(
        () => validatePaths(requiredPaths.filter(path => path !== required)),
        required,
      ).toThrow(`missing published resource: ${required}`)
    }
    for (const extra of [
      '../secret',
      '/absolute',
      'dist\\secret',
      'test/unit.js',
      'src/index.js',
      'scripts/publish.js',
      'dist/qrcode.d.ts',
      'dist/src/qr.js',
      '.env',
      'dist/.env.production',
      'node_modules/private/index.js',
    ]) {
      expect(() => validatePaths([...requiredPaths, extra]), extra).toThrow(
        PreflightError,
      )
    }
  })

  it('rejects external module leaks in both ESM and generated CommonJS calls', () => {
    expect(() => validateBundleCode(`import open from 'open'; import fs from 'node:fs'; await import('./create.js'); const req = createRequire(import.meta.url); req('node:path');`, 'cli.js')).not.toThrow()
    expect(() => validateBundleCode(`// require('pngjs')\nconst example = "import('qrcode')"; require_qrcode();`, 'cli.js')).not.toThrow()
    for (const code of [
      `import QRCode from 'qrcode'`,
      `export { default } from 'semver/functions/valid.js'`,
      `await import('string-width')`,
      `__cjs_require('pngjs')`,
      `require$1('yargs')`,
      `require.resolve('cross-spawn')`,
      `const load = createRequire(import.meta.url); load('dijkstrajs')`,
      `require(process.env.MODULE)`,
      `await import('../outside.js')`,
    ]) {
      expect(() => validateBundleCode(code, 'cli.js'), code).toThrow()
    }
  })

  it('ships the actual bundled dependency licenses and validates built chunk bytes', async () => {
    const notices = await thirdPartyNotices()
    expect(notices.packages.map(dependency => dependency.name).sort()).toEqual(Object.keys(bundledDependencies).sort())
    expect(notices.text).toContain('Copyright (c) 2009 Kazuhiko Arase')
    expect(notices.text).toContain('Copyright (c) 2011 Ryan Day')
    expect(notices.text).toContain('Wyatt Baldwin')
    expect(notices.packages.find(dependency => dependency.name === 'semver')?.license).toBe('ISC')
    await expect(validatePublishedBundle(fileURLToPath(new URL('../dist/', import.meta.url)))).resolves.toBeUndefined()
  })

  it('rejects a published artifact whose licenses, chunk bytes, or dependency inventory drift', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'weapp-bundle-guard-'))
    try {
      await cp(fileURLToPath(new URL('../dist/', import.meta.url)), directory, { recursive: true })
      const filename = join(directory, noticesPath)
      const notices = await readFile(filename, 'utf8')
      await writeFile(filename, `${notices}\nchanged`)
      await expect(validatePublishedBundle(directory)).rejects.toThrow('licenses changed')
      await writeFile(filename, notices)
      const entry = join(directory, 'cli.js')
      const code = await readFile(entry, 'utf8')
      await writeFile(entry, `${code}\n`)
      await expect(validatePublishedBundle(directory)).rejects.toThrow('bundle changed')
      await writeFile(entry, code)
      const report: unknown = JSON.parse(await readFile(join(directory, bundleReportPath), 'utf8'))
      expect(report).toHaveProperty('packages')
      if (typeof report !== 'object' || report === null || !('packages' in report) || !Array.isArray(report.packages)) {
        throw new Error('Expected built bundle report')
      }
      report.packages.pop()
      await writeFile(join(directory, bundleReportPath), JSON.stringify(report))
      await expect(validatePublishedBundle(directory)).rejects.toThrow('inventory differs')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accepts stable and nightly artifacts only when their built version matches the manifest', () => {
    for (const version of ['0.3.0', `0.4.0-snapshot.nightly.c${'a'.repeat(40)}.b${'b'.repeat(64)}`]) {
      const identity = validateManifest(changed('version', version))
      expect(() => validateBuiltVersion({ version }, identity)).not.toThrow()
      for (const metadata of [null, {}, { version: '0.2.0' }, { version: 3 }]) {
        expect(() => validateBuiltVersion(metadata, identity)).toThrow('rebuild after versioning')
      }
    }
  })
})
