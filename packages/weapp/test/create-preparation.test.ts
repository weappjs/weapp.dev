import type { CreateOperations, CreateProgress, CreateWizardHooks, ScaffolderMetadata } from '../src/commands/create/plan.js'
import type { CliContext } from '../src/types.js'
import { getEventListeners } from 'node:events'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setImmediate } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, runCreate } from '../src/commands/create.js'
import { CreateError } from '../src/commands/create/errors.js'
import { scaffoldPlan } from '../src/commands/create/plan.js'
import { CreatePreparation } from '../src/commands/create/preparation.js'
import { Workbench } from '../src/terminal/workbench.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}
const preparations: CreatePreparation[] = []
let directory: string
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-create-preparation-'))
})
afterEach(async () => {
  for (const preparation of preparations.splice(0)) {
    preparation.dispose()
  }
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
function prepare(query: NonNullable<CreateOperations['query']>, signal?: AbortSignal) {
  const preparation = new CreatePreparation({ query, signal, nodeVersion: '22.22.2' })
  preparations.push(preparation)
  return preparation
}
function context() {
  const output = { stdout: '', stderr: '' }
  const query = vi.fn<NonNullable<CreateOperations['query']>>(async () => ({ version: '3.1.0', engines: { node: '>=18' } }))
  const execute = vi.fn<NonNullable<CreateOperations['execute']>>(async (plan) => {
    await mkdir(plan.directory)
    await writeFile(path.join(plan.directory, 'package.json'), JSON.stringify({ dependencies: { [plan.dependency]: '^3' } }))
    return { code: 0 }
  })
  const ctx: CliContext = {
    stdin: {},
    stdout: { write: text => (output.stdout += text) },
    stderr: { write: text => (output.stderr += text) },
    resources: {},
    lang: 'en',
    color: false,
    motion: false,
    interactive: true,
    createOperations: { nodeVersion: '22.22.2', query, execute },
    openUrl: async () => {},
  }
  return { ctx, query, execute, output }
}

describe('per-invocation scaffold preparation', () => {
  it('starts after a valid plan, overlaps template selection, and pins its exact version through confirmation', async () => {
    const { ctx, query, execute } = context()
    const metadata = deferred<ScaffolderMetadata>()
    const queried = deferred<void>()
    query.mockImplementation(() => {
      queried.resolve()
      return metadata.promise
    })
    const progress: CreateProgress[] = []
    ctx.createWizard = async (route, options, hooks) => {
      expect(query).not.toHaveBeenCalled()
      await expect(scaffoldPlan(route, path.join(directory, 'bad name'), options)).rejects.toThrow()
      expect(query).not.toHaveBeenCalled()
      const plan = await scaffoldPlan(route, path.join(directory, 'app'), options)
      const unsubscribe = hooks?.subscribeProgress?.(state => progress.push(state))
      hooks?.onPlan?.(plan)
      await queried.promise
      expect(execute).not.toHaveBeenCalled()
      const changed = await scaffoldPlan(route, path.join(directory, 'renamed'), { template: 'react' })
      hooks?.onPlan?.(changed)
      expect(query).toHaveBeenCalledOnce()
      metadata.resolve({ version: '3.0.9', engines: { node: '>=18' } })
      await setImmediate()
      expect(progress.at(-1)).toMatchObject({ phase: 'ready', version: '3.0.9' })
      unsubscribe?.()
      return { args: [route, changed.directory], options: { template: 'react' } }
    }
    expect(await runCreate(ctx, [])).toBe(0)
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][1]?.cwd).toBe(await realpath(directory))
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: ['renamed', 'react', '--no-install-skills'] }), '3.0.9', expect.anything())
  })

  it('keeps every dry-run offline even when the wizard reports valid plans', async () => {
    const { ctx, query, execute } = context()
    ctx.createWizard = async (route, options, hooks) => {
      const plan = await scaffoldPlan(route, path.join(directory, 'app'), options)
      hooks?.onPlan?.(plan)
      hooks?.onPlan?.({ ...plan, args: ['app', 'react', '--no-install-skills'] })
      await setImmediate()
      return { args: [route, plan.directory] }
    }
    expect(await runCreate(ctx, [], { dryRun: true })).toBe(0)
    expect(query).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('aborts a superseded cwd lookup and ignores its late response', async () => {
    const first = deferred<ScaffolderMetadata>()
    const second = deferred<ScaffolderMetadata>()
    const query = vi.fn<NonNullable<CreateOperations['query']>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const preparation = prepare(query)
    const states: CreateProgress[] = []
    preparation.subscribe(state => states.push(state))
    const oldPlan = await scaffoldPlan('weapp-vite', path.join(directory, 'app'))
    await mkdir(path.join(directory, 'another'))
    const newPlan = await scaffoldPlan('weapp-vite', path.join(directory, 'another', 'app'))
    preparation.prepare(oldPlan)
    await setImmediate()
    const oldSignal = query.mock.calls[0][1]?.signal
    const oldResult = preparation.resolve(oldPlan)
    preparation.prepare(newPlan)
    await expect(oldResult).rejects.toHaveProperty('name', 'AbortError')
    await setImmediate()
    expect(oldSignal?.aborted).toBe(true)
    first.resolve({ version: '99.0.0' })
    second.resolve({ version: '3.1.0' })
    expect(await preparation.resolve(newPlan)).toEqual({ version: '3.1.0' })
    await setImmediate()
    expect(states.filter(state => state.phase === 'ready')).toEqual([
      expect.objectContaining({ cwd: newPlan.cwd, version: '3.1.0' }),
    ])
    expect(query.mock.calls.map(call => call[1]?.cwd)).toEqual([oldPlan.cwd, newPlan.cwd])
    expect(getEventListeners(oldSignal!, 'abort')).toHaveLength(0)
  })

  it('handles early failures while editing and rethrows the original bilingual error on confirmation', async () => {
    const metadata = deferred<ScaffolderMetadata>()
    const query = vi.fn<NonNullable<CreateOperations['query']>>(() => metadata.promise)
    const preparation = prepare(query)
    const plan = await scaffoldPlan('weapp-vite', path.join(directory, 'app'))
    const states: CreateProgress[] = []
    preparation.subscribe(state => states.push(state))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      preparation.prepare(plan)
      await setImmediate()
      const failure = new CreateError('无法查询版本，请稍后重试。', 'Unable to query the version. Retry later.')
      metadata.reject(failure)
      await setImmediate()
      expect(unhandled).not.toHaveBeenCalled()
      expect(states.at(-1)?.phase).toBe('failed')
      await expect(preparation.resolve(plan)).rejects.toBe(failure)
      expect(query).toHaveBeenCalledOnce()
    }
    finally {
      process.removeListener('unhandledRejection', unhandled)
    }
  })

  it('validates Node requirements during preparation before the user confirms', async () => {
    const query = vi.fn<NonNullable<CreateOperations['query']>>(async () => ({ version: '3.1.0', engines: { node: '>=24' } }))
    const preparation = prepare(query)
    const plan = await scaffoldPlan('weapp-vite', path.join(directory, 'app'))
    const states: CreateProgress[] = []
    preparation.subscribe(state => states.push(state))
    preparation.prepare(plan)
    await setImmediate()
    expect(states.at(-1)?.phase).toBe('failed')
    await expect(preparation.resolve(plan)).rejects.toThrow(/requires Node >=24/)
  })

  it('settles ignored-abort queries promptly, clears listeners, and detaches progress subscribers', async () => {
    const controller = new AbortController()
    const query = vi.fn<NonNullable<CreateOperations['query']>>(() => new Promise(() => {}))
    const preparation = prepare(query, controller.signal)
    const plan = await scaffoldPlan('weapp-vite', path.join(directory, 'app'))
    const progress = vi.fn()
    const unsubscribe = preparation.subscribe(progress)
    preparation.prepare(plan)
    await setImmediate()
    const pending = preparation.resolve(plan)
    const querySignal = query.mock.calls[0][1]?.signal
    unsubscribe()
    controller.abort()
    await expect(pending).rejects.toHaveProperty('name', 'AbortError')
    preparation.dispose()
    expect(querySignal?.aborted).toBe(true)
    expect(getEventListeners(querySignal!, 'abort')).toHaveLength(0)
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    preparation.progress({ phase: 'ready', packageName: plan.package, cwd: plan.cwd, version: '3.1.0' })
    expect(progress).toHaveBeenCalledOnce()
  })

  it('never shares a prepared version with the next Create invocation', async () => {
    const query = vi.fn<NonNullable<CreateOperations['query']>>().mockResolvedValueOnce({ version: '3.0.9' }).mockResolvedValueOnce({ version: '3.1.0' })
    const plan = await scaffoldPlan('weapp-vite', path.join(directory, 'app'))
    const first = prepare(query)
    expect((await first.resolve(plan)).version).toBe('3.0.9')
    first.dispose()
    expect((await prepare(query).resolve(plan)).version).toBe('3.1.0')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('aborts preparation on wizard cancellation without leaking a late rejection', async () => {
    const { ctx, query, execute, output } = context()
    const metadata = deferred<ScaffolderMetadata>()
    const queried = deferred<void>()
    query.mockImplementation(() => {
      queried.resolve()
      return metadata.promise
    })
    ctx.createWizard = async (route, options, hooks) => {
      hooks?.onPlan?.(await scaffoldPlan(route, path.join(directory, 'app'), options))
      await queried.promise
      hooks?.onCancel?.()
      return null
    }
    expect(await runCreate(ctx, [])).toBe(0)
    const signal = query.mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(true)
    metadata.reject(new Error('late aborted metadata'))
    await setImmediate()
    expect(getEventListeners(signal!, 'abort')).toHaveLength(0)
    expect(execute).not.toHaveBeenCalled()
    expect(output.stderr).toBe('')
    expect(output.stdout).toContain('Checking the scaffolder version')
    expect(output.stdout).not.toContain('Running the official scaffolder')
  })

  it('returns to the hub on local waiting cancellation and keeps global interrupt codes', async () => {
    for (const interrupt of [undefined, 130, 143]) {
      const { ctx, query, execute, output } = context()
      ctx.interactive = false
      // Dispatch copies its context, while the terminal owns the original interrupt state.
      const owner = { ...ctx }
      const workbench = new Workbench(owner)
      ctx.resources.workbench = workbench
      const queried = deferred<void>()
      query.mockImplementation(() => {
        queried.resolve()
        return new Promise(() => {})
      })
      workbench.waitForCreate = async (_promise, cancel) => {
        await queried.promise
        if (interrupt) {
          owner.cancelled = true
          owner.cancelledCode = interrupt
          workbench.abortController.abort()
        }
        cancel()
        void _promise.catch(() => {})
        return null
      }
      expect(await runCreate(ctx, ['weapp-vite', path.join(directory, `app-${interrupt || 'escape'}`)])).toBe(interrupt || 0)
      expect(workbench.abortSignal.aborted).toBe(Boolean(interrupt))
      expect(query.mock.calls[0][1]?.signal?.aborted).toBe(true)
      expect(execute).not.toHaveBeenCalled()
      expect(output.stderr).toBe('')
      expect(output.stdout).toContain('Checking the scaffolder version')
      expect(output.stdout).not.toContain('Running the official scaffolder')
    }
  })

  it('cancels during final directory planning without leaving the hub or starting a query', async () => {
    const { ctx, query, execute } = context()
    const workbench = new Workbench(ctx)
    ctx.resources.workbench = workbench
    workbench.waitForCreate = async (pending, cancel) => {
      cancel()
      void pending.catch(() => {})
      return null
    }
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')])).toBe(0)
    await setImmediate()
    expect(query).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(workbench.abortSignal.aborted).toBe(false)
  })

  it('cleans the operation signal listener after success and errors', async () => {
    for (const fails of [false, true]) {
      const { ctx, query } = context()
      const controller = new AbortController()
      ctx.operationSignal = controller.signal
      if (fails) {
        query.mockRejectedValue(new Error('metadata unavailable'))
      }
      expect(await runCreate(ctx, ['weapp-vite', path.join(directory, `app-${fails}`)])).toBe(fails ? 1 : 0)
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
      expect(getEventListeners(query.mock.calls[0][1]!.signal!, 'abort')).toHaveLength(0)
    }
  })

  it('keeps cancelled subscriptions harmless after the invocation ends', async () => {
    const { ctx, query } = context()
    let hooks: CreateWizardHooks | undefined
    ctx.createWizard = async (_route, _options, value) => {
      hooks = value
      return null
    }
    expect(await runCreate(ctx, [])).toBe(0)
    const listener = vi.fn()
    hooks?.subscribeProgress?.(listener)()
    hooks?.onPlan?.(await scaffoldPlan('weapp-vite', path.join(directory, 'app')))
    await setImmediate()
    expect(query).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
  })

  it('reports actual execution and validation durations from their own stage boundaries', async () => {
    const { ctx } = context()
    const states: CreateProgress[] = []
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145).mockReturnValueOnce(145).mockReturnValueOnce(147)
    await createProject('weapp-vite', path.join(directory, 'app'), {}, { ...ctx.createOperations, onProgress: state => states.push(state) })
    expect(clock).toHaveBeenCalledTimes(4)
    expect(states.map(state => state.phase)).toEqual(['executing', 'executing', 'validating', 'complete'])
    expect(states.at(-1)).toMatchObject({ executionElapsedMs: 45, validationElapsedMs: 2 })
  })

  it('retains execution duration when the upstream process fails', async () => {
    const states: CreateProgress[] = []
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(127)
    await expect(createProject('weapp-vite', path.join(directory, 'app'), {}, {
      query: async () => ({ version: '3.1.0' }),
      execute: async () => { throw new Error('upstream failure') },
      onProgress: state => states.push(state),
    })).rejects.toThrow('upstream failure')
    expect(clock).toHaveBeenCalledTimes(2)
    expect(states.at(-1)).toMatchObject({ phase: 'executing', executionElapsedMs: 27 })
    expect(states.some(state => state.phase === 'validating')).toBe(false)
  })

  it.each([false, true])('prints accurate stages and measured timings outside the workbench (interactive: %s)', async (interactive) => {
    const { ctx, output } = context()
    ctx.interactive = interactive
    expect(await runCreate(ctx, ['weapp-vite', path.join(directory, 'app')])).toBe(0)
    expect(output.stdout).toMatch(/Checking the scaffolder version[\s\S]*Running the official scaffolder create-weapp-vite@3\.1\.0[\s\S]*Validating the generated project[\s\S]*Version lookup \d+ms · Scaffolder \d+ms · Project validation \d+ms/)
    expect(output.stdout).not.toContain('undefined')
  })
})
