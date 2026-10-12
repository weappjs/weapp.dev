import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Preserve Windows-safe npm spawning on the Node 18 baseline.
import spawn from 'cross-spawn'
// eslint-disable-next-line e18e/ban-dependencies -- Validate npm engines with the complete semver grammar on Node 18.
import semver from 'semver'
import { sanitize, t, write, writeError } from '../shared.js'

export const TEMPLATES = Object.freeze(['default', 'wevu', 'react', 'tailwindcss', 'multi-platform-sfc'])
export const CREATE_ADAPTERS = Object.freeze({
  'weapp-vite': { package: 'create-weapp-vite', bin: 'create-weapp-vite', dependency: 'weapp-vite' },
  'vue-mini': { package: 'create-vue-mini', bin: 'create-vue-mini', dependency: '@vue-mini/core' },
  'rezor': { package: 'create-rezor', bin: 'create-rezor', dependency: 'rezor' },
  'uni': { package: 'create-uni', bin: 'create-uni', dependency: '@dcloudio/uni-app' },
  'taro': { package: 'create-vite-taro', bin: 'create-vite-taro', dependency: 'vite-plugin-taro' },
})
class CreateError extends Error {
  constructor(zh, en) {
    super(en)
    this.zh = zh
    this.en = en
  }
}
async function exists(filename) {
  try {
    await lstat(filename)
    return true
  }
  catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}
export async function scaffoldPlan(route, directory, options = {}) {
  if (!Object.hasOwn(CREATE_ADAPTERS, route)) {
    throw new CreateError(`未知创建路线：${route}。可选：${Object.keys(CREATE_ADAPTERS).join(', ')}`, `Unknown creation route: ${route}. Choose ${Object.keys(CREATE_ADAPTERS).join(', ')}`)
  }
  const adapter = CREATE_ADAPTERS[route]
  if (options.template !== undefined && route !== 'weapp-vite') {
    throw new CreateError('--template 只适用于 weapp-vite。', '--template is only available for weapp-vite.')
  }
  const template = options.template || 'default'
  if (!TEMPLATES.includes(template)) {
    throw new CreateError(`未知模板：${template}。可选：${TEMPLATES.join(', ')}`, `Unknown template: ${template}. Choose ${TEMPLATES.join(', ')}`)
  }
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
  let parent
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
  return { route, package: adapter.package, bin: adapter.bin, dependency: adapter.dependency, directory: target, cwd: parent, args: scaffoldArgs }
}
export function npmExecArgs(plan, version = 'latest') {
  return ['exec', '--yes', `--package=${plan.package}@${version}`, '--', plan.bin, ...plan.args]
}
export function displayCommand(args) {
  return ['npm', ...args].map(arg => /^[\w@/.=:-]+$/.test(arg) ? arg : `'${arg.replaceAll('\'', '\'\\\'\'')}'`).join(' ')
}
export function parseScaffolderMetadata(output) {
  const metadata = JSON.parse(output)
  // npm returns a JSON string when version is the only populated field.
  return typeof metadata === 'string' ? { version: metadata } : metadata
}
export function queryScaffolder(packageName, { timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['view', `${packageName}@latest`, 'version', 'engines', '--json', '--registry=https://registry.npmjs.org/', '--fetch-retries=0', `--fetch-timeout=${timeout}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    let oversized = false
    const timer = setTimeout(() => {
      child.kill()
      reject(new CreateError('npm 元数据查询超时，请检查网络后重试。', 'The npm metadata query timed out. Check your connection and retry.'))
    }, timeout + 1000)
    child.stdout.on('data', (chunk) => {
      if (output.length < 1024 * 1024) {
        output += chunk
      }
      else {
        oversized = true
        child.kill()
      }
    })
    // Registry errors can contain credentials from user configuration; never echo them.
    child.stderr.resume()
    child.on('error', () => {
      clearTimeout(timer)
      reject(new CreateError('无法运行 npm，请确认 npm 已安装且在 PATH 中。', 'Unable to run npm. Ensure npm is installed and on PATH.'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 || oversized) {
        return reject(new CreateError(`无法从官方 npm 源查询 ${packageName}，请检查网络后重试。`, `Unable to query ${packageName} from the official npm registry. Check your connection and retry.`))
      }
      try {
        resolve(parseScaffolderMetadata(output))
      }
      catch {
        reject(new CreateError('npm 返回了无效的元数据。', 'npm returned invalid metadata.'))
      }
    })
  })
}
export function executeScaffolder(plan, version) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', npmExecArgs(plan, version), { cwd: plan.cwd, stdio: 'inherit' })
    child.on('error', () => reject(new CreateError('无法启动官方脚手架，请确认 npm 已安装。', 'Unable to start the official scaffolder. Ensure npm is installed.')))
    child.on('close', (code, signal) => resolve({ code, signal }))
  })
}
export async function createProject(route, directory, options = {}, operations = {}) {
  const plan = await scaffoldPlan(route, directory, options)
  if (options.dryRun) {
    return { plan, dryRun: true }
  }
  const metadata = await (operations.query || queryScaffolder)(plan.package)
  if (!metadata || !semver.valid(metadata.version)) {
    throw new CreateError('脚手架版本元数据无效。', 'The scaffolder version metadata is invalid.')
  }
  const requirement = metadata.engines?.node
  const nodeVersion = operations.nodeVersion || process.versions.node
  if (requirement && (!semver.validRange(requirement) || !semver.satisfies(nodeVersion, requirement))) {
    throw new CreateError(`${plan.package}@${metadata.version} 要求 Node ${requirement}；当前为 ${nodeVersion}。请升级 Node 后重试。`, `${plan.package}@${metadata.version} requires Node ${requirement}; current version is ${nodeVersion}. Upgrade Node and retry.`)
  }
  if (await exists(plan.directory)) {
    throw new CreateError(`目标在创建前已出现，不能覆盖：${plan.directory}`, `The target appeared before creation and cannot be overwritten: ${plan.directory}`)
  }
  const result = await (operations.execute || executeScaffolder)(plan, metadata.version)
  const code = typeof result === 'number' ? result : result?.code
  if (code !== 0) {
    throw new CreateError(`官方脚手架未成功退出。已有文件保留在 ${plan.directory}，请检查后重试。`, `The official scaffolder did not finish successfully. Any generated files remain at ${plan.directory}; inspect them before retrying.`)
  }
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(plan.directory, 'package.json'), 'utf8'))
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('manifest')
    }
  }
  catch {
    throw new CreateError(`脚手架未生成有效的 package.json。已有文件保留在 ${plan.directory}。`, `The scaffolder did not generate a valid package.json. Any generated files remain at ${plan.directory}.`)
  }
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
  if (typeof dependencies[plan.dependency] !== 'string' || !dependencies[plan.dependency].trim()) {
    throw new CreateError(`生成项目缺少预期依赖 ${plan.dependency}，请检查 ${plan.directory}。`, `The generated project is missing the expected dependency ${plan.dependency}. Inspect ${plan.directory}.`)
  }
  return { plan, version: metadata.version, manifest }
}
export async function runCreate(ctx, args, options) {
  if (args.length !== 2) {
    writeError(ctx, t(ctx, '用法：weapp create <路线> <新目录> [--template 模板] [--dry-run]', 'Usage: weapp create <route> <new-directory> [--template template] [--dry-run]'))
    return 1
  }
  try {
    const result = await createProject(args[0], args[1], options)
    if (result.dryRun) {
      write(ctx, `${t(ctx, '执行目录', 'Working directory')}: ${sanitize(result.plan.cwd)}\n${displayCommand(npmExecArgs(result.plan))}`)
      write(ctx, t(ctx, '实际运行会先检查官方版本和 Node 要求；此预览没有联网或写入文件。', 'Execution first checks the official version and Node requirements; this preview does not access the network or write files.'))
    }
    else {
      write(ctx, `${t(ctx, '项目已创建', 'Project created')}: ${sanitize(result.plan.directory)}`)
      write(ctx, `cd ${displayCommand([result.plan.directory]).slice(4)}\nnpm install`)
    }
    return 0
  }
  catch (error) {
    writeError(ctx, sanitize(error.zh ? t(ctx, error.zh, error.en) : t(ctx, '无法创建项目，请检查目录权限。', 'Unable to create the project. Check directory permissions.')))
    return 1
  }
}
