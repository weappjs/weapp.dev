import type { Rolldown } from 'tsdown'
import type { Node } from 'typescript'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import path from 'node:path'
import ts from 'typescript'

export const bundledDependencies = Object.freeze({
  'ansi-regex': 'MIT',
  'cross-spawn': 'MIT',
  'dijkstrajs': 'MIT',
  'emoji-regex': 'MIT',
  'get-east-asian-width': 'MIT',
  'isexe': 'ISC',
  'path-key': 'MIT',
  'picomatch': 'MIT',
  'qrcode': 'MIT',
  'semver': 'ISC',
  'shebang-command': 'MIT',
  'shebang-regex': 'MIT',
  'string-width': 'MIT',
  'strip-ansi': 'MIT',
  'which': 'ISC',
  'yaml': 'ISC',
} as const)

export const bundleReportPath = 'data/bundle.json'
export const noticesPath = 'THIRD_PARTY_NOTICES.txt'
const packageNames = Object.keys(bundledDependencies).sort()
const packageRequire = createRequire(new URL('../package.json', import.meta.url))
const licenseFiles = ['LICENSE', 'license', 'LICENSE.md', 'LICENSE-MIT.txt']

interface BundlePackage { name: string, version: string, license: string }
interface BundleChunk { file: string, sha256: string }
interface BundleReport {
  version: 1
  packages: BundlePackage[]
  chunks: BundleChunk[]
  noticesSha256: string
}
interface PackageSource {
  manifest: { name: string, version: string, license: string, dependencies?: Record<string, string> }
  directory: string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function packageSource(name: string, from: NodeRequire): Promise<PackageSource> {
  let directory = path.dirname(from.resolve(name))
  while (true) {
    try {
      const manifest: unknown = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
      if (isRecord(manifest) && manifest.name === name && typeof manifest.version === 'string' && typeof manifest.license === 'string') {
        return { directory, manifest: manifest as PackageSource['manifest'] }
      }
    }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`Cannot locate bundled package manifest: ${name}`)
    }
    directory = parent
  }
}

async function bundledSources(): Promise<Map<string, PackageSource>> {
  const sources = new Map<string, PackageSource>()
  async function visit(name: string, from: NodeRequire, children = true): Promise<void> {
    if (sources.has(name)) {
      return
    }
    if (!Object.hasOwn(bundledDependencies, name)) {
      throw new Error(`Unapproved bundled dependency: ${name}`)
    }
    const source = await packageSource(name, from)
    if (source.manifest.license !== bundledDependencies[name as keyof typeof bundledDependencies]) {
      throw new Error(`Review changed license for ${name}`)
    }
    sources.set(name, source)
    if (children) {
      const dependencyRequire = createRequire(path.join(source.directory, 'package.json'))
      for (const dependency of Object.keys(source.manifest.dependencies || {}).sort()) {
        await visit(dependency, dependencyRequire)
      }
    }
  }
  // Only QR core and the SVG tag renderer are bundled, not qrcode's PNG/CLI graph.
  await visit('qrcode', packageRequire, false)
  await visit('dijkstrajs', createRequire(path.join(sources.get('qrcode')!.directory, 'package.json')))
  for (const name of ['cross-spawn', 'semver', 'string-width', 'picomatch', 'yaml']) {
    await visit(name, packageRequire)
  }
  if (sources.size !== packageNames.length) {
    throw new Error('Bundled license inventory does not match the dependency allowlist')
  }
  return sources
}

export async function thirdPartyNotices(): Promise<{ text: string, packages: BundlePackage[] }> {
  const sources = await bundledSources()
  const sections = ['Third-party software included in the weapp JavaScript bundles.\nOpen and its dependencies are installed separately with their own licenses.']
  const packages: BundlePackage[] = []
  for (const name of packageNames) {
    const { directory, manifest } = sources.get(name)!
    let license: string | undefined
    for (const filename of licenseFiles) {
      try {
        license = await readFile(path.join(directory, filename), 'utf8')
        break
      }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }
      }
    }
    if (!license?.trim() || !/copyright/i.test(license)) {
      throw new Error(`Missing bundled license: ${name}`)
    }
    let attribution = ''
    if (name === 'qrcode') {
      const core = await readFile(path.join(directory, 'lib/core/qrcode.js'), 'utf8')
      const header = core.match(/\/\*\*[\s\S]*?\*\//)?.[0]
      if (!header?.includes('2009 Kazuhiko Arase') || !header.includes('2011 Ryan Day')) {
        throw new Error('Review changed QR core copyright attribution')
      }
      attribution = `\n\nOriginal QR core attribution:\n${header}`
    }
    packages.push({ name, version: manifest.version, license: manifest.license })
    sections.push(`=== ${name}@${manifest.version} (${manifest.license}) ===\n\n${license.trim()}${attribution}`)
  }
  return { text: `${sections.join('\n\n')}\n`, packages }
}

function checkReference(reference: string, filename: string): void {
  if (isBuiltin(reference) || reference === 'open') {
    return
  }
  if (/^\.{1,2}\//.test(reference) && !reference.includes('\\')) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filename), reference))
    if (!resolved.startsWith('../') && !path.posix.isAbsolute(resolved)) {
      return
    }
  }
  throw new Error(`Unexpected runtime module reference in ${filename}: ${reference}`)
}

/** Check emitted JavaScript as well as the graph: tsdown onlyImport skips CJS require. */
export function validateBundleCode(code: string, filename: string): void {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const requireName = /(?:^|[_$])require(?:$|[_$])/i
  const requireAliases = new Set<string>()
  function collectAliases(node: Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && /(?:^|[_$])createRequire(?:$|[_$])/.test(node.initializer.expression.text)) {
      requireAliases.add(node.name.text)
    }
    ts.forEachChild(node, collectAliases)
  }
  collectAliases(source)
  function reference(node: Node | undefined): void {
    if (node && ts.isStringLiteralLike(node)) {
      checkReference(node.text, filename)
    }
    else {
      throw new Error(`Non-literal runtime module reference in ${filename}`)
    }
  }
  function visit(node: Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        reference(node.moduleSpecifier)
      }
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      const requireCall = ts.isIdentifier(expression) && (requireName.test(expression.text) || requireAliases.has(expression.text))
      const requireResolve = ts.isPropertyAccessExpression(expression) && expression.name.text === 'resolve'
        && ts.isIdentifier(expression.expression) && (requireName.test(expression.expression.text) || requireAliases.has(expression.expression.text))
      if (expression.kind === ts.SyntaxKind.ImportKeyword || requireCall || requireResolve) {
        // Local CommonJS factories such as require_qrcode() take no specifier.
        if (node.arguments.length || expression.kind === ts.SyntaxKind.ImportKeyword) {
          reference(node.arguments[0])
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

export function bundlePolicyPlugin(): Rolldown.Plugin {
  return {
    name: 'weapp-runtime-bundle-policy',
    async generateBundle(_options, bundle) {
      const found = new Set<string>()
      for (const id of this.getModuleIds()) {
        if (isBuiltin(id) || id === 'open') {
          continue
        }
        if (!path.isAbsolute(id) && !id.startsWith('\0')) {
          checkReference(id, 'CLI module graph')
        }
        const normalized = id.replaceAll('\\', '/')
        const position = normalized.lastIndexOf('/node_modules/')
        if (position < 0) {
          continue
        }
        const dependency = normalized.slice(position + '/node_modules/'.length)
        const name = dependency.startsWith('@') ? dependency.split('/').slice(0, 2).join('/') : dependency.split('/')[0]!
        if (!Object.hasOwn(bundledDependencies, name)) {
          throw new Error(`Unapproved CLI bundle module: ${name}`)
        }
        if (name === 'qrcode' && !/^qrcode\/lib\/(?:core\/[^/]+\.js|renderer\/(?:svg-tag|utils)\.js)$/.test(dependency)) {
          throw new Error(`Unapproved QR bundle entry: ${dependency}`)
        }
        found.add(name)
      }
      if (found.size !== packageNames.length) {
        throw new Error(`CLI bundle and license inventory differ: ${[...found].sort().join(', ')}`)
      }
      const notices = await thirdPartyNotices()
      const chunks: BundleChunk[] = []
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          validateBundleCode(output.code, output.fileName)
          chunks.push({ file: output.fileName, sha256: hash(output.code) })
        }
      }
      const report: BundleReport = { version: 1, packages: notices.packages, chunks: chunks.sort((a, b) => a.file.localeCompare(b.file)), noticesSha256: hash(notices.text) }
      this.emitFile({ type: 'asset', fileName: bundleReportPath, source: `${JSON.stringify(report)}\n` })
    },
  }
}

/** Recheck the exact installed/extracted artifact without trusting workspace resolution. */
export async function validatePublishedBundle(directory: string): Promise<void> {
  const report: unknown = JSON.parse(await readFile(path.join(directory, bundleReportPath), 'utf8'))
  if (!isRecord(report) || report.version !== 1 || !Array.isArray(report.packages) || !Array.isArray(report.chunks)) {
    throw new Error('Invalid published bundle report')
  }
  const names: string[] = []
  const notices = await readFile(path.join(directory, noticesPath), 'utf8')
  if (hash(notices) !== report.noticesSha256) {
    throw new Error('Published bundled licenses changed after build')
  }
  for (const item of report.packages as unknown[]) {
    if (!isRecord(item) || typeof item.name !== 'string' || !Object.hasOwn(bundledDependencies, item.name)
      || typeof item.version !== 'string' || item.license !== bundledDependencies[item.name as keyof typeof bundledDependencies]
      || !notices.includes(`=== ${item.name}@${item.version} (${item.license}) ===`)) {
      throw new Error('Invalid published license inventory')
    }
    names.push(item.name)
  }
  if (names.sort().join('\n') !== packageNames.join('\n')) {
    throw new Error('Published bundle inventory differs from the allowlist')
  }
  const files: string[] = []
  for (const chunk of report.chunks as unknown[]) {
    if (!isRecord(chunk) || typeof chunk.file !== 'string' || !/^[\w.-]+\.js$/.test(chunk.file) || typeof chunk.sha256 !== 'string') {
      throw new Error('Invalid published bundle chunk')
    }
    const code = await readFile(path.join(directory, chunk.file), 'utf8')
    if (hash(code) !== chunk.sha256) {
      throw new Error(`Published bundle changed after build: ${chunk.file}`)
    }
    validateBundleCode(code, chunk.file)
    files.push(chunk.file)
  }
  for (const entry of ['cli.js', 'index.js', 'terminal.js']) {
    if (!files.includes(entry)) {
      throw new Error(`Missing published bundle entry: ${entry}`)
    }
  }
}
