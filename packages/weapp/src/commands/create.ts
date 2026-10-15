import type { Buffer } from 'node:buffer'
import type { CliContext, CliOptions } from '../types.js'
import type { CreateOperations, CreateProgress, CreateResult, CreateWizardHooks, ExecutionOptions, QueryOptions, ScaffolderExecution, ScaffolderMetadata, ScaffoldPlan } from './create/plan.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve Windows-safe npm spawning on the Node 18 baseline.
import spawn from 'cross-spawn'
import { sanitize, t, write, writeError } from '../shared.js'
import { cancellationError, checkCancellation, CreateError } from './create/errors.js'
import { CREATE_ADAPTERS, displayCommand, exists, npmExecArgs, scaffoldPlan, validateSelection } from './create/plan.js'
import { CreatePreparation, validateScaffolderMetadata } from './create/preparation.js'

export type { CreateOperations, CreateProgress, CreateResult, CreateRoute, CreateWizardHooks, CreateWizardSelection, ExecutionOptions, QueryOptions, ScaffolderExecution, ScaffolderMetadata, ScaffoldPlan } from './create/plan.js'
export { CREATE_ADAPTERS, displayCommand, npmExecArgs, scaffoldPlan, TEMPLATES } from './create/plan.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function parseScaffolderMetadata(output: string): ScaffolderMetadata {
  const metadata: unknown = JSON.parse(output)
  // npm returns a JSON string when version is the only populated field.
  if (typeof metadata === 'string') {
    return { version: metadata }
  }
  if (!isRecord(metadata) || typeof metadata.version !== 'string') {
    throw new Error('invalid-scaffolder-metadata')
  }
  if (metadata.engines === undefined) {
    return { version: metadata.version }
  }
  if (!isRecord(metadata.engines) || (metadata.engines.node !== undefined && typeof metadata.engines.node !== 'string')) {
    throw new Error('invalid-scaffolder-engines')
  }
  return { version: metadata.version, engines: { node: metadata.engines.node } }
}
export function queryScaffolder(packageName: string, { timeout = 15000, signal, cwd }: QueryOptions = {}): Promise<ScaffolderMetadata> {
  return new Promise((resolve, reject) => {
    checkCancellation({ signal })
    const child = spawn('npm', ['view', `${packageName}@latest`, 'version', 'engines', '--json', '--fetch-retries=0', `--fetch-timeout=${timeout}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    let oversized = false
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    let abort: () => void
    const finish = (result: { metadata: ScaffolderMetadata } | { error: unknown }): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if ('metadata' in result) {
        resolve(result.metadata)
      }
      else {
        reject(result.error)
      }
    }
    abort = () => {
      child.kill()
      finish({ error: cancellationError() })
    }
    timer = setTimeout(() => {
      child.kill()
      finish({ error: new CreateError('npm 元数据查询超时，请检查网络后重试。', 'The npm metadata query timed out. Check your connection and retry.') })
    }, timeout + 1000)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < 1024 * 1024) {
        output += chunk.toString()
      }
      else {
        oversized = true
        child.kill()
      }
    })
    // Registry errors can contain credentials from user configuration; never echo them.
    child.stderr?.resume()
    child.on('error', () => {
      finish({ error: signal?.aborted ? cancellationError() : new CreateError('无法运行 npm，请确认 npm 已安装且在 PATH 中。', 'Unable to run npm. Ensure npm is installed and on PATH.') })
    })
    child.on('close', (code) => {
      if (signal?.aborted) {
        finish({ error: cancellationError() })
        return
      }
      if (code !== 0 || oversized) {
        finish({ error: new CreateError(`无法通过 npm 查询 ${packageName}，请检查网络后重试。`, `Unable to query ${packageName} through the configured npm registry. Check your connection and retry.`) })
        return
      }
      try {
        finish({ metadata: parseScaffolderMetadata(output) })
      }
      catch {
        finish({ error: new CreateError('npm 返回了无效的元数据。', 'npm returned invalid metadata.') })
      }
    })
  })
}
export function executeScaffolder(plan: ScaffoldPlan, version: string, { signal }: ExecutionOptions = {}): Promise<ScaffolderExecution> {
  return new Promise((resolve, reject) => {
    checkCancellation({ signal })
    const child = spawn('npm', npmExecArgs(plan, version), { cwd: plan.cwd, stdio: 'inherit' })
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
    child.on('error', () => {
      signal?.removeEventListener('abort', abort)
      reject(signal?.aborted ? cancellationError() : new CreateError('无法启动官方脚手架，请确认 npm 已安装。', 'Unable to start the official scaffolder. Ensure npm is installed.'))
    })
    // Wait for inherited terminal input to be released before restoring the workbench.
    child.on('close', (code, childSignal) => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) {
        reject(cancellationError())
      }
      else {
        resolve({ code, signal: childSignal })
      }
    })
  })
}
export async function createProject(route: string, directory: string, options: CliOptions = {}, operations: CreateOperations = {}): Promise<CreateResult> {
  checkCancellation(operations)
  const plan = await scaffoldPlan(route, directory, options)
  checkCancellation(operations)
  if (options.dryRun) {
    return { plan, dryRun: true }
  }
  const operationOptions: [ExecutionOptions?] = operations.signal ? [{ signal: operations.signal }] : []
  const metadata = await (operations.query || queryScaffolder)(plan.package, { cwd: plan.cwd, signal: operations.signal })
  checkCancellation(operations)
  validateScaffolderMetadata(plan.package, metadata, operations.nodeVersion)
  if (await exists(plan.directory)) {
    throw new CreateError(`目标在创建前已出现，不能覆盖：${plan.directory}`, `The target appeared before creation and cannot be overwritten: ${plan.directory}`)
  }
  checkCancellation(operations)
  const progress = { packageName: plan.package, cwd: plan.cwd, version: metadata.version }
  const executionStartedAt = Date.now()
  let executionElapsedMs: number
  let result: ScaffolderExecution | number
  operations.onProgress?.({ ...progress, phase: 'executing' })
  try {
    result = await (operations.execute || executeScaffolder)(plan, metadata.version, ...operationOptions)
  }
  finally {
    executionElapsedMs = Date.now() - executionStartedAt
    operations.onProgress?.({ ...progress, phase: 'executing', executionElapsedMs })
  }
  checkCancellation(operations)
  const code = typeof result === 'number' ? result : result?.code
  if (code !== 0) {
    throw new CreateError(`官方脚手架未成功退出。已有文件保留在 ${plan.directory}，请检查后重试。`, `The official scaffolder did not finish successfully. Any generated files remain at ${plan.directory}; inspect them before retrying.`)
  }
  const validationStartedAt = Date.now()
  let completed = false
  operations.onProgress?.({ ...progress, phase: 'validating', executionElapsedMs })
  try {
    let manifest: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(await readFile(path.join(plan.directory, 'package.json'), 'utf8'))
      if (!isRecord(parsed)) {
        throw new Error('manifest')
      }
      manifest = parsed
    }
    catch {
      throw new CreateError(`脚手架未生成有效的 package.json。已有文件保留在 ${plan.directory}。`, `The scaffolder did not generate a valid package.json. Any generated files remain at ${plan.directory}.`)
    }
    const dependencies = { ...(isRecord(manifest.dependencies) ? manifest.dependencies : {}), ...(isRecord(manifest.devDependencies) ? manifest.devDependencies : {}) }
    const frameworkDependency = dependencies[plan.dependency]
    if (typeof frameworkDependency !== 'string' || !frameworkDependency.trim()) {
      throw new CreateError(`生成项目缺少预期依赖 ${plan.dependency}，请检查 ${plan.directory}。`, `The generated project is missing the expected dependency ${plan.dependency}. Inspect ${plan.directory}.`)
    }
    completed = true
    return { plan, version: metadata.version, manifest }
  }
  finally {
    operations.onProgress?.({ ...progress, phase: completed ? 'complete' : 'failed', executionElapsedMs, validationElapsedMs: Date.now() - validationStartedAt })
  }
}

export async function runCreate(ctx: CliContext, args: string[], options: CliOptions = {}): Promise<number> {
  if (args.length > 2) {
    writeError(ctx, t(ctx, '用法：weapp create [路线] [新目录] [--template 模板] [--dry-run]', 'Usage: weapp create [route] [new-directory] [--template template] [--dry-run]'))
    return 1
  }
  let preparation: CreatePreparation | undefined
  let detachSignal: (() => void) | undefined
  let unsubscribeProgress: (() => void) | undefined
  let interruptedCode: (() => number | undefined) | undefined
  let locallyCancelled = false
  try {
    let selectedArgs = args
    let selectedOptions = options
    const route = args[0] ?? 'weapp-vite'
    const selection = validateSelection(route, options)
    const controller = new AbortController()
    const sourceSignal = ctx.operationSignal || ctx.resources?.workbench?.abortSignal || ctx.createOperations?.signal
    const abort = () => controller.abort()
    sourceSignal?.addEventListener('abort', abort, { once: true })
    detachSignal = () => sourceSignal?.removeEventListener('abort', abort)
    if (sourceSignal?.aborted) {
      abort()
    }
    const operations: CreateOperations = {
      ...ctx.createOperations,
      signal: controller.signal,
      isCancelled: () => ctx.cancelled || ctx.createOperations?.isCancelled?.(),
    }
    preparation = new CreatePreparation({
      ...operations,
      query: operations.query || queryScaffolder,
    })
    const prepared = preparation
    let lastProgress: CreateProgress | undefined
    unsubscribeProgress = prepared.subscribe((state) => {
      const history = state.phase === 'querying'
        ? {}
        : {
            queryElapsedMs: lastProgress?.queryElapsedMs,
            executionElapsedMs: lastProgress?.executionElapsedMs,
            validationElapsedMs: lastProgress?.validationElapsedMs,
          }
      lastProgress = { ...history, ...state }
      ctx.createOperations?.onProgress?.(lastProgress)
      ctx.resources?.workbench?.setCreateProgress(lastProgress)
      if (!ctx.resources?.workbench?.session.started) {
        if (state.phase === 'querying') {
          write(ctx, t(ctx, '正在查询脚手架版本与 Node 要求…', 'Checking the scaffolder version and Node requirement…'))
        }
        else if (state.phase === 'executing' && state.executionElapsedMs === undefined) {
          write(ctx, t(ctx, `正在运行官方脚手架 ${state.packageName}@${state.version}…`, `Running the official scaffolder ${state.packageName}@${state.version}…`))
        }
        else if (state.phase === 'validating') {
          write(ctx, t(ctx, '正在验证生成项目…', 'Validating the generated project…'))
        }
        else if (state.phase === 'complete') {
          write(ctx, t(ctx, `版本查询 ${lastProgress.queryElapsedMs}ms · 脚手架 ${lastProgress.executionElapsedMs}ms · 项目验证 ${lastProgress.validationElapsedMs}ms`, `Version lookup ${lastProgress.queryElapsedMs}ms · Scaffolder ${lastProgress.executionElapsedMs}ms · Project validation ${lastProgress.validationElapsedMs}ms`))
        }
      }
    })
    const hooks: CreateWizardHooks = {
      onPlan: (plan) => {
        if (!options.dryRun) {
          prepared.prepare(plan)
        }
      },
      subscribeProgress: prepared.subscribe,
      onCancel: abort,
    }
    if (args.length < 2) {
      if (!ctx.interactive || typeof ctx.createWizard !== 'function') {
        throw new CreateError('非交互终端需要提供新项目目录。用法：weapp create <路线> <新目录>。', 'A non-interactive terminal requires a new project directory. Usage: weapp create <route> <new-directory>.')
      }
      checkCancellation(operations)
      const selection = await ctx.createWizard(route, options, hooks)
      if (!selection) {
        return ctx.cancelledCode || (ctx.cancelled ? 130 : 0)
      }
      selectedArgs = selection.args
      selectedOptions = { ...options, ...selection.options }
      if (!Array.isArray(selectedArgs) || selectedArgs.length !== 2) {
        throw new CreateError('创建向导未提供有效的路线和目录。', 'The creation wizard did not provide a valid route and directory.')
      }
    }
    const cancel = () => {
      locallyCancelled = true
      abort()
    }
    operations.query = (packageName, queryOptions) => prepared.resolve({ package: packageName, cwd: queryOptions?.cwd || '.' })
    operations.onProgress = state => prepared.progress(state)
    const execute = operations.execute || executeScaffolder
    operations.execute = (plan, version, ...executionOptions) => {
      const workbench = ctx.resources?.workbench
      const callback = () => {
        checkCancellation(operations)
        return execute(plan, version, ...executionOptions)
      }
      const notice = t(ctx, `正在交给官方脚手架 ${plan.package}@${version}。首次运行时，npm 可能需要下载依赖；终端输入现在由脚手架接管。`, `Starting the official scaffolder ${plan.package}@${version}. On first use, npm may download dependencies; the scaffolder now controls terminal input.`)
      return workbench ? workbench.external(callback, notice) : callback()
    }
    const workbench = ctx.resources?.workbench
    interruptedCode = () => workbench?.ctx.cancelledCode
    if (!lastProgress) {
      prepared.progress({ phase: 'planning', packageName: CREATE_ADAPTERS[selection.route].package, cwd: path.dirname(path.resolve(selectedArgs[1])) })
    }
    const pending = createProject(selectedArgs[0], selectedArgs[1], selectedOptions, operations)
    const result = workbench ? await workbench.waitForCreate(pending, cancel, prepared.subscribe) : await pending
    if (!result) {
      throw cancellationError()
    }
    if (result.dryRun) {
      write(ctx, `${t(ctx, '执行目录', 'Working directory')}: ${sanitize(result.plan.cwd)}\n${displayCommand(npmExecArgs(result.plan))}`)
      write(ctx, t(ctx, '实际运行会先检查官方版本和 Node 要求；此预览没有联网或写入文件。', 'Execution first checks the official version and Node requirements; this preview does not access the network or write files.'))
    }
    else if (ctx.hub && ctx.resources?.workbench?.session.started && !ctx.resources.workbench.session.closed) {
      ctx.resources.workbench.showCreateSuccess(result.plan, lastProgress)
    }
    else {
      write(ctx, `${t(ctx, '项目已创建', 'Project created')}: ${sanitize(result.plan.directory)}`)
      write(ctx, `cd ${displayCommand([result.plan.directory]).slice(4)}\nnpm install`)
    }
    return 0
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return ctx.cancelledCode || interruptedCode?.() || (locallyCancelled && !ctx.cancelled ? 0 : 130)
    }
    writeError(ctx, sanitize(error instanceof CreateError ? t(ctx, error.zh, error.en) : t(ctx, '无法创建项目，请检查目录权限。', 'Unable to create the project. Check directory permissions.')))
    return 1
  }
  finally {
    unsubscribeProgress?.()
    preparation?.dispose()
    detachSignal?.()
  }
}
