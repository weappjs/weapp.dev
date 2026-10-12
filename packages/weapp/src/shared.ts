import type { CliContext, CliInput, CliOutput, Language } from './types.js'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'

export function t(ctx: Pick<CliContext, 'lang'>, zh: string, en: string): string {
  return ctx.lang === 'en' ? en : zh
}

/** Render user-provided terminal controls as visible escapes. */
export function sanitize(value: unknown): string {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0)!
    return code < 32 || (code >= 127 && code <= 159) ? `\\u${code.toString(16).padStart(4, '0')}` : character
  }).join('')
}

export function write(ctx: Pick<CliContext, 'stdout'>, text = ''): void {
  ctx.stdout.write(`${text}\n`)
}

export function writeError(ctx: Pick<CliContext, 'stderr'>, text: string): void {
  ctx.stderr.write(`${text}\n`)
}

export async function safeWrite(path: string, content: string, force = false): Promise<void> {
  await writeFile(path, content, { encoding: 'utf8', flag: force ? 'w' : 'wx' })
}

export function detectLanguage(env: NodeJS.ProcessEnv = process.env): Language {
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  return /^en(?:[_\-.]|$)/i.test(locale) ? 'en' : 'zh-CN'
}

export function requestedLanguage(argv: string[], fallback: Language): Language {
  let lang = fallback
  for (let index = 0; index < argv.length && argv[index] !== '--'; index += 1) {
    const value = argv[index] === '--lang' ? argv[index + 1] : argv[index].startsWith('--lang=') ? argv[index].slice(7) : undefined
    if (value === 'en' || value === 'zh-CN') {
      lang = value
    }
  }
  return lang
}

export function errorMessage(ctx: Pick<CliContext, 'lang'>, message: string): string {
  if (ctx.lang === 'en') {
    return message
  }
  const translations: [RegExp, string][] = [
    [/^Unknown option: (.*)$/, '未知选项: $1'],
    [/^Unknown command: (.*)$/, '未知命令: $1'],
    [/^Duplicate option: (.*)$/, '选项重复: $1'],
    [/^Missing value for (.*)$/, '选项缺少值: $1'],
    [/^Option (.*) does not accept a value$/, '选项 $1 不接受值'],
    [/^Option (.*) is not available for (.*)$/, '$2 不支持选项 $1'],
    [/^Unknown ecosystem: (.*)\. Choose (.*)$/, '未知生态: $1。可选: $2'],
    [/^Unknown status: (.*)\. Choose (.*)$/, '未知状态: $1。可选: $2'],
    [/^--lang must be zh-CN or en$/, '--lang 须为 zh-CN 或 en'],
    [/^--seed must be an integer between 0 and 4294967295$/, '--seed 须为 0 到 4294967295 之间的整数'],
    [/^--duration must be between 0 and 86400 seconds$/, '--duration 须大于 0 且不超过 86400 秒'],
    [/^--version cannot be combined with a command$/, '--version 不能与子命令同时使用'],
    [/^Usage: (.*)$/, '用法: $1'],
  ]
  for (const [pattern, replacement] of translations) {
    if (pattern.test(message)) {
      return message.replace(pattern, replacement)
    }
  }
  return message
}

export function isInteractive(stdin: Pick<CliInput, 'isTTY' | 'setRawMode'>, stdout: Pick<CliOutput, 'isTTY'>, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY && typeof stdin.setRawMode === 'function' && env.TERM !== 'dumb' && !env.CI)
}
