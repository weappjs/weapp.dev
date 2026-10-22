import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diagnose } from '../src/commands/doctor.js'

let directory: string
const ctx = { lang: 'en' as const }
const operations = { nodeVersion: '22.22.2', packageManagerVersion: async () => '10.0.0' }
beforeEach(async () => {
  directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'weapp-doctor-')))
  await mkdir(path.join(directory, '.git'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
async function json(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, JSON.stringify(value))
}

describe('project-aware doctor', () => {
  it('accepts native projects without npm manifests and skips package manager probes', async () => {
    await json(path.join(directory, 'app.json'), { pages: ['pages/index'] })
    const probe = vi.fn(operations.packageManagerVersion)
    const report = await diagnose(directory, ctx, { ...operations, packageManagerVersion: probe })
    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'manifest')?.severity).toBe('info')
    expect(probe).not.toHaveBeenCalled()
  })

  it('warns about a missing native app.json at the default root without requiring a manifest', async () => {
    await json(path.join(directory, 'project.config.json'), {})
    const report = await diagnose(directory, ctx, operations)
    expect(report.ok).toBe(true)
    expect(report.context.kind).toBe('native')
    expect(report.checks.find(check => check.id === 'native-app')).toMatchObject({ severity: 'warning', advice: expect.stringContaining('miniprogramRoot') })
    expect(report.checks.find(check => check.id === 'manifest')?.severity).toBe('info')
  })

  it('resolves hoisted installed versions only inside the verified workspace', async () => {
    await json(path.join(directory, 'package.json'), { workspaces: ['packages/*'], packageManager: 'pnpm@10.0.0' })
    await json(path.join(directory, 'packages/app/package.json'), { dependencies: { example: '^2.0.0' } })
    await json(path.join(directory, 'node_modules/example/package.json'), { version: '1.0.0' })
    const report = await diagnose(path.join(directory, 'packages/app'), ctx, operations)
    expect(report.checks.find(check => check.id === 'dependencies')?.severity).toBe('ok')
    expect(report.checks.find(check => check.id === 'dependency-versions')).toMatchObject({ severity: 'warning', suggestion: { cwd: directory, command: 'pnpm', args: ['install'] } })
  })

  it('preserves requested-directory JSON semantics while exposing the resolved context', async () => {
    await json(path.join(directory, 'package.json'), { name: 'app' })
    const cwd = path.join(directory, 'src/pages')
    await mkdir(cwd, { recursive: true })
    const probe = vi.fn(async () => '10.0.0')
    const report = await diagnose(cwd, ctx, { ...operations, packageManagerVersion: probe })
    expect(report).toMatchObject({ directory: cwd, requestedDirectory: cwd, projectRoot: directory, context: { kind: 'package', projectRoot: directory } })
    expect(probe).toHaveBeenCalledWith('npm', { cwd: directory })
  })

  it('does not use dependencies from an unverified ancestor', async () => {
    await json(path.join(directory, 'package.json'), {})
    await json(path.join(directory, 'packages/app/package.json'), { dependencies: { example: '^2' } })
    await json(path.join(directory, 'node_modules/example/package.json'), { version: '2.0.0' })
    const report = await diagnose(path.join(directory, 'packages/app'), ctx, operations)
    expect(report.checks.find(check => check.id === 'dependencies')).toMatchObject({ severity: 'warning', message: expect.stringContaining('example') })
  })

  it('does not label protocol, tag, alias, or optional dependencies as missing', async () => {
    await json(path.join(directory, 'package.json'), { dependencies: { local: 'workspace:*', catalog: 'catalog:', alias: 'npm:example@^1', git: 'github:example/repo', tagged: 'latest' }, optionalDependencies: { platform: '^1' } })
    const report = await diagnose(directory, ctx, operations)
    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'dependencies')?.severity).toBe('ok')
    expect(report.checks.find(check => check.id === 'dependency-versions-unverified')?.message).toContain('workspace:*')
    expect(report.checks.find(check => check.id === 'optional-dependencies')?.severity).toBe('info')
    expect(report.checks.some(check => check.message.includes('Missing declared'))).toBe(false)
  })

  it('recognizes PnP without executing its loader or reporting node_modules missing', async () => {
    await json(path.join(directory, 'package.json'), { packageManager: 'yarn@4.0.0', dependencies: { example: '^1' } })
    await writeFile(path.join(directory, '.pnp.cjs'), `throw new Error('must not execute')`)
    const report = await diagnose(directory, ctx, operations)
    expect(report.checks.find(check => check.id === 'dependencies')).toMatchObject({ severity: 'info', message: expect.stringContaining('not evaluated') })
  })

  it('reports package manager version drift and workspace Node incompatibility', async () => {
    await json(path.join(directory, 'package.json'), { workspaces: ['packages/*'], packageManager: 'pnpm@9.0.0', engines: { node: '>=24' } })
    await json(path.join(directory, 'packages/app/package.json'), {})
    const report = await diagnose(path.join(directory, 'packages/app'), ctx, operations)
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'package-manager-version')?.severity).toBe('warning')
    expect(report.checks.find(check => check.id === 'workspace-node')?.severity).toBe('error')
  })

  it('checks package manager engines in both the member and workspace', async () => {
    await json(path.join(directory, 'package.json'), { workspaces: ['packages/*'], packageManager: 'pnpm@10.0.0', engines: { pnpm: '>=11' } })
    await json(path.join(directory, 'packages/app/package.json'), { engines: { pnpm: ' ' } })
    const report = await diagnose(path.join(directory, 'packages/app'), ctx, operations)
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'project-engine:pnpm')).toMatchObject({ severity: 'error', evidence: [path.join(directory, 'packages/app/package.json#engines.pnpm')] })
    expect(report.checks.find(check => check.id === 'workspace-engine:pnpm')?.severity).toBe('error')
  })

  it('gives static weapp-vite guidance and framework-specific documentation without executing config', async () => {
    await json(path.join(directory, 'package.json'), { scripts: { dev: 'vite --config custom.ts' }, devDependencies: { 'weapp-vite': '^3', '@vue-mini/core': '^1' } })
    await writeFile(path.join(directory, 'custom.ts'), `throw new Error('must not execute')`)
    const report = await diagnose(directory, ctx, operations)
    expect(report.checks.find(check => check.id === 'weapp-vite-config')).toMatchObject({ severity: 'warning', advice: expect.stringContaining('--config') })
    expect(report.checks.find(check => check.id === 'framework-docs:@vue-mini/core')?.message).toContain('https://vuemini.org/')
    await writeFile(path.join(directory, 'vite.config.ts'), `throw new Error('must not execute')`)
    const configured = await diagnose(directory, ctx, operations)
    expect(configured.checks.some(check => check.id === 'weapp-vite-config')).toBe(false)
    expect(configured.checks.find(check => check.id === 'vite-config')?.message).toContain('not executed')
  })

  it('keeps failed package manager probes in the structured report', async () => {
    await json(path.join(directory, 'package.json'), {})
    const report = await diagnose(directory, ctx, {
      ...operations,
      packageManagerVersion: async () => {
        throw new Error('probe failed')
      },
    })
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'package-manager:npm')).toMatchObject({ severity: 'error', evidence: [`npm --version (cwd: ${directory})`] })
  })

  it('does not suggest install or probe an arbitrary manager when lockfiles conflict', async () => {
    await json(path.join(directory, 'package.json'), { dependencies: { missing: '^1' } })
    await writeFile(path.join(directory, 'pnpm-lock.yaml'), '')
    await writeFile(path.join(directory, 'yarn.lock'), '')
    const probe = vi.fn(operations.packageManagerVersion)
    const report = await diagnose(directory, ctx, { ...operations, packageManagerVersion: probe })
    expect(probe).not.toHaveBeenCalled()
    expect(report.checks.find(check => check.id === 'dependencies')?.suggestion).toBeUndefined()
    expect(report.checks.find(check => check.id === 'package-manager-lockfiles')?.severity).toBe('warning')
  })
})
