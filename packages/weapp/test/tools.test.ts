import type { CreateOperations, CreateRoute, ScaffolderMetadata } from '../src/commands/create.js'
import type { CliContext, Language } from '../src/types.js'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import jsQR from 'jsqr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CREATE_ADAPTERS, createProject, npmExecArgs, parseScaffolderMetadata, runCreate, scaffoldPlan } from '../src/commands/create.js'
import { diagnose, runDoctor } from '../src/commands/doctor.js'
import { generatePalette, luminance, runPalette } from '../src/commands/palette.js'
import { qrTerminal, readQrInput, runQr } from '../src/commands/qr.js'
import { TEMPLATE_DETAILS, TEMPLATES } from '../src/templates.js'
import { Workbench } from '../src/terminal/workbench.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-tools-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
interface FakeOperationOptions {
  metadata?: Partial<ScaffolderMetadata>
  noFiles?: boolean
  invalidJson?: boolean
  wrongDependency?: boolean
  code?: number
}
function fakeOperations(dependency: string, options: FakeOperationOptions = {}) {
  return {
    nodeVersion: '22.22.2',
    query: vi.fn<NonNullable<CreateOperations['query']>>(async () => ({ version: '1.2.3', engines: { node: '>=18' }, ...options.metadata })),
    execute: vi.fn<NonNullable<CreateOperations['execute']>>(async (plan) => {
      if (!options.noFiles) {
        await mkdir(plan.directory)
        await writeFile(path.join(plan.directory, 'package.json'), options.invalidJson ? '{' : JSON.stringify({ name: 'test', devDependencies: { [options.wrongDependency ? 'wrong' : dependency]: '^1.0.0' } }))
      }
      return { code: options.code || 0 }
    }),
  }
}
type TestContext = Omit<CliContext, 'createOperations'> & { createOperations: ReturnType<typeof fakeOperations> }
function context(lang: Language = 'en', input: (string | Uint8Array)[] = []): { ctx: TestContext, output: { stdout: string, stderr: string } } {
  const output = { stdout: '', stderr: '' }
  const ctx: TestContext = {
    lang,
    color: false,
    motion: false,
    interactive: false,
    resources: {},
    openUrl: async () => {},
    createOperations: fakeOperations('weapp-vite'),
    stdin: Readable.from(input),
    stdout: { write: (text) => {
      output.stdout += text
      return true
    } },
    stderr: { write: (text) => {
      output.stderr += text
      return true
    } },
  }
  return { ctx, output }
}
function capturedWorkbench(ctx: CliContext, external: (callback: () => unknown | Promise<unknown>) => Promise<unknown>, workbench = new Workbench(ctx)): Workbench {
  workbench.external = async <T>(callback: () => T | Promise<T>): Promise<T> => {
    let result: { value: T } | undefined
    await external(async () => {
      result = { value: await callback() }
    })
    if (!result) {
      throw new Error('Captured scaffolder did not execute')
    }
    return result.value
  }
  return workbench
}
describe('official scaffold adapters', () => {
  it('provides bilingual use cases for each official weapp-vite template', () => {
    expect(TEMPLATES).toEqual(['default', 'wevu', 'react', 'tailwindcss', 'multi-platform-sfc'])
    expect(Object.keys(TEMPLATE_DETAILS)).toEqual(TEMPLATES)
    for (const template of TEMPLATES) {
      expect(TEMPLATE_DETAILS[template].zh).toMatch(/[\u4E00-\u9FFF]/)
      expect(TEMPLATE_DETAILS[template].en.length).toBeGreaterThan(20)
      expect(Object.isFrozen(TEMPLATE_DETAILS[template])).toBe(true)
    }
    expect(Object.isFrozen(TEMPLATES)).toBe(true)
  })
  it('normalizes npm JSON output with and without engines metadata', () => {
    expect(parseScaffolderMetadata('"2.17.1"')).toEqual({ version: '2.17.1' })
    expect(parseScaffolderMetadata('{"version":"1.4.5","engines":{"node":">=18"}}')).toEqual({ version: '1.4.5', engines: { node: '>=18' } })
  })
  it.each(['null', '[]', '{}', '{"version":24}', '{"version":"1.2.3","engines":{"node":18}}'])('rejects malformed registry metadata at the JSON boundary: %s', (metadata) => {
    expect(() => parseScaffolderMetadata(metadata)).toThrow()
  })
  it.each(Object.keys(CREATE_ADAPTERS) as CreateRoute[])('pins the official %s creator and verifies its dependency', async (route) => {
    const adapter = CREATE_ADAPTERS[route]
    const operations = fakeOperations(adapter.dependency)
    const result = await createProject(route, path.join(directory, route), {}, operations)
    expect(operations.query).toHaveBeenCalledWith(adapter.package, { cwd: await realpath(directory), signal: undefined })
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
  it.each(['sqlite', 'weapp-sqlite', '@weapp-sqlite/weapp-vite'])('keeps the SQLite integration outside scaffold routes: %s', async (route) => {
    const operations = fakeOperations('@weapp-sqlite/weapp-vite')
    await expect(createProject(route, path.join(directory, 'app'), { dryRun: true }, operations)).rejects.toThrow(/Unknown creation route/)
    await expect(createProject(route, path.join(directory, 'app'), {}, operations)).rejects.toThrow(/Unknown creation route/)
    expect(operations.query).not.toHaveBeenCalled()
    expect(operations.execute).not.toHaveBeenCalled()
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
describe('interactive project creation', () => {
  it('defaults to weapp-vite and preserves command options through the wizard', async () => {
    const { ctx, output } = context()
    ctx.interactive = true
    ctx.createOperations = fakeOperations('weapp-vite')
    ctx.createWizard = vi.fn(async () => ({ args: ['weapp-vite', path.join(directory, 'app')], options: { template: 'react' } }))
    const options = { dryRun: true }
    expect(await runCreate(ctx, [], options)).toBe(0)
    expect(ctx.createWizard).toHaveBeenCalledWith('weapp-vite', options, expect.objectContaining({ onPlan: expect.any(Function) }))
    expect(output.stdout).toContain('app react --no-install-skills')
    expect(output.stdout).toContain('does not access the network')
    expect(output.stderr).toBe('')
    expect(ctx.createOperations.query).not.toHaveBeenCalled()
    expect(ctx.createOperations.execute).not.toHaveBeenCalled()
    expect(options).toEqual({ dryRun: true })
  })
  it.each(['weapp-vite', 'vue-mini', 'rezor', 'uni', 'taro'] as const)('opens the wizard for the explicit %s route', async (route) => {
    const { ctx } = context()
    ctx.interactive = true
    ctx.createOperations = fakeOperations(CREATE_ADAPTERS[route].dependency)
    ctx.createWizard = vi.fn(async () => ({ args: [route, path.join(directory, 'app')], options: {} }))
    expect(await runCreate(ctx, [route], {})).toBe(0)
    expect(ctx.createWizard).toHaveBeenCalledWith(route, {}, expect.objectContaining({ onPlan: expect.any(Function) }))
    expect(ctx.createOperations.query).toHaveBeenCalledWith(CREATE_ADAPTERS[route].package, { cwd: await realpath(directory), signal: expect.any(AbortSignal) })
    expect(ctx.createOperations.execute).toHaveBeenCalledOnce()
  })
  it('skips the wizard when both route and directory are explicit', async () => {
    const { ctx } = context()
    ctx.interactive = true
    ctx.createWizard = vi.fn()
    ctx.createOperations = fakeOperations('weapp-vite')
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')], {})).toBe(0)
    expect(ctx.createWizard).not.toHaveBeenCalled()
    expect(ctx.createOperations.execute).toHaveBeenCalledOnce()
  })
  it.each([{ args: [] }, { args: ['weapp-vite'] }, { args: ['uni'] }])('requires a directory in non-interactive terminals: %j', async ({ args }) => {
    const { ctx, output } = context()
    ctx.createWizard = vi.fn()
    ctx.createOperations = fakeOperations('weapp-vite')
    expect(await runCreate(ctx, args, {})).toBe(1)
    expect(output.stderr).toContain('requires a new project directory')
    expect(ctx.createWizard).not.toHaveBeenCalled()
    expect(ctx.createOperations.query).not.toHaveBeenCalled()
    expect(ctx.createOperations.execute).not.toHaveBeenCalled()
  })
  it.each(['my-app', 'vite', 'weapp-sqlite', '@weapp-sqlite/weapp-vite', 'constructor', '__proto__'])('rejects non-whitelisted routes before prompting: %s', async (route) => {
    const { ctx, output } = context()
    ctx.interactive = true
    ctx.createWizard = vi.fn()
    ctx.createOperations = fakeOperations('weapp-vite')
    expect(await runCreate(ctx, [route], {})).toBe(1)
    expect(output.stderr).toContain('Unknown creation route')
    expect(ctx.createWizard).not.toHaveBeenCalled()
    expect(ctx.createOperations.query).not.toHaveBeenCalled()
  })
  it.each([
    { args: [], options: { template: 'unknown' }, message: 'Unknown template' },
    { args: ['uni'], options: { template: 'react' }, message: 'only available for weapp-vite' },
  ])('validates supplied template options before opening the wizard: %j', async ({ args, options, message }) => {
    const { ctx, output } = context()
    ctx.interactive = true
    ctx.createWizard = vi.fn()
    expect(await runCreate(ctx, args, options)).toBe(1)
    expect(output.stderr).toContain(message)
    expect(ctx.createWizard).not.toHaveBeenCalled()
  })
  it.each([
    { cancelled: false, expected: 0 },
    { cancelled: true, expected: 130 },
    { cancelled: true, cancelledCode: 143, expected: 143 },
  ])('returns the wizard cancellation code without executing: %j', async ({ expected, ...state }) => {
    const { ctx, output } = context()
    Object.assign(ctx, { interactive: true, ...state })
    ctx.createWizard = vi.fn(async () => null)
    ctx.createOperations = fakeOperations('weapp-vite')
    expect(await runCreate(ctx, [], {})).toBe(expected)
    expect(output).toEqual({ stdout: '', stderr: '' })
    expect(ctx.createOperations.query).not.toHaveBeenCalled()
    expect(ctx.createOperations.execute).not.toHaveBeenCalled()
  })
  it.each([
    { args: ['weapp-vite'] },
    { args: ['my-app', 'app'] },
    { args: ['weapp-vite', 'app'], options: { template: 'unsafe' } },
  ])('rejects invalid wizard results before metadata lookup: %j', async (selection) => {
    const { ctx, output } = context()
    ctx.interactive = true
    ctx.createWizard = vi.fn(async () => selection)
    ctx.createOperations = fakeOperations('weapp-vite')
    expect(await runCreate(ctx, [], {})).toBe(1)
    expect(output.stderr).toBeTruthy()
    expect(ctx.createOperations.query).not.toHaveBeenCalled()
  })
  it.each([0, 2])('releases and restores the workbench around upstream execution with exit %s', async (code) => {
    const { ctx } = context()
    const operations = fakeOperations('weapp-vite', { code })
    const lifecycle: string[] = []
    operations.query.mockImplementation(async () => {
      lifecycle.push('query')
      return { version: '1.2.3', engines: { node: '>=18' } }
    })
    const execute = operations.execute.getMockImplementation()
    if (!execute) {
      throw new Error('Missing fake scaffolder implementation')
    }
    operations.execute.mockImplementation(async (...args) => {
      lifecycle.push('execute')
      return execute(...args)
    })
    const external = vi.fn(async <T>(callback: () => T | Promise<T>): Promise<T> => {
      lifecycle.push('release')
      try {
        return await callback()
      }
      finally {
        lifecycle.push('restore')
      }
    })
    ctx.resources = { workbench: capturedWorkbench(ctx, external) }
    ctx.createOperations = operations
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')], {})).toBe(code === 0 ? 0 : 1)
    expect(lifecycle).toEqual(['query', 'release', 'execute', 'restore'])
    expect(external).toHaveBeenCalledOnce()
    expect(operations.execute).toHaveBeenCalledWith(expect.objectContaining({ route: 'weapp-vite' }), '1.2.3', { signal: expect.any(AbortSignal) })
  })
  it('does not suspend the workbench or query metadata for a dry-run', async () => {
    const { ctx } = context()
    const external = vi.fn<Workbench['external']>()
    ctx.resources = { workbench: capturedWorkbench(ctx, external) }
    ctx.createOperations = fakeOperations('weapp-vite')
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')], { dryRun: true })).toBe(0)
    expect(external).not.toHaveBeenCalled()
    expect(ctx.createOperations.query).not.toHaveBeenCalled()
  })
  it('does not start scaffolding when metadata resolves after a workbench cancellation', async () => {
    const { ctx, output } = context()
    const workbench = new Workbench(ctx)
    const controller = workbench.abortController
    let resolveMetadata!: (metadata: ScaffolderMetadata) => void
    let startedQuery!: () => void
    const querying = new Promise<void>((resolve) => {
      startedQuery = resolve
    })
    ctx.createOperations = fakeOperations('weapp-vite')
    ctx.createOperations.query.mockImplementation(() => {
      startedQuery()
      return new Promise<ScaffolderMetadata>((resolve) => {
        resolveMetadata = resolve
      })
    })
    const external = vi.fn(async <T>(callback: () => T | Promise<T>): Promise<T> => callback())
    ctx.resources = { workbench: capturedWorkbench(ctx, external, workbench) }
    const creating = runCreate(ctx, ['weapp-vite', path.join(directory, 'app')], {})
    await querying
    ctx.cancelledCode = 143
    controller.abort()
    resolveMetadata({ version: '1.2.3', engines: { node: '>=18' } })
    expect(await creating).toBe(143)
    expect(ctx.createOperations.query).toHaveBeenCalledWith('create-weapp-vite', { cwd: await realpath(directory), signal: expect.any(AbortSignal) })
    expect(ctx.createOperations.query.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(ctx.createOperations.execute).not.toHaveBeenCalled()
    expect(external).not.toHaveBeenCalled()
    expect(output.stderr).toBe('')
    expect(output.stdout).toContain('Checking the scaffolder version')
    expect(output.stdout).not.toContain('Running the official scaffolder')
    await expect(readFile(path.join(directory, 'app', 'package.json'))).rejects.toHaveProperty('code', 'ENOENT')
  })
  it('stops a delayed metadata result after context cancellation even without an AbortSignal', async () => {
    const { ctx, output } = context()
    ctx.createOperations = fakeOperations('weapp-vite')
    ctx.createOperations.query.mockImplementation(async () => {
      ctx.cancelled = true
      return { version: '1.2.3' }
    })
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')], {})).toBe(130)
    expect(ctx.createOperations.execute).not.toHaveBeenCalled()
    expect(output.stderr).toBe('')
    expect(output.stdout).toContain('Checking the scaffolder version')
  })
  it('refuses a pre-aborted creation before looking up metadata', async () => {
    const controller = new AbortController()
    controller.abort()
    const operations = { ...fakeOperations('weapp-vite'), signal: controller.signal }
    await expect(createProject('weapp-vite', path.join(directory, 'app'), {}, operations)).rejects.toHaveProperty('name', 'AbortError')
    expect(operations.query).not.toHaveBeenCalled()
    expect(operations.execute).not.toHaveBeenCalled()
  })
  it('rechecks cancellation when the workbench hands terminal input to the executor', async () => {
    const { ctx, output } = context()
    const controller = new AbortController()
    ctx.operationSignal = controller.signal
    ctx.createOperations = fakeOperations('weapp-vite')
    const external = vi.fn(async <T>(callback: () => T | Promise<T>): Promise<T> => {
      controller.abort()
      return callback()
    })
    ctx.resources = { workbench: capturedWorkbench(ctx, external) }
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')], {})).toBe(130)
    expect(external).toHaveBeenCalledOnce()
    expect(ctx.createOperations.execute).not.toHaveBeenCalled()
    expect(output.stderr).toBe('')
    expect(output.stdout).not.toContain('Project created:')
  })
})
describe('read-only doctor', () => {
  const operations = { nodeVersion: '22.22.2', packageManagerVersion: async () => '10.0.0' }
  it('reports missing or malformed manifests as errors, warnings do not fail', async () => {
    const { ctx } = context()
    expect((await diagnose(directory, ctx, operations)).ok).toBe(false)
    await writeFile(path.join(directory, 'package.json'), '{')
    expect((await diagnose(directory, ctx, operations)).checks.find(check => check.id === 'manifest')?.severity).toBe('error')
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'app', dependencies: { 'weapp-vite': '^3' } }))
    const report = await diagnose(directory, ctx, operations)
    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'dependencies')?.severity).toBe('warning')
  })
  it('finds conflicting locks, missing declared dependencies and invalid project Node', async () => {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'app', engines: { node: '>=24' }, packageManager: 'pnpm@10.0.0', dependencies: { 'weapp-vite': '^3', 'missing': '1' } }))
    await writeFile(path.join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9')
    await writeFile(path.join(directory, 'yarn.lock'), '')
    await mkdir(path.join(directory, 'node_modules', 'weapp-vite'), { recursive: true })
    await writeFile(path.join(directory, 'node_modules', 'weapp-vite', 'package.json'), '{}')
    const report = await diagnose(directory, context().ctx, operations)
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'lockfiles')?.severity).toBe('warning')
    expect(report.checks.find(check => check.id === 'dependencies')?.message).toMatch(/missing/)
  })
  it('identifies JSON and Vite configuration without executing project scripts or config', async () => {
    const marker = path.join(directory, 'must-not-exist')
    const manifest = JSON.stringify({ name: 'read-only', scripts: { doctor: `touch ${marker}` } })
    await writeFile(path.join(directory, 'package.json'), manifest)
    await writeFile(path.join(directory, 'vite.config.js'), `throw new Error('must not run')`)
    await writeFile(path.join(directory, 'project.config.json'), '{}')
    const report = await diagnose(directory, context('zh-CN').ctx, operations)
    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'vite-config')?.message).toMatch(/未执行配置/)
    expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toBe(manifest)
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('emits only a JSON report for machine output, including missing directories', async () => {
    const { ctx, output } = context()
    expect(await runDoctor(ctx, [path.join(directory, 'missing')], { json: true })).toBe(1)
    expect(JSON.parse(output.stdout) as unknown).toMatchObject({ ok: false })
    expect(output.stdout).not.toContain(String.fromCharCode(27))
    expect(output.stderr).toBe('')
  })
  it('detects an unavailable selected package manager', async () => {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.0.0' }))
    const report = await diagnose(directory, context().ctx, { ...operations, packageManagerVersion: async command => command === 'npm' ? '10.0.0' : null })
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'package-manager:pnpm')?.severity).toBe('error')
  })
})
function decodeTerminal(text: string): string | undefined {
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
    expect(JSON.parse(output.stdout) as unknown).toMatchObject({ base: '#aabbcc' })
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
    expect(JSON.parse(output.stdout) as unknown).toMatchObject({ base: '#aabbcc', output: filename })
    expect(JSON.parse(await readFile(filename, 'utf8')) as unknown).toMatchObject({ base: '#aabbcc' })
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
