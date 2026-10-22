import type { CliContext } from '../src/types.js'
import { ChildProcess } from 'node:child_process'
import { EventEmitter, getEventListeners } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
// eslint-disable-next-line e18e/ban-dependencies -- Mock the production Windows-safe process boundary.
import spawn from 'cross-spawn'
import { afterEach, expect, it, vi } from 'vitest'
import { executeScaffolder, runCreate } from '../src/commands/create.js'
import { scaffoldPlan } from '../src/commands/create/plan.js'
import { Workbench } from '../src/terminal/workbench.js'

vi.mock('cross-spawn', () => ({ default: vi.fn() }))

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.mocked(spawn).mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-create-lifecycle-'))
  roots.push(root)
  const directory = path.join(root, 'app')
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: vi.fn() })
  let text = ''
  const output = Object.assign(new EventEmitter(), { isTTY: true, columns: 100, rows: 30, write: (value: string) => {
    text += value
    return true
  } })
  const child = new ChildProcess()
  const install = vi.fn(() => child)
  const ctx: CliContext = {
    lang: 'en',
    stdin: input,
    stdout: output,
    stderr: output,
    color: false,
    motion: false,
    interactive: false,
    resources: {},
    openUrl: async () => {},
    createOperations: {
      query: async () => ({ version: '1.0.0' }),
      execute: async (plan) => {
        await mkdir(plan.directory)
        await writeFile(path.join(plan.directory, 'package.json'), JSON.stringify({ dependencies: { 'weapp-vite': '^1' } }))
        return 0
      },
    },
    projectOperations: { spawn: install, packageManagerVersion: async () => '10.9.0' },
  }
  return { ctx, directory, child, install, text: () => text }
}

it('keeps the created project and hub open when Ctrl+C cancels the optional install', async () => {
  const { ctx, directory, child, install } = await fixture()
  const signals = new EventEmitter()
  let createCode: number | undefined
  const workbench = new Workbench(ctx, async argv => createCode = await runCreate({ ...ctx, hub: true }, argv.slice(1), { install: true }))
  Object.defineProperty(workbench.session, 'signals', { value: signals })
  ctx.resources.workbench = workbench
  // Start from a result page, as when returning to create from an existing project.
  workbench.screen = { type: 'result', title: 'PREVIOUS RESULT', lines: [], parent: workbench.hall }
  const session = workbench.run()
  const command = workbench.command(['create', 'weapp-vite', directory])
  try {
    await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1))
    signals.emit('SIGINT')
    expect(workbench.session.suspended).toBe(true)
    expect(workbench.busy).toBe(true)
    child.emit('close', null, 'SIGTERM')
    await command
    expect(createCode).toBe(0)
    expect(workbench.session.closed).toBe(false)
    expect(workbench.session.suspended).toBe(false)
    expect(workbench.abortSignal.aborted).toBe(false)
    expect(ctx.cancelled).toBeUndefined()
    expect(workbench.screen.title).toBe('PROJECT CREATED')
    expect(workbench.screen.type === 'result' && workbench.screen.lines.join('\n')).toContain('installation did not finish')
    expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toContain('weapp-vite')
  }
  finally {
    workbench.cancel()
    child.emit('close', null, 'SIGTERM')
    workbench.finish(0)
    await command
    await session
  }
  expect(signals.listenerCount('SIGINT')).toBe(0)
  expect(signals.listenerCount('SIGTERM')).toBe(0)
})

it('preserves global SIGTERM 143 after the project was created and installation was interrupted', async () => {
  const { ctx, directory, child, install } = await fixture()
  const signals = new EventEmitter()
  let createCode: number | undefined
  const workbench = new Workbench(ctx, async argv => createCode = await runCreate({ ...ctx, hub: true }, argv.slice(1), { install: true }))
  Object.defineProperty(workbench.session, 'signals', { value: signals })
  ctx.resources.workbench = workbench
  workbench.screen = { type: 'result', lines: [], parent: workbench.hall }
  const session = workbench.run()
  const command = workbench.command(['create', 'weapp-vite', directory])
  try {
    await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1))
    signals.emit('SIGTERM')
    child.emit('close', null, 'SIGTERM')
    await command
    expect(await session).toBe(143)
    expect(createCode).toBe(143)
    expect(workbench.abortSignal.aborted).toBe(true)
    expect(workbench.session.closed).toBe(true)
    expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toContain('weapp-vite')
  }
  finally {
    workbench.cancel()
    child.emit('close', null, 'SIGTERM')
    workbench.finish(0)
    await command
    await session
  }
})

it('keeps standalone installation cancellation at 130 and waits for process close', async () => {
  const { ctx, directory, child, install, text } = await fixture()
  const controller = new AbortController()
  ctx.operationSignal = controller.signal
  let settled = false
  const creation = runCreate(ctx, ['weapp-vite', directory], { install: true }).then((code) => {
    settled = true
    return code
  })
  try {
    await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1))
    controller.abort()
    await Promise.resolve()
    expect(settled).toBe(false)
    child.emit('close', null, 'SIGTERM')
    expect(await creation).toBe(130)
    expect(text()).toContain('Project created; installation did not finish')
    expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toContain('weapp-vite')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  }
  finally {
    controller.abort()
    child.emit('close', null, 'SIGTERM')
    await creation
  }
})

it('runs the official scaffolder with its inherited environment and fixed argv', async () => {
  const { directory } = await fixture()
  const plan = await scaffoldPlan('weapp-vite', directory)
  const child = new ChildProcess()
  vi.stubEnv('COREPACK_ENABLE_NETWORK', '1')
  vi.mocked(spawn).mockReturnValue(child)
  const execution = executeScaffolder(plan, '1.2.3')
  expect(spawn).toHaveBeenCalledWith('npm', ['exec', '--yes', '--package=create-weapp-vite@1.2.3', '--', 'create-weapp-vite', 'app', 'default', '--no-install-skills'], expect.objectContaining({ cwd: plan.cwd, env: process.env, stdio: 'inherit', shell: false }))
  child.emit('close', 0, null)
  expect(await execution).toEqual({ code: 0, signal: null })
})

it.skipIf(process.platform === 'win32')('waits for official scaffolder process group cleanup after its parent closes', async () => {
  const { directory } = await fixture()
  const plan = await scaffoldPlan('weapp-vite', directory)
  const child = new ChildProcess()
  Object.defineProperty(child, 'pid', { value: 246801 })
  vi.mocked(spawn).mockReturnValue(child)
  let groupExists = true
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    if (!groupExists) {
      throw Object.assign(new Error('Process group ended'), { code: 'ESRCH' })
    }
    return true
  })
  const controller = new AbortController()
  let settled = false
  const execution = executeScaffolder(plan, '1.2.3', { signal: controller.signal }).catch((error: unknown) => {
    settled = true
    return error
  })
  try {
    controller.abort()
    child.emit('close', null, 'SIGTERM')
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(kill).toHaveBeenCalledWith(-246801, 'SIGTERM')
    groupExists = false
    expect(await execution).toMatchObject({ name: 'AbortError' })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  }
  finally {
    groupExists = false
    controller.abort()
    child.emit('close', null, 'SIGTERM')
    await execution
  }
})
