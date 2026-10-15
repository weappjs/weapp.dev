import type { Key } from 'node:readline'
import type { CreateProgress, CreateWizardHooks, ScaffoldPlan } from '../commands/create/plan.js'
import type { CatalogProject, CliContext, CliOptions, CliOutput } from '../types.js'
import type { ProjectPreview } from './preview.js'
import type { TerminalFinish } from './session.js'
import { mainProjects } from '../catalog.js'
import { displayCommand, npmExecArgs, scaffoldPlan } from '../commands/create/plan.js'
import { sanitize, t } from '../shared.js'
import { TEMPLATE_DETAILS, TEMPLATES } from '../templates.js'
import { projectPreview } from './preview.js'
import { renderProjectPreview, renderScene } from './scenes.js'
import { clipLine, graphemes, padLine, TerminalSession } from './session.js'

const projectId = (project: CatalogProject) => project.slug || project.id || project.packageName
const content = (ctx: CliContext, project?: CatalogProject): Partial<CatalogProject['locales']['zh-CN']> => project?.locales?.[ctx.lang] || project?.locales?.['zh-CN'] || {}
const printable = (value: string) => value && ![...value].some(char => char.codePointAt(0)! < 32 || (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159))

function wrap(value: string | undefined, width: number): string[] {
  const lines = []
  let row = ''
  for (const char of graphemes(sanitize(value || ''))) {
    if (clipLine(row + char, width) !== row + char && row) {
      lines.push(row)
      row = ''
    }
    row += char
  }
  if (row) {
    lines.push(row)
  }
  return lines
}

function inputLine(value: string, width: number): string {
  const text = sanitize(value)
  if (clipLine(`› ${text}▏`, width) === `› ${text}▏`) {
    return `› ${text}▏`
  }
  let tail = ''
  for (const char of [...graphemes(text)].reverse()) {
    if (clipLine(`› …${char}${tail}▏`, width) !== `› …${char}${tail}▏`) {
      break
    }
    tail = char + tail
  }
  return `› …${tail}▏`
}

const colorPattern = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g')
function resultLines(lines: string[], width: number): string[] {
  return lines.flatMap((line) => {
    const rows = wrap(line.replace(colorPattern, ''), width)
    return rows.length ? rows : ['']
  })
}

export interface ProjectBrowserOptions { all?: boolean, filtered?: boolean }
export interface CreateWizardResult { args: [string, string], options: CliOptions }
export type WorkbenchDispatch = (argv: string[]) => unknown | Promise<unknown>
interface ScreenBase {
  title?: string
  subtitle?: string
  selected?: number
  project?: CatalogProject
  preview?: { directory: string, template: string }
  parent?: WorkbenchScreen
}
export interface MenuEntry { value: string, label: string, description?: string, project?: undefined }
export interface ProjectEntry { value: CatalogProject, label: string, description?: string, project: CatalogProject }
export type WorkbenchEntry = MenuEntry | ProjectEntry
export interface MenuScreen extends ScreenBase { type: 'menu', entries: MenuEntry[], templates?: boolean, complete?: (value: string | null) => void }
export interface ProjectsScreen extends ScreenBase {
  type: 'projects'
  projects: CatalogProject[]
  allProjects: CatalogProject[]
  all: boolean
  filtered?: boolean
  query: string
  browse: boolean
  complete?: (value: CatalogProject | null) => void
}
export interface InputScreen extends ScreenBase { type: 'input', hint?: string, value: string, error?: string, complete?: (value: string | null) => void }
export interface SummaryScreen extends ScreenBase { type: 'summary', lines: string[], scroll?: number, complete?: (value: boolean | null) => void }
export interface DetailScreen extends ScreenBase { type: 'detail', project: CatalogProject, complete?: undefined }
export interface ResultScreen extends ScreenBase { type: 'result', lines: string[], scroll?: number, successAt?: number, complete?: undefined }
export interface PreparingScreen extends ScreenBase { type: 'preparing', cancel: () => void, complete?: undefined }
export type WorkbenchScreen = MenuScreen | ProjectsScreen | InputScreen | SummaryScreen | DetailScreen | ResultScreen | PreparingScreen
export type RequestScreen = MenuScreen | ProjectsScreen | InputScreen | SummaryScreen
export type RequestValue = string | CatalogProject | boolean

export class Workbench {
  readonly ctx: CliContext
  readonly dispatch: WorkbenchDispatch
  readonly session: TerminalSession
  readonly started: number
  readonly hall: MenuScreen
  readonly requests: Set<() => void>
  readonly abortController: AbortController
  readonly abortSignal: AbortSignal
  time: number
  lastTime: number
  paused: boolean
  focus: number
  focusFrom: number
  focusTo: number
  focusAt: number
  busy: boolean
  screen: WorkbenchScreen
  createProgress?: CreateProgress
  private progressAt = 0
  private previewFrom: ProjectPreview = projectPreview()
  private previewTo: ProjectPreview = projectPreview()
  private previewAt = 0
  private createCancellations = new Set<() => void>()
  finish: TerminalFinish = () => {}

  constructor(ctx: CliContext, dispatch: WorkbenchDispatch = () => 0) {
    this.ctx = ctx
    this.dispatch = dispatch
    this.session = new TerminalSession(ctx)
    this.started = performance.now()
    this.time = 0
    this.lastTime = this.started
    this.paused = false
    this.focus = 0
    this.focusFrom = 0
    this.focusTo = 0
    this.focusAt = 0
    this.busy = false
    this.requests = new Set()
    this.abortController = new AbortController()
    this.abortSignal = this.abortController.signal
    this.hall = {
      type: 'menu',
      selected: 0,
      title: t(ctx, '开发工作台', 'WORKBENCH'),
      subtitle: t(ctx, '从一个小程序，开始。', 'Start with a mini-app.'),
      entries: [
        { value: 'create', label: t(ctx, '创建 weapp-vite 项目', 'Create with weapp-vite'), description: t(ctx, '原生、Wevu、React。选择你的起点。', 'Native, Wevu, React. Choose your starting point.') },
        { value: 'ecosystem', label: t(ctx, '探索 weapp 生态', 'Explore the weapp ecosystem'), description: t(ctx, '构建、样式、组件与存储。', 'Builds, styling, components, and storage.') },
        { value: 'doctor', label: t(ctx, '检查当前项目', 'Inspect your project'), description: t(ctx, '只读检查环境和工程配置。', 'Read-only environment and configuration checks.') },
        { value: 'lab', label: t(ctx, '打开视觉实验室', 'Open the visual lab'), description: t(ctx, '在浏览器里触碰粒子与星系。', 'Explore particles and galaxies in your browser.') },
        { value: 'more', label: t(ctx, '更多工具', 'More tools'), description: t(ctx, '其他生态、二维码、配色与特效。', 'Other ecosystems, QR codes, palettes, and effects.') },
      ],
    }
    this.screen = this.hall
  }

  accent(value: string, selected = false): string {
    return this.ctx.color ? `\u001B[${selected ? '1;92' : '36'}m${value}\u001B[0m` : value
  }

  entries(screen: ProjectsScreen): ProjectEntry[]
  entries(screen: MenuScreen): MenuEntry[]
  entries(screen?: WorkbenchScreen): WorkbenchEntry[]
  entries(screen: WorkbenchScreen = this.screen): WorkbenchEntry[] {
    if (screen.type !== 'projects') {
      return screen.type === 'menu' ? screen.entries : []
    }
    const pool = screen.all ? screen.allProjects : screen.projects
    const query = screen.query.toLowerCase()
    return pool.filter(project => !query || JSON.stringify([projectId(project), project.locales, project.keywords]).toLowerCase().includes(query)).map(project => ({ value: project, label: content(this.ctx, project).name || projectId(project), description: content(this.ctx, project).tagline, project }))
  }

  frame() {
    const { width, height } = this.session.dimensions()
    const screen = this.screen
    const entries = this.entries()
    screen.selected = Math.max(0, Math.min(screen.selected || 0, entries.length - 1))
    const current = screen.project || entries[screen.selected || 0]?.project
    const detail = content(this.ctx, current)
    const focusTo = current ? mainProjects(this.ctx.catalog || []).indexOf(current) : 0
    if (focusTo !== this.focusTo) {
      this.focusFrom = this.focus
      this.focusTo = focusTo
      this.focusAt = this.time
    }
    if (!this.ctx.motion || this.paused) {
      this.focusFrom = this.focusTo
    }
    const transition = this.ctx.motion && !this.paused ? Math.min(1, (this.time - this.focusAt) / 0.25) : 1
    this.focus = this.focusFrom + (this.focusTo - this.focusFrom) * transition * transition * (3 - 2 * transition)
    const hideVisual = ((screen.type === 'result' || screen.type === 'input') && !screen.preview) || ((screen.type === 'summary' || screen.type === 'result') && height < 24)
    const wide = width >= 87 && height >= 24 && !hideVisual
    const compact = width < 60 || height < 18
    const leftWidth = wide ? Math.min(38, Math.floor(width * 0.38)) : width - 2
    const visualWidth = wide ? width - leftWidth - 5 : width - 2
    const visualHeight = wide ? Math.min(16, height - 9) : compact ? 3 : Math.min(screen.preview ? 5 : 7, height - 14)
    const available = Math.max(1, height - 5 - (wide || hideVisual ? 0 : Math.max(1, visualHeight)))
    const progress = screen.preview && screen.type !== 'preparing' && this.createProgress ? ['', ...wrap(this.progressLabel(), leftWidth)] : []
    const contentAvailable = Math.max(1, available - progress.length)
    const heading = ` ${this.accent('WEAPP')}  /  ${screen.title || this.hall.title}`
    const lines = [heading, ` ${screen.subtitle || this.hall.subtitle}`, '']
    let left = []
    if (screen.type === 'input') {
      left = [...wrap(screen.hint, leftWidth), '', this.accent(inputLine(screen.value, leftWidth), true), '', ...(screen.error ? wrap(screen.error, leftWidth) : [])]
    }
    else if (screen.type === 'preparing') {
      left = [t(this.ctx, '正在准备创建项目', 'Preparing your project'), '', ...wrap(this.progressLabel(), leftWidth), '', t(this.ctx, 'Esc 取消本次创建', 'Esc cancels this creation')]
    }
    else if (screen.type === 'result') {
      const rows = resultLines(screen.lines, leftWidth)
      screen.scroll = Math.max(0, Math.min(screen.scroll || 0, rows.length - contentAvailable))
      left = rows.slice(screen.scroll, screen.scroll + contentAvailable)
      if (screen.preview && screen.scroll === 0 && left.length) {
        left[0] = this.accent(left[0], true)
      }
    }
    else if (screen.type === 'summary') {
      left = screen.lines.flatMap(line => wrap(line, leftWidth))
      left.push('', this.accent(t(this.ctx, '› Enter 创建项目', '› Enter creates the project'), true))
      screen.scroll = Math.max(0, Math.min(screen.scroll || 0, left.length - contentAvailable))
      left = left.slice(screen.scroll, screen.scroll + contentAvailable)
    }
    else if (screen.type === 'detail') {
      left = [this.accent(detail.name || projectId(current!), true), current!.status, '', ...wrap(`${t(this.ctx, '能力', 'Capabilities')}: ${(detail.capabilities || []).join(' · ')}`, leftWidth), '', ...wrap(detail.description, leftWidth), '', ...wrap(`${t(this.ctx, '适合', 'Best for')}: ${detail.audience}`, leftWidth)]
    }
    else {
      if (screen.type === 'projects') {
        left.push(`${t(this.ctx, '搜索', 'Search')}: ${sanitize(screen.query) || t(this.ctx, '输入关键词', 'Type to search')}`, '')
      }
      const limit = Math.max(1, (wide ? height - 9 : height - visualHeight - 9) - (screen.type === 'projects' ? 5 : 0))
      const first = Math.max(0, Math.min((screen.selected || 0) - Math.floor(limit / 2), entries.length - limit))
      for (let index = first; index < Math.min(entries.length, first + limit); index++) {
        left.push(index === screen.selected ? this.accent(`› ${sanitize(entries[index].label)}`, true) : `  ${sanitize(entries[index].label)}`)
      }
      if (!entries.length) {
        left.push(t(this.ctx, '没有匹配项目', 'No matching projects'))
      }
      left.push('', ...wrap(entries[screen.selected || 0]?.description || '', leftWidth))
      if (current && !wide) {
        left.push(`${t(this.ctx, '状态', 'Status')}: ${current.status}`, ...wrap(current.status === 'planned' ? t(this.ctx, '暂无安装命令', 'No installation command') : current.quickStart?.command || current.installCommand || '', leftWidth))
      }
    }
    if (progress.length) {
      left = [...left.slice(0, contentAvailable), ...progress]
    }
    const preview = screen.preview && projectPreview(screen.type === 'input' ? screen.value : screen.preview.directory, screen.type === 'menu' && screen.templates ? screen.entries[screen.selected || 0]?.value : screen.preview.template)
    if (preview && (preview.name !== this.previewTo.name || preview.template !== this.previewTo.template)) {
      this.previewFrom = this.previewTo
      this.previewTo = preview
      this.previewAt = this.time
    }
    const previewTransition = !this.ctx.motion || this.paused ? 1 : Math.min(1, (this.time - this.previewAt) / 0.25)
    const visual = (artWidth: number, artHeight: number) => preview
      ? renderProjectPreview({ width: artWidth, height: artHeight, from: this.previewFrom, to: this.previewTo, transition: previewTransition, time: this.ctx.motion ? this.time : 0, color: this.ctx.color, celebration: screen.type === 'result' && screen.successAt !== undefined ? this.ctx.motion ? (this.time - screen.successAt) / 0.8 : 1 : undefined })
      : renderScene(screen === this.hall && this.ctx.motion && this.time < 1.2 ? 'logo' : 'orbit', { width: artWidth, height: artHeight, time: this.ctx.motion ? this.time : 1.2, opening: screen === this.hall, catalog: mainProjects(this.ctx.catalog || []), logo: this.ctx.logo, color: this.ctx.color, focus: this.focus })
    if (wide && !hideVisual) {
      const right = [...visual(visualWidth, visualHeight), '', this.accent(preview?.name || detail.name || 'weapp-vite', true), ...wrap(preview ? `${preview.template} · ${t(this.ctx, '你的项目星图', 'Your project constellation')}` : detail.tagline || t(this.ctx, '用 Vite 做小程序工程构建', 'Vite builds for mini-app projects'), visualWidth)]
      if (current && !preview) {
        right.push(`${t(this.ctx, '状态', 'Status')}: ${current.status}`)
        right.push(...wrap(current.status === 'planned' ? t(this.ctx, '规划中 · 暂无安装命令', 'Planned · No installation command') : current.quickStart?.command || current.installCommand || '', visualWidth))
      }
      else if (!preview) {
        right.push('npx weapp create')
      }
      for (let row = 0; row < Math.min(height - 6, Math.max(left.length, right.length)); row++) {
        lines.push(` ${padLine(left[row] || '', leftWidth)}  ${right[row] || ''}`)
      }
    }
    else {
      if (!hideVisual) {
        lines.push(...visual(visualWidth, Math.max(1, visualHeight)))
      }
      lines.push(...left.map(line => ` ${line}`))
    }
    let footer = this.ctx.motion
      ? t(this.ctx, '↑/↓ 选择 · Enter 打开 · 空格 暂停 · Q 退出', '↑/↓ select · Enter open · Space pause · Q quit')
      : t(this.ctx, '↑/↓ 选择 · Enter 打开 · Q 退出', '↑/↓ select · Enter open · Q quit')
    if (width < 60) {
      footer = this.ctx.motion ? t(this.ctx, '↑/↓ 选择 · Enter · 空格 · Q', '↑/↓ · Enter · Space · Q') : t(this.ctx, '↑/↓ 选择 · Enter · Q', '↑/↓ · Enter · Q')
    }
    if (screen.type === 'projects') {
      footer = screen.filtered ? t(this.ctx, '输入 搜索 · Enter 详情 · Esc 返回', 'Type to search · Enter details · Esc back') : t(this.ctx, 'Tab 全部生态 · 输入 搜索 · Enter 详情 · Esc 返回', 'Tab all ecosystems · Type to search · Enter details · Esc back')
      if (width < 60) {
        footer = screen.filtered ? t(this.ctx, '输入搜索 · Enter · Esc', 'Type search · Enter · Esc') : t(this.ctx, 'Tab 全部 · 输入搜索 · Enter · Esc', 'Tab all · Type search · Enter · Esc')
      }
    }
    if (screen.type === 'input') {
      footer = screen.preview ? t(this.ctx, 'Enter 继续 · Esc 取消', 'Enter continue · Esc cancel') : t(this.ctx, 'Enter 继续 · Esc 返回', 'Enter continue · Esc back')
    }
    if (screen.type === 'summary') {
      footer = t(this.ctx, '↑/↓ 滚动 · Enter 创建 · Esc 取消', '↑/↓ scroll · Enter create · Esc cancel')
    }
    if (screen.type === 'detail') {
      footer = `${t(this.ctx, 'D 文档 · R 源码', 'D docs · R source')} · Esc`
    }
    if (screen.type === 'result') {
      footer = t(this.ctx, '↑/↓ 滚动 · Enter / Esc 返回', '↑/↓ scroll · Enter / Esc back')
    }
    if (screen === this.hall) {
      footer = width < 60 ? 'Enter / C · ↑/↓ · Q' : t(this.ctx, 'Enter / C 创建 · ↑/↓ 选择 · 空格 暂停 · Q 退出', 'Enter / C create · ↑/↓ select · Space pause · Q quit')
      if (!this.ctx.motion) {
        footer = width < 60 ? 'Enter / C · ↑/↓ · Q' : t(this.ctx, 'Enter / C 创建 · ↑/↓ 选择 · Q 退出', 'Enter / C create · ↑/↓ select · Q quit')
      }
    }
    if (screen.type === 'preparing') {
      footer = t(this.ctx, 'Esc 取消本次创建', 'Esc cancels this creation')
    }
    const body = lines.slice(0, Math.max(0, height - 2))
    while (body.length < height - 2) {
      body.push('')
    }
    body.push(this.busy && screen === this.hall ? ` ${this.progressLabel()}` : this.paused ? t(this.ctx, ' 动效已暂停', ' Motion paused') : '', ` ${footer}`)
    return body
  }

  render() {
    if (this.session.closed) {
      return
    }
    this.session.render(this.frame())
  }

  progressLabel(): string {
    const progress = this.createProgress
    if (!progress) {
      return t(this.ctx, '查询官方版本与 Node 要求…', 'Checking the official version and Node requirement…')
    }
    const labels = {
      planning: t(this.ctx, '正在验证新项目目录…', 'Validating the new project directory…'),
      querying: t(this.ctx, '正在查询官方版本与 Node 要求…', 'Checking the official version and Node requirement…'),
      ready: t(this.ctx, '官方脚手架已就绪', 'Official scaffold ready'),
      failed: t(this.ctx, '准备未完成，确认后显示错误详情。', 'Preparation failed. Confirm to view the error.'),
      executing: t(this.ctx, '准备并运行官方脚手架；首次运行可能下载依赖。', 'Preparing and running the official scaffold; the first run may download dependencies.'),
      validating: t(this.ctx, '正在验证创建结果…', 'Validating the created project…'),
      complete: t(this.ctx, '创建结果已验证', 'Created project verified'),
    }
    const completedMs = progress.phase === 'ready' || progress.phase === 'failed' ? progress.queryElapsedMs ?? progress.elapsedMs : progress.phase === 'complete' ? progress.validationElapsedMs : undefined
    const active = ['planning', 'querying', 'executing', 'validating'].includes(progress.phase) && this.ctx.motion && !this.paused
    const elapsedMs = completedMs ?? (active ? performance.now() - this.progressAt : undefined)
    return `${labels[progress.phase]}${progress.version ? ` · ${progress.version}` : ''}${elapsedMs === undefined ? '' : ` · ${this.duration(elapsedMs)}`}`
  }

  private duration(milliseconds: number): string {
    const value = Math.max(0, milliseconds)
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  }

  setCreateProgress(progress?: CreateProgress): void {
    if (!progress || !this.createProgress || progress.phase !== this.createProgress.phase || progress.cwd !== this.createProgress.cwd || progress.packageName !== this.createProgress.packageName) {
      this.progressAt = performance.now()
    }
    this.createProgress = progress
    this.render()
  }

  onCreateCancel(cancel: () => void): () => void {
    this.createCancellations.add(cancel)
    return () => this.createCancellations.delete(cancel)
  }

  waitForCreate<T>(promise: Promise<T>, cancel: () => void, subscribeProgress?: CreateWizardHooks['subscribeProgress']): Promise<T | null> {
    if (!this.session.started) {
      return promise
    }
    if (this.session.closed || this.abortSignal.aborted) {
      cancel()
      void promise.catch(() => {})
      return Promise.resolve(null)
    }
    const previous = this.screen
    return new Promise<T | null>((resolve, reject) => {
      let active = true
      let unsubscribe = () => {}
      let cancelWait: () => void
      const complete = (value: T | null, failure?: unknown) => {
        if (!active) {
          return
        }
        active = false
        unsubscribe()
        this.requests.delete(cancelWait)
        this.screen = previous
        this.render()
        if (failure !== undefined) {
          reject(failure)
        }
        else {
          resolve(value)
        }
      }
      cancelWait = () => {
        cancel()
        complete(null)
      }
      this.requests.add(cancelWait)
      this.screen = { type: 'preparing', title: t(this.ctx, '准备创建', 'PREPARING TO CREATE'), parent: previous, cancel: cancelWait, preview: { directory: this.previewTo.name, template: this.previewTo.template } }
      unsubscribe = subscribeProgress?.(progress => this.setCreateProgress(progress)) || unsubscribe
      this.render()
      void promise.then(value => complete(value), failure => complete(null, failure))
    })
  }

  showCreateSuccess(plan: ScaffoldPlan, progress?: CreateProgress): void {
    if (this.session.closed) {
      return
    }
    this.createProgress = undefined
    const template = plan.route === 'weapp-vite' ? plan.args[1] || 'default' : 'default'
    this.screen = {
      type: 'result',
      title: t(this.ctx, '项目已创建', 'PROJECT CREATED'),
      subtitle: `${plan.route}${plan.route === 'weapp-vite' ? ` · ${template}` : ''}`,
      parent: this.hall,
      preview: { directory: plan.directory, template },
      successAt: this.time,
      lines: [this.accent(t(this.ctx, '[ 项目已创建 ]', '[ PROJECT CREATED ]'), true), '', `${t(this.ctx, '项目已创建', 'Project created')}: ${sanitize(plan.directory)}`, '', `cd ${displayCommand([plan.directory]).slice(4)}`, 'npm install', '', ...[
        [t(this.ctx, '版本查询', 'Version query'), progress?.queryElapsedMs],
        [t(this.ctx, '官方脚手架', 'Official scaffold'), progress?.executionElapsedMs],
        [t(this.ctx, '结果验证', 'Result validation'), progress?.validationElapsedMs],
      ].flatMap(([label, milliseconds]) => typeof milliseconds === 'number' ? [`${label}: ${this.duration(milliseconds)}`] : []), '', t(this.ctx, '下一步：安装依赖，再按官方文档启动。', 'Next: install dependencies and follow the official guide.')],
      scroll: 0,
    }
    this.render()
  }

  request(screen: InputScreen): Promise<string | null>
  request(screen: MenuScreen): Promise<string | null>
  request(screen: ProjectsScreen): Promise<CatalogProject | null>
  request(screen: SummaryScreen): Promise<boolean | null>
  request(screen: RequestScreen): Promise<RequestValue | null> {
    if (this.session.closed) {
      return Promise.resolve(null)
    }
    const previous = this.screen
    return new Promise<RequestValue | null>((resolve) => {
      let cancelRequest: () => void
      const complete = (value: RequestValue | null) => {
        this.requests.delete(cancelRequest)
        this.screen = previous
        resolve(value)
        this.render()
      }
      cancelRequest = () => complete(null)
      this.requests.add(cancelRequest)
      this.screen = { ...screen, selected: screen.selected || 0, complete }
      this.render()
    })
  }

  cancel() {
    this.abortController.abort()
    for (const complete of [...this.requests]) {
      complete()
    }
  }

  async external<T>(callback: () => T | Promise<T>, notice?: string): Promise<T> {
    if (this.session.closed || this.abortSignal.aborted) {
      const error = new Error('The terminal session has ended.')
      error.name = 'AbortError'
      throw error
    }
    this.session.suspend()
    try {
      if (notice) {
        this.session.output.write(`${sanitize(notice)}\n`)
      }
      return await callback()
    }
    finally {
      this.lastTime = performance.now()
      this.session.resume()
      this.render()
    }
  }

  interrupted(code: unknown) {
    if (code !== 130 && code !== 143) {
      return false
    }
    this.ctx.cancelled = true
    this.ctx.cancelledCode = code
    this.cancel()
    this.finish(code)
    return true
  }

  async command(argv: string[]): Promise<void> {
    if (this.busy || this.session.closed) {
      return
    }
    this.busy = true
    const previous = this.screen
    const stdout = this.ctx.stdout
    const stderr = this.ctx.stderr
    const operationSignal = this.ctx.operationSignal
    const controller = new AbortController()
    const abort = () => controller.abort()
    const unsubscribeCancel = argv[0] === 'create' ? this.onCreateCancel(abort) : () => {}
    this.abortSignal.addEventListener('abort', abort, { once: true })
    if (this.abortSignal.aborted) {
      abort()
    }
    const output: string[] = []
    const capture = (original: CliOutput): CliOutput => ({ isTTY: original.isTTY, columns: original.columns, rows: original.rows, write(value: string) {
      output.push(String(value))
      return true
    } })
    this.ctx.stdout = capture(stdout)
    this.ctx.stderr = capture(stderr)
    this.ctx.operationSignal = argv[0] === 'create' ? controller.signal : this.abortSignal
    try {
      const code = await this.dispatch(argv)
      if (argv[0] === 'create' && controller.signal.aborted && !this.abortSignal.aborted && !this.ctx.cancelled) {
        return
      }
      if (this.interrupted(code)) {
        return
      }
      if (output.length && !this.session.closed) {
        this.screen = { type: 'result', title: argv[0].toUpperCase(), lines: output.join('').split(/\r?\n/), parent: previous, scroll: 0 }
      }
    }
    catch (error) {
      if (!this.session.closed) {
        this.screen = { type: 'result', title: t(this.ctx, '操作未完成', 'ACTION INCOMPLETE'), lines: wrap(error instanceof Error ? error.message : String(error), this.session.dimensions().width - 2), parent: previous }
      }
    }
    finally {
      this.ctx.stdout = stdout
      this.ctx.stderr = stderr
      this.ctx.operationSignal = operationSignal
      unsubscribeCancel()
      this.abortSignal.removeEventListener('abort', abort)
      this.busy = false
      this.render()
    }
  }

  projects(projects: CatalogProject[] = this.ctx.catalog || [], options: ProjectBrowserOptions = {}, browse = false): ProjectsScreen {
    const all = options.all === true
    return { type: 'projects', title: t(this.ctx, '生态项目', 'ECOSYSTEM'), subtitle: all ? t(this.ctx, '全部小程序生态', 'All mini-app ecosystems') : t(this.ctx, 'weapp 系列 · 各司其职', 'The weapp family · each with a purpose'), projects: options.filtered ? projects : mainProjects(projects), allProjects: projects, all, filtered: options.filtered, query: '', selected: 0, browse, parent: this.screen }
  }

  async activate(entry: MenuEntry): Promise<void> {
    if (entry.value === 'ecosystem') {
      this.screen = this.projects(this.ctx.catalog || [], {}, true)
      return
    }
    if (entry.value === 'all') {
      this.screen = this.projects(this.ctx.catalog || [], { all: true }, true)
      return
    }
    if (entry.value === 'more') {
      this.screen = { type: 'menu', title: t(this.ctx, '更多工具', 'MORE TOOLS'), parent: this.hall, selected: 0, entries: [
        { value: 'all', label: t(this.ctx, '其他小程序生态', 'Other mini-app ecosystems') },
        { value: 'qr', label: t(this.ctx, '生成二维码', 'Generate a QR code') },
        { value: 'palette', label: t(this.ctx, '生成配色', 'Build a palette') },
        { value: 'fx', label: t(this.ctx, '终端视觉效果', 'Terminal visual effects') },
      ] }
      return
    }
    if (entry.value === 'create') {
      await this.command(['create'])
      return
    }
    if (entry.value === 'lab') {
      await this.command(['lab'])
      return
    }
    if (entry.value === 'fx') {
      this.interrupted(await this.external(() => this.dispatch(['fx'])))
      return
    }
    const directory = entry.value === 'doctor'
      ? await this.request({ type: 'input', title: t(this.ctx, '项目体检', 'PROJECT DOCTOR'), hint: t(this.ctx, '输入项目目录，用 . 检查当前目录', 'Enter a directory; use . for the current project'), value: '.' })
      : await this.request({ type: 'input', title: entry.value === 'qr' ? t(this.ctx, '二维码内容', 'QR CONTENT') : t(this.ctx, '配色基色', 'PALETTE COLOR'), hint: entry.value === 'qr' ? t(this.ctx, '输入链接或文本', 'Enter a URL or text') : '#2ba245', value: '' })
    if (directory !== null) {
      await this.command([entry.value, '--', directory])
    }
  }

  key(value: string, key: Key, finish: TerminalFinish): void | Promise<void> {
    const screen = this.screen
    if (screen === this.hall && key.name === 'escape' && this.createCancellations.size) {
      for (const cancel of this.createCancellations) {
        cancel()
      }
      this.render()
      return
    }
    if (screen.type === 'preparing') {
      if (key.name === 'escape') {
        screen.cancel()
      }
      else if (key.name === 'q') {
        this.cancel()
        finish(0)
      }
      return
    }
    if (screen === this.hall && key.name === 'c' && !key.ctrl && !key.meta && !this.busy) {
      return this.activate(this.hall.entries[0]).then(() => this.render())
    }
    const entries = this.entries()
    if (this.ctx.motion && key.name === 'space' && ['menu', 'detail'].includes(screen.type)) {
      this.paused = !this.paused
      this.lastTime = performance.now()
      this.render()
      return
    }
    if (key.name === 'escape' || (key.name === 'q' && !['input', 'projects'].includes(screen.type))) {
      if (screen.complete) {
        screen.complete(null)
      }
      else if (screen.parent) {
        this.screen = screen.parent
      }
      else {
        this.cancel()
        finish(0)
      }
      this.render()
      return
    }
    if (screen.type === 'result') {
      if (key.name === 'return') {
        this.screen = screen.parent || this.hall
      }
      if (key.name === 'up') {
        screen.scroll = Math.max(0, (screen.scroll || 0) - 1)
      }
      if (key.name === 'down') {
        screen.scroll = (screen.scroll || 0) + 1
      }
    }
    else if (screen.type === 'summary') {
      if (key.name === 'return') {
        screen.complete?.(true)
      }
      else if (key.name === 'up') {
        screen.scroll = Math.max(0, (screen.scroll || 0) - 1)
      }
      else if (key.name === 'down') {
        screen.scroll = (screen.scroll || 0) + 1
      }
    }
    else if (screen.type === 'input') {
      if (key.name === 'return' && screen.value.trim()) {
        screen.complete?.(screen.value.trim())
      }
      else if (key.name === 'backspace') {
        screen.value = [...screen.value].slice(0, -1).join('')
      }
      else if (!key.ctrl && !key.meta && printable(value)) {
        screen.value = [...screen.value + value].slice(0, 2048).join('')
      }
    }
    else if (screen.type === 'detail') {
      if (key.name === 'd') {
        return this.command(['docs', projectId(screen.project), '--open'])
      }
      if (key.name === 'r') {
        return this.command(['repo', projectId(screen.project), '--open'])
      }
    }
    else {
      if (key.name === 'up') {
        screen.selected = ((screen.selected || 0) + Math.max(1, entries.length) - 1) % Math.max(1, entries.length)
      }
      else if (key.name === 'down') {
        screen.selected = ((screen.selected || 0) + 1) % Math.max(1, entries.length)
      }
      else if (key.name === 'return' && entries[screen.selected || 0]) {
        if (screen.type === 'projects' && screen.complete) {
          screen.complete(this.entries(screen)[screen.selected || 0].value)
        }
        else if (screen.type === 'menu' && screen.complete) {
          screen.complete(screen.entries[screen.selected || 0].value)
        }
        else if (screen.type === 'projects') {
          this.screen = { type: 'detail', title: projectId(this.entries(screen)[screen.selected || 0].project), project: this.entries(screen)[screen.selected || 0].project, parent: screen }
        }
        else if (screen.type === 'menu' && !this.busy) {
          return this.activate(screen.entries[screen.selected || 0]).then(() => this.render())
        }
      }
      else if (screen.type === 'projects') {
        if (key.name === 'tab' && !screen.filtered) {
          screen.all = !screen.all
          screen.selected = 0
        }
        else if (key.name === 'backspace') {
          screen.query = [...screen.query].slice(0, -1).join('')
          screen.selected = 0
        }
        else if (!key.ctrl && !key.meta && printable(value)) {
          screen.query = [...screen.query + value].slice(0, 120).join('')
          screen.selected = 0
        }
      }
    }
    this.render()
  }

  run() {
    return this.session.run({
      start: (finish) => {
        this.finish = finish
      },
      render: () => this.render(),
      tick: this.ctx.motion
        ? () => {
            const now = performance.now()
            if (!this.paused) {
              this.time += Math.max(0, Math.min(0.15, (now - this.lastTime) / 1000))
            }
            this.lastTime = now
          }
        : undefined,
      key: (value, key, finish) => this.key(value, key, finish),
      cancel: () => this.cancel(),
    })
  }
}

async function withWorkbench<T>(ctx: CliContext, callback: (workbench: Workbench) => Promise<T>): Promise<T | null> {
  if (ctx.resources?.workbench) {
    return callback(ctx.resources.workbench)
  }
  const workbench = new Workbench(ctx)
  ctx.resources ||= {}
  ctx.resources.workbench = workbench
  const result = callback(workbench)
  const running = workbench.run()
  try {
    return await Promise.race([result, running.then(() => null)])
  }
  finally {
    if (!workbench.session.closed) {
      workbench.finish(0)
    }
    try {
      await running
    }
    finally {
      delete ctx.resources.workbench
    }
  }
}

export async function selectProject(ctx: CliContext, projects: CatalogProject[], options: ProjectBrowserOptions = {}): Promise<CatalogProject | null> {
  return withWorkbench(ctx, workbench => workbench.request(workbench.projects(projects, options)))
}

export async function createWizard(ctx: CliContext, route = 'weapp-vite', options: CliOptions = {}, hooks?: CreateWizardHooks): Promise<CreateWizardResult | null> {
  return withWorkbench<CreateWizardResult | null>(ctx, async (workbench) => {
    let confirmedCreation = false
    let cancelled = false
    const unsubscribeCancel = workbench.onCreateCancel(() => {
      cancelled = true
    })
    workbench.setCreateProgress(undefined)
    const unsubscribe = hooks?.subscribeProgress?.(progress => workbench.setCreateProgress(progress))
    try {
      let directory = ''
      let error = ''
      let template = options.template || 'default'
      while (!ctx.cancelled && !ctx.operationSignal?.aborted && !workbench.session.closed) {
        if (cancelled) {
          return null
        }
        const next = await workbench.request({ type: 'input', title: t(ctx, '新项目目录', 'NEW PROJECT DIRECTORY'), subtitle: `1 / ${route === 'weapp-vite' ? '3' : '2'} · ${route}`, hint: t(ctx, '输入尚不存在的目录，例如 my-app', 'Enter a new directory, for example my-app'), value: directory, error, preview: { directory, template } })
        if (next === null || cancelled || ctx.operationSignal?.aborted) {
          return null
        }
        directory = next
        let plan
        try {
          workbench.setCreateProgress({ phase: 'planning', packageName: route, cwd: directory })
          plan = await workbench.waitForCreate(scaffoldPlan(route, directory, { ...options, template: route === 'weapp-vite' ? template : options.template }), () => {})
          if (!plan) {
            return null
          }
        }
        catch (failure) {
          workbench.setCreateProgress(undefined)
          error = failure instanceof Error ? ('zh' in failure && 'en' in failure && typeof failure.zh === 'string' && typeof failure.en === 'string' ? t(ctx, failure.zh, failure.en) : failure.message) : String(failure)
          continue
        }
        if (cancelled || ctx.operationSignal?.aborted || workbench.session.closed || workbench.abortSignal.aborted) {
          return null
        }
        error = ''
        workbench.setCreateProgress(undefined)
        hooks?.onPlan?.(plan)
        if (route === 'weapp-vite') {
          const selected = await workbench.request({ type: 'menu', title: t(ctx, '选择模板', 'CHOOSE A TEMPLATE'), subtitle: '2 / 3 · weapp-vite', selected: Math.max(0, TEMPLATES.findIndex(name => name === template)), entries: TEMPLATES.map(name => ({ value: name, label: name, description: TEMPLATE_DETAILS[name][ctx.lang === 'en' ? 'en' : 'zh'] })), templates: true, preview: { directory, template } })
          if (selected === null || cancelled || ctx.operationSignal?.aborted) {
            return null
          }
          template = selected
          if (!workbench.createProgress) {
            workbench.setCreateProgress({ phase: 'planning', packageName: route, cwd: directory })
          }
          plan = await workbench.waitForCreate(scaffoldPlan(route, directory, { ...options, template }), () => {})
          if (!plan) {
            return null
          }
          if (cancelled || ctx.operationSignal?.aborted || workbench.session.closed || workbench.abortSignal.aborted) {
            return null
          }
          if (workbench.createProgress?.phase === 'planning') {
            workbench.setCreateProgress(undefined)
          }
          hooks?.onPlan?.(plan)
        }
        const confirmed = await workbench.request({ type: 'summary', title: t(ctx, '准备创建', 'READY TO CREATE'), subtitle: route === 'weapp-vite' ? '3 / 3 · weapp-vite' : `2 / 2 · ${route}`, preview: { directory, template }, lines: [
          `${t(ctx, '目录', 'Directory')}: ${plan.directory}`,
          ...(route === 'weapp-vite' ? [`${t(ctx, '模板', 'Template')}: ${template}`, TEMPLATE_DETAILS[TEMPLATES.find(name => name === template) || 'default'][ctx.lang === 'en' ? 'en' : 'zh']] : []),
          '',
          displayCommand(npmExecArgs(plan)),
          '',
          options.dryRun ? t(ctx, '离线预览，不联网、不创建目录。', 'Offline preview. No network access or directory creation.') : t(ctx, '确认后运行官方脚手架。', 'Confirm to run the official scaffold.'),
          t(ctx, '依赖由你稍后安装；已有目录不会被覆盖。', 'Install dependencies afterward. Existing directories are preserved.'),
        ] })
        if (confirmed && !cancelled && !ctx.operationSignal?.aborted) {
          confirmedCreation = true
          return { args: [route, directory], options: { ...options, ...(route === 'weapp-vite' ? { template } : {}) } }
        }
        return null
      }
      return null
    }
    finally {
      unsubscribe?.()
      unsubscribeCancel()
      if (!confirmedCreation) {
        hooks?.onCancel?.()
      }
    }
  })
}
