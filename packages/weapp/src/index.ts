import type { CatalogProject, CliContext, CliOverrides, LogoData } from './types.js'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs, renderHelp } from './registry.js'
import { runtimeAsset } from './runtime.js'
import { detectLanguage, errorMessage, isInteractive, requestedLanguage, sanitize, t, write, writeError } from './shared.js'

interface DataFiles { catalog: CatalogProject[], logo: LogoData, meta: { version: string } }
async function loadData<K extends keyof DataFiles>(name: K): Promise<DataFiles[K]> {
  // These snapshots are generated and validated during the package build.
  return JSON.parse(await readFile(runtimeAsset(`data/${name}.json`), 'utf8')) as DataFiles[K]
}

export async function openUrl(url: string): Promise<void> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')) {
    throw new Error('Only official HTTPS links and the local lab can be opened')
  }
  // Keep platform-specific browser launching off every other command's path.
  // eslint-disable-next-line e18e/ban-dependencies -- Cross-platform launching compatible with Node 18.
  const { default: open } = await import('open')
  await open(parsed.href, { wait: false })
}

export async function dispatch(argv: string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs(argv)
  const { command, args, options } = parsed
  const current: CliContext = { ...ctx, lang: options.lang || ctx.lang, color: ctx.color && !options.noColor, motion: ctx.motion && !options.noMotion }
  current.createWizard = async (route, wizardOptions, hooks) => {
    const { runCreateWizard } = await import('./terminal/index.js')
    return runCreateWizard(current, route, wizardOptions, hooks)
  }
  if (options.version) {
    write(current, current.version || (await loadData('meta')).version)
    return 0
  }
  if (options.help || (!command && !current.interactive)) {
    write(current, renderHelp(current, command))
    return 0
  }
  const catalogCommand = command === 'projects' || command === 'info' || command === 'docs' || command === 'repo'
  const visualCommand = !command || command === 'fx' || command === 'lab'
  const projectBrowser = command === 'projects' && current.interactive && !args.length && !options.json
  await Promise.all([
    !current.catalog && (catalogCommand || visualCommand)
      ? loadData('catalog').then(data => current.catalog = data)
      : undefined,
    !current.logo && (visualCommand || projectBrowser)
      ? loadData('logo').then(data => current.logo = data)
      : undefined,
  ])
  if (!command) {
    const { runHub } = await import('./terminal/index.js')
    return runHub(current, async (next) => {
      try {
        return await dispatch(next, { ...current, hub: true })
      }
      catch (error) {
        writeError(current, sanitize(errorMessage(current, error instanceof Error ? error.message : String(error))))
        return 1
      }
    })
  }
  if (command === 'fx') {
    const { runFx } = await import('./terminal/index.js')
    return runFx(current, args, options)
  }
  if (command === 'play') {
    if (args[0] !== 'snake') {
      throw new Error(t(current, '目前支持 play snake。', 'The available game is play snake.'))
    }
    const { runSnake } = await import('./terminal/index.js')
    return runSnake(current, args, options)
  }
  if (command === 'lab') {
    const { runLab } = await import('./lab.js')
    return runLab(current, args, options)
  }
  if (command === 'projects') {
    const { printProjects, renderProject, searchProjects } = await import('./catalog.js')
    const matches = searchProjects(current.catalog!, args[0], options)
    if (current.interactive && !args.length && !options.json && matches.length) {
      const { selectProjects } = await import('./terminal/index.js')
      const project = await selectProjects(current, matches, { all: options.all || Boolean(options.ecosystem), filtered: Boolean(options.ecosystem || options.status) })
      if (project) {
        write(current, renderProject(current, project))
      }
      return current.cancelled ? current.cancelledCode || 130 : 0
    }
    printProjects(current, matches, options)
    return 0
  }
  if ((command === 'info' || command === 'docs' || command === 'repo')) {
    const { findProject, renderProject } = await import('./catalog.js')
    const project = findProject(current.catalog!, args[0])
    if (!project) {
      throw new Error(t(current, `找不到项目：${sanitize(args[0])}。运行 weapp projects 搜索。`, `Unknown project: ${sanitize(args[0])}. Search with weapp projects.`))
    }
    if (command === 'info') {
      write(current, options.json ? JSON.stringify(project) : renderProject(current, project))
      return 0
    }
    const url = command === 'docs' ? project.docsUrl : `https://github.com/${project.github}`
    write(current, url)
    if (options.open) {
      await current.openUrl(url)
    }
    return 0
  }
  if (command === 'create') {
    const { runCreate } = await import('./commands/create.js')
    return runCreate(current, args, options)
  }
  if (command === 'doctor') {
    const { runDoctor } = await import('./commands/doctor.js')
    return runDoctor(current, args, options)
  }
  if (command === 'qr') {
    const { runQr } = await import('./commands/qr.js')
    return runQr(current, args, options)
  }
  const { runPalette } = await import('./commands/palette.js')
  return runPalette(current, args, options)
}

export async function runCli(argv: string[], overrides: CliOverrides = {}): Promise<number> {
  const env = overrides.env || process.env
  const ctx: CliContext = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    lang: detectLanguage(env),
    color: false,
    motion: true,
    resources: {},
    interactive: false,
    openUrl,
    ...overrides,
  }
  ctx.interactive = overrides.interactive ?? isInteractive(ctx.stdin, ctx.stdout, env)
  ctx.lang = requestedLanguage(argv, ctx.lang)
  ctx.color = overrides.color ?? Boolean(ctx.stdout.isTTY && env.TERM !== 'dumb' && !Object.hasOwn(env, 'NO_COLOR'))
  try {
    return await dispatch(argv, ctx)
  }
  catch (error) {
    writeError(ctx, `${t(ctx, '错误', 'Error')}: ${sanitize(errorMessage(ctx, error instanceof Error ? error.message : String(error)))}\n\n${renderHelp(ctx)}`)
    return 1
  }
  finally {
    await ctx.resources.lab?.close()
  }
}
