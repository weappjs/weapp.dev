import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import jsQR from 'jsqr'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
interface SmokeProject {
  slug: string
  packageName: string
  ecosystem: string
  status: string
  installCommand?: string
}
function parseProject(value: unknown): SmokeProject {
  assert.ok(isRecord(value) && typeof value.slug === 'string' && typeof value.packageName === 'string'
    && typeof value.ecosystem === 'string' && typeof value.status === 'string', 'Valid catalog project')
  assert.ok(value.installCommand === undefined || typeof value.installCommand === 'string')
  return { slug: value.slug, packageName: value.packageName, ecosystem: value.ecosystem, status: value.status, installCommand: value.installCommand }
}
function parseProjects(value: unknown): SmokeProject[] {
  assert.ok(Array.isArray(value), 'Valid project list')
  return value.map(parseProject)
}
function parseJson(text: string): unknown {
  return JSON.parse(text)
}

const root = resolve(process.argv[2] || '.')
const cli = resolve(root, 'dist/cli.js')
const manifest: unknown = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
assert.ok(isRecord(manifest) && typeof manifest.name === 'string' && typeof manifest.version === 'string', 'Valid package manifest')
assert.ok(isRecord(manifest.dependencies) && Object.keys(manifest.dependencies).join() === 'open', 'Only open may remain an external runtime dependency')
const installedRequire = createRequire(resolve(root, 'package.json'))
const openDirectory = dirname(installedRequire.resolve('open'))
if (process.platform !== 'win32') {
  const launcher = join(openDirectory, 'xdg-open')
  await access(launcher, constants.R_OK | constants.X_OK)
  assert.equal(createHash('sha256').update(await readFile(launcher)).digest('hex'), '7d759d54f0d4ce1beeb34ee62c587985b5042374e8de237b0dcb8cd47aa698cf', 'Preserve the open 10.2.0 launcher bytes and execute permission')
}
const defaultEnv = { ...process.env, NODE_PATH: '', NO_COLOR: '1', LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' }
function run(args: string[], extra: Partial<SpawnSyncOptionsWithStringEncoding> = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000, env: defaultEnv, ...extra })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.ok(!result.stdout.includes(String.fromCharCode(27)), 'Output must not contain ANSI')
  return result.stdout
}
assert.match(run([]), /weapp\.js\.org/)
assert.match(run(['--help']), /Usage:/)
assert.doesNotMatch(run(['--help']), /play snake/)
assert.match(run(['play', '--help']), /play snake/)
assert.equal(run(['--version']).trim(), manifest.version)
const projects = parseProjects(parseJson(run(['projects', '--json'])))
assert.equal(projects.length, 11)
assert.equal(projects.filter(project => project.ecosystem === 'weapp').length, 6)
assert.equal(parseProjects(parseJson(run(['projects', '--all', '--json']))).length, 11)
assert.equal(parseProject(parseJson(run(['info', 'tw', '--json']))).slug, 'weapp-tailwindcss')
const sqlite = parseProject(parseJson(run(['info', 'weapp-sqlite', '--json'])))
assert.equal(sqlite.packageName, '@weapp-sqlite/weapp-vite')
assert.equal(sqlite.status, 'beta')
assert.equal(sqlite.installCommand, 'pnpm add @weapp-sqlite/weapp-vite')
assert.equal(parseProject(parseJson(run(['info', '@weapp-sqlite/weapp-vite', '--json']))).slug, 'weapp-sqlite')
for (const route of ['sqlite', 'weapp-sqlite', '@weapp-sqlite/weapp-vite']) {
  const result = spawnSync(process.execPath, [cli, 'create', route, 'unsupported-sqlite', '--dry-run'], { encoding: 'utf8', timeout: 5000, env: defaultEnv })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Unknown creation route/)
}
for (const template of ['default', 'wevu', 'react', 'tailwindcss', 'multi-platform-sfc']) {
  assert.match(run(['create', 'weapp-vite', `smoke-${template}`, '--template', template, '--dry-run']), /create-weapp-vite@latest/)
}
const palette = parseJson(run(['palette', '#000000', '--json']))
assert.ok(isRecord(palette) && Array.isArray(palette.colors))
assert.equal(palette.colors.length, 5)
function decodeTerminal(text: string): string | undefined {
  const rows = text.trimEnd().split(/\r?\n/)
  const width = rows[0].length
  const height = rows.length * 2
  const scale = 8
  const image = new Uint8ClampedArray(width * scale * height * scale * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const character = rows[Math.floor(y / 2)][x]
      const white = character === '█' || (y % 2 === 0 ? character === '▀' : character === '▄')
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = ((y * scale + dy) * width * scale + x * scale + dx) * 4
          image[offset] = image[offset + 1] = image[offset + 2] = white ? 255 : 0
          image[offset + 3] = 255
        }
      }
    }
  }
  return jsQR(image, width * scale, height * scale, { inversionAttempts: 'dontInvert' })?.data
}
for (const content of ['https://weapp.js.org/', '中文 · weapp 🎆', 'Family 👨‍👩‍👧‍👦']) {
  assert.equal(decodeTerminal(run(['qr', '-'], { input: content })), content, 'Decode the actual packed CLI QR independently')
}

// All fixture processes run locally. No registry or real scaffolder is invoked.
const fixture = await mkdtemp(join(tmpdir(), 'weapp artifact & 中文 '))
try {
  const filename = join(fixture, 'code.svg')
  run(['qr', 'https://weapp.js.org/', '--output', filename])
  const svg = await readFile(filename, 'utf8')
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(svg, /#ffffff/)
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|https?:\/\/weapp/)
  assert.equal(spawnSync(process.execPath, [cli, 'qr', 'different', '--output', filename], { env: defaultEnv }).status, 1)
  assert.equal(await readFile(filename, 'utf8'), svg, 'SVG overwrite protection survives packaging')

  const bin = join(fixture, 'node_modules', '.bin')
  await mkdir(bin, { recursive: true })
  const capture = join(fixture, 'calls.jsonl')
  const runner = join(bin, 'npm-fixture.cjs')
  await writeFile(runner, `const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.WEAPP_SMOKE_CAPTURE, JSON.stringify({args, cwd:process.cwd(), corepackNetwork:process.env.COREPACK_ENABLE_NETWORK, managePackageManagerVersions:process.env.npm_config_manage_package_manager_versions}) + '\\n');
if (args[0] === 'view') process.stdout.write(JSON.stringify({version:'1.2.3',engines:{node:'>=18'}}));
else if (args[0] === '--version') process.stdout.write('10.0.0\\n');
else if (args[0] === 'exec') {
  const position = args.indexOf('--');
  const target = path.resolve(args[position + 2]);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target,'package.json'),JSON.stringify({name:'packed-fixture',devDependencies:{'weapp-vite':'1.0.0'}}));
} else process.exitCode = 2;
`)
  if (process.platform === 'win32') {
    await writeFile(join(bin, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0npm-fixture.cjs" %*\r\n`)
  }
  else {
    const shim = join(bin, 'npm')
    await writeFile(shim, `#!/usr/bin/env node\nrequire('./npm-fixture.cjs')\n`)
    await chmod(shim, 0o755)
  }
  const env: NodeJS.ProcessEnv = { ...defaultEnv, WEAPP_SMOKE_CAPTURE: capture }
  for (const key of Object.keys(env)) {
    if (['path', 'pathext'].includes(key.toLowerCase())) {
      delete env[key]
    }
  }
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = [bin, dirname(process.execPath)].join(delimiter)
  env.PATHEXT = '.CMD;.EXE;.BAT;.COM'
  run(['create', 'weapp-vite', 'packed-project', '--template', 'wevu'], { cwd: fixture, env })
  const calls: unknown[] = (await readFile(capture, 'utf8')).trim().split('\n').map(parseJson)
  assert.equal(calls.length, 2, 'Exactly one version lookup and one execution through the packaged launcher')
  assert.ok(isRecord(calls[0]) && isRecord(calls[1]))
  assert.deepEqual(calls[0].args, ['view', 'create-weapp-vite@latest', 'version', 'engines', '--json', '--fetch-retries=0', '--fetch-timeout=15000'])
  assert.deepEqual(calls[1].args, ['exec', '--yes', '--package=create-weapp-vite@1.2.3', '--', 'create-weapp-vite', 'packed-project', 'wevu', '--no-install-skills'])
  assert.equal(calls[0].cwd, await realpath(fixture))
  assert.equal(calls[1].cwd, await realpath(fixture), 'Windows .cmd and POSIX shebang preserve the Unicode/metacharacter working directory')
  assert.equal(parseProject(parseJson(run(['info', 'tw', '--json'], { cwd: fixture, env }))).slug, 'weapp-tailwindcss')

  const dryTarget = join(fixture, 'offline-install-preview')
  const capturedBeforePreview = await readFile(capture, 'utf8')
  const preview = run(['create', 'weapp-vite', dryTarget, '--dry-run', '--install', '--package-manager', 'pnpm'], { cwd: fixture, env })
  assert.match(preview, /create-weapp-vite@latest/)
  assert.match(preview, /does not access the network/)
  await assert.rejects(access(dryTarget), { code: 'ENOENT' }, 'Install preview must not create the target')
  assert.equal(await readFile(capture, 'utf8'), capturedBeforePreview, 'Dry-run with installation must not invoke a package manager')

  const packedProject = await realpath(join(fixture, 'packed-project'))
  const sourceDirectory = join(packedProject, 'src', 'pages')
  await mkdir(sourceDirectory, { recursive: true })
  const nestedReport = parseJson(run(['doctor', sourceDirectory, '--json'], { cwd: fixture, env }))
  assert.ok(isRecord(nestedReport) && isRecord(nestedReport.context) && Array.isArray(nestedReport.checks))
  assert.equal(nestedReport.directory, sourceDirectory, 'Existing JSON directory field retains requested-directory semantics')
  assert.equal(nestedReport.requestedDirectory, sourceDirectory)
  assert.equal(nestedReport.projectRoot, packedProject)
  assert.equal(nestedReport.context.kind, 'package')
  assert.equal(nestedReport.context.projectRoot, packedProject)
  assert.match(run(['doctor', sourceDirectory], { cwd: fixture, env }), /Detected project root:/)
  const probeCalls: unknown[] = (await readFile(capture, 'utf8')).trim().split('\n').map(parseJson)
  const probe = probeCalls.at(-1)
  assert.ok(isRecord(probe))
  assert.deepEqual(probe.args, ['--version'])
  assert.equal(probe.cwd, packedProject, 'Doctor probes in the detected project context')
  assert.equal(probe.corepackNetwork, '0', 'Doctor must not trigger Corepack downloads')
  assert.equal(probe.managePackageManagerVersions, 'false', 'Doctor must not trigger pnpm manager downloads')

  const nativeProject = join(fixture, 'native-project')
  await mkdir(nativeProject)
  await writeFile(join(nativeProject, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }))
  const capturedBeforeNative = await readFile(capture, 'utf8')
  const nativeReport = parseJson(run(['doctor', nativeProject, '--json'], { cwd: fixture, env }))
  assert.ok(isRecord(nativeReport) && isRecord(nativeReport.context))
  assert.equal(nativeReport.ok, true, 'Native projects do not require package.json')
  assert.equal(nativeReport.context.kind, 'native')
  assert.equal(await readFile(capture, 'utf8'), capturedBeforeNative, 'Native-only doctor does not probe a package manager')

  await mkdir(join(packedProject, 'node_modules', 'weapp-vite'), { recursive: true })
  await writeFile(join(packedProject, 'node_modules', 'weapp-vite', 'package.json'), JSON.stringify({ name: 'weapp-vite', version: '2.0.0' }))
  const versionReport = parseJson(run(['doctor', packedProject, '--json'], { cwd: fixture, env }))
  assert.ok(isRecord(versionReport) && Array.isArray(versionReport.checks))
  const versionCheck = versionReport.checks.find(check => isRecord(check) && check.id === 'dependency-versions')
  assert.ok(isRecord(versionCheck) && isRecord(versionCheck.suggestion))
  assert.equal(versionCheck.severity, 'warning')
  assert.deepEqual(versionCheck.suggestion, { cwd: packedProject, command: 'npm', args: ['install'] })

  const workspace = join(fixture, 'workspace')
  const member = join(workspace, 'packages', 'member')
  await mkdir(member, { recursive: true })
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }))
  await writeFile(join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  - "!packages/excluded"\n')
  await writeFile(join(member, 'package.json'), JSON.stringify({ packageManager: 'npm@9.0.0' }))
  const conflictResult = spawnSync(process.execPath, [cli, 'doctor', member, '--json'], { cwd: fixture, env, encoding: 'utf8', timeout: 15000 })
  assert.equal(conflictResult.status, 1)
  assert.equal(conflictResult.stderr, '')
  const conflictReport = parseJson(conflictResult.stdout)
  assert.ok(isRecord(conflictReport) && isRecord(conflictReport.context) && isRecord(conflictReport.context.workspace) && Array.isArray(conflictReport.checks))
  assert.equal(conflictReport.context.workspace.root, await realpath(workspace))
  assert.ok(conflictReport.checks.some(check => isRecord(check) && check.id === 'package-manager-workspace' && check.severity === 'error'), 'Packed YAML/glob support must preserve declaration conflicts')

  const empty = join(fixture, 'empty-path')
  await mkdir(empty)
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = empty
  const missing = spawnSync(process.execPath, [cli, 'create', 'weapp-vite', 'missing-npm'], { cwd: fixture, env, encoding: 'utf8', timeout: 5000 })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Unable to run npm/)
}
finally {
  await rm(fixture, { recursive: true, force: true })
}
for (const effect of ['logo', 'orbit', 'matrix', 'fireworks']) {
  assert.ok(run(['fx', effect, '--seed', '42']).length > 20)
}
assert.equal(spawnSync(process.execPath, [cli, '--unknown']).status, 1)
assert.equal(spawnSync(process.execPath, [cli, 'play', 'snake']).status, 1)
for (const args of [[], ['weapp-vite']]) {
  const result = spawnSync(process.execPath, [cli, 'create', ...args, '--dry-run'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
}

const child = spawn(process.execPath, [cli, 'lab', '--no-open', '--no-motion'], { env: defaultEnv, stdio: ['ignore', 'pipe', 'pipe'] })
let errorOutput = ''
child.stderr.on('data', chunk => errorOutput += chunk)
try {
  const url = await new Promise<string>((accept, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Lab did not start: ${errorOutput}`)), 10000)
    child.on('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Lab exited early (${code}): ${errorOutput}`))
    })
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/http:\/\/127\.0\.0\.1:\d\S*/)
      if (match) {
        clearTimeout(timeout)
        accept(match[0])
      }
    })
  })
  const response = await fetch(url)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /canvas/i)
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!/^(?:https?:|data:)/.test(match[1])) {
      assert.equal((await fetch(new URL(match[1], url))).status, 200, `Missing lab asset: ${match[1]}`)
    }
  }
  const data: unknown = await (await fetch(new URL('/data.json', url))).json()
  assert.ok(isRecord(data) && Array.isArray(data.catalog) && isRecord(data.logo)
    && Array.isArray(data.logo.points) && isRecord(data.projectLogos), 'Valid lab payload')
  assert.equal(data.catalog.length, 11)
  assert.equal(data.logo.points.length, 2400)
  assert.equal(Object.keys(data.projectLogos).length, 11)
  const sqliteLogo = data.projectLogos['weapp-sqlite']
  assert.ok(isRecord(sqliteLogo))
  assert.equal(sqliteLogo.url, '/logos/weapp-sqlite.svg')
  assert.equal(sqliteLogo.fallback, false)
  for (const project of parseProjects(data.catalog)) {
    const logo: unknown = data.projectLogos[project.slug]
    assert.ok(isRecord(logo) && typeof logo.url === 'string', 'Valid project logo')
    assert.ok(logo.url.startsWith('/logos/'), `Logo must use a fixed local route: ${project.slug}`)
    const asset: Response = await fetch(new URL(logo.url, url))
    assert.equal(asset.status, 200, `Missing project logo: ${project.slug}`)
    assert.ok((await asset.arrayBuffer()).byteLength > 100)
  }
  assert.equal((await fetch(new URL('/package.json', url))).status, 404)
  assert.equal((await fetch(new URL('/logos/miniprogram.svg', url))).status, 404)
  assert.equal((await fetch(new URL('/%2e%2e/package.json', url))).status, 404)
}
finally {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = new Promise<void>((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error('Lab did not close after SIGINT')), 5000)
      child.once('exit', () => {
        clearTimeout(timeout)
        accept()
      })
    })
    child.kill('SIGINT')
    await closed
  }
}
process.stdout.write(`Artifact smoke passed on Node ${process.version}: ${manifest.name}@${manifest.version}\n`)
