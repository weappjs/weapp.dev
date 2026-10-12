import { sanitize, t, write, writeError } from '../shared.js'
import { EFFECTS, renderScene } from './scenes.js'
import { TerminalSession } from './session.js'
import { createSnake, resizeSnake, snakeLines, tickSnake, turnSnake } from './snake.js'

export { renderScene } from './scenes.js'
export { TerminalSession } from './session.js'
export { createSnake, resizeSnake, tickSnake, turnSnake } from './snake.js'

const exitKey = key => key.name === 'escape' || key.name === 'q'
const projectId = project => project.slug || project.id || project.packageName
const locale = (ctx, project) => project.locales?.[ctx.lang] || project.locales?.['zh-CN'] || {}
function containsControl(value) {
  return [...String(value)].some((character) => {
    const code = character.codePointAt(0)
    return code < 32 || (code >= 127 && code <= 159)
  })
}

function status(ctx, code) {
  if (code === 130 || code === 143) {
    ctx.cancelled = true
    ctx.cancelledCode = code
  }
  return code
}

export async function runFx(ctx, args = [], options = {}) {
  let effectIndex = EFFECTS.indexOf(args[0] || 'logo')
  if (effectIndex < 0 || args.length > 1) {
    writeError(ctx, t(ctx, `可用效果：${EFFECTS.join(', ')}`, `Available effects: ${EFFECTS.join(', ')}`))
    return 1
  }
  const seed = options.seed ?? 'weapp'
  const scene = (width, height, time) => renderScene(EFFECTS[effectIndex], { width, height, time, seed, logo: ctx.logo, catalog: ctx.catalog, color: ctx.color })
  if (!ctx.interactive) {
    write(ctx, `weapp fx ${EFFECTS[effectIndex]}\n${scene(Math.min(79, (ctx.stdout.columns || 80) - 1), 16, 2.8).join('\n')}`)
    return 0
  }
  let elapsed = ctx.motion ? 0 : 2.8
  let paused = !ctx.motion
  let previous = performance.now()
  const session = new TerminalSession(ctx)
  const render = () => {
    const { width, height } = session.dimensions()
    const help = ctx.motion
      ? t(ctx, '空格 暂停 · R 重播 · ←/→ 切换 · Q 返回', 'Space pause · R replay · ←/→ switch · Q back')
      : t(ctx, '静态预览 · R 重播 · ←/→ 切换 · Q 返回', 'Static preview · R replay · ←/→ switch · Q back')
    session.render([
      ` WEAPP / ${EFFECTS[effectIndex].toUpperCase()}   ${paused ? t(ctx, '已暂停', 'PAUSED') : t(ctx, '播放中', 'LIVE')}`,
      ...scene(width, Math.max(1, height - 4), elapsed),
      '',
      ` ${help}`,
    ])
  }
  return status(ctx, await session.run({
    start(finish) {
      if (options.duration) {
        session.timeout(() => finish(0), options.duration * 1000)
      }
    },
    render,
    tick: ctx.motion
      ? () => {
          const now = performance.now()
          if (!paused) {
            elapsed += Math.min(0.15, (now - previous) / 1000)
          }
          previous = now
        }
      : undefined,
    key(value, key, finish) {
      if (exitKey(key)) {
        return finish(0)
      }
      if (ctx.motion && (key.name === 'space' || key.name === 'p')) {
        paused = !paused
      }
      if (key.name === 'r') {
        elapsed = ctx.motion ? 0 : 2.8
      }
      if (key.name === 'right' || key.name === 'n') {
        effectIndex = (effectIndex + 1) % EFFECTS.length
        elapsed = ctx.motion ? 0 : 2.8
      }
      if (key.name === 'left') {
        effectIndex = (effectIndex + EFFECTS.length - 1) % EFFECTS.length
        elapsed = ctx.motion ? 0 : 2.8
      }
      if (/^[1-4]$/.test(value)) {
        effectIndex = Number(value) - 1
        elapsed = ctx.motion ? 0 : 2.8
      }
      render()
    },
  }))
}

export async function runSnake(ctx, args = ['snake'], options = {}) {
  if (args.length !== 1 || args[0] !== 'snake') {
    writeError(ctx, t(ctx, '用法：weapp play snake', 'Usage: weapp play snake'))
    return 1
  }
  if (!ctx.interactive) {
    writeError(ctx, t(ctx, '贪吃蛇需要交互终端。请运行 weapp play snake。', 'Snake needs an interactive terminal. Run weapp play snake.'))
    return 1
  }
  const session = new TerminalSession(ctx)
  const boardSize = () => {
    const { width, height } = session.dimensions()
    return { width: Math.max(6, Math.min(35, Math.floor((width - 2) / 2))), height: Math.max(5, Math.min(18, height - 7)), small: width < 16 || height < 12 }
  }
  let size = boardSize()
  let game = createSnake(size.width, size.height, options.seed ?? 'weapp')
  let paused = size.small
  let note = ''
  let accumulator = 0
  let previous = performance.now()
  const render = () => {
    const heading = ` WEAPP / SNAKE   ${t(ctx, '得分', 'SCORE')} ${game.score}`
    if (size.small) {
      session.render([heading, '', t(ctx, '窗口太小，游戏已暂停。放大窗口，或按 Q 返回。', 'Window too small. Enlarge it, or press Q to return.')])
      return
    }
    const phase = game.phase === 'won'
      ? t(ctx, '你赢了！R 再玩一次', 'YOU WON! R to restart')
      : game.phase === 'over'
        ? t(ctx, '游戏结束 · R 再玩一次', 'GAME OVER · R to restart')
        : paused ? t(ctx, '已暂停 · 空格继续', 'PAUSED · Space resumes') : t(ctx, '方向键 / WASD 移动', 'Arrows / WASD move')
    session.render([heading, ...snakeLines(game, ctx.color), phase, note, t(ctx, '空格 暂停 · R 重开 · Q 返回', 'Space pause · R restart · Q back')])
  }
  return status(ctx, await session.run({
    render,
    tick() {
      const now = performance.now()
      const delta = Math.min(150, now - previous)
      previous = now
      if (paused || size.small || game.phase !== 'running') {
        return
      }
      accumulator += delta
      const interval = Math.max(90, 210 - game.score * 5)
      if (accumulator >= interval) {
        game = tickSnake(game)
        accumulator %= interval
      }
    },
    resize() {
      const nextSize = boardSize()
      paused = true
      accumulator = 0
      if (nextSize.width !== size.width || nextSize.height !== size.height) {
        const resized = resizeSnake(game, nextSize.width, nextSize.height)
        game = resized.state
        note = resized.reset ? t(ctx, '窗口变化，棋盘已重置。', 'Window resized; the board was reset.') : t(ctx, '窗口变化，棋盘已调整。', 'Window resized; board adjusted.')
      }
      size = nextSize
    },
    key(value, key, finish) {
      if (exitKey(key)) {
        return finish(0)
      }
      if (key.name === 'r') {
        game = createSnake(size.width, size.height, options.seed ?? 'weapp')
        paused = size.small
        note = ''
        accumulator = 0
      }
      if (key.name === 'space' || key.name === 'p') {
        if (!size.small) {
          paused = !paused
        }
        accumulator = 0
        note = ''
      }
      const direction = ({ w: 'up', s: 'down', a: 'left', d: 'right' })[key.name] || key.name
      if (!paused) {
        game = turnSnake(game, direction)
      }
      render()
    },
  }))
}

async function menu(ctx, title, entries, { search = false, subtitle = '' } = {}) {
  let selected = 0
  let query = ''
  const session = new TerminalSession(ctx)
  const filtered = () => entries.filter(entry => !query || entry.search?.toLowerCase().includes(query.toLowerCase()) || entry.label.toLowerCase().includes(query.toLowerCase()))
  const render = () => {
    const matches = filtered()
    selected = Math.max(0, Math.min(selected, matches.length - 1))
    const { height } = session.dimensions()
    const rows = Math.max(1, height - (search ? 6 : 5))
    const first = Math.max(0, Math.min(selected - Math.floor(rows / 2), matches.length - rows))
    const lines = [` WEAPP / ${title}`, subtitle ? ` ${subtitle}` : '']
    if (search) {
      lines.push(` ${t(ctx, '搜索', 'Search')}: ${sanitize(query) || t(ctx, '直接输入关键词', 'Type to filter')}`)
    }
    lines.push('')
    for (let index = first; index < Math.min(matches.length, first + rows); index++) {
      const entry = matches[index]
      const prefix = index === selected ? ' > ' : '   '
      const line = `${prefix}${entry.label}`
      lines.push(index === selected && ctx.color ? `\u001B[1;92m${line}\u001B[0m` : line)
    }
    if (!matches.length) {
      lines.push(` ${t(ctx, '没有匹配项目', 'No matching projects')}`)
    }
    lines.push('', ` ${t(ctx, '↑/↓ 选择 · Enter 打开 · Esc 返回', '↑/↓ select · Enter open · Esc back')}`)
    session.render(lines)
  }
  const result = await session.run({
    render,
    key(value, key, finish) {
      const matches = filtered()
      if (key.name === 'escape' || (!search && key.name === 'q')) {
        return finish(null)
      }
      if (key.name === 'up') {
        selected = (selected + Math.max(1, matches.length) - 1) % Math.max(1, matches.length)
      }
      else if (key.name === 'down') {
        selected = (selected + 1) % Math.max(1, matches.length)
      }
      else if (key.name === 'return') {
        if (matches[selected]) {
          return finish(matches[selected].value)
        }
      }
      else if (search && key.name === 'backspace') {
        query = [...query].slice(0, -1).join('')
        selected = 0
      }
      else if (search && value && !key.ctrl && !key.meta && !containsControl(value)) {
        query = [...query + value].slice(0, 120).join('')
        selected = 0
      }
      render()
    },
  })
  return typeof result === 'number' ? (status(ctx, result), null) : result
}

export function selectProjects(ctx, projects = ctx.catalog) {
  return menu(ctx, t(ctx, '项目目录', 'PROJECTS'), projects.map(project => ({
    label: `${sanitize(locale(ctx, project).name || projectId(project))}  /  ${sanitize(locale(ctx, project).tagline || project.status)}`,
    search: JSON.stringify([project.slug, project.packageName, project.keywords, project.locales, project.ecosystem]),
    value: project,
  })), { search: true, subtitle: t(ctx, `${projects.length} 个项目，各有用处。`, `${projects.length} projects, each with a purpose.`) })
}

async function prompt(ctx, title, hint = '') {
  let value = ''
  const session = new TerminalSession(ctx)
  const render = () => session.render([
    ` WEAPP / ${title}`,
    '',
    ` ${hint}`,
    '',
    ` > ${sanitize(value)}_`,
    '',
    t(ctx, 'Enter 确认 · Esc 返回', 'Enter confirm · Esc back'),
  ])
  const result = await session.run({
    render,
    key(input, key, finish) {
      if (key.name === 'escape') {
        return finish(null)
      }
      if (key.name === 'return') {
        if (value.trim()) {
          return finish(value.trim())
        }
      }
      else if (key.name === 'backspace') {
        value = [...value].slice(0, -1).join('')
      }
      else if (input && !key.ctrl && !key.meta && !containsControl(input)) {
        value = [...value + input].slice(0, 2048).join('')
      }
      render()
    },
  })
  return typeof result === 'number' ? (status(ctx, result), null) : result
}

async function opening(ctx) {
  if (!ctx.motion) {
    return 0
  }
  let elapsed = 0
  const start = performance.now()
  const session = new TerminalSession(ctx)
  return session.run({
    start(finish) {
      session.timeout(() => finish(0), 1200)
    },
    render() {
      const { width, height } = session.dimensions()
      session.render([
        ...renderScene('logo', { width, height: Math.max(1, height - 3), time: elapsed, seed: 'weapp', logo: ctx.logo, color: ctx.color, opening: true }),
        '',
        ` ${t(ctx, '按任意键跳过', 'Press any key to skip')}`,
      ])
    },
    tick() {
      elapsed = (performance.now() - start) / 1000
    },
    key(value, key, finish) {
      finish(0)
    },
  })
}

async function acknowledge(ctx) {
  const session = new TerminalSession(ctx, { alternateScreen: false })
  return session.run({
    start() {
      write(ctx, `\n${t(ctx, '按任意键返回大厅…', 'Press any key to return to the hall…')}`)
    },
    key(value, key, finish) {
      finish(0)
    },
  })
}

export async function runHub(ctx, dispatch) {
  const opened = await opening(ctx)
  if (opened) {
    return status(ctx, opened)
  }
  const group = (zh, en, label) => `${t(ctx, zh, en)} / ${label}`
  const entries = [
    { label: group('玩一下', 'PLAY', t(ctx, '粒子与终端特效', 'Particle effects')), value: 'fx' },
    { label: group('玩一下', 'PLAY', t(ctx, '贪吃蛇', 'Snake')), value: 'snake' },
    { label: group('玩一下', 'PLAY', t(ctx, '浏览器视觉实验室', 'Visual lab')), value: 'lab' },
    { label: group('做项目', 'BUILD', t(ctx, '创建新项目', 'Create a project')), value: 'create' },
    { label: group('做项目', 'BUILD', t(ctx, '项目体检', 'Project doctor')), value: 'doctor' },
    { label: group('找工具', 'TOOLS', t(ctx, '项目目录', 'Project catalog')), value: 'projects' },
    { label: group('找工具', 'TOOLS', t(ctx, '了解一个项目', 'Project info')), value: 'info' },
    { label: group('找工具', 'TOOLS', t(ctx, '打开官方文档', 'Official docs')), value: 'docs' },
    { label: group('找工具', 'TOOLS', t(ctx, '打开源码仓库', 'Source repository')), value: 'repo' },
    { label: group('找工具', 'TOOLS', t(ctx, '生成二维码', 'Generate QR code')), value: 'qr' },
    { label: group('找工具', 'TOOLS', t(ctx, '生成配色', 'Build a palette')), value: 'palette' },
  ]
  while (!ctx.cancelled) {
    const action = await menu(ctx, t(ctx, '交互大厅', 'THE HALL'), entries, { subtitle: t(ctx, '玩一下。做项目。找工具。', 'Play. Build. Find your tools.') })
    if (!action) {
      return ctx.cancelled ? (ctx.cancelledCode || 130) : 0
    }
    let argv = [action]
    if (action === 'snake') {
      argv = ['play', 'snake']
    }
    if (action === 'create') {
      const route = await menu(ctx, t(ctx, '选择项目路线', 'CHOOSE A ROUTE'), [
        ['weapp-vite', 'Vite / native mini-apps / Wevu / React'],
        ['vue-mini', 'Vue for native mini-apps'],
        ['rezor', 'Rezor'],
        ['uni', 'uni-app'],
        ['taro', 'Taro'],
      ].map(([value, label]) => ({ value, label: `${value}  /  ${label}` })))
      if (!route) {
        continue
      }
      const directory = await prompt(ctx, t(ctx, '新项目目录', 'NEW PROJECT DIRECTORY'), t(ctx, '输入尚不存在的目录名，例如 my-app', 'Enter a new directory, for example my-app'))
      if (!directory) {
        continue
      }
      argv = ['create', route, directory]
      if (route === 'weapp-vite') {
        const template = await menu(ctx, t(ctx, '选择模板', 'CHOOSE A TEMPLATE'), ['default', 'wevu', 'react', 'tailwindcss', 'multi-platform-sfc'].map(value => ({ value, label: value })))
        if (!template) {
          continue
        }
        argv.push('--template', template)
      }
    }
    else if (['info', 'docs', 'repo'].includes(action)) {
      const project = await selectProjects(ctx)
      if (!project) {
        continue
      }
      argv.push(projectId(project))
      if (action !== 'info') {
        argv.push('--open')
      }
    }
    else if (action === 'qr' || action === 'palette') {
      const value = await prompt(ctx, action === 'qr' ? t(ctx, '二维码内容', 'QR CONTENT') : t(ctx, '配色基色', 'PALETTE COLOR'), action === 'qr' ? t(ctx, '输入链接或文本', 'Enter a URL or text') : '#2ba245')
      if (!value) {
        continue
      }
      argv.push('--', value)
    }
    else if (action === 'doctor') {
      const directory = await prompt(ctx, t(ctx, '检查哪个项目', 'PROJECT TO CHECK'), t(ctx, '输入项目目录，用 . 检查当前目录', 'Enter a directory; use . for the current project'))
      if (!directory) {
        continue
      }
      argv.push(directory)
    }
    if (ctx.cancelled) {
      return ctx.cancelledCode || 130
    }
    const code = await dispatch(argv)
    if (code === 130 || code === 143 || ctx.cancelled) {
      return status(ctx, code || 130)
    }
    if (action !== 'fx' && action !== 'snake') {
      const acknowledged = await acknowledge(ctx)
      if (acknowledged) {
        return status(ctx, acknowledged)
      }
    }
  }
  return ctx.cancelledCode || 130
}
