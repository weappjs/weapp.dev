import type { PackageManagerName, ProjectContext } from '../project/context.js'
import type { CliContext, CliOptions } from '../types.js'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Compare declared package manager versions using npm semver rules.
import eq from 'semver/functions/eq.js'
// eslint-disable-next-line e18e/ban-dependencies -- Validate npm engines with the complete semver grammar on Node 18.
import satisfies from 'semver/functions/satisfies.js'
// eslint-disable-next-line e18e/ban-dependencies -- Do not mistake arbitrary dependency version strings for semver.
import valid from 'semver/functions/valid.js'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve npm-compatible engine range parsing on Node 18.
import validRange from 'semver/ranges/valid.js'
import { installedPackageManagerVersion } from '../project/actions.js'
import { discoverProject, projectFileExists, readProjectJson } from '../project/context.js'
import { sanitize, t, write, writeError } from '../shared.js'

const FRAMEWORK_DOCS: Readonly<Record<string, string>> = {
  'weapp-vite': 'https://vite.weapp.dev/',
  '@vue-mini/core': 'https://vuemini.org/',
  'rezor': 'https://github.com/rezorjs/rezor',
  'vite-plugin-taro': 'https://vpt.js.org/',
  '@tarojs/taro': 'https://docs.taro.zone/',
  '@dcloudio/uni-app': 'https://uniapp.dcloud.net.cn/',
  'weapp-tailwindcss': 'https://tw.weapp.dev/',
}

export type DiagnosticSeverity = 'ok' | 'warning' | 'error' | 'info'
export interface DiagnosticCheck {
  id: string
  severity: DiagnosticSeverity
  message: string
  advice?: string
  evidence?: string[]
  suggestion?: { cwd: string, command: string, args: string[] }
}
export interface DiagnosticReport {
  /** The originally requested directory, retained for existing JSON consumers. */
  directory: string
  requestedDirectory: string
  projectRoot: string
  context: ProjectContext
  ok: boolean
  checks: DiagnosticCheck[]
}
export interface DoctorOperations {
  nodeVersion?: string
  packageManagerVersion?: (command: string, options?: { cwd: string }) => Promise<string | null>
  project?: ProjectContext
}
export function packageManagerVersion(command: string, { timeout = 3000, cwd = process.cwd() }: { timeout?: number, cwd?: string } = {}): Promise<string | null> {
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(command)) {
    return Promise.resolve(null)
  }
  return installedPackageManagerVersion(command as PackageManagerName, { cwd, probeTimeoutMs: timeout })
}
export async function diagnose(directory: string | undefined, ctx: Pick<CliContext, 'lang'>, operations: DoctorOperations = {}): Promise<DiagnosticReport> {
  const project = operations.project || await discoverProject(directory)
  const root = project.projectRoot
  const installRoot = project.workspace?.root || root
  const checks: DiagnosticCheck[] = []
  const add = (id: string, severity: DiagnosticSeverity, zh: string, en: string, zhAdvice?: string, enAdvice?: string, extra?: Pick<DiagnosticCheck, 'evidence' | 'suggestion'>): void => {
    checks.push({ id, severity, message: t(ctx, zh, en), ...(zhAdvice && enAdvice ? { advice: t(ctx, zhAdvice, enAdvice) } : {}), ...extra })
  }
  const report = (): DiagnosticReport => ({ directory: project.requestedDirectory, requestedDirectory: project.requestedDirectory, projectRoot: root, context: project, ok: checks.every(check => check.severity !== 'error'), checks })
  const manifestEvidence = [path.join(root, 'package.json')]
  const nodeVersion = operations.nodeVersion || process.versions.node
  const nodeOk = satisfies(nodeVersion, '>=18')
  add('node', nodeOk ? 'ok' : 'error', `Node ${nodeVersion}`, `Node ${nodeVersion}`, nodeOk ? undefined : '请安装 Node 18 或更新版本。', nodeOk ? undefined : 'Install Node 18 or newer.', { evidence: [process.execPath] })
  for (const issue of [...project.issues, ...project.packageManager.conflicts]) {
    const evidence = issue.evidence || (issue.id === 'directory' ? [project.requestedDirectory] : issue.id.startsWith('native') ? project.configs.map(config => path.join(root, config.path)) : [...manifestEvidence, ...(project.workspace && project.workspace.root !== root ? [path.join(project.workspace.root, 'package.json')] : [])])
    add(issue.id, issue.severity, issue.messageZh || issue.message, issue.message, issue.adviceZh || issue.advice, issue.advice, { evidence })
  }
  if (project.issues.some(issue => issue.id === 'directory')) {
    return report()
  }
  if (project.manifest) {
    const name = project.manifest.name || t(ctx, '(未命名)', '(unnamed)')
    add('manifest', 'ok', `项目：${name}`, `Project: ${name}`, undefined, undefined, { evidence: [path.join(root, 'package.json')] })
  }
  else if (project.kind === 'native') {
    add('manifest', 'info', '原生微信小程序没有 package.json；无需检查 npm 依赖或运行脚本。', 'This native WeChat project has no package.json; dependency and script checks do not apply.')
  }
  else if (project.kind === 'unknown') {
    add('manifest', 'error', '没有找到 package.json 或原生小程序配置。', 'No package.json or native mini-program configuration was found.', '提供一个项目目录，或先创建项目。', 'Provide a project directory or create a project first.', { evidence: [project.requestedDirectory] })
  }
  if (project.workspace) {
    add('workspace', 'ok', `已验证 workspace：${project.workspace.root}（${project.workspace.memberPath}）`, `Verified workspace: ${project.workspace.root} (${project.workspace.memberPath})`, undefined, undefined, { evidence: project.workspace.evidence.map(file => path.join(project.workspace!.root, file)) })
  }
  const engineSources = [{ id: 'project', labelZh: '项目', labelEn: 'Project', manifest: project.manifest, filename: path.join(root, 'package.json') }, ...(project.workspace && project.workspace.root !== root ? [{ id: 'workspace', labelZh: 'Workspace', labelEn: 'Workspace', manifest: project.workspace.manifest, filename: path.join(project.workspace.root, 'package.json') }] : [])]
  for (const source of engineSources) {
    const requirement = source.manifest?.engines?.node
    if (requirement === undefined) {
      continue
    }
    const range = typeof requirement === 'string' && requirement.trim() ? validRange(requirement) : null
    const compatible = range && satisfies(nodeVersion, range)
    add(`${source.id}-node`, compatible ? 'ok' : 'error', `${source.labelZh} Node 要求：${String(requirement)}`, `${source.labelEn} Node requirement: ${String(requirement)}`, compatible ? undefined : '使用满足 engines.node 的 Node 版本，并确保它是有效的 semver 范围。', compatible ? undefined : 'Use a Node version satisfying engines.node and ensure it is a valid semver range.', { evidence: [`${source.filename}#engines.node`] })
  }
  const selected = project.packageManager.name
  const managers = [...new Set(project.lockfiles.map(lock => lock.manager))]
  if (project.manifest) {
    if (!project.lockfiles.length) {
      add('lockfiles', 'warning', '未发现锁文件。', 'No lockfile was found.', '安装依赖并提交对应包管理器的锁文件。', 'Install dependencies and commit the lockfile for your package manager.', { evidence: [installRoot] })
    }
    else {
      const locks = project.lockfiles.map(lock => path.basename(lock.path)).join(', ')
      add('lockfiles', managers.length > 1 ? 'warning' : 'ok', `锁文件：${locks}`, `Lockfiles: ${locks}`, managers.length > 1 ? '明确团队使用的包管理器，并检查其他锁文件是否仍需要保留。' : undefined, managers.length > 1 ? 'Choose the package manager your team uses and review whether the other lockfiles are still needed.' : undefined, { evidence: project.lockfiles.map(lock => lock.path) })
    }
    if (selected && managers.length && !managers.includes(selected)) {
      add('package-manager-lock', 'warning', `选择了 ${selected}，但锁文件不匹配。`, `${selected} was selected, but its lockfile is missing.`, '检查包管理器声明及现有锁文件；doctor 不修改它们。', 'Review the package manager declaration and existing lockfiles; doctor does not change them.', { evidence: project.lockfiles.map(lock => lock.path) })
    }
    if (selected) {
      let version: string | null
      try {
        version = await (operations.packageManagerVersion || packageManagerVersion)(selected, { cwd: installRoot })
      }
      catch {
        version = null
      }
      const knownVersion = typeof version === 'string' && valid(version) ? version : undefined
      add(`package-manager:${selected}`, knownVersion ? 'ok' : 'error', knownVersion ? `${selected} ${version}` : `找不到 ${selected}，版本无效或版本查询超时。`, knownVersion ? `${selected} ${version}` : `${selected} is unavailable, returned an invalid version, or its version query timed out.`, knownVersion ? undefined : `安装 ${selected}，并确保它在 PATH 中。`, knownVersion ? undefined : `Install ${selected} and ensure it is on PATH.`, { evidence: [`${selected} --version (cwd: ${installRoot})`] })
      if (knownVersion && project.packageManager.version) {
        const matches = eq(knownVersion, project.packageManager.version)
        add('package-manager-version', matches ? 'ok' : 'warning', `声明 ${selected}@${project.packageManager.version}，当前为 ${knownVersion}。`, `Declared ${selected}@${project.packageManager.version}; installed ${knownVersion}.`, matches ? undefined : '使用项目声明的包管理器版本；doctor 不下载或切换版本。', matches ? undefined : 'Use the declared package manager version; doctor does not download or switch versions.', { evidence: engineSources.map(source => `${source.filename}#packageManager`) })
      }
      if (knownVersion) {
        for (const source of engineSources) {
          const requirement = source.manifest?.engines?.[selected]
          if (requirement === undefined) {
            continue
          }
          const range = typeof requirement === 'string' && requirement.trim() ? validRange(requirement) : null
          const compatible = range && satisfies(knownVersion, range)
          add(`${source.id}-engine:${selected}`, compatible ? 'ok' : 'error', `${source.labelZh} 要求 ${selected} ${String(requirement)}，当前为 ${knownVersion}。`, `${source.labelEn} requires ${selected} ${String(requirement)}; installed ${knownVersion}.`, compatible ? undefined : '请使用满足包管理器 engines 声明的版本，并修正无效范围。', compatible ? undefined : 'Use a version satisfying the package manager engines declaration and correct invalid ranges.', { evidence: [`${source.filename}#engines.${selected}`] })
        }
      }
    }
    else {
      add('package-manager', 'warning', '包管理器尚未确定；未运行版本探测。', 'The package manager is unresolved; no version probe was run.', '先处理包管理器声明或锁文件冲突。', 'Resolve package manager declaration or lockfile conflicts first.', { evidence: [...manifestEvidence, ...project.lockfiles.map(lock => lock.path)] })
    }
  }
  add('frameworks', project.frameworks.length ? 'ok' : 'info', project.frameworks.length ? `识别到：${project.frameworks.join(', ')}` : '没有识别到已知的小程序框架依赖。', project.frameworks.length ? `Detected: ${project.frameworks.join(', ')}` : 'No known mini-program framework dependency was detected.')
  for (const framework of project.frameworks) {
    add(`framework-docs:${framework}`, 'info', `${framework} 官方文档：${FRAMEWORK_DOCS[framework]}`, `${framework} official documentation: ${FRAMEWORK_DOCS[framework]}`, '依赖存在不代表已完成框架接入；请按对应框架文档检查配置。', 'A declared dependency does not prove integration is complete; follow this framework’s configuration guide.', { evidence: manifestEvidence })
  }
  if (project.frameworks.includes('weapp-vite') && !project.configs.some(config => config.kind === 'vite')) {
    add('weapp-vite-config', 'warning', '未找到常见路径的 Vite 配置；weapp-vite 的配置位置尚未确认。', 'No conventional Vite config was found; the weapp-vite configuration location is unconfirmed.', '检查已有脚本是否使用 --config 指向其他位置，并按 https://vite.weapp.dev/ 核对接入；doctor 不执行配置或自动生成文件。', 'Check whether existing scripts use --config for another location and follow https://vite.weapp.dev/ to verify integration; doctor neither executes configs nor generates files.', { evidence: [root, ...manifestEvidence] })
  }
  const dependencies = { ...project.manifest?.dependencies, ...project.manifest?.devDependencies, ...project.manifest?.optionalDependencies }
  const declared = Object.keys(dependencies).filter(name => /^(?:@[\w.-]+\/)?[\w.-]+$/.test(name) && name.split('/').every(segment => segment !== '.' && segment !== '..'))
  const lookupRoots: string[] = []
  let lookupRoot = root
  while (true) {
    lookupRoots.push(lookupRoot)
    if (lookupRoot === installRoot || path.dirname(lookupRoot) === lookupRoot) {
      break
    }
    lookupRoot = path.dirname(lookupRoot)
  }
  if (declared.length) {
    let pnp = false
    for (const candidate of lookupRoots) {
      if (await projectFileExists(path.join(candidate, '.pnp.cjs')) || await projectFileExists(path.join(candidate, '.pnp.js'))) {
        pnp = true
        break
      }
    }
    if (pnp) {
      add('dependencies', 'info', '检测到 Yarn PnP；未执行其加载器，依赖版本尚未判定。', 'Yarn PnP was detected; its loader was not executed and dependency versions were not evaluated.')
    }
    else {
      const missing: string[] = []
      const optionalMissing: string[] = []
      const mismatched: string[] = []
      const unverified: string[] = []
      const found: string[] = []
      for (const name of declared) {
        const range = validRange(dependencies[name])
        // Protocols, aliases, tags and catalogs need package-manager-specific resolution.
        if (!range) {
          unverified.push(`${name} (${dependencies[name]})`)
          continue
        }
        let installed: Record<string, unknown> | undefined
        let unreadable = false
        for (const candidate of lookupRoots) {
          const filename = path.join(candidate, 'node_modules', ...name.split('/'), 'package.json')
          if (!(await projectFileExists(filename))) {
            continue
          }
          try {
            installed = await readProjectJson(filename)
          }
          catch {
            unreadable = true
          }
          break
        }
        if (!installed) {
          if (unreadable) {
            unverified.push(name)
          }
          else if (Object.hasOwn(project.manifest?.optionalDependencies || {}, name)) {
            optionalMissing.push(name)
          }
          else {
            missing.push(name)
          }
          continue
        }
        found.push(name)
        if (typeof installed.version !== 'string' || !valid(installed.version)) {
          unverified.push(name)
        }
        else if (!satisfies(installed.version, range)) {
          mismatched.push(`${name}@${installed.version} (${dependencies[name]})`)
        }
      }
      const canSuggestInstall = selected && !project.packageManager.conflicts.length && !project.issues.some(issue => issue.severity === 'error')
      const suggestion = canSuggestInstall ? { cwd: installRoot, command: selected, args: ['install'] } : undefined
      const evidence = [...manifestEvidence, ...lookupRoots.map(directory => path.join(directory, 'node_modules'))]
      const adviceZh = suggestion ? `在 ${installRoot} 运行 ${selected} install；仅缺少开发依赖也可能来自生产环境安装。` : '先解决包管理器选择或项目配置问题；仅缺少开发依赖也可能来自生产环境安装。'
      const adviceEn = suggestion ? `Run ${selected} install in ${installRoot}; missing development dependencies may also reflect a production-only installation.` : 'Resolve package manager or project configuration issues first; missing development dependencies may also reflect a production-only installation.'
      add('dependencies', missing.length ? 'warning' : 'ok', missing.length ? `缺少已声明依赖：${missing.join(', ')}` : `已找到 ${found.length} 个可检查的声明依赖。`, missing.length ? `Missing declared dependencies: ${missing.join(', ')}` : `Found ${found.length} declared dependencies with inspectable ranges.`, missing.length ? adviceZh : undefined, missing.length ? adviceEn : undefined, { evidence, ...(missing.length && suggestion ? { suggestion } : {}) })
      if (mismatched.length) {
        add('dependency-versions', 'warning', `依赖版本不满足声明：${mismatched.join(', ')}`, `Installed dependency versions do not satisfy their ranges: ${mismatched.join(', ')}`, adviceZh, adviceEn, { evidence, ...(suggestion ? { suggestion } : {}) })
      }
      if (unverified.length) {
        add('dependency-versions-unverified', 'info', `以下依赖版本未判定：${unverified.join(', ')}`, `These dependency versions were not evaluated: ${unverified.join(', ')}`, '协议、别名、标签或不可读取版本需要对应包管理器检查；不能据此断言依赖缺失或兼容。', 'Protocols, aliases, tags, or unreadable versions require the package manager to inspect them; neither absence nor compatibility is implied.')
      }
      if (optionalMissing.length) {
        add('optional-dependencies', 'info', `未安装可选依赖：${optionalMissing.join(', ')}；可能不适用于当前平台。`, `Optional dependencies are absent: ${optionalMissing.join(', ')}; they may not apply to this platform.`)
      }
    }
  }
  for (const config of project.configs.filter(config => config.kind === 'json')) {
    const valid = config.status === 'valid'
    add(`config:${config.path}`, valid ? 'ok' : 'warning', valid ? `${config.path} JSON 有效。` : `${config.path} 不是可读取的标准 JSON。`, valid ? `${config.path} contains valid JSON.` : `${config.path} is not readable standard JSON.`, valid ? undefined : '检查文件语法；doctor 不执行配置或解析 JSONC/JSON5。', valid ? undefined : 'Check the syntax; doctor does not execute config files or parse JSONC/JSON5.', { evidence: [path.join(root, config.path)] })
  }
  const viteConfigs = project.configs.filter(config => config.kind === 'vite').map(config => config.path)
  if (viteConfigs.length) {
    add('vite-config', 'info', `发现 ${viteConfigs.join(', ')}；未执行配置。`, `Found ${viteConfigs.join(', ')}; config files were not executed.`)
  }
  if (!project.configs.length) {
    add('mini-program-config', 'info', '没有在常见路径找到小程序配置。', 'No mini-program config was found in common locations.', '原生项目检查 app.json / project.config.json；工程项目检查框架配置路径。', 'For native projects check app.json / project.config.json; for framework projects check the framework config path.')
  }
  return report()
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
      write(ctx, `${t(ctx, '检查目录', 'Checking')}: ${sanitize(report.requestedDirectory)}`)
      if (report.projectRoot !== report.requestedDirectory) {
        write(ctx, `${t(ctx, '识别的项目根目录', 'Detected project root')}: ${sanitize(report.projectRoot)}`)
      }
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
