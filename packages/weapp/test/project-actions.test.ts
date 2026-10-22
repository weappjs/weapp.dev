import type { ProjectContext } from '../src/project/context.js'
import type { ProjectSpawn } from '../src/project/process.js'
import { ChildProcess, execFileSync, spawn as nodeSpawn } from 'node:child_process'
import { getEventListeners } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actionDisplayCommand, executeProjectAction, installedPackageManagerVersion, projectActions, validateProjectAction } from '../src/project/actions.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-project-actions-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

function context(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    requestedDirectory: directory,
    projectRoot: directory,
    kind: 'package',
    manifest: { name: 'fixture', scripts: { dev: 'vite', build: 'vite build' } },
    packageManager: { name: 'npm', source: 'default', conflicts: [] },
    frameworks: [],
    configs: [],
    lockfiles: [],
    issues: [],
    ...overrides,
  }
}
const availableManager = async (): Promise<string> => '10.9.0'
const sameContext = async (previous: ProjectContext): Promise<ProjectContext> => previous
function fakeChild(pid = 123456): ChildProcess {
  const child = new ChildProcess()
  Object.defineProperty(child, 'pid', { value: pid })
  return child
}

describe('project action planning and validation', () => {
  it.each(['npm', 'pnpm', 'yarn', 'bun'] as const)('installs at the verified workspace root and runs %s scripts in the member', (name) => {
    const project = context({
      projectRoot: path.join(directory, 'packages/app'),
      workspace: { root: directory, memberPath: 'packages/app', evidence: ['pnpm-workspace.yaml'] },
      packageManager: { name, source: 'lockfile', conflicts: [] },
    })
    const actions = projectActions(project)
    expect(actions.map(({ kind, cwd, command, args }) => ({ kind, cwd, command, args }))).toEqual([
      { kind: 'install', cwd: directory, command: name, args: ['install'] },
      { kind: 'script', cwd: project.projectRoot, command: name, args: ['run', 'dev'] },
      { kind: 'script', cwd: project.projectRoot, command: name, args: ['run', 'build'] },
    ])
  })

  it('does not expose actions without a manifest, for native projects, or while manager selection is unresolved', () => {
    expect(projectActions(context({ manifest: undefined }))).toEqual([])
    expect(projectActions(context({ kind: 'native' }))).toEqual([])
    expect(projectActions(context({ kind: 'invalid' }))).toEqual([])
    expect(projectActions(context({ packageManager: { source: 'unresolved', conflicts: [] } }))).toEqual([])
  })

  it('stops conflicting declarations before even probing a manager', async () => {
    const project = context({ packageManager: { name: 'npm', source: 'declaration', conflicts: [{ id: 'manager-conflict', severity: 'error', message: 'Conflicting package managers' }] } })
    const query = vi.fn(availableManager)
    const spawn = vi.fn<ProjectSpawn>()
    const result = await executeProjectAction(projectActions(project)[0], { packageManagerVersion: query, spawn })
    expect(result).toMatchObject({ status: 'failed', errors: [{ id: 'manager-conflict' }] })
    expect(query).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it.each(['>=24', 'definitely-not-semver', 24])('blocks unmet or invalid member Node requirements: %s', async (requirement) => {
    const project = context({ manifest: { engines: { node: requirement } } })
    const query = vi.fn(availableManager)
    const result = await validateProjectAction(projectActions(project)[0], { nodeVersion: '18.20.8', packageManagerVersion: query })
    expect(result.valid).toBe(false)
    expect(result.errors[0].id).toBe('engine:package:node')
    expect(query).not.toHaveBeenCalled()
  })

  it('also honors workspace Node and package manager engines', async () => {
    const project = context({ workspace: { root: directory, memberPath: 'app', evidence: ['package.json'], manifest: { engines: { node: '>=18', npm: '>=11' } } } })
    const result = await validateProjectAction(projectActions(project)[0], { nodeVersion: '18.20.8', packageManagerVersion: availableManager })
    expect(result.errors.map(error => error.id)).toContain('engine:workspace:npm')
  })

  it('requires the declared manager version and refuses unavailable managers', async () => {
    const project = context({ packageManager: { name: 'pnpm', version: '10.0.0', source: 'declaration', conflicts: [] } })
    const action = projectActions(project)[0]
    expect((await validateProjectAction(action, { packageManagerVersion: availableManager })).errors[0].id).toBe('package-manager:version')
    expect((await validateProjectAction(action, { packageManagerVersion: async () => null })).errors[0].id).toBe('package-manager:unavailable')
    expect((await validateProjectAction(action, { packageManagerVersion: async () => '10.0.0' })).valid).toBe(true)
  })

  it('rejects altered cwd/argv and option-like script names before execution', async () => {
    const action = projectActions(context())[0]
    expect((await validateProjectAction({ ...action, cwd: path.dirname(directory) }, { packageManagerVersion: availableManager })).errors[0].id).toBe('action:invalid')
    expect((await validateProjectAction({ ...action, args: ['install', '--global'] }, { packageManagerVersion: availableManager })).errors[0].id).toBe('action:invalid')
    const script = projectActions(context({ manifest: { scripts: { '--version': 'echo nope' } } }))[1]
    expect((await validateProjectAction(script, { packageManagerVersion: availableManager })).errors[0].id).toBe('script:invalid')
  })

  it('preserves script arguments as one value and quotes only their display', async () => {
    const action = projectActions(context({ manifest: { scripts: { 'test; touch unexpected': 'node test.js' } } }))[1]
    const spawn = vi.fn<ProjectSpawn>(() => {
      const child = fakeChild()
      setImmediate(() => child.emit('close', 0, null))
      return child
    })
    expect(actionDisplayCommand(action)).toBe('npm run \'test; touch unexpected\'')
    expect(await executeProjectAction(action, { packageManagerVersion: availableManager, refreshContext: sameContext, spawn })).toMatchObject({ status: 'success', code: 0 })
    expect(spawn).toHaveBeenCalledWith('npm', ['run', 'test; touch unexpected'], expect.objectContaining({
      cwd: directory,
      stdio: 'inherit',
      shell: false,
      env: expect.objectContaining({ COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false' }),
    }))
  })

  it('refuses a script changed on disk during compatibility checks and requires fresh confirmation', async () => {
    const { discoverProject } = await import('../src/project/context.js')
    const filename = path.join(directory, 'package.json')
    await writeFile(filename, JSON.stringify({ scripts: { dev: 'node approved.js' } }))
    const project = await discoverProject(directory)
    const spawn = vi.fn<ProjectSpawn>()
    const result = await executeProjectAction(projectActions(project)[1], {
      packageManagerVersion: async () => {
        await writeFile(filename, JSON.stringify({ scripts: { dev: 'node changed.js' } }))
        return '10.9.0'
      },
      spawn,
    })
    expect(result).toMatchObject({ status: 'failed', errors: [{ id: 'action:changed' }] })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('does not run after cancellation during context refresh', async () => {
    const controller = new AbortController()
    const spawn = vi.fn<ProjectSpawn>()
    const result = await executeProjectAction(projectActions(context())[0], {
      packageManagerVersion: availableManager,
      refreshContext: async (previous) => {
        controller.abort()
        return previous
      },
      signal: controller.signal,
      spawn,
    })
    expect(result.status).toBe('cancelled')
    expect(spawn).not.toHaveBeenCalled()
  })
})

describe('package manager process lifecycle', () => {
  it('probes only --version with Corepack downloads and pnpm automatic switching disabled', async () => {
    const spawn = vi.fn<ProjectSpawn>(() => {
      const child = fakeChild()
      child.stdout = new PassThrough()
      setImmediate(() => {
        child.stdout!.emit('data', '10.9.0\n')
        child.emit('close', 0, null)
      })
      return child
    })
    expect(await installedPackageManagerVersion('npm', { cwd: directory, spawn })).toBe('10.9.0')
    expect(spawn).toHaveBeenCalledWith('npm', ['--version'], expect.objectContaining({
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0', npm_config_manage_package_manager_versions: 'false' }),
    }))
  })

  it('does not launch a process for an already cancelled action', async () => {
    const controller = new AbortController()
    controller.abort()
    const spawn = vi.fn<ProjectSpawn>()
    expect(await executeProjectAction(projectActions(context())[0], { signal: controller.signal, spawn })).toMatchObject({ status: 'cancelled', code: 130 })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('times out a stalled version query, terminates its group, and removes cancellation listeners', async () => {
    const child = fakeChild()
    const controller = new AbortController()
    const kill = vi.fn((_pid: number, signal: NodeJS.Signals | number) => {
      if (signal === 'SIGTERM') {
        setImmediate(() => child.emit('close', null, 'SIGTERM'))
      }
      return true
    })
    expect(await installedPackageManagerVersion('npm', { cwd: directory, spawn: () => child, platform: 'linux', kill, probeTimeoutMs: 10, terminateGraceMs: 0, signal: controller.signal })).toBeNull()
    expect(kill).toHaveBeenCalledWith(-123456, 'SIGTERM')
    expect(kill).toHaveBeenCalledWith(-123456, 'SIGKILL')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('returns failures for nonzero exits and spawn errors, waiting for close', async () => {
    for (const code of [7, null]) {
      const spawn = vi.fn<ProjectSpawn>(() => {
        const child = fakeChild()
        setImmediate(() => {
          if (code === null) {
            child.emit('error', new Error('https://user:secret@example.invalid/'))
          }
          child.emit('close', code, null)
        })
        return child
      })
      const result = await executeProjectAction(projectActions(context())[0], { packageManagerVersion: availableManager, refreshContext: sameContext, spawn })
      expect(result.status).toBe('failed')
      expect(result.code).toBe(code || 1)
      expect(JSON.stringify(result)).not.toContain('secret')
    }
  })

  it('uses Windows tree termination and waits for both taskkill and original close', async () => {
    const controller = new AbortController()
    const command = fakeChild(12345)
    const taskkill = fakeChild(54321)
    const spawn = vi.fn<ProjectSpawn>(name => name === 'taskkill' ? taskkill : command)
    let settled = false
    const result = executeProjectAction(projectActions(context())[0], { packageManagerVersion: availableManager, refreshContext: sameContext, spawn, platform: 'win32', signal: controller.signal }).then((value) => {
      settled = true
      return value
    })
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    controller.abort()
    expect(spawn).toHaveBeenLastCalledWith('taskkill', ['/PID', '12345', '/T', '/F'], expect.objectContaining({ shell: false, stdio: 'ignore' }))
    command.emit('close', null, 'SIGTERM')
    await Promise.resolve()
    expect(settled).toBe(false)
    taskkill.emit('close', 0, null)
    expect(await result).toMatchObject({ status: 'cancelled', code: 130 })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it.skipIf(process.platform === 'win32')('terminates real lifecycle grandchildren that ignore SIGTERM before returning', async () => {
    const fixture = path.join(directory, 'manager.cjs')
    const descendantFile = path.join(directory, 'descendant.pid')
    await mkdir(path.join(directory, 'app'))
    await writeFile(fixture, `
const { spawn } = require('node:child_process')
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)", process.argv[2]], { stdio: 'inherit' })
process.on('SIGTERM', () => {})
child.on('exit', () => process.exit(0))
setInterval(() => {}, 1000)
`)
    const controller = new AbortController()
    const spawn: ProjectSpawn = (_command, _args, options) => nodeSpawn(process.execPath, [fixture, descendantFile], options)
    const execution = executeProjectAction(projectActions(context())[0], { packageManagerVersion: availableManager, refreshContext: sameContext, spawn, signal: controller.signal, terminateGraceMs: 40 })
    try {
      let descendant = 0
      await vi.waitFor(async () => {
        descendant = Number(await readFile(descendantFile, 'utf8'))
        expect(descendant).toBeGreaterThan(0)
      })
      controller.abort()
      expect(await execution).toMatchObject({ status: 'cancelled', code: 130 })
      await vi.waitFor(() => {
        let running = false
        try {
          running = !execFileSync('ps', ['-p', String(descendant), '-o', 'stat='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().startsWith('Z')
        }
        catch { /* The descendant no longer exists. */ }
        expect(running).toBe(false)
      })
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    }
    finally {
      controller.abort()
      await execution
    }
  })
})
