import type { CliContext } from '../src/types.js'
import { ChildProcess, execFileSync, spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter, getEventListeners } from 'node:events'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
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
  const interruptListeners = process.listenerCount('SIGINT')
  const terminateListeners = process.listenerCount('SIGTERM')
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
    expect(process.listenerCount('SIGINT')).toBe(interruptListeners)
    expect(process.listenerCount('SIGTERM')).toBe(terminateListeners)
  }
  finally {
    controller.abort()
    child.emit('close', null, 'SIGTERM')
    await creation
  }
})

function isRunning(pid: number): boolean {
  try {
    return !execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().startsWith('Z')
  }
  catch {
    return false
  }
}

// Windows does not deliver POSIX signals through process.kill; tree termination is tested separately.
it.skipIf(process.platform === 'win32').each([
  { phase: 'scaffolder', signal: 'SIGINT', code: 130 },
  { phase: 'scaffolder', signal: 'SIGTERM', code: 143 },
  { phase: 'install', signal: 'SIGINT', code: 130 },
  { phase: 'install', signal: 'SIGTERM', code: 143 },
] as const)('cleans standalone $phase descendants before returning $code on $signal', async ({ phase, signal, code }) => {
  const { directory } = await fixture()
  const root = path.dirname(directory)
  const bin = path.join(root, 'bin')
  await mkdir(bin)
  const managerPidFile = path.join(root, 'manager.pid')
  const descendantPidFile = path.join(root, 'descendant.pid')
  const manager = path.join(bin, 'npm')
  await writeFile(manager, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
function waitForCancellation() {
  process.on('SIGTERM', () => {});
  spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.env.WEAPP_SIGNAL_DESCENDANT_PID, String(process.pid)); setInterval(() => {}, 1000);"], { stdio: 'inherit' });
  fs.writeFileSync(process.env.WEAPP_SIGNAL_MANAGER_PID, String(process.pid));
  setInterval(() => {}, 1000);
}
if (args[0] === 'view') process.stdout.write(JSON.stringify({ version: '1.0.0', engines: { node: '>=18' } }));
else if (args[0] === '--version') process.stdout.write('10.9.0\\n');
else if (args[0] === 'exec') {
  const target = path.resolve(args[args.indexOf('--') + 2]);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ dependencies: { 'weapp-vite': '1.0.0' } }));
  if (process.env.WEAPP_SIGNAL_PHASE === 'scaffolder') waitForCancellation();
}
else if (args[0] === 'install') waitForCancellation();
else process.exitCode = 2;
`)
  await chmod(manager, 0o755)
  const cli = nodeSpawn(process.execPath, [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), 'create', 'weapp-vite', directory, '--lang', 'en', ...(phase === 'install' ? ['--install'] : [])], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CI: '1', WEAPP_SIGNAL_PHASE: phase, WEAPP_SIGNAL_MANAGER_PID: managerPidFile, WEAPP_SIGNAL_DESCENDANT_PID: descendantPidFile },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  cli.stdout.on('data', value => output += value.toString())
  cli.stderr.on('data', value => output += value.toString())
  const descendants: number[] = []
  const exited = new Promise<{ code: number | null, signal: NodeJS.Signals | null, surviving: number[] }>((resolve) => {
    cli.once('exit', (code, signal) => resolve({ code, signal, surviving: descendants.filter(isRunning) }))
  })
  const closed = new Promise<void>(resolve => cli.once('close', () => resolve()))
  try {
    await vi.waitFor(async () => {
      expect(cli.exitCode, output).toBeNull()
      const [managerPid, descendantPid] = await Promise.all([readFile(managerPidFile, 'utf8'), readFile(descendantPidFile, 'utf8')])
      descendants.splice(0, descendants.length, Number(managerPid), Number(descendantPid))
      expect(descendants.every(pid => pid > 0)).toBe(true)
    }, { timeout: 5000, interval: 20 })
    process.kill(-cli.pid!, signal)
    expect(await exited, output).toEqual({ code, signal: null, surviving: [] })
    await closed
    expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toContain('weapp-vite')
    if (phase === 'install') {
      expect(output).toContain('Project created; installation did not finish')
    }
  }
  finally {
    // Only groups created by this test are eligible for fallback cleanup.
    const managerPid = descendants[0] || await readFile(managerPidFile, 'utf8').then(Number, () => undefined)
    for (const pid of [managerPid, cli.pid]) {
      if (!pid) {
        continue
      }
      try {
        process.kill(-pid, 'SIGKILL')
      }
      catch (error) {
        expect(error).toMatchObject({ code: 'ESRCH' })
      }
    }
    await closed
  }
}, 10000)

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
