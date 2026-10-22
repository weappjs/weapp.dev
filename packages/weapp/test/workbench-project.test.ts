import type { ChildProcess } from 'node:child_process'
import type { ProjectContext } from '../src/project/context.js'
import type { CliContext } from '../src/types.js'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { runCreate } from '../src/commands/create.js'
import { discoverProject } from '../src/project/context.js'
import { parseArgs } from '../src/registry.js'
import { Workbench } from '../src/terminal/workbench.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture(manifest?: Record<string, unknown>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-workbench-'))
  roots.push(root)
  if (manifest) {
    await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest))
  }
  return root
}
function context() {
  let output = ''
  const input = new PassThrough()
  const stdout = Object.assign(new EventEmitter(), { columns: 100, rows: 30, write: (text: string) => {
    output += text
    return true
  } })
  const ctx: CliContext = { lang: 'en', stdin: input, stdout, stderr: stdout, color: false, motion: false, interactive: false, resources: {}, openUrl: async () => {} }
  return { ctx, text: () => output }
}
const press = (workbench: Workbench, name: string) => workbench.key('', { name }, () => {})

it('accepts explicit installation and validates package-manager values before loading features', () => {
  expect(parseArgs(['create', 'weapp-vite', 'app', '--install', '--package-manager', 'pnpm']).options).toMatchObject({ install: true, packageManager: 'pnpm' })
  expect(() => parseArgs(['create', '--package-manager', 'other'])).toThrow(/package-manager/)
  expect(() => parseArgs(['doctor', '--install'])).toThrow(/not available/)
})

it('does not queue Enter during discovery or move a focus the user selected', async () => {
  const root = await fixture({ name: 'existing', scripts: { test: 'node test.js' } })
  const project = await discoverProject(root)
  let complete!: (value: ProjectContext) => void
  const { ctx } = context()
  ctx.discoverProject = () => new Promise(resolve => complete = resolve)
  const dispatch = vi.fn()
  const workbench = new Workbench(ctx, dispatch)
  const finding = workbench.discoverCurrentProject(root)
  await press(workbench, 'return')
  expect(dispatch).not.toHaveBeenCalled()
  await press(workbench, 'down')
  const selected = workbench.hall.entries[workbench.hall.selected!].value
  complete(project)
  await finding
  expect(workbench.hall.entries[workbench.hall.selected!].value).toBe(selected)
  expect(dispatch).not.toHaveBeenCalled()
  await press(workbench, 'c')
  expect(dispatch).toHaveBeenCalledWith(['create'])
})

it('defaults existing projects to status, empty directories to create and native projects to read-only entries', async () => {
  const { ctx } = context()
  for (const [manifest, native, expected] of [[{ name: 'existing' }, false, 'project-status'], [undefined, false, 'create'], [undefined, true, 'project-status']] as const) {
    const root = await fixture(manifest)
    if (native) {
      await writeFile(path.join(root, 'project.config.json'), '{}')
    }
    const workbench = new Workbench(ctx)
    await workbench.discoverCurrentProject(root)
    expect(workbench.hall.entries[0].value).toBe(expected)
    if (native) {
      expect(workbench.hall.entries.map(entry => entry.value)).not.toContain('project-install')
      expect(workbench.hall.entries.map(entry => entry.value)).not.toContain('project-scripts')
    }
  }
})

it('keeps an unreadable project distinct from an empty directory', async () => {
  const { ctx } = context()
  ctx.discoverProject = async () => {
    throw new Error('EACCES')
  }
  const dispatch = vi.fn()
  const workbench = new Workbench(ctx, dispatch)
  await workbench.discoverCurrentProject('/unreadable/project')
  expect(workbench.projectContext?.kind).toBe('invalid')
  expect(workbench.hall.entries[0].value).toBe('project-status')
  await press(workbench, 'return')
  expect(dispatch).not.toHaveBeenCalled()
  expect(workbench.frame().join('\n')).toContain('Unable to read the project')
})

it('does not start any script before confirmation and restores the selected page on cancellation', async () => {
  const root = await fixture({ scripts: { test: 'node verify.js' } })
  const project = await discoverProject(root)
  const { ctx } = context()
  const spawn = vi.fn()
  ctx.projectOperations = { spawn, packageManagerVersion: async () => '12.2.1' }
  const workbench = new Workbench(ctx)
  const previous = workbench.screen
  previous.selected = 2
  const running = workbench.projectAction(project, 'scripts')
  await vi.waitFor(() => expect(workbench.screen.title).toBe('PROJECT SCRIPTS'))
  await press(workbench, 'return')
  await vi.waitFor(() => expect(workbench.screen.title).toBe('CONFIRM PROJECT ACTION'))
  expect(workbench.frame().join('\n')).toContain('node verify.js')
  expect(workbench.screen.type === 'summary' && workbench.screen.lines).toContain(`Working directory: ${project.projectRoot}`)
  expect(spawn).not.toHaveBeenCalled()
  await press(workbench, 'escape')
  await running
  expect(workbench.screen).toBe(previous)
  expect(previous.selected).toBe(2)
  expect(spawn).not.toHaveBeenCalled()
})

it('does not reopen a confirmation after leaving a page during asynchronous discovery', async () => {
  const root = await fixture({ scripts: { dev: 'node server.js' } })
  const project = await discoverProject(root)
  const { ctx } = context()
  let complete!: (value: ProjectContext) => void
  ctx.discoverProject = vi.fn(() => new Promise<ProjectContext>(resolve => complete = resolve))
  const workbench = new Workbench(ctx)
  workbench.screen = { type: 'result', context: project, lines: [], parent: workbench.hall }
  const running = workbench.projectAction(project, 'install')
  await vi.waitFor(() => expect(ctx.discoverProject).toHaveBeenCalled())
  await press(workbench, 'escape')
  expect(workbench.screen).toBe(workbench.hall)
  complete(project)
  await running
  expect(workbench.screen).toBe(workbench.hall)
  expect(workbench.busy).toBe(false)
  expect(workbench.requests.size).toBe(0)
})

it('requires an explicit selection for multiple lockfiles and reports missing scripts without executing', async () => {
  const root = await fixture({ scripts: {} })
  await writeFile(path.join(root, 'yarn.lock'), '')
  await writeFile(path.join(root, 'package-lock.json'), '{}')
  const { ctx } = context()
  const workbench = new Workbench(ctx)
  const running = workbench.projectAction(await discoverProject(root), 'scripts')
  await vi.waitFor(() => expect(workbench.screen.title).toBe('CHOOSE PACKAGE MANAGER'))
  await press(workbench, 'return')
  await running
  expect(workbench.frame().join('\n')).toContain('no runnable scripts')
})

it.each([undefined, false, true])('creation never installs unless explicitly requested (%s)', async (install) => {
  const root = await fixture()
  const { ctx, text } = context()
  ctx.createOperations = {
    query: async () => ({ version: '1.0.0' }),
    execute: async (plan) => {
      await mkdir(plan.directory)
      await writeFile(path.join(plan.directory, 'package.json'), JSON.stringify({ dependencies: { 'weapp-vite': '^1' }, scripts: { build: 'node build.js' } }))
      return 0
    },
  }
  const spawn = vi.fn(() => {
    const child = new EventEmitter() as ChildProcess
    queueMicrotask(() => child.emit('close', 0, null))
    return child
  })
  ctx.projectOperations = { spawn, packageManagerVersion: async () => '12.2.1' }
  expect(await runCreate(ctx, ['weapp-vite', path.join(root, 'app')], { install })).toBe(0)
  expect(spawn).toHaveBeenCalledTimes(install ? 1 : 0)
  expect(text()).toContain('build: node build.js')
  if (install) {
    expect(spawn).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: path.join(await import('node:fs/promises').then(fs => fs.realpath(root)), 'app'), shell: false }))
  }
})

it('keeps dry-run offline even with --install and reports failed installation separately from successful creation', async () => {
  const root = await fixture()
  const { ctx, text } = context()
  const query = vi.fn(async () => ({ version: '1.0.0' }))
  ctx.createOperations = { query, execute: async (plan) => {
    await mkdir(plan.directory)
    await writeFile(path.join(plan.directory, 'package.json'), JSON.stringify({ dependencies: { 'weapp-vite': '^1' } }))
    return 0
  } }
  const spawn = vi.fn(() => {
    const child = new EventEmitter() as ChildProcess
    queueMicrotask(() => child.emit('close', 2, null))
    return child
  })
  ctx.projectOperations = { spawn, packageManagerVersion: async () => '12.2.1' }
  expect(await runCreate(ctx, ['weapp-vite', path.join(root, 'app')], { dryRun: true, install: true, packageManager: 'pnpm' })).toBe(0)
  expect(query).not.toHaveBeenCalled()
  expect(spawn).not.toHaveBeenCalled()
  expect(await runCreate(ctx, ['weapp-vite', path.join(root, 'app')], { install: true })).toBe(2)
  expect(text()).toContain('Project created; installation did not finish')
  expect(await readFile(path.join(root, 'app/package.json'), 'utf8')).toContain('weapp-vite')
})
