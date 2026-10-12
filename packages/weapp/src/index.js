import { readFile } from 'node:fs/promises'
import process from 'node:process'
// eslint-disable-next-line e18e/ban-dependencies -- Cross-platform browser launching compatible with Node 18.
import open from 'open'
import { findProject, printProjects, renderProject, searchProjects } from './catalog.js'
import { runCreate } from './commands/create.js'
import { runDoctor } from './commands/doctor.js'
import { runPalette } from './commands/palette.js'
import { runQr } from './commands/qr.js'
import { runLab } from './lab.js'
import { parseArgs, renderHelp } from './registry.js'
import { detectLanguage, errorMessage, isInteractive, requestedLanguage, sanitize, t, write, writeError } from './shared.js'
import { runCreateWizard, runFx, runHub, runSnake, selectProjects } from './terminal/index.js'

async function loadData(name) {
  return JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'))
}

export async function openUrl(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')) {
    throw new Error('Only official HTTPS links and the local lab can be opened')
  }
  await open(parsed.href, { wait: false })
}

export async function dispatch(argv, ctx) {
  const parsed = parseArgs(argv)
  const { command, args, options } = parsed
  const current = { ...ctx, lang: options.lang || ctx.lang, color: ctx.color && !options.noColor, motion: ctx.motion && !options.noMotion }
  current.createWizard = (route, wizardOptions) => runCreateWizard(current, route, wizardOptions)
  if (options.version) {
    write(current, current.version || (await loadData('meta')).version)
    return 0
  }
  if (options.help || (!command && !current.interactive)) {
    write(current, renderHelp(current, command))
    return 0
  }
  if (!current.catalog) {
    current.catalog = await loadData('catalog')
  }
  if (!current.logo) {
    current.logo = await loadData('logo')
  }
  if (!command) {
    return runHub(current, async (next) => {
      try {
        return await dispatch(next, { ...current, hub: true })
      }
      catch (error) {
        writeError(current, sanitize(errorMessage(current, error.message)))
        return 1
      }
    })
  }
  if (command === 'fx') {
    return runFx(current, args, options)
  }
  if (command === 'play') {
    if (args[0] !== 'snake') {
      throw new Error(t(current, '目前支持 play snake。', 'The available game is play snake.'))
    }
    return runSnake(current, args, options)
  }
  if (command === 'lab') {
    return runLab(current, args, options)
  }
  if (command === 'projects') {
    const matches = searchProjects(current.catalog, args[0], options)
    if (current.interactive && !args.length && !options.json && matches.length) {
      const project = await selectProjects(current, matches, { all: options.all || Boolean(options.ecosystem), filtered: Boolean(options.ecosystem || options.status) })
      if (project) {
        write(current, renderProject(current, project))
      }
      return current.cancelled ? current.cancelledCode || 130 : 0
    }
    printProjects(current, matches, options)
    return 0
  }
  if (['info', 'docs', 'repo'].includes(command)) {
    const project = findProject(current.catalog, args[0])
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
  const tools = { create: runCreate, doctor: runDoctor, qr: runQr, palette: runPalette }
  return tools[command](current, args, options)
}

export async function runCli(argv, overrides = {}) {
  const env = overrides.env || process.env
  const ctx = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    lang: detectLanguage(env),
    color: false,
    motion: true,
    resources: {},
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
    writeError(ctx, `${t(ctx, '错误', 'Error')}: ${sanitize(errorMessage(ctx, error.message))}\n\n${renderHelp(ctx)}`)
    return 1
  }
  finally {
    await ctx.resources.lab?.close()
  }
}
