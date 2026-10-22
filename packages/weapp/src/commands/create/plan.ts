import type { Template } from '../../templates.js'
import type { CliOptions } from '../../types.js'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { TEMPLATES } from '../../templates.js'
import { CreateError } from './errors.js'

export { TEMPLATES } from '../../templates.js'
export const CREATE_ADAPTERS = Object.freeze({
  'weapp-vite': { package: 'create-weapp-vite', bin: 'create-weapp-vite', dependency: 'weapp-vite' },
  'vue-mini': { package: 'create-vue-mini', bin: 'create-vue-mini', dependency: '@vue-mini/core' },
  'rezor': { package: 'create-rezor', bin: 'create-rezor', dependency: 'rezor' },
  'uni': { package: 'create-uni', bin: 'create-uni', dependency: '@dcloudio/uni-app' },
  'taro': { package: 'create-vite-taro', bin: 'create-vite-taro', dependency: 'vite-plugin-taro' },
})
export type CreateRoute = keyof typeof CREATE_ADAPTERS
export interface ScaffoldPlan {
  route: CreateRoute
  package: string
  bin: string
  dependency: string
  directory: string
  cwd: string
  args: string[]
}
export interface ScaffolderMetadata {
  version: string
  engines?: { node?: string }
}
export interface QueryOptions {
  cwd?: string
  timeout?: number
  signal?: AbortSignal
}
export interface ExecutionOptions {
  signal?: AbortSignal
}
export interface ScaffolderExecution {
  code: number | null
  signal?: NodeJS.Signals | null
}
export interface CreateOperations {
  nodeVersion?: string
  onProgress?: (progress: CreateProgress) => void
  signal?: AbortSignal
  isCancelled?: () => boolean | undefined
  query?: (packageName: string, options?: QueryOptions) => Promise<ScaffolderMetadata>
  execute?: (plan: ScaffoldPlan, version: string, options?: ExecutionOptions) => Promise<ScaffolderExecution | number>
}
export interface CreateWizardSelection {
  args: string[]
  options?: CliOptions
}
export type CreateResult = {
  plan: ScaffoldPlan
  dryRun: true
  version?: never
  manifest?: never
} | {
  plan: ScaffoldPlan
  dryRun?: false
  version: string
  manifest: Record<string, unknown>
}
export interface CreateProgress {
  phase: 'planning' | 'querying' | 'ready' | 'failed' | 'executing' | 'validating' | 'complete'
  packageName: string
  cwd: string
  version?: string
  elapsedMs?: number
  queryElapsedMs?: number
  executionElapsedMs?: number
  validationElapsedMs?: number
}
export interface CreateWizardHooks {
  onPlan?: (plan: ScaffoldPlan) => void
  subscribeProgress?: (listener: (progress: CreateProgress) => void) => () => void
  onCancel?: () => void
}
export async function exists(filename: string): Promise<boolean> {
  try {
    await lstat(filename)
    return true
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}
function isCreateRoute(route: string): route is CreateRoute {
  return Object.hasOwn(CREATE_ADAPTERS, route)
}
function isTemplate(template: string): template is Template {
  const templates: readonly string[] = TEMPLATES
  return templates.includes(template)
}
export function validateSelection(route: string, options: CliOptions): { route: CreateRoute, template: Template } {
  if (options.packageManager !== undefined && !['npm', 'pnpm', 'yarn', 'bun'].includes(options.packageManager)) {
    throw new CreateError('--package-manager 必须为 npm、pnpm、yarn 或 bun。', '--package-manager must be npm, pnpm, yarn, or bun.')
  }
  if (!isCreateRoute(route)) {
    throw new CreateError(`未知创建路线：${route}。可选：${Object.keys(CREATE_ADAPTERS).join(', ')}`, `Unknown creation route: ${route}. Choose ${Object.keys(CREATE_ADAPTERS).join(', ')}`)
  }
  if (options.template !== undefined && route !== 'weapp-vite') {
    throw new CreateError('--template 只适用于 weapp-vite。', '--template is only available for weapp-vite.')
  }
  const template = options.template || 'default'
  if (!isTemplate(template)) {
    throw new CreateError(`未知模板：${template}。可选：${TEMPLATES.join(', ')}`, `Unknown template: ${template}. Choose ${TEMPLATES.join(', ')}`)
  }
  return { route, template }
}
export async function scaffoldPlan(route: string, directory: string, options: CliOptions = {}): Promise<ScaffoldPlan> {
  const selection = validateSelection(route, options)
  const { template } = selection
  const adapter = CREATE_ADAPTERS[selection.route]
  if (typeof directory !== 'string' || !directory.trim() || [...directory].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new CreateError('请提供有效的新项目目录。', 'Provide a valid new project directory.')
  }
  const absolute = path.resolve(directory)
  const name = path.basename(absolute)
  if (!/^[a-z0-9][\w.-]*$/i.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name.endsWith('.')) {
    throw new CreateError('项目目录名须以字母或数字开头，仅包含字母、数字、点、下划线和短横线。', 'The project directory name must begin with a letter or number and contain only letters, numbers, dots, underscores, or hyphens.')
  }
  if (await exists(absolute)) {
    throw new CreateError(`目标已存在，不能覆盖：${absolute}`, `Target already exists and cannot be overwritten: ${absolute}`)
  }
  let parent: string
  try {
    parent = await realpath(path.dirname(absolute))
    if (!(await lstat(parent)).isDirectory()) {
      throw new Error('not-directory')
    }
  }
  catch {
    throw new CreateError(`父目录不存在或不是目录：${path.dirname(absolute)}`, `Parent directory does not exist or is not a directory: ${path.dirname(absolute)}`)
  }
  const target = path.join(parent, name)
  const scaffoldName = route === 'weapp-vite' && name === 'init' ? './init' : name
  const scaffoldArgs = route === 'weapp-vite' ? [scaffoldName, template, '--no-install-skills'] : [scaffoldName]
  return { route: selection.route, package: adapter.package, bin: adapter.bin, dependency: adapter.dependency, directory: target, cwd: parent, args: scaffoldArgs }
}
export function npmExecArgs(plan: ScaffoldPlan, version = 'latest'): string[] {
  return ['exec', '--yes', `--package=${plan.package}@${version}`, '--', plan.bin, ...plan.args]
}
export function displayCommand(args: readonly string[]): string {
  return ['npm', ...args].map(arg => /^[\w@/.=:-]+$/.test(arg) ? arg : `'${arg.replaceAll('\'', '\'\\\'\'')}'`).join(' ')
}
