import type { CliContext, CliOptions } from './types.js'
import { t } from './shared.js'

const globalOptions = ['lang', 'noColor', 'noMotion', 'help', 'version']
export type CommandName = 'fx' | 'play' | 'lab' | 'projects' | 'info' | 'docs' | 'repo' | 'create' | 'doctor' | 'qr' | 'palette'
interface CommandDefinition { usage: string, min: number, max: number, options: string[], hidden?: boolean, zh: string, en: string }
export const commands: Record<CommandName, CommandDefinition> = {
  fx: { usage: 'fx [logo|orbit|matrix|fireworks]', min: 0, max: 1, options: ['seed', 'duration'], zh: '粒子、星轨、字符雨与烟花', en: 'Particles, orbits, matrix rain, and fireworks' },
  play: { usage: 'play snake', min: 1, max: 1, options: ['seed'], hidden: true, zh: '玩一局贪吃蛇', en: 'Play terminal snake' },
  lab: { usage: 'lab [--no-open]', min: 0, max: 0, options: ['noOpen'], zh: '打开离线视觉实验室', en: 'Open the offline visual lab' },
  projects: { usage: 'projects [query] [--all] [--ecosystem name] [--status state] [--json]', min: 0, max: 1, options: ['all', 'ecosystem', 'status', 'json'], zh: '浏览 weapp 生态，搜索全部项目', en: 'Browse weapp and search every ecosystem' },
  info: { usage: 'info <project> [--json]', min: 1, max: 1, options: ['json'], zh: '查看项目能力与开始方式', en: 'Inspect a project and its quick start' },
  docs: { usage: 'docs <project> [--open]', min: 1, max: 1, options: ['open'], zh: '查看官方文档', en: 'Find official documentation' },
  repo: { usage: 'repo <project> [--open]', min: 1, max: 1, options: ['open'], zh: '查看源码仓库', en: 'Find the source repository' },
  create: { usage: 'create [weapp-vite|vue-mini|rezor|uni|taro] [directory] [--template name] [--dry-run] [--install] [--package-manager npm|pnpm|yarn|bun]', min: 0, max: 2, options: ['template', 'dryRun', 'install', 'packageManager'], zh: '默认创建 weapp-vite，支持交互向导', en: 'Create weapp-vite by default, with a guided setup' },
  doctor: { usage: 'doctor [directory] [--json]', min: 0, max: 1, options: ['json'], zh: '只读检查环境与项目', en: 'Inspect the environment and project' },
  qr: { usage: 'qr [text|-] [--output file.svg] [--force]', min: 0, max: 1, options: ['output', 'force'], zh: '生成终端或 SVG 二维码', en: 'Generate a terminal or SVG QR code' },
  palette: { usage: 'palette <hex> [--format css] [--json] [--output file] [--force]', min: 1, max: 1, options: ['format', 'json', 'output', 'force'], zh: '生成五阶配色与文字对比度', en: 'Generate five shades and text contrast' },
}

const values = new Set(['lang', 'seed', 'duration', 'ecosystem', 'status', 'template', 'packageManager', 'output', 'format'])
const known = new Set([...globalOptions, ...Object.values(commands).flatMap(command => command.options)])
const camel = (value: string): string => value.replace(/-([a-z])/g, (_: string, letter: string) => letter.toUpperCase())

export function parseArgs(argv: string[]): { command?: CommandName, args: string[], options: CliOptions } {
  const options: Record<string, string | number | boolean> = {}
  const positional: string[] = []
  let literal = false
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (literal || token === '-' || !token.startsWith('-')) {
      positional.push(token)
      continue
    }
    if (token === '--') {
      literal = true
      continue
    }
    if (token === '-h' || token === '-v') {
      options[token === '-h' ? 'help' : 'version'] = true
      continue
    }
    const [flag, ...parts] = token.slice(2).split('=')
    const key = camel(flag)
    if (!token.startsWith('--') || !known.has(key)) {
      throw new Error(`Unknown option: ${token}`)
    }
    if (Object.hasOwn(options, key)) {
      throw new Error(`Duplicate option: --${flag}`)
    }
    if (!values.has(key)) {
      if (parts.length) {
        throw new Error(`Option --${flag} does not accept a value`)
      }
      options[key] = true
      continue
    }
    const value = parts.length ? parts.join('=') : argv[++i]
    if (value === undefined || value === '' || (value.startsWith('--') && !parts.length)) {
      throw new Error(`Missing value for --${flag}`)
    }
    options[key] = value
  }
  const candidate = positional.shift()
  const command = candidate as CommandName | undefined
  if (command && !Object.hasOwn(commands, command)) {
    throw new Error(`Unknown command: ${command}`)
  }
  const allowed = new Set([...globalOptions, ...(command ? commands[command].options : [])])
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw new Error(`Option ${key} is not available for ${command || 'weapp'}`)
    }
  }
  if (options.lang && !['zh-CN', 'en'].includes(String(options.lang))) {
    throw new Error('--lang must be zh-CN or en')
  }
  if (options.packageManager !== undefined && !['npm', 'pnpm', 'yarn', 'bun'].includes(String(options.packageManager))) {
    throw new Error('--package-manager must be npm, pnpm, yarn, or bun')
  }
  if (options.seed !== undefined) {
    if (!/^\d+$/.test(String(options.seed)) || Number(options.seed) > 0xFFFFFFFF) {
      throw new Error('--seed must be an integer between 0 and 4294967295')
    }
    options.seed = Number(options.seed)
  }
  if (options.duration !== undefined) {
    const duration = Number(options.duration)
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) {
      throw new Error('--duration must be between 0 and 86400 seconds')
    }
    options.duration = duration
  }
  if (options.version && (command || positional.length)) {
    throw new Error('--version cannot be combined with a command')
  }
  if (command && !options.help && (positional.length < commands[command].min || positional.length > commands[command].max)) {
    throw new Error(`Usage: weapp ${commands[command].usage}`)
  }
  // Every key and value has been checked above; numeric flags are normalized.
  return { command, args: positional, options: options as CliOptions }
}

export function renderHelp(ctx: Pick<CliContext, 'lang'>, command?: CommandName): string {
  const intro = t(ctx, 'weapp — 以项目为核心的小程序动态工作台', 'weapp — a project-driven workbench for mini-app developers')
  const links = [
    'Website: https://weapp.js.org/',
    'Projects: https://weapp.js.org/en/projects/',
    'GitHub: https://github.com/weappjs',
    'Issues: https://github.com/weappjs/weapp.dev/issues',
  ]
  const usage = command
    ? [`  npx weapp ${commands[command].usage}`, `  ${t(ctx, commands[command].zh, commands[command].en)}`]
    : Object.values(commands).filter(entry => !entry.hidden).flatMap(entry => [`  npx weapp ${entry.usage}`, `    ${t(ctx, entry.zh, entry.en)}`])
  return [intro, '', ...links, '', 'Usage:', ...(command ? [] : [`  npx weapp — ${t(ctx, '动态工作台，识别当前项目；无项目时优先创建', 'animated workbench, detecting your project or offering creation')}`]), ...usage, ...(command === 'create' ? ['', t(ctx, '交互终端：目录 → 模板 → 创建摘要；默认模板 default。其他路线须明确指定。', 'Interactive terminal: directory → template → summary; default template: default. Specify other routes explicitly.'), t(ctx, '非交互环境必须提供路线与目录。--install 明确安装依赖；默认仅创建。--package-manager 选择包管理器，不能覆盖声明冲突。--dry-run 始终离线且不安装。', 'Provide a route and directory in non-interactive environments. --install explicitly installs dependencies; creation alone is the default. --package-manager selects a manager without overriding declarations. --dry-run stays offline and never installs.')] : []), '', '--lang zh-CN|en  --no-color  --no-motion  --help  --version', '', t(ctx, '方向键 / Enter 选择 · Tab 切换生态 · 空格暂停 · Esc 返回 · q 退出', 'Arrow keys / Enter select · Tab switch ecosystems · Space pause · Esc back · q quit')].join('\n')
}
