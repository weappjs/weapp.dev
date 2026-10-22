import type { Buffer } from 'node:buffer'
import type { CliContext, CliOptions } from '../types.js'
import type { CreateOperations, CreateProgress, CreateResult, CreateWizardHooks, ExecutionOptions, QueryOptions, ScaffolderExecution, ScaffolderMetadata, ScaffoldPlan } from './create/plan.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve Windows-safe npm spawning on the Node 18 baseline.
import spawn from 'cross-spawn'
import { issueLines, projectLines } from '../project/presentation.js'
import { runProjectProcess } from '../project/process.js'
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
export async function executeScaffolder(plan: ScaffoldPlan, version: string, { signal }: ExecutionOptions = {}): Promise<ScaffolderExecution> {
  checkCancellation({ signal })
  const result = await runProjectProcess('npm', npmExecArgs(plan, version), plan.cwd, { signal })
  if (result.cleanupFailed) {
    throw new CreateError('官方脚手架已停止，但未能完整清理其子进程树。', 'The official scaffolder stopped, but its process tree could not be fully cleaned up.')
  }
  if (result.cancelled) {
    throw cancellationError()
  }
  if (result.failedToStart) {
    throw new CreateError('无法启动官方脚手架，请确认 npm 已安装。', 'Unable to start the official scaffolder. Ensure npm is installed.')
  }
  return { code: result.code, signal: result.signal }
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
  let detachProcessSignals: (() => void) | undefined
  let unsubscribeProgress: (() => void) | undefined
  let interruptedCode: (() => number | undefined) | undefined
  let locallyCancelled = false
  let createdDirectory: string | undefined
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
    const terminalSession = ctx.resources?.workbench?.session
    if (!ctx.hub && !(terminalSession?.started && !terminalSession.closed)) {
      // Standalone commands own signal forwarding while their detached children run.
      // An active wizard owns terminal signals until it returns to this command.
      const interrupt = (code: number) => {
        const session = ctx.resources?.workbench?.session
        if (session?.started && !session.closed) {
          return
        }
        ctx.cancelled = true
        ctx.cancelledCode = code
        abort()
      }
      const onInterrupt = () => interrupt(130)
      const onTerminate = () => interrupt(143)
      process.on('SIGINT', onInterrupt)
      process.on('SIGTERM', onTerminate)
      detachProcessSignals = () => {
        process.removeListener('SIGINT', onInterrupt)
        process.removeListener('SIGTERM', onTerminate)
      }
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
      write(ctx, t(ctx, '此预览没有联网、写入文件或安装依赖。包管理器、脚本和项目要求在创建后判断。', 'This preview does not access the network, write files, or install dependencies. Package manager, scripts, and project requirements are determined after creation.'))
    }
    else {
      // Creation has succeeded. A failed optional installation must never be reported as a failed scaffold.
      createdDirectory = result.plan.directory
      const { discoverProject } = await import('../project/context.js')
      const project = await discoverProject(result.plan.directory, { packageManager: selectedOptions.packageManager })
      const { projectActions, executeProjectAction, actionDisplayCommand } = await import('../project/actions.js')
      let installCode = 0
      let installation: string[] = []
      if (selectedOptions.install) {
        const install = projectActions(project).find(action => action.kind === 'install')
        if (!install) {
          installCode = 1
          installation = [t(ctx, '项目已创建，但不能安装依赖。请先解决项目或包管理器声明。', 'Project created, but installation is unavailable. Resolve the project or package manager declaration first.')]
        }
        else {
          const execute = () => executeProjectAction(install, { ...ctx.projectOperations, signal: controller.signal })
          const notice = `${install.cwd}\n${actionDisplayCommand(install)}`
          const outcome = workbench ? await workbench.external(execute, notice, () => controller.abort()) : await execute()
          // A locally cancelled follow-up leaves a usable, successfully created project in the hub.
          // Standalone commands and global interrupts still report their actual exit status.
          const returnToProject = outcome.status === 'cancelled' && ctx.hub && workbench?.session.started && !workbench.session.closed && !workbench.abortSignal.aborted
          installCode = ctx.cancelledCode || interruptedCode?.() || (returnToProject ? 0 : outcome.code)
          installation = [outcome.status === 'success'
            ? t(ctx, '依赖安装完成。', 'Dependencies installed.')
            : t(ctx, '项目已创建；安装未完成，生成文件已保留，可重新选择安装。', 'Project created; installation did not finish. Generated files are preserved; you can retry installation.'), ...issueLines(ctx, outcome.errors)]
        }
      }
      const nextSteps = [
        ...projectLines(ctx, project),
        ...installation,
        ...(!selectedOptions.install ? projectActions(project).filter(action => action.kind === 'install').map(action => `${action.cwd}\n${actionDisplayCommand(action)}`) : []),
        `weapp doctor ${displayCommand([project.projectRoot]).slice(4)}`,
      ]
      if (ctx.hub && workbench?.session.started && !workbench.session.closed) {
        workbench.showCreateSuccess(result.plan, lastProgress, project, nextSteps)
      }
      else {
        write(ctx, `${t(ctx, '项目已创建', 'Project created')}: ${sanitize(result.plan.directory)}`)
        write(ctx, nextSteps.join('\n'))
      }
      return installCode
    }
    return 0
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return ctx.cancelledCode || interruptedCode?.() || (locallyCancelled && !ctx.cancelled ? 0 : 130)
    }
    writeError(ctx, sanitize(createdDirectory
      ? t(ctx, `项目已创建于 ${createdDirectory}，后续操作未完成。请运行 doctor 检查后重试；生成文件已保留。`, `Project created at ${createdDirectory}, but the follow-up action did not finish. Run doctor before retrying; generated files were retained.`)
      : error instanceof CreateError ? t(ctx, error.zh, error.en) : t(ctx, '无法创建项目，请检查目录权限。', 'Unable to create the project. Check directory permissions.')))
    return 1
  }
  finally {
    unsubscribeProgress?.()
    preparation?.dispose()
    detachSignal?.()
    detachProcessSignals?.()
  }
}
