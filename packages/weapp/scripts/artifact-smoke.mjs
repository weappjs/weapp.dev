import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.argv[2] || '.')
const cli = resolve(root, 'bin/weapp.js')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
function run(args, extra = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000, env: { ...process.env, NO_COLOR: '1', LANG: 'en_US.UTF-8' }, ...extra })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.ok(!result.stdout.includes(String.fromCharCode(27)), 'Output must not contain ANSI')
  return result.stdout
}
assert.match(run([]), /weapp\.js\.org/)
assert.match(run(['--help']), /Usage:/)
assert.doesNotMatch(run(['--help']), /play snake/)
assert.match(run(['play', '--help']), /play snake/)
assert.equal(run(['--version']).trim(), manifest.version)
const projects = JSON.parse(run(['projects', '--json']))
assert.equal(projects.length, 11)
assert.equal(projects.filter(project => project.ecosystem === 'weapp').length, 6)
assert.equal(JSON.parse(run(['projects', '--all', '--json'])).length, 11)
assert.equal(JSON.parse(run(['info', 'tw', '--json'])).slug, 'weapp-tailwindcss')
assert.equal(JSON.parse(run(['info', 'weapp-sqlite', '--json'])).installCommand, undefined)
for (const template of ['default', 'wevu', 'react', 'tailwindcss', 'multi-platform-sfc']) {
  assert.match(run(['create', 'weapp-vite', `smoke-${template}`, '--template', template, '--dry-run']), /create-weapp-vite@latest/)
}
assert.equal(JSON.parse(run(['palette', '#000000', '--json'])).colors.length, 5)
assert.match(run(['qr', '-'], { input: 'https://weapp.js.org/' }), /[█▀▄]/)
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

const child = spawn(process.execPath, [cli, 'lab', '--no-open', '--no-motion'], { stdio: ['ignore', 'pipe', 'pipe'] })
let errorOutput = ''
child.stderr.on('data', chunk => errorOutput += chunk)
try {
  const url = await new Promise((accept, reject) => {
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
  const data = await (await fetch(new URL('/data.json', url))).json()
  assert.equal(data.catalog.length, 11)
  assert.equal(data.logo.points.length, 2400)
  assert.equal(Object.keys(data.projectLogos).length, 11)
  assert.equal(data.projectLogos['weapp-sqlite'].fallback, true)
  for (const project of data.catalog) {
    const logo = data.projectLogos[project.slug]
    assert.ok(logo.url.startsWith('/logos/'), `Logo must use a fixed local route: ${project.slug}`)
    const asset = await fetch(new URL(logo.url, url))
    assert.equal(asset.status, 200, `Missing project logo: ${project.slug}`)
    assert.ok((await asset.arrayBuffer()).byteLength > 100)
  }
  assert.equal((await fetch(new URL('/package.json', url))).status, 404)
  assert.equal((await fetch(new URL('/%2e%2e/package.json', url))).status, 404)
}
finally {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = new Promise((accept, reject) => {
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
