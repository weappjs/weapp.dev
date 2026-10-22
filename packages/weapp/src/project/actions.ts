import type { PackageManagerName, ProjectContext, ProjectIssue, ProjectManifest } from './context.js'
import type { ProjectProcessOptions } from './process.js'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Match complete npm engine ranges while retaining Node 18.
import satisfies from 'semver/functions/satisfies.js'
// eslint-disable-next-line e18e/ban-dependencies -- Validate package manager versions before executing project commands.
import valid from 'semver/functions/valid.js'
// eslint-disable-next-line e18e/ban-dependencies -- Reject malformed engine ranges rather than bypassing them.
import validRange from 'semver/ranges/valid.js'
import { projectProcessEnvironment, runProjectProcess } from './process.js'

export interface ProjectAction {
  id: string
  kind: 'install' | 'script'
  cwd: string
  command: PackageManagerName
  args: string[]
  script?: string
  context: ProjectContext
}
export interface ProjectActionOptions extends ProjectProcessOptions {
  nodeVersion?: string
  packageManagerVersion?: (command: PackageManagerName, options: ProjectProcessOptions & { cwd: string }) => Promise<string | null>
  refreshContext?: (previous: ProjectContext) => Promise<ProjectContext>
  probeTimeoutMs?: number
}
export interface ProjectActionValidation {
  valid: boolean
  errors: ProjectIssue[]
  nodeVersion: string
  packageManagerVersion?: string
}
export interface ProjectActionResult {
  status: 'success' | 'failed' | 'cancelled'
  code: number
  signal: NodeJS.Signals | null
  errors: ProjectIssue[]
}

function issue(id: string, message: string, messageZh: string, advice?: string, adviceZh?: string): ProjectIssue {
  return { id, severity: 'error', message, messageZh, advice, adviceZh }
}

function projectSnapshot(context: ProjectContext): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(stable)
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stable(entry)]))
    }
    return value
  }
  return JSON.stringify(stable({
    root: context.projectRoot,
    kind: context.kind,
    manifest: context.manifest,
    workspace: context.workspace,
    packageManager: context.packageManager,
    lockfiles: context.lockfiles,
    errors: context.issues.filter(entry => entry.severity === 'error'),
  }))
}

async function refreshProjectContext(previous: ProjectContext): Promise<ProjectContext> {
  const { discoverProject } = await import('./context.js')
  return discoverProject(previous.requestedDirectory, { packageManager: previous.packageManager.source === 'explicit' ? previous.packageManager.name : undefined })
}

export function projectActions(context: ProjectContext): ProjectAction[] {
  const command = context.packageManager.name
  if (!context.manifest || !command || (context.kind !== 'package' && context.kind !== 'mixed')) {
    return []
  }
  return [
    { id: 'install', kind: 'install', cwd: context.workspace?.root || context.projectRoot, command, args: ['install'], context },
    ...Object.keys(context.manifest.scripts || {}).map(script => ({ id: `script:${script}`, kind: 'script' as const, cwd: context.projectRoot, command, args: ['run', script], script, context })),
  ]
}

/** This is presentation only; commands are always passed as an argv array. */
export function actionDisplayCommand(action: ProjectAction): string {
  return [action.command, ...action.args].map(value => /^[\w./:@=-]+$/.test(value) ? value : `'${value.replaceAll('\'', '\'\\\'\'')}'`).join(' ')
}

export async function installedPackageManagerVersion(command: PackageManagerName, options: ProjectActionOptions & { cwd: string }): Promise<string | null> {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) {
    abort()
  }
  const timer = setTimeout(abort, options.probeTimeoutMs ?? 3000)
  try {
    const result = await runProjectProcess(command, ['--version'], options.cwd, { ...options, env: projectProcessEnvironment(options.env), signal: controller.signal, stdio: ['ignore', 'pipe', 'pipe'] })
    const version = result.stdout.trim()
    return !result.cancelled && !result.failedToStart && result.code === 0 && valid(version) ? version : null
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

function validateEngine(manifest: ProjectManifest | undefined, engine: string, version: string, scope: string): ProjectIssue[] {
  const requirement = manifest?.engines?.[engine]
  if (requirement === undefined) {
    return []
  }
  if (typeof requirement !== 'string' || !requirement.trim() || !validRange(requirement) || !satisfies(version, requirement)) {
    return [issue(`engine:${scope}:${engine}`, `${scope} requires ${engine} ${String(requirement)}; installed: ${version}.`, `${scope} 要求 ${engine} ${String(requirement)}；当前版本：${version}。`, 'Use a compatible runtime and a valid engines range before retrying.', '请使用兼容的运行时并修正 engines 范围后重试。')]
  }
  return []
}

export async function validateProjectAction(action: ProjectAction, options: ProjectActionOptions = {}): Promise<ProjectActionValidation> {
  const nodeVersion = options.nodeVersion || process.versions.node
  const context = action.context
  const errors = [...context.issues.filter(entry => entry.severity === 'error'), ...context.packageManager.conflicts]
  const expected = projectActions(context).find(candidate => candidate.id === action.id)
  if (!expected || expected.cwd !== action.cwd || expected.command !== action.command || expected.kind !== action.kind || expected.script !== action.script || JSON.stringify(expected.args) !== JSON.stringify(action.args)) {
    errors.push(issue('action:invalid', 'The action no longer matches the detected project.', '操作与检测到的项目不一致。'))
  }
  if (action.script !== undefined && (!action.script.trim() || action.script.startsWith('-') || action.script.includes('\0'))) {
    errors.push(issue('script:invalid', 'This script name cannot be safely passed to the package manager.', '此脚本名无法安全传递给包管理器。'))
  }
  if (!valid(nodeVersion) || !satisfies(nodeVersion, '>=18')) {
    errors.push(issue('engine:node', `Node 18 or newer is required; installed: ${nodeVersion}.`, `需要 Node 18 或更新版本；当前版本：${nodeVersion}。`))
  }
  errors.push(...validateEngine(context.manifest, 'node', nodeVersion, 'package'), ...validateEngine(context.workspace?.manifest, 'node', nodeVersion, 'workspace'))
  if (options.signal?.aborted || errors.length) {
    return { valid: false, errors, nodeVersion }
  }
  let managerVersion: string | null
  try {
    managerVersion = await (options.packageManagerVersion || installedPackageManagerVersion)(action.command, { ...options, cwd: action.cwd })
  }
  catch {
    managerVersion = null
  }
  if (!managerVersion || !valid(managerVersion)) {
    errors.push(issue('package-manager:unavailable', `Unable to read the installed ${action.command} version without downloading a package manager.`, `无法在不下载包管理器的情况下读取已安装的 ${action.command} 版本。`, 'Install the required package manager, then retry.', '请先安装要求的包管理器，再重试。'))
  }
  else {
    const required = context.packageManager.version
    if (required && (!valid(required) || !satisfies(managerVersion, required))) {
      errors.push(issue('package-manager:version', `This project requires ${action.command}@${required}; installed: ${managerVersion}.`, `项目要求 ${action.command}@${required}；当前版本：${managerVersion}。`))
    }
    errors.push(...validateEngine(context.manifest, action.command, managerVersion, 'package'), ...validateEngine(context.workspace?.manifest, action.command, managerVersion, 'workspace'))
  }
  return { valid: !options.signal?.aborted && errors.length === 0, errors: [...new Map(errors.map(error => [error.id, error])).values()], nodeVersion, packageManagerVersion: managerVersion || undefined }
}

export async function executeProjectAction(action: ProjectAction, options: ProjectActionOptions = {}): Promise<ProjectActionResult> {
  const cancelled = (): ProjectActionResult => ({ status: 'cancelled', code: 130, signal: null, errors: [] })
  if (options.signal?.aborted) {
    return cancelled()
  }
  const snapshot = projectSnapshot(action.context)
  const validation = await validateProjectAction(action, options)
  if (options.signal?.aborted) {
    return cancelled()
  }
  if (!validation.valid) {
    return { status: 'failed', code: 1, signal: null, errors: validation.errors }
  }
  try {
    // Recheck after asynchronous version probing, immediately before launching the approved action.
    const current = await (options.refreshContext || refreshProjectContext)(action.context)
    if (options.signal?.aborted) {
      return cancelled()
    }
    if (snapshot !== projectSnapshot(current)) {
      return { status: 'failed', code: 1, signal: null, errors: [issue('action:changed', 'The project changed after this action was prepared. Review it and confirm again.', '项目在操作准备后发生变化，请重新检查并确认。')] }
    }
  }
  catch {
    if (options.signal?.aborted) {
      return cancelled()
    }
    return { status: 'failed', code: 1, signal: null, errors: [issue('action:unreadable', 'The project could not be read again before execution.', '执行前无法重新读取项目。')] }
  }
  if (options.signal?.aborted) {
    return cancelled()
  }
  const result = await runProjectProcess(action.command, action.args, action.cwd, { ...options, env: projectProcessEnvironment(options.env) })
  if (result.cleanupFailed) {
    return { status: 'failed', code: 1, signal: result.signal, errors: [issue('process:cleanup', 'The package manager stopped, but its process tree could not be fully cleaned up.', '包管理器已停止，但未能完整清理其子进程树。')] }
  }
  if (result.cancelled) {
    return { ...cancelled(), signal: result.signal }
  }
  if (result.failedToStart || result.code !== 0) {
    return { status: 'failed', code: result.code || 1, signal: result.signal, errors: [issue('process:failed', result.failedToStart ? `Unable to start ${action.command}.` : `${action.command} did not exit successfully. Existing project files were retained.`, result.failedToStart ? `无法启动 ${action.command}。` : `${action.command} 未成功退出，已有项目文件已保留。`)] }
  }
  return { status: 'success', code: 0, signal: null, errors: [] }
}
