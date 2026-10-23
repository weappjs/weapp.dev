import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line e18e/ban-dependencies -- Windows npm.cmd support on the minimum supported Node.
import spawn from 'cross-spawn'
// eslint-disable-next-line e18e/ban-dependencies -- Match the npm-compatible engine/version checks used by official scaffolds.
import semver from 'semver'
import { projectLogoFiles } from '../lab/project-logos.js'
import { bundleReportPath, noticesPath, validatePublishedBundle } from './bundle-policy.js'

const registry = 'https://registry.npmjs.org'
const repository = 'weappjs/weapp.dev'
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
export interface PackageIdentity {
  name: 'weapp'
  version: string
}
export interface PreflightOptions {
  argv?: string[]
  env?: NodeJS.ProcessEnv
  log?: (message: string) => unknown
}
export const requiredPaths = Object.freeze([
  'package.json',
  'README.md',
  'dist/cli.js',
  'dist/index.js',
  'dist/terminal.js',
  `dist/${noticesPath}`,
  `dist/${bundleReportPath}`,
  'dist/data/catalog.json',
  'dist/data/logo.json',
  'dist/data/project-logos.json',
  'dist/data/meta.json',
  'dist/lab/index.html',
  'dist/lab/style.css',
  'dist/lab/app.js',
  'dist/lab/syne-latin-700-normal.woff2',
  'dist/lab/geist-latin-wght-normal.woff2',
  'dist/lab/OFL-Syne.txt',
  'dist/lab/OFL-Geist.txt',
  'dist/lab/logos/ATTRIBUTION.md',
  ...Object.values(projectLogoFiles).map(file => `dist/lab/logos/${file}`),
])

export class PreflightError extends Error {
  readonly stage: string
  readonly status: number | undefined

  constructor(stage: string, reason: string, status?: number) {
    super(
      `${stage}: ${reason}${Number.isInteger(status) ? ` (HTTP ${status})` : ''}`,
    )
    this.name = 'PreflightError'
    this.stage = stage
    this.status = status
  }
}

function requireCheck(condition: unknown, stage: string, reason: string): asserts condition {
  if (!condition) {
    throw new PreflightError(stage, reason)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
}
export function validateManifest(manifest: unknown): PackageIdentity {
  const stage = 'manifest'
  requireCheck(
    isRecord(manifest) && manifest.name === 'weapp',
    stage,
    'package name must be weapp',
  )
  requireCheck(
    typeof manifest.version === 'string'
    && semver.valid(manifest.version) === manifest.version,
    stage,
    'version must be a canonical semver',
  )
  requireCheck(manifest.private !== true, stage, 'package must be publishable')
  requireCheck(manifest.type === 'module', stage, 'package must use ESM')
  requireCheck(
    isRecord(manifest.repository)
    && manifest.repository.type === 'git'
    && manifest.repository.url === `git+https://github.com/${repository}.git`
    && manifest.repository.directory === 'packages/weapp',
    stage,
    'repository identity must match weappjs/weapp.dev/packages/weapp',
  )
  requireCheck(
    isRecord(manifest.publishConfig) && manifest.publishConfig.access === 'public',
    stage,
    'publication access must be public',
  )
  requireCheck(
    manifest.publishConfig.registry === undefined
    || manifest.publishConfig.registry === registry
    || manifest.publishConfig.registry === `${registry}/`,
    stage,
    'publication registry must be npmjs.org',
  )
  requireCheck(
    isRecord(manifest.bin) && manifest.bin.weapp === 'dist/cli.js',
    stage,
    'weapp executable must be dist/cli.js',
  )
  requireCheck(
    isRecord(manifest.engines)
    && typeof manifest.engines.node === 'string'
    && semver.satisfies('18.0.0', manifest.engines.node)
    && semver.gte(semver.minVersion(manifest.engines.node) || '0.0.0', '18.0.0'),
    stage,
    'Node engines must support Node 18 and require at least Node 18',
  )
  for (const kind of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const dependencies = manifest[kind]
    requireCheck(dependencies === undefined || isRecord(dependencies), stage, 'published dependencies must be objects')
    requireCheck(
      Object.entries(dependencies || {}).every(
        ([name, value]) =>
          !name.startsWith('@weapp-io/')
          && typeof value === 'string'
          && !/^(?:workspace:|file:|link:)/.test(value),
      ),
      stage,
      'published dependencies must not require the private workspace',
    )
  }
  requireCheck(
    isRecord(manifest.dependencies)
    && Object.keys(manifest.dependencies).join() === 'open'
    && typeof manifest.dependencies.open === 'string'
    && Object.keys(manifest.optionalDependencies || {}).length === 0
    && Object.keys(manifest.peerDependencies || {}).length === 0
    && (!manifest.bundledDependencies || (Array.isArray(manifest.bundledDependencies) && manifest.bundledDependencies.length === 0))
    && (!manifest.bundleDependencies || (Array.isArray(manifest.bundleDependencies) && manifest.bundleDependencies.length === 0)),
    stage,
    'open must be the only external runtime dependency; other runtime code must be bundled',
  )
  return { name: manifest.name, version: manifest.version }
}

export function validatePaths(paths: unknown): void {
  requireCheck(
    isStringArray(paths)
    && paths.every(
      path =>
        typeof path === 'string'
        && !path.startsWith('/')
        && !path.includes('\\')
        && !path.split('/').includes('..'),
    ),
    'artifact',
    'tarball contains an unsafe path',
  )
  for (const path of requiredPaths) {
    requireCheck(
      paths.includes(path),
      'artifact',
      `missing published resource: ${path}`,
    )
  }
  requireCheck(
    !paths.some(
      path =>
        /^(?:src|scripts|test|lab|node_modules)\//.test(path)
        || path.startsWith('dist/src/')
        || path.endsWith('.ts')
        || /(?:^|\/)\.env(?:\.|$)/.test(path),
    ),
    'artifact',
    'tarball includes a private source or environment path',
  )
}

/** The CLI version must be rebuilt after repoctl selects a stable or nightly version. */
export function validateBuiltVersion(metadata: unknown, manifest: PackageIdentity): void {
  requireCheck(
    isRecord(metadata) && metadata.version === manifest.version,
    'artifact',
    'built CLI version must match the package manifest; rebuild after versioning',
  )
}

function execute(command: string, args: string[], cwd: string, stage: string): string {
  const result = spawn.sync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  })
  requireCheck(result.status === 0, stage, 'validation command failed')
  return result.stdout
}

async function verifyArtifact(artifact: string, manifest: PackageIdentity): Promise<{ filename: string, hash: string }> {
  const original = await readFile(artifact)
  const hash = createHash('sha256').update(original).digest('hex')
  const entries = execute('tar', ['-tzf', artifact], packageRoot, 'artifact')
    .trim()
    .split('\n')
  requireCheck(
    entries.every(path => path.startsWith('package/')),
    'artifact',
    'tarball entries must be in package/',
  )
  const paths = entries
    .filter(path => !path.endsWith('/'))
    .map(path => path.slice('package/'.length))
  validatePaths(paths)
  const packed: unknown = JSON.parse(
    execute(
      'tar',
      ['-xOzf', artifact, 'package/package.json'],
      packageRoot,
      'artifact',
    ),
  )
  const identity = validateManifest(packed)
  validateBuiltVersion(JSON.parse(execute(
    'tar',
    ['-xOzf', artifact, 'package/dist/data/meta.json'],
    packageRoot,
    'artifact',
  )) as unknown, manifest)
  requireCheck(
    identity.name === manifest.name && identity.version === manifest.version,
    'artifact',
    'tarball identity must match the checked-out manifest',
  )
  const target = await mkdtemp(join(tmpdir(), 'weapp-preflight-'))
  try {
    execute(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        artifact,
      ],
      target,
      'artifact-install',
    )
    await validatePublishedBundle(join(target, 'node_modules/weapp/dist'))
    execute(
      process.execPath,
      [
        join(packageRoot, '.cache/validation/artifact-smoke.mjs'),
        join(target, 'node_modules/weapp'),
      ],
      target,
      'artifact-smoke',
    )
  }
  finally {
    await rm(target, { recursive: true, force: true })
  }
  requireCheck(
    createHash('sha256')
      .update(await readFile(artifact))
      .digest('hex') === hash,
    'artifact',
    'tarball changed during validation',
  )
  return { filename: basename(artifact), hash }
}

export async function preflight({
  argv = [],
  env = process.env,
  log = message => process.stdout.write(`${message}\n`),
}: PreflightOptions = {}): Promise<PackageIdentity> {
  requireCheck(
    argv.length <= 2
    && (argv.length === 0
      || (argv[0] === '--artifact' && (!argv[1] || !argv[1].startsWith('--')))),
    'arguments',
    'use preflight [--artifact [tarball]]',
  )
  const manifest = validateManifest(JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  ) as unknown)
  const ci = env.GITHUB_ACTIONS === 'true'
  let artifact: string
  if (argv[0] === '--artifact') {
    if (argv[1]) {
      artifact = resolve(argv[1])
    }
    else {
      const artifacts = (await readdir(packageRoot)).filter(name =>
        name.endsWith('.tgz'),
      )
      requireCheck(
        artifacts.length === 1
        && artifacts[0] === `${manifest.name}-${manifest.version}.tgz`,
        'artifact',
        'expected exactly one matching publication tarball',
      )
      artifact = join(packageRoot, artifacts[0])
    }
    requireCheck(
      basename(artifact) === `${manifest.name}-${manifest.version}.tgz`,
      'artifact',
      'artifact filename must match the checked-out package version',
    )
    const result = await verifyArtifact(artifact, manifest)
    log(
      `Tarball install and smoke verified: ${result.filename}, SHA256 ${result.hash}`,
    )
    if (ci && env.GITHUB_OUTPUT) {
      await writeFile(
        env.GITHUB_OUTPUT,
        `artifact=${result.filename}\nsha256=${result.hash}\n`,
        { flag: 'a' },
      )
    }
  }
  else {
    const packed: unknown = JSON.parse(
      execute(
        'npm',
        ['pack', '--dry-run', '--ignore-scripts', '--json'],
        packageRoot,
        'pack',
      ),
    )
    requireCheck(
      Array.isArray(packed) && packed.length === 1,
      'pack',
      'pack identity must match the manifest',
    )
    const entry: unknown = packed[0]
    requireCheck(isRecord(entry) && entry.name === manifest.name && entry.version === manifest.version, 'pack', 'pack identity must match the manifest')
    requireCheck(Array.isArray(entry.files), 'pack', 'pack files must be an array')
    const paths = entry.files.map((file: unknown) => {
      requireCheck(isRecord(file) && typeof file.path === 'string', 'pack', 'pack files must have string paths')
      return file.path
    })
    validatePaths(paths)
    validateBuiltVersion(JSON.parse(await readFile(join(packageRoot, 'dist/data/meta.json'), 'utf8')) as unknown, manifest)
    await validatePublishedBundle(join(packageRoot, 'dist'))
    log('Local pack dry-run verified.')
  }
  log('Package validation completed without publishing or requesting credentials.')
  return manifest
}

async function main() {
  try {
    await preflight({ argv: process.argv.slice(2) })
  }
  catch (error) {
    // Keep command output and environment details out of validation errors.
    process.stderr.write(
      `${error instanceof PreflightError ? error.message : 'preflight: unexpected validation failure'}\n`,
    )
    process.exitCode = 1
  }
}
if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
}
