import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import picomatch from 'picomatch'
// eslint-disable-next-line e18e/ban-dependencies -- Package manager declarations use the complete semver grammar on Node 18.
import valid from 'semver/functions/valid.js'
import { parseDocument } from 'yaml'

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun'
export interface ProjectIssue {
  id: string
  severity: 'warning' | 'error' | 'info'
  message: string
  messageZh?: string
  advice?: string
  adviceZh?: string
  evidence?: string[]
}
export interface ProjectManifest extends Record<string, unknown> {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  engines?: Record<string, unknown>
  packageManager?: unknown
}
export interface ProjectConfig {
  path: string
  kind: 'json' | 'vite'
  status: 'valid' | 'invalid' | 'detected'
}
export interface ProjectContext {
  requestedDirectory: string
  projectRoot: string
  kind: 'package' | 'native' | 'mixed' | 'unknown' | 'invalid'
  manifest?: ProjectManifest
  workspace?: { root: string, memberPath: string, evidence: string[], manifest?: ProjectManifest }
  packageManager: {
    name?: PackageManagerName
    version?: string
    source: 'declaration' | 'explicit' | 'lockfile' | 'default' | 'unresolved'
    conflicts: ProjectIssue[]
  }
  frameworks: string[]
  configs: ProjectConfig[]
  lockfiles: { path: string, manager: PackageManagerName }[]
  issues: ProjectIssue[]
}
const LOCKFILES: Readonly<Record<string, PackageManagerName>> = { 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun' }
const FRAMEWORKS = ['weapp-vite', '@vue-mini/core', 'rezor', 'vite-plugin-taro', '@tarojs/taro', '@dcloudio/uni-app', 'weapp-tailwindcss']
const CONFIGS = ['project.config.json', 'project.private.config.json', 'app.json', 'miniprogram/app.json', 'src/app.json', 'src/manifest.json', 'manifest.json', 'src/pages.json', 'pages.json']
const VITE_CONFIGS = ['vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.ts', 'vite.config.mts', 'vite.config.cts']
const MAX_FILE_SIZE = 1024 * 1024

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export async function projectFileExists(filename: string): Promise<boolean> {
  try {
    await lstat(filename)
    return true
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false
    }
    throw error
  }
}
async function readBoundedFile(filename: string): Promise<string> {
  const stats = await lstat(filename)
  if (!stats.isFile() || stats.size > MAX_FILE_SIZE) {
    throw new Error('Expected a regular file no larger than 1 MiB')
  }
  const source = await readFile(filename, 'utf8')
  if (source.length > MAX_FILE_SIZE) {
    throw new Error('File exceeds 1 MiB')
  }
  return source
}
export async function readProjectJson(filename: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readBoundedFile(filename))
  if (!isRecord(value)) {
    throw new Error('Expected a JSON object')
  }
  return value
}
function issue(id: string, message: string, messageZh: string, severity: ProjectIssue['severity'] = 'warning', advice?: string, adviceZh?: string): ProjectIssue {
  const defaults: Record<string, [string, string]> = {
    'directory': ['Provide an existing, readable project directory.', '请提供存在且可读取的项目目录。'],
    'native-root': ['Keep miniprogramRoot within this project and check symbolic links.', '请将 miniprogramRoot 保持在当前项目内，并检查符号链接。'],
    'native-app': ['Check miniprogramRoot and run the existing build script if it points to generated output.', '请核对 miniprogramRoot；如果它指向构建产物，请运行已有构建脚本。'],
    'native-config': ['Check the native configuration JSON syntax and permissions.', '请检查原生配置文件的 JSON 语法与权限。'],
    'workspace': ['Correct the workspace declaration and confirm member patterns before installing dependencies.', '请修正 workspace 声明，并在安装依赖前确认成员匹配规则。'],
    'package-manager-declaration': ['Use an exact supported package manager version, for example pnpm@10.0.0.', '请使用受支持包管理器的精确版本，例如 pnpm@10.0.0。'],
    'package-manager-workspace': ['Align the project and workspace packageManager declarations before installing or running scripts.', '请先统一当前项目与 workspace 的 packageManager 声明，再安装或运行脚本。'],
    'package-manager-explicit': ['Choose the declared package manager or deliberately update the project declaration first.', '请选择已声明的包管理器，或先明确更新项目声明。'],
    'package-manager-lockfiles': ['Choose the intended manager in the workbench or pass --package-manager when creating a project.', '请在工作台中选择包管理器，或在创建项目时传入 --package-manager。'],
  }
  const fallback = id.startsWith('manifest:') ? ['Correct the reported package.json field and rerun the check.', '请修正指出的 package.json 字段后重新检查。'] : defaults[id]
  advice ||= fallback?.[0]
  adviceZh ||= fallback?.[1]
  return { id, severity, message, messageZh, ...(advice ? { advice, adviceZh } : {}) }
}
function normalizeManifest(raw: Record<string, unknown>, issues: ProjectIssue[]): ProjectManifest {
  const manifest: ProjectManifest = { ...raw }
  if (typeof raw.name !== 'string') {
    delete manifest.name
  }
  for (const key of ['scripts', 'dependencies', 'devDependencies', 'optionalDependencies'] as const) {
    if (raw[key] === undefined) {
      continue
    }
    const value = raw[key]
    if (!isRecord(value) || Object.values(value).some(entry => typeof entry !== 'string')) {
      issues.push(issue(`manifest:${key}`, `package.json ${key} must contain string values.`, `package.json 的 ${key} 必须为字符串映射。`))
      delete manifest[key]
    }
    else {
      manifest[key] = value as Record<string, string>
    }
  }
  if (raw.engines !== undefined && !isRecord(raw.engines)) {
    issues.push(issue('manifest:engines', 'package.json engines must be an object.', 'package.json 的 engines 必须是对象。', 'error'))
    delete manifest.engines
  }
  return manifest
}
function isWithin(root: string, directory: string): boolean {
  const relative = path.relative(root, directory)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
async function inspectConfigs(root: string): Promise<{ configs: ProjectConfig[], native: boolean, issues: ProjectIssue[] }> {
  const configs: ProjectConfig[] = []
  const issues: ProjectIssue[] = []
  let native = false
  const candidates = [...CONFIGS]
  for (const config of candidates) {
    const filename = path.join(root, config)
    if (!(await projectFileExists(filename))) {
      continue
    }
    try {
      if (!isWithin(root, await realpath(path.dirname(filename)))) {
        throw new Error('Configuration directory points outside the project')
      }
      const parsed = await readProjectJson(filename)
      configs.push({ path: config, kind: 'json', status: 'valid' })
      if (config === 'project.config.json') {
        native = true
        if (parsed.miniprogramRoot === undefined || typeof parsed.miniprogramRoot === 'string') {
          const miniRoot = path.resolve(root, typeof parsed.miniprogramRoot === 'string' ? parsed.miniprogramRoot : '.')
          let contained = isWithin(root, miniRoot)
          if (contained && await projectFileExists(miniRoot)) {
            contained = isWithin(root, await realpath(miniRoot))
          }
          if (!contained) {
            issues.push(issue('native-root', 'miniprogramRoot points outside the project; it was not inspected.', 'miniprogramRoot 指向项目外部，未检查该路径。'))
          }
          else {
            const appPath = path.relative(root, path.join(miniRoot, 'app.json')).split(path.sep).join('/')
            if (!candidates.includes(appPath)) {
              candidates.push(appPath)
            }
            if (!(await projectFileExists(path.join(miniRoot, 'app.json')))) {
              issues.push(issue('native-app', `No app.json was found at ${appPath}; the build output may not exist yet.`, `未找到 ${appPath}，构建产物可能尚未生成。`))
            }
          }
        }
      }
      if (config.endsWith('app.json') && (Array.isArray(parsed.pages) || Array.isArray(parsed.subpackages) || Array.isArray(parsed.subPackages))) {
        native = true
      }
    }
    catch {
      configs.push({ path: config, kind: 'json', status: 'invalid' })
    }
  }
  for (const config of VITE_CONFIGS) {
    if (await projectFileExists(path.join(root, config))) {
      configs.push({ path: config, kind: 'vite', status: 'detected' })
    }
  }
  return { configs, native, issues }
}
async function workspacePatterns(root: string, raw?: Record<string, unknown>): Promise<{ patterns: string[], evidence: string[] } | undefined> {
  let value: unknown
  let evidence: string[]
  if (await projectFileExists(path.join(root, 'pnpm-workspace.yaml'))) {
    const document = parseDocument(await readBoundedFile(path.join(root, 'pnpm-workspace.yaml')), { strict: true, uniqueKeys: true })
    if (document.errors.length) {
      throw new Error('Invalid pnpm-workspace.yaml')
    }
    const parsed: unknown = document.toJS({ maxAliasCount: 20 })
    if (!isRecord(parsed)) {
      throw new Error('Invalid pnpm workspace object')
    }
    value = parsed.packages
    // A pnpm workspace may declare only catalogs/settings and use the default all-packages pattern.
    if (value === undefined) {
      value = ['**']
    }
    evidence = ['pnpm-workspace.yaml']
  }
  else if (raw?.workspaces !== undefined) {
    value = isRecord(raw.workspaces) ? raw.workspaces.packages : raw.workspaces
    evidence = ['package.json#workspaces']
  }
  else {
    return undefined
  }
  if (!Array.isArray(value) || value.length > 1000 || value.some(pattern => typeof pattern !== 'string' || !pattern || pattern.length > 1024 || pattern.includes('\0'))) {
    throw new Error('Invalid workspace patterns')
  }
  return { patterns: value as string[], evidence }
}
function workspaceIncludes(patterns: string[], member: string): boolean {
  const positive = patterns.filter(pattern => !pattern.startsWith('!'))
  const negative = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
  const matches = (patterns: string[]): boolean => patterns.some(pattern => picomatch(pattern.replace(/^\.\//, '').replace(/\/$/, ''), { dot: true, nonegate: true })(member))
  return matches(positive) && !matches(negative)
}
function declaration(manifest: ProjectManifest | undefined, label: string, conflicts: ProjectIssue[]): { name: PackageManagerName, version: string } | undefined {
  const value = manifest?.packageManager
  if (value === undefined) {
    return undefined
  }
  const match = typeof value === 'string' ? /^(npm|pnpm|yarn|bun)@(.+)$/.exec(value) : null
  if (!match || !valid(match[2]) || match[2].startsWith('v') || match[2].startsWith('=')) {
    conflicts.push(issue('package-manager-declaration', `${label} packageManager must name npm, pnpm, yarn, or bun with an exact version.`, `${label} 的 packageManager 必须指定 npm、pnpm、yarn 或 bun 和精确版本。`, 'error'))
    return undefined
  }
  return { name: match[1] as PackageManagerName, version: match[2] }
}
function selectPackageManager(manifest: ProjectManifest | undefined, workspaceManifest: ProjectManifest | undefined, locks: ProjectContext['lockfiles'], explicit?: PackageManagerName): ProjectContext['packageManager'] {
  const conflicts: ProjectIssue[] = []
  const local = declaration(manifest, 'Project', conflicts)
  const root = workspaceManifest ? declaration(workspaceManifest, 'Workspace', conflicts) : undefined
  if (local && root && (local.name !== root.name || local.version !== root.version)) {
    conflicts.push(issue('package-manager-workspace', 'Project and workspace packageManager declarations conflict.', '当前项目与 workspace 的 packageManager 声明冲突。', 'error'))
  }
  const declared = root || local
  if (declared && explicit && explicit !== declared.name) {
    conflicts.push(issue('package-manager-explicit', `The explicit ${explicit} selection conflicts with the declared ${declared.name}.`, `显式选择的 ${explicit} 与声明的 ${declared.name} 冲突。`, 'error'))
  }
  if (declared) {
    return { ...declared, source: 'declaration', conflicts }
  }
  if (conflicts.length) {
    return { source: 'unresolved', conflicts }
  }
  if (explicit) {
    return { name: explicit, source: 'explicit', conflicts }
  }
  const managers = [...new Set(locks.map(lock => lock.manager))]
  if (managers.length > 1) {
    conflicts.push(issue('package-manager-lockfiles', 'Multiple package managers have lockfiles; choose one explicitly before installing or running scripts.', '存在多种包管理器锁文件；安装或运行脚本前请明确选择包管理器。'))
    return { source: 'unresolved', conflicts }
  }
  return { name: managers[0] || 'npm', source: managers.length ? 'lockfile' : 'default', conflicts }
}

/** Read a bounded project snapshot without executing configuration, package managers, or hooks. */
export async function discoverProject(directory?: string, options: { packageManager?: PackageManagerName } = {}): Promise<ProjectContext> {
  const requestedDirectory = path.resolve(directory || '.')
  const context: ProjectContext = { requestedDirectory, projectRoot: requestedDirectory, kind: 'unknown', packageManager: { source: 'unresolved', conflicts: [] }, frameworks: [], configs: [], lockfiles: [], issues: [] }
  let current: string
  try {
    current = await realpath(requestedDirectory)
    if (!(await lstat(current)).isDirectory()) {
      throw new Error('Expected a directory')
    }
  }
  catch {
    context.kind = 'invalid'
    context.issues.push(issue('directory', `Directory does not exist or cannot be read: ${requestedDirectory}`, `目录不存在或不可读取：${requestedDirectory}`, 'error'))
    return context
  }
  const ancestors: string[] = []
  while (true) {
    ancestors.push(current)
    if (await projectFileExists(path.join(current, '.git')) || path.dirname(current) === current) {
      break
    }
    current = path.dirname(current)
  }
  let projectIndex = -1
  let selectedProject: { candidate: string, index: number, hasManifest: boolean, inspected: Awaited<ReturnType<typeof inspectConfigs>> } | undefined
  for (const [index, candidate] of ancestors.entries()) {
    const hasManifest = await projectFileExists(path.join(candidate, 'package.json'))
    const hasProjectConfig = await projectFileExists(path.join(candidate, 'project.config.json'))
    const hasApp = await projectFileExists(path.join(candidate, 'app.json'))
    if (!hasManifest && !hasProjectConfig && !hasApp) {
      continue
    }
    const inspected = await inspectConfigs(candidate)
    // app.json can be a source/build directory inside a package or native project.
    // An enclosing root must actually identify this app before it can absorb it.
    if (!hasManifest && !hasProjectConfig) {
      if (!selectedProject && (inspected.native || inspected.configs.some(config => config.path === 'app.json' && config.status === 'invalid'))) {
        selectedProject = { candidate, index, hasManifest, inspected }
      }
      continue
    }
    if (selectedProject) {
      const appPath = path.relative(candidate, path.join(selectedProject.candidate, 'app.json')).split(path.sep).join('/')
      const ownsApp = inspected.configs.some(config => config.kind === 'json' && config.path === appPath)
      if (!ownsApp) {
        break
      }
    }
    selectedProject = { candidate, index, hasManifest, inspected }
    break
  }
  if (!selectedProject) {
    return context
  }
  const { candidate, index, hasManifest, inspected } = selectedProject
  context.projectRoot = candidate
  context.configs = inspected.configs
  context.issues.push(...inspected.issues)
  projectIndex = index
  if (hasManifest) {
    try {
      context.manifest = normalizeManifest(await readProjectJson(path.join(candidate, 'package.json')), context.issues)
      context.kind = inspected.native ? 'mixed' : 'package'
    }
    catch {
      context.kind = 'invalid'
      context.issues.push(issue('manifest', 'package.json is invalid or unreadable.', 'package.json 无效或不可读取。', 'error', 'Check the JSON format and file permissions.', '请检查 JSON 格式和文件权限。'))
    }
  }
  else {
    context.kind = inspected.native ? 'native' : 'invalid'
    if (context.kind === 'invalid') {
      context.issues.push(issue('native-config', 'Native project configuration is invalid or unreadable.', '原生项目配置无效或不可读取。', 'error'))
    }
  }
  let workspaceManifest: ProjectManifest | undefined
  if (context.manifest) {
    for (const candidate of ancestors.slice(projectIndex)) {
      try {
        const raw = candidate === context.projectRoot ? context.manifest : await projectFileExists(path.join(candidate, 'package.json')) ? await readProjectJson(path.join(candidate, 'package.json')) : undefined
        const workspace = await workspacePatterns(candidate, raw)
        if (!workspace) {
          continue
        }
        const memberPath = path.relative(candidate, context.projectRoot).split(path.sep).join('/') || '.'
        if (isWithin(await realpath(candidate), await realpath(context.projectRoot)) && (memberPath === '.' || workspaceIncludes(workspace.patterns, memberPath))) {
          context.workspace = { root: candidate, memberPath, evidence: workspace.evidence, manifest: raw ? normalizeManifest(raw, context.issues) : undefined }
          if (candidate !== context.projectRoot && raw) {
            workspaceManifest = context.workspace.manifest
          }
          break
        }
      }
      catch {
        context.issues.push({ ...issue('workspace', `Cannot validate workspace declarations at ${candidate}; its settings were not inherited.`, `无法验证 ${candidate} 的 workspace 声明，未继承其设置。`, 'error'), evidence: [path.join(candidate, 'package.json'), path.join(candidate, 'pnpm-workspace.yaml')] })
        break
      }
    }
  }
  const installRoot = context.workspace?.root || context.projectRoot
  for (const [filename, manager] of Object.entries(LOCKFILES)) {
    if (await projectFileExists(path.join(installRoot, filename))) {
      context.lockfiles.push({ path: path.join(installRoot, filename), manager })
    }
  }
  context.packageManager = selectPackageManager(context.manifest, workspaceManifest, context.lockfiles, options.packageManager)
  const dependencies = { ...context.manifest?.dependencies, ...context.manifest?.devDependencies, ...context.manifest?.optionalDependencies }
  context.frameworks = FRAMEWORKS.filter(name => Object.hasOwn(dependencies, name))
  return context
}
