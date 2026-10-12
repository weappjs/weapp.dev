import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import jsQR from 'jsqr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CREATE_ADAPTERS, createProject, npmExecArgs, parseScaffolderMetadata, scaffoldPlan } from '../src/commands/create.js'
import { diagnose, runDoctor } from '../src/commands/doctor.js'
import { generatePalette, luminance, runPalette } from '../src/commands/palette.js'
import { qrTerminal, readQrInput, runQr } from '../src/commands/qr.js'

let directory
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-tools-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
function context(lang = 'en', input = []) {
  const output = { stdout: '', stderr: '' }
  const ctx = {
    lang,
    color: false,
    motion: false,
    interactive: false,
    stdin: Readable.from(input),
    stdout: { write: (text) => {
      output.stdout += text
    } },
    stderr: { write: (text) => {
      output.stderr += text
    } },
  }
  return { ctx, output }
}
function fakeOperations(dependency, options = {}) {
  return {
    nodeVersion: '22.22.2',
    query: vi.fn(async () => ({ version: '1.2.3', engines: { node: '>=18' }, ...options.metadata })),
    execute: vi.fn(async (plan) => {
      if (!options.noFiles) {
        await mkdir(plan.directory)
        await writeFile(path.join(plan.directory, 'package.json'), options.invalidJson ? '{' : JSON.stringify({ name: 'test', devDependencies: { [options.wrongDependency ? 'wrong' : dependency]: '^1.0.0' } }))
      }
      return { code: options.code || 0 }
    }),
  }
}
describe('official scaffold adapters', () => {
  it('normalizes npm JSON output with and without engines metadata', () => {
    expect(parseScaffolderMetadata('"2.17.1"')).toEqual({ version: '2.17.1' })
    expect(parseScaffolderMetadata('{"version":"1.4.5","engines":{"node":">=18"}}')).toEqual({ version: '1.4.5', engines: { node: '>=18' } })
  })
  it.each(Object.keys(CREATE_ADAPTERS))('pins the official %s creator and verifies its dependency', async (route) => {
    const adapter = CREATE_ADAPTERS[route]
    const operations = fakeOperations(adapter.dependency)
    const result = await createProject(route, path.join(directory, route), {}, operations)
    expect(operations.query).toHaveBeenCalledWith(adapter.package)
    expect(operations.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd: await realpath(directory), package: adapter.package, args: route === 'weapp-vite' ? [route, 'default', '--no-install-skills'] : [route] }), '1.2.3')
    expect(result.version).toBe('1.2.3')
    expect(npmExecArgs(result.plan, result.version)).toEqual(['exec', '--yes', `--package=${adapter.package}@1.2.3`, '--', adapter.bin, ...result.plan.args])
  })
  it('uses the official Vite Taro creator for the taro route', () => {
    expect(CREATE_ADAPTERS.taro).toEqual({ package: 'create-vite-taro', bin: 'create-vite-taro', dependency: 'vite-plugin-taro' })
  })
  it('previews offline and does not create files', async () => {
    const operations = fakeOperations('weapp-vite')
    const result = await createProject('weapp-vite', path.join(directory, 'app'), { dryRun: true, template: 'react' }, operations)
    expect(result.dryRun).toBe(true)
    expect(result.plan.args).toEqual(['app', 'react', '--no-install-skills'])
    expect(operations.query).not.toHaveBeenCalled()
    expect(operations.execute).not.toHaveBeenCalled()
  })
  it('handles the weapp-vite init reserved name explicitly', async () => {
    expect((await scaffoldPlan('weapp-vite', path.join(directory, 'init'))).args[0]).toBe('./init')
  })
  it('rejects incompatible Node and invalid version metadata before executing', async () => {
    const operations = fakeOperations('weapp-vite', { metadata: { engines: { node: '>=24' } } })
    await expect(createProject('weapp-vite', path.join(directory, 'app'), {}, operations)).rejects.toThrow(/requires Node >=24/)
    expect(operations.execute).not.toHaveBeenCalled()
    operations.query.mockResolvedValue({ version: 'latest' })
    await expect(createProject('weapp-vite', path.join(directory, 'app'), {}, operations)).rejects.toThrow(/metadata is invalid/)
  })
  it('refuses existing directories, dangling symlinks, invalid names, and missing parents', async () => {
    await mkdir(path.join(directory, 'existing'))
    await symlink(path.join(directory, 'missing-target'), path.join(directory, 'linked'))
    for (const name of ['existing', 'linked', '-option', 'bad name', 'CON', 'trailing.']) {
      await expect(scaffoldPlan('weapp-vite', path.join(directory, name))).rejects.toThrow()
    }
    await expect(scaffoldPlan('weapp-vite', path.join(directory, 'missing', 'app'))).rejects.toThrow(/Parent directory/)
  })
  it('rejects unknown routes, templates, and templates for unrelated creators', async () => {
    await expect(scaffoldPlan('sqlite', path.join(directory, 'app'))).rejects.toThrow(/Unknown creation route/)
    await expect(scaffoldPlan('weapp-vite', path.join(directory, 'app'), { template: 'unsafe' })).rejects.toThrow(/Unknown template/)
    await expect(scaffoldPlan('uni', path.join(directory, 'app'), { template: 'react' })).rejects.toThrow(/only available/)
  })
  it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])('rejects inherited pseudo-route %s before metadata or dry-run execution', async (route) => {
    const operations = fakeOperations('weapp-vite')
    await expect(createProject(route, path.join(directory, 'app'), { dryRun: true }, operations)).rejects.toThrow(/Unknown creation route/)
    await expect(createProject(route, path.join(directory, 'app'), {}, operations)).rejects.toThrow(/Unknown creation route/)
    expect(operations.query).not.toHaveBeenCalled()
    expect(operations.execute).not.toHaveBeenCalled()
  })
  it('refuses a target created while npm metadata is being resolved', async () => {
    const operations = fakeOperations('weapp-vite')
    operations.query.mockImplementation(async () => {
      await mkdir(path.join(directory, 'app'))
      return { version: '1.2.3' }
    })
    await expect(createProject('weapp-vite', path.join(directory, 'app'), {}, operations)).rejects.toThrow(/appeared before creation/)
    expect(operations.execute).not.toHaveBeenCalled()
  })
  it.each([{ code: 2 }, { noFiles: true }, { invalidJson: true }, { wrongDependency: true }])('detects unsuccessful generation and keeps partial files: %j', async (options) => {
    const operations = fakeOperations('weapp-vite', options)
    await expect(createProject('weapp-vite', path.join(directory, 'app'), {}, operations)).rejects.toThrow()
    if (!options.noFiles) {
      expect(await readFile(path.join(directory, 'app', 'package.json'), 'utf8')).toBeTruthy()
    }
  })
})
describe('read-only doctor', () => {
  const operations = { nodeVersion: '22.22.2', packageManagerVersion: async () => '10.0.0' }
  it('reports missing or malformed manifests as errors, warnings do not fail', async () => {
    const { ctx } = context()
    expect((await diagnose(directory, ctx, operations)).ok).toBe(false)
    await writeFile(path.join(directory, 'package.json'), '{')
    expect((await diagnose(directory, ctx, operations)).checks.find(check => check.id === 'manifest').severity).toBe('error')
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'app', dependencies: { 'weapp-vite': '^3' } }))
    const report = await diagnose(directory, ctx, operations)
    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'dependencies').severity).toBe('warning')
  })
  it('finds conflicting locks, missing declared dependencies and invalid project Node', async () => {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'app', engines: { node: '>=24' }, packageManager: 'pnpm@10.0.0', dependencies: { 'weapp-vite': '^3', 'missing': '1' } }))
    await writeFile(path.join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9')
    await writeFile(path.join(directory, 'yarn.lock'), '')
    await mkdir(path.join(directory, 'node_modules', 'weapp-vite'), { recursive: true })
    await writeFile(path.join(directory, 'node_modules', 'weapp-vite', 'package.json'), '{}')
    const report = await diagnose(directory, context().ctx, operations)
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'lockfiles').severity).toBe('warning')
    expect(report.checks.find(check => check.id === 'dependencies').message).toMatch(/missing/)
  })
  it('identifies JSON and Vite configuration without executing project scripts or config', async () => {
    const marker = path.join(directory, 'must-not-exist')
    const manifest = JSON.stringify({ name: 'read-only', scripts: { doctor: `touch ${marker}` } })
    await writeFile(path.join(directory, 'package.json'), manifest)
    await writeFile(path.join(directory, 'vite.config.js'), `throw new Error('must not run')`)
    await writeFile(path.join(directory, 'project.config.json'), '{}')
    const report = await diagnose(directory, context('zh-CN').ctx, operations)
    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'vite-config').message).toMatch(/未执行配置/)
    expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toBe(manifest)
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('emits only a JSON report for machine output, including missing directories', async () => {
    const { ctx, output } = context()
    expect(await runDoctor(ctx, [path.join(directory, 'missing')], { json: true })).toBe(1)
    expect(JSON.parse(output.stdout).ok).toBe(false)
    expect(output.stdout).not.toContain(String.fromCharCode(27))
    expect(output.stderr).toBe('')
  })
  it('detects an unavailable selected package manager', async () => {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.0.0' }))
    const report = await diagnose(directory, context().ctx, { ...operations, packageManagerVersion: async command => command === 'npm' ? '10.0.0' : null })
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'package-manager:pnpm').severity).toBe('error')
  })
})
function decodeTerminal(text) {
  const rows = text.split('\n')
  const width = rows[0].length
  const height = rows.length * 2
  const scale = 8
  const image = new Uint8ClampedArray(width * scale * height * scale * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const char = rows[Math.floor(y / 2)][x]
      const white = char === '█' || (y % 2 === 0 ? char === '▀' : char === '▄')
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
describe('QR rendering and exports', () => {
  it.each(['https://weapp.js.org/', '中文 · weapp 🎆', 'escaped\x1B[31m'])('independently decodes the actual terminal QR: %s', (content) => {
    expect(decodeTerminal(qrTerminal(content))).toBe(content)
  })
  it('reads UTF-8 stdin across byte boundaries', async () => {
    const bytes = Buffer.from('你好 🎆\n')
    const chunks = [...bytes].map(byte => Buffer.from([byte]))
    expect(await readQrInput(Readable.from(chunks))).toBe('你好 🎆')
    const { ctx, output } = context('en', chunks)
    expect(await runQr(ctx, ['-'], {})).toBe(0)
    expect(decodeTerminal(output.stdout.trimEnd())).toBe('你好 🎆')
  })
  it('encodes a literal dash from the hub without consuming terminal stdin', async () => {
    const { ctx, output } = context()
    ctx.hub = true
    ctx.stdin = {
      [Symbol.asyncIterator]() {
        throw new Error('Hub QR must not consume terminal stdin')
      },
    }
    expect(await runQr(ctx, ['-'], {})).toBe(0)
    expect(decodeTerminal(output.stdout.trimEnd())).toBe('-')
    expect(output.stderr).toBe('')
  })
  it('exports self-contained SVG and refuses to overwrite without --force', async () => {
    const filename = path.join(directory, 'code.svg')
    const { ctx, output } = context()
    expect(await runQr(ctx, ['https://weapp.js.org/'], { output: filename })).toBe(0)
    const svg = await readFile(filename, 'utf8')
    expect(svg).toMatch(/<svg/)
    expect(svg).toMatch(/#ffffff/)
    expect(svg).not.toMatch(/<script|https?:\/\/weapp/)
    expect(await runQr(ctx, ['different'], { output: filename })).toBe(1)
    expect(await readFile(filename, 'utf8')).toBe(svg)
    expect(output.stderr).toMatch(/--force/)
    expect(await runQr(ctx, ['different'], { output: filename, force: true })).toBe(0)
    expect(await readFile(filename, 'utf8')).not.toBe(svg)
  })
  it('rejects empty, oversized and wrong-format inputs', async () => {
    for (const args of [[''], ['a'.repeat(5000)], ['a', 'b']]) {
      expect(await runQr(context().ctx, args, {})).toBe(1)
    }
    expect(await runQr(context().ctx, ['x'], { output: path.join(directory, 'code.png') })).toBe(1)
  })
})
describe('five-step palettes', () => {
  it('preserves base color, returns five monotonic shades and known WCAG contrast', () => {
    const palette = generatePalette('#2ba245')
    expect(palette.colors).toHaveLength(5)
    expect(palette.colors[2].hex).toBe(palette.base)
    expect(generatePalette('fff').colors[2].contrast).toEqual({ black: 21, white: 1 })
    expect(generatePalette('#000000').colors[2].contrast).toEqual({ black: 1, white: 21 })
    expect(luminance([255, 255, 255])).toBe(1)
    expect(palette.colors.map(color => color.contrast.black)).toEqual(palette.colors.map(color => color.contrast.black).sort((a, b) => b - a))
  })
  it('keeps JSON and CSS free of ANSI and exports without overwriting', async () => {
    const { ctx, output } = context()
    ctx.color = true
    expect(await runPalette(ctx, ['#abc'], { json: true })).toBe(0)
    expect(JSON.parse(output.stdout).base).toBe('#aabbcc')
    expect(output.stdout).not.toContain(String.fromCharCode(27))
    const filename = path.join(directory, 'palette.css')
    expect(await runPalette(ctx, ['#abc'], { output: filename })).toBe(0)
    const css = await readFile(filename, 'utf8')
    expect(css).toMatch(/--weapp-500: #aabbcc;/)
    expect(await runPalette(ctx, ['#fff'], { output: filename })).toBe(1)
    expect(await readFile(filename, 'utf8')).toBe(css)
    expect(await runPalette(ctx, ['#fff'], { output: filename, force: true })).toBe(0)
  })
  it('prints pure JSON when --format json exports a palette file', async () => {
    const { ctx, output } = context()
    ctx.color = true
    const filename = path.join(directory, 'palette.json')
    expect(await runPalette(ctx, ['#abc'], { format: 'json', output: filename })).toBe(0)
    expect(JSON.parse(output.stdout)).toMatchObject({ base: '#aabbcc', output: filename })
    expect(JSON.parse(await readFile(filename, 'utf8')).base).toBe('#aabbcc')
    expect(output.stdout).not.toContain(String.fromCharCode(27))
    expect(output.stderr).toBe('')
  })
  it('validates colors and output formats with bilingual errors', async () => {
    const { ctx, output } = context('zh-CN')
    expect(await runPalette(ctx, ['\x1B[31m'], {})).toBe(1)
    expect(output.stderr).toMatch(/HEX/)
    expect(await runPalette(ctx, ['abc'], { format: 'svg' })).toBe(1)
    expect(await runPalette(ctx, ['abc'], { json: true, format: 'css' })).toBe(1)
  })
})
