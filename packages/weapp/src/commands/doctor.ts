import type { Buffer } from 'node:buffer'
import type { CliContext, CliOptions } from '../types.js'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve Windows-safe package manager probing on the Node 18 baseline.
import spawn from 'cross-spawn'
// eslint-disable-next-line e18e/ban-dependencies -- Validate npm engines with the complete semver grammar on Node 18.
import satisfies from 'semver/functions/satisfies.js'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve npm-compatible engine range parsing on Node 18.
import validRange from 'semver/ranges/valid.js'
import { sanitize, t, write, writeError } from '../shared.js'

const LOCKFILES: Readonly<Record<string, string>> = { 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun' }
const FRAMEWORKS = ['weapp-vite', '@vue-mini/core', 'rezor', 'vite-plugin-taro', '@tarojs/taro', '@dcloudio/uni-app', 'weapp-tailwindcss']
const CONFIGS = ['project.config.json', 'project.private.config.json', 'app.json', 'miniprogram/app.json', 'src/app.json', 'src/manifest.json', 'manifest.json', 'src/pages.json', 'pages.json']
const VITE_CONFIGS = ['vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'vite.config.mts']
export type DiagnosticSeverity = 'ok' | 'warning' | 'error' | 'info'
export interface DiagnosticCheck {
  id: string
  severity: DiagnosticSeverity
  message: string
  advice?: string
}
export interface DiagnosticReport {
  directory: string
  ok: boolean
  checks: DiagnosticCheck[]
}
export interface DoctorOperations {
  nodeVersion?: string
  packageManagerVersion?: (command: string) => Promise<string | null>
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
async function exists(filename: string): Promise<boolean> {
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
async function readJson(filename: string): Promise<unknown> {
  const stats = await lstat(filename)
  if (!stats.isFile() || stats.size > 1024 * 1024) {
    throw new Error('invalid-json-file')
  }
  return JSON.parse(await readFile(filename, 'utf8'))
}
export function packageManagerVersion(command: string, { timeout = 3000 }: { timeout?: number } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0' } })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, timeout)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < 1024) {
        output += chunk.toString()
      }
    })
    child.stderr?.resume()
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 && /^\d+\.\d+/.test(output.trim()) ? output.trim().split('\n')[0] : null)
    })
  })
}
export async function diagnose(directory: string | undefined, ctx: Pick<CliContext, 'lang'>, operations: DoctorOperations = {}): Promise<DiagnosticReport> {
  const root = path.resolve(directory || '.')
  const checks: DiagnosticCheck[] = []
  const add = (id: string, severity: DiagnosticSeverity, zh: string, en: string, zhAdvice?: string, enAdvice?: string): void => {
    checks.push({ id, severity, message: t(ctx, zh, en), ...(zhAdvice && enAdvice ? { advice: t(ctx, zhAdvice, enAdvice) } : {}) })
  }
  const nodeVersion = operations.nodeVersion || process.versions.node
  const nodeOk = satisfies(nodeVersion, '>=18')
  add('node', nodeOk ? 'ok' : 'error', `Node ${nodeVersion}`, `Node ${nodeVersion}`, nodeOk ? undefined : '请安装 Node 18 或更新版本。', nodeOk ? undefined : 'Install Node 18 or newer.')
  try {
    if (!(await lstat(root)).isDirectory()) {
      throw new Error('directory')
    }
  }
  catch {
    add('directory', 'error', `目录不存在或不可读取：${root}`, `Directory does not exist or cannot be read: ${root}`, '提供一个可读取的项目目录。', 'Provide a readable project directory.')
    return { directory: root, ok: false, checks }
  }
  let manifest: Record<string, unknown> | undefined
  try {
    const parsed = await readJson(path.join(root, 'package.json'))
    if (!isRecord(parsed)) {
      throw new Error('manifest')
    }
    manifest = parsed
    add('manifest', 'ok', `项目：${typeof manifest.name === 'string' ? manifest.name : '(未命名)'}`, `Project: ${typeof manifest.name === 'string' ? manifest.name : '(unnamed)'}`)
  }
  catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    add('manifest', 'error', missing ? '缺少 package.json。' : 'package.json 无效或不可读取。', missing ? 'package.json is missing.' : 'package.json is invalid or unreadable.', '请在项目根目录运行 doctor，并检查 JSON 格式。', 'Run doctor in the project root and check the JSON format.')
  }
  if (isRecord(manifest?.engines) && manifest.engines.node) {
    const requirement = manifest.engines.node
    const valid = typeof requirement === 'string' && validRange(requirement)
    const compatible = valid && satisfies(nodeVersion, requirement)
    add('project-node', compatible ? 'ok' : 'error', `项目 Node 要求：${String(requirement)}`, `Project Node requirement: ${String(requirement)}`, compatible ? undefined : '使用满足 engines.node 的 Node 版本，并确保它是有效的 semver 范围。', compatible ? undefined : 'Use a Node version satisfying engines.node and ensure it is a valid semver range.')
  }
  const locks: string[] = []
  for (const filename of Object.keys(LOCKFILES)) {
    if (await exists(path.join(root, filename))) {
      locks.push(filename)
    }
  }
  const managers = [...new Set(locks.map(lock => LOCKFILES[lock]))]
  if (!locks.length) {
    add('lockfiles', 'warning', '未发现锁文件。', 'No lockfile was found.', '安装依赖并提交对应包管理器的锁文件。', 'Install dependencies and commit the lockfile for your package manager.')
  }
  else {
    add('lockfiles', managers.length > 1 ? 'warning' : 'ok', `锁文件：${locks.join(', ')}`, `Lockfiles: ${locks.join(', ')}`, managers.length > 1 ? '保留团队实际使用的包管理器锁文件，避免依赖版本漂移。' : undefined, managers.length > 1 ? 'Keep the lockfile for the package manager your team uses to avoid dependency drift.' : undefined)
  }
  let selected = managers[0] || 'npm'
  if (manifest?.packageManager) {
    const match = typeof manifest.packageManager === 'string' ? /^(npm|pnpm|yarn|bun)@.+$/.exec(manifest.packageManager) : null
    if (match) {
      selected = match[1]
      if (managers.length && !managers.includes(selected)) {
        add('package-manager-lock', 'warning', `packageManager 指定 ${selected}，但锁文件不匹配。`, `packageManager specifies ${selected}, but its lockfile is missing.`, '按 packageManager 安装依赖并更新锁文件。', 'Install with the declared packageManager and update the lockfile.')
      }
    }
    else {
      add('package-manager-declaration', 'warning', 'packageManager 字段未使用受支持的包管理器格式。', 'The packageManager field does not use a supported package manager format.', '使用 npm、pnpm、yarn 或 bun 加精确版本。', 'Use npm, pnpm, yarn, or bun with an exact version.')
    }
  }
  const commands = [...new Set(['npm', selected])]
  const versions = await Promise.all(commands.map(command => (operations.packageManagerVersion || packageManagerVersion)(command)))
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index]
    const version = versions[index]
    add(`package-manager:${command}`, version ? 'ok' : command === selected ? 'error' : 'warning', version ? `${command} ${version}` : `找不到 ${command} 或版本查询超时。`, version ? `${command} ${version}` : `${command} is unavailable or its version query timed out.`, version ? undefined : `安装 ${command}，并确保它在 PATH 中。`, version ? undefined : `Install ${command} and ensure it is on PATH.`)
  }
  const dependencies = { ...(isRecord(manifest?.dependencies) ? manifest.dependencies : {}), ...(isRecord(manifest?.devDependencies) ? manifest.devDependencies : {}) }
  const declared = Object.keys(dependencies).filter(name => /^(?:@[\w.-]+\/)?[\w.-]+$/.test(name) && name.split('/').every(segment => segment !== '.' && segment !== '..'))
  const frameworks = FRAMEWORKS.filter(name => name in dependencies)
  add('frameworks', frameworks.length ? 'ok' : 'info', frameworks.length ? `识别到：${frameworks.join(', ')}` : '没有识别到已知的小程序框架依赖。', frameworks.length ? `Detected: ${frameworks.join(', ')}` : 'No known mini-program framework dependency was detected.')
  if (declared.length) {
    if (!(await exists(path.join(root, 'node_modules')))) {
      add('dependencies', 'warning', '尚未安装依赖：没有 node_modules。', 'Dependencies have not been installed: node_modules is missing.', `运行 ${selected} install。`, `Run ${selected} install.`)
    }
    else {
      const missing: string[] = []
      for (const name of declared) {
        if (!(await exists(path.join(root, 'node_modules', ...name.split('/'), 'package.json')))) {
          missing.push(name)
        }
      }
      add('dependencies', missing.length ? 'warning' : 'ok', missing.length ? `缺少已声明依赖：${missing.join(', ')}` : `已找到 ${declared.length} 个声明依赖。`, missing.length ? `Missing declared dependencies: ${missing.join(', ')}` : `Found ${declared.length} declared dependencies.`, missing.length ? `运行 ${selected} install。` : undefined, missing.length ? `Run ${selected} install.` : undefined)
    }
  }
  const configs: string[] = []
  for (const config of CONFIGS) {
    const filename = path.join(root, config)
    if (!(await exists(filename))) {
      continue
    }
    configs.push(config)
    try {
      const parsed = await readJson(filename)
      if (!isRecord(parsed)) {
        throw new Error('json-object')
      }
      add(`config:${config}`, 'ok', `${config} JSON 有效。`, `${config} contains valid JSON.`)
    }
    catch {
      add(`config:${config}`, 'warning', `${config} 不是可读取的标准 JSON。`, `${config} is not readable standard JSON.`, '检查文件语法；doctor 不执行配置或解析 JSONC/JSON5。', 'Check the syntax; doctor does not execute config files or parse JSONC/JSON5.')
    }
  }
  const viteConfigs: string[] = []
  for (const filename of VITE_CONFIGS) {
    if (await exists(path.join(root, filename))) {
      viteConfigs.push(filename)
    }
  }
  if (viteConfigs.length) {
    add('vite-config', 'info', `发现 ${viteConfigs.join(', ')}；未执行配置。`, `Found ${viteConfigs.join(', ')}; config files were not executed.`)
  }
  if (!configs.length && !viteConfigs.length) {
    add('mini-program-config', 'info', '没有在常见路径找到小程序配置。', 'No mini-program config was found in common locations.', '原生项目检查 app.json / project.config.json；工程项目检查框架配置路径。', 'For native projects check app.json / project.config.json; for framework projects check the framework config path.')
  }
  return { directory: root, ok: checks.every(check => check.severity !== 'error'), checks }
}
export async function runDoctor(ctx: CliContext, args: string[], options: CliOptions): Promise<number> {
  if (args.length > 1) {
    writeError(ctx, t(ctx, '用法：weapp doctor [目录] [--json]', 'Usage: weapp doctor [directory] [--json]'))
    return 1
  }
  try {
    const report = await diagnose(args[0], ctx)
    if (options.json) {
      write(ctx, JSON.stringify(report, null, 2))
    }
    else {
      write(ctx, `${t(ctx, '检查目录', 'Checking')}: ${sanitize(report.directory)}`)
      const marks = { ok: '✓', warning: '!', error: '×', info: '·' }
      for (const check of report.checks) {
        write(ctx, `${marks[check.severity]} ${sanitize(check.message)}${check.advice ? `\n  ${sanitize(check.advice)}` : ''}`)
      }
      write(ctx, t(ctx, report.ok ? '检查完成。' : '发现需要处理的错误。', report.ok ? 'Checks completed.' : 'Errors need attention.'))
    }
    return report.ok ? 0 : 1
  }
  catch {
    writeError(ctx, t(ctx, '无法读取项目，请检查目录与文件权限。', 'Unable to read the project. Check directory and file permissions.'))
    return 1
  }
}
