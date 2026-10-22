import type { Key } from 'node:readline'
import type { CreateWizardHooks } from '../commands/create/plan.js'
import type { CatalogProject, CliContext, CliOptions } from '../types.js'
import type { Effect } from './scenes.js'
import type { ProjectBrowserOptions, WorkbenchDispatch } from './workbench.js'
import { t, write, writeError } from '../shared.js'
import { EFFECTS, renderScene } from './scenes.js'
import { TerminalSession } from './session.js'
import { createSnake, resizeSnake, snakeLines, tickSnake, turnSnake } from './snake.js'
import { createWizard, selectProject, Workbench } from './workbench.js'

export { renderScene } from './scenes.js'
export { TerminalSession } from './session.js'
export { createSnake, resizeSnake, tickSnake, turnSnake } from './snake.js'

const exitKey = (key: Key) => key.name === 'escape' || key.name === 'q'

function status(ctx: CliContext, code: number): number {
  if (code === 130 || code === 143) {
    ctx.cancelled = true
    ctx.cancelledCode = code
  }
  return code
}

export async function runFx(ctx: CliContext, args: string[] = [], options: CliOptions = {}): Promise<number> {
  let effectIndex = EFFECTS.indexOf((args[0] || 'logo') as Effect)
  if (effectIndex < 0 || args.length > 1) {
    writeError(ctx, t(ctx, `可用效果：${EFFECTS.join(', ')}`, `Available effects: ${EFFECTS.join(', ')}`))
    return 1
  }
  const seed = options.seed ?? 'weapp'
  const scene = (width: number, height: number, time: number) => renderScene(EFFECTS[effectIndex], { width, height, time, seed, logo: ctx.logo, catalog: ctx.catalog, color: ctx.color })
  if (!ctx.interactive) {
    write(ctx, `weapp fx ${EFFECTS[effectIndex]}\n${scene(Math.min(79, (ctx.stdout.columns || 80) - 1), 16, 2.8).join('\n')}`)
    return 0
  }
  let elapsed = ctx.motion ? 0 : 2.8
  let paused = !ctx.motion
  let previous = performance.now()
  const session = new TerminalSession(ctx)
  const render = () => session.render(() => {
    const { width, height } = session.dimensions()
    const help = ctx.motion
      ? t(ctx, '空格 暂停 · R 重播 · ←/→ 切换 · Q 返回', 'Space pause · R replay · ←/→ switch · Q back')
      : t(ctx, '静态预览 · R 重播 · ←/→ 切换 · Q 返回', 'Static preview · R replay · ←/→ switch · Q back')
    return [
      ` WEAPP / ${EFFECTS[effectIndex].toUpperCase()}   ${paused ? t(ctx, '已暂停', 'PAUSED') : t(ctx, '播放中', 'LIVE')}`,
      ...scene(width, Math.max(1, height - 4), elapsed),
      '',
      ` ${help}`,
    ]
  })
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
          return !paused
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

export async function runSnake(ctx: CliContext, args: string[] = ['snake'], options: CliOptions = {}): Promise<number> {
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
  const render = () => session.render(() => {
    const heading = ` WEAPP / SNAKE   ${t(ctx, '得分', 'SCORE')} ${game.score}`
    if (size.small) {
      return [heading, '', t(ctx, '窗口太小，游戏已暂停。放大窗口，或按 Q 返回。', 'Window too small. Enlarge it, or press Q to return.')]
    }
    const phase = game.phase === 'won'
      ? t(ctx, '你赢了！R 再玩一次', 'YOU WON! R to restart')
      : game.phase === 'over'
        ? t(ctx, '游戏结束 · R 再玩一次', 'GAME OVER · R to restart')
        : paused ? t(ctx, '已暂停 · 空格继续', 'PAUSED · Space resumes') : t(ctx, '方向键 / WASD 移动', 'Arrows / WASD move')
    return [heading, ...snakeLines(game, ctx.color), phase, note, t(ctx, '空格 暂停 · R 重开 · Q 返回', 'Space pause · R restart · Q back')]
  })
  return status(ctx, await session.run({
    render,
    tick() {
      const now = performance.now()
      const delta = Math.min(150, now - previous)
      previous = now
      if (paused || size.small || game.phase !== 'running') {
        return false
      }
      accumulator += delta
      const interval = Math.max(90, 210 - game.score * 5)
      if (accumulator >= interval) {
        game = tickSnake(game)
        accumulator %= interval
        return true
      }
      return false
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
    key(_value, key, finish) {
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
      const directions: Record<string, string> = { w: 'up', s: 'down', a: 'left', d: 'right' }
      const direction = key.name ? directions[key.name] || key.name : undefined
      if (!paused) {
        game = turnSnake(game, direction)
      }
      render()
    },
  }))
}

export function selectProjects(ctx: CliContext, projects: CatalogProject[] = ctx.catalog || [], options: ProjectBrowserOptions = {}) {
  return selectProject(ctx, projects, options)
}

export function runCreateWizard(ctx: CliContext, route = 'weapp-vite', options: CliOptions = {}, hooks?: CreateWizardHooks) {
  return createWizard(ctx, route, options, hooks)
}

export async function runHub(ctx: CliContext, dispatch: WorkbenchDispatch): Promise<number> {
  const workbench = new Workbench(ctx, dispatch)
  ctx.resources ||= {}
  ctx.resources.workbench = workbench
  try {
    return await workbench.run()
  }
  finally {
    workbench.cancel()
    delete ctx.resources.workbench
  }
}
