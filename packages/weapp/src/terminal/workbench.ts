import type { Key } from 'node:readline'
import type { CatalogProject, CliContext, CliOptions, CliOutput } from '../types.js'
import type { TerminalFinish } from './session.js'
import { mainProjects } from '../catalog.js'
import { displayCommand, npmExecArgs, scaffoldPlan } from '../commands/create.js'
import { sanitize, t } from '../shared.js'
import { TEMPLATE_DETAILS, TEMPLATES } from '../templates.js'
import { renderScene } from './scenes.js'
import { clipLine, padLine, TerminalSession } from './session.js'

const projectId = (project: CatalogProject) => project.slug || project.id || project.packageName
const content = (ctx: CliContext, project?: CatalogProject): Partial<CatalogProject['locales']['zh-CN']> => project?.locales?.[ctx.lang] || project?.locales?.['zh-CN'] || {}
const printable = (value: string) => value && ![...value].some(char => char.codePointAt(0)! < 32 || (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159))

function wrap(value: string | undefined, width: number): string[] {
  const lines = []
  let row = ''
  for (const char of sanitize(value || '')) {
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

export interface ProjectBrowserOptions { all?: boolean, filtered?: boolean }
export interface CreateWizardResult { args: [string, string], options: CliOptions }
export type WorkbenchDispatch = (argv: string[]) => unknown | Promise<unknown>
interface ScreenBase {
  title?: string
  subtitle?: string
  selected?: number
  project?: CatalogProject
  parent?: WorkbenchScreen
}
export interface MenuEntry { value: string, label: string, description?: string, project?: undefined }
export interface ProjectEntry { value: CatalogProject, label: string, description?: string, project: CatalogProject }
export type WorkbenchEntry = MenuEntry | ProjectEntry
export interface MenuScreen extends ScreenBase { type: 'menu', entries: MenuEntry[], complete?: (value: string | null) => void }
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
export interface SummaryScreen extends ScreenBase { type: 'summary', lines: string[], complete?: (value: boolean | null) => void }
export interface DetailScreen extends ScreenBase { type: 'detail', project: CatalogProject, complete?: undefined }
export interface ResultScreen extends ScreenBase { type: 'result', lines: string[], scroll?: number, complete?: undefined }
export type WorkbenchScreen = MenuScreen | ProjectsScreen | InputScreen | SummaryScreen | DetailScreen | ResultScreen
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
  opening: boolean
  time: number
  lastTime: number
  paused: boolean
  focus: number
  focusFrom: number
  focusTo: number
  focusAt: number
  busy: boolean
  screen: WorkbenchScreen
  finish: TerminalFinish = () => {}

  constructor(ctx: CliContext, dispatch: WorkbenchDispatch = () => 0, { opening = false }: { opening?: boolean } = {}) {
    this.ctx = ctx
    this.dispatch = dispatch
    this.session = new TerminalSession(ctx)
    this.started = performance.now()
    this.opening = opening && ctx.motion
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
    if (this.opening) {
      const collapse = Math.max(0, Math.min(1, (this.time - 0.85) / 0.35))
      const eased = collapse * collapse * (3 - 2 * collapse)
      const wide = width >= 87 && height >= 24
      const targetWidth = wide ? width - Math.min(38, Math.floor(width * 0.38)) - 5 : width - 2
      const targetHeight = wide ? Math.min(16, height - 9) : Math.max(3, Math.min(7, height - 14))
      const artWidth = Math.round(width + (targetWidth - width) * eased)
      const artHeight = Math.round((height - 4) + (targetHeight - height + 4) * eased)
      const offset = Math.round((wide ? width - targetWidth : 1) * eased)
      return [
        ...(collapse ? [this.accent(' WEAPP'), t(this.ctx, ' 从一个小程序，开始。', ' Start with a mini-app.'), ''] : []),
        ...renderScene(collapse ? 'orbit' : 'logo', { width: artWidth, height: Math.max(1, artHeight), time: collapse ? 0 : this.time * 1.2 / 0.85, logo: this.ctx.logo, catalog: mainProjects(this.ctx.catalog || []), color: this.ctx.color, opening: true }).map(line => `${' '.repeat(offset)}${line}`),
        this.accent(' WEAPP'),
        ` ${t(this.ctx, '小程序开发，从这里开始。', 'Mini-app development starts here.')}`,
        ` ${t(this.ctx, '按任意键进入', 'Press any key to enter')}`,
      ]
    }
    const screen = this.screen
    const entries = this.entries()
    screen.selected = Math.max(0, Math.min(screen.selected || 0, entries.length - 1))
    const current = screen.project || entries[screen.selected || 0]?.project
    const detail = content(this.ctx, current)
    const focusTo = current ? mainProjects(this.ctx.catalog || []).indexOf(current) : screen.selected || 0
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
    const wide = width >= 87 && height >= 24
    const compact = width < 60 || height < 18
    const leftWidth = wide ? Math.min(38, Math.floor(width * 0.38)) : width - 2
    const visualWidth = wide ? width - leftWidth - 5 : width - 2
    const visualHeight = wide ? Math.min(16, height - 9) : compact ? 3 : Math.min(7, height - 14)
    const heading = ` ${this.accent('WEAPP')}  /  ${screen.title || this.hall.title}`
    const lines = [heading, ` ${screen.subtitle || this.hall.subtitle}`, '']
    let left = []
    if (screen.type === 'input') {
      left = [screen.hint || '', '', this.accent(`› ${sanitize(screen.value)}▏`, true), '', ...(screen.error ? wrap(screen.error, leftWidth) : [])]
    }
    else if (screen.type === 'result') {
      const available = Math.max(1, height - 7)
      left = screen.lines.slice(screen.scroll || 0, (screen.scroll || 0) + available)
    }
    else if (screen.type === 'summary') {
      left = screen.lines.flatMap(line => wrap(line, leftWidth))
      left.push('', this.accent(t(this.ctx, '› Enter 创建项目', '› Enter creates the project'), true))
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
    const hideVisual = ['result', 'summary', 'input'].includes(screen.type)
    if (wide && !hideVisual) {
      const visual = renderScene('orbit', { width: visualWidth, height: visualHeight, time: this.ctx.motion ? this.time : 1.2, catalog: mainProjects(this.ctx.catalog || []), logo: this.ctx.logo, color: this.ctx.color, focus: this.focus })
      const right = [...visual, '', this.accent(detail.name || 'weapp-vite', true), ...wrap(detail.tagline || t(this.ctx, '用 Vite 做小程序工程构建', 'Vite builds for mini-app projects'), visualWidth)]
      if (current) {
        right.push(`${t(this.ctx, '状态', 'Status')}: ${current.status}`)
        right.push(...wrap(current.status === 'planned' ? t(this.ctx, '规划中 · 暂无安装命令', 'Planned · No installation command') : current.quickStart?.command || current.installCommand || '', visualWidth))
      }
      else {
        right.push('npx weapp create')
      }
      for (let row = 0; row < Math.min(height - 6, Math.max(left.length, right.length)); row++) {
        lines.push(` ${padLine(left[row] || '', leftWidth)}  ${right[row] || ''}`)
      }
    }
    else {
      if (!hideVisual) {
        lines.push(...renderScene('orbit', { width: visualWidth, height: Math.max(1, visualHeight), time: this.ctx.motion ? this.time : 1.2, catalog: mainProjects(this.ctx.catalog || []), logo: this.ctx.logo, color: this.ctx.color, focus: this.focus }))
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
      footer = t(this.ctx, 'Enter 继续 · Esc 返回', 'Enter continue · Esc back')
    }
    if (screen.type === 'summary') {
      footer = t(this.ctx, 'Enter 创建 · Esc 返回修改', 'Enter create · Esc to edit')
    }
    if (screen.type === 'detail') {
      footer = `${t(this.ctx, 'D 文档 · R 源码', 'D docs · R source')}${projectId(current!) === 'weapp-vite' ? t(this.ctx, ' · C 创建', ' · C create') : ''} · Esc`
    }
    if (screen.type === 'result') {
      footer = t(this.ctx, '↑/↓ 滚动 · Enter / Esc 返回', '↑/↓ scroll · Enter / Esc back')
    }
    const body = lines.slice(0, Math.max(0, height - 2))
    while (body.length < height - 2) {
      body.push('')
    }
    body.push(this.busy && screen === this.hall ? t(this.ctx, ' 正在准备…', ' Preparing…') : this.paused ? t(this.ctx, ' 动效已暂停', ' Motion paused') : '', ` ${footer}`)
    return body
  }

  render() {
    if (this.session.closed) {
      return
    }
    this.session.render(this.frame())
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

  async external<T>(callback: () => T | Promise<T>): Promise<T> {
    if (this.session.closed || this.abortSignal.aborted) {
      const error = new Error('The terminal session has ended.')
      error.name = 'AbortError'
      throw error
    }
    this.session.suspend()
    try {
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
    const output: string[] = []
    const capture = (original: CliOutput): CliOutput => ({ isTTY: original.isTTY, columns: original.columns, rows: original.rows, write(value: string) {
      output.push(String(value))
      return true
    } })
    this.ctx.stdout = capture(stdout)
    this.ctx.stderr = capture(stderr)
    this.ctx.operationSignal = this.abortSignal
    try {
      const code = await this.dispatch(argv)
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
    if (this.opening) {
      this.opening = false
      this.render()
      return
    }
    const screen = this.screen
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
        screen.scroll = Math.min(Math.max(0, screen.lines.length - 4), (screen.scroll || 0) + 1)
      }
    }
    else if (screen.type === 'summary') {
      if (key.name === 'return') {
        screen.complete?.(true)
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
      if (key.name === 'c' && projectId(screen.project) === 'weapp-vite') {
        return this.command(['create'])
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
            if (this.time >= 1.2) {
              this.opening = false
            }
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

export async function createWizard(ctx: CliContext, route = 'weapp-vite', options: CliOptions = {}): Promise<CreateWizardResult | null> {
  return withWorkbench<CreateWizardResult | null>(ctx, async (workbench) => {
    let directory = ''
    let error = ''
    let template = options.template || 'default'
    while (!ctx.cancelled && !workbench.session.closed) {
      const next = await workbench.request({ type: 'input', title: t(ctx, '新项目目录', 'NEW PROJECT DIRECTORY'), subtitle: `1 / ${route === 'weapp-vite' ? '3' : '2'} · ${route}`, hint: t(ctx, '输入尚不存在的目录，例如 my-app', 'Enter a new directory, for example my-app'), value: directory, error })
      if (next === null) {
        return null
      }
      directory = next
      let plan
      try {
        plan = await scaffoldPlan(route, directory, { ...options, template: route === 'weapp-vite' ? template : options.template })
      }
      catch (failure) {
        error = failure instanceof Error ? ('zh' in failure && 'en' in failure && typeof failure.zh === 'string' && typeof failure.en === 'string' ? t(ctx, failure.zh, failure.en) : failure.message) : String(failure)
        continue
      }
      error = ''
      if (route === 'weapp-vite') {
        const selected = await workbench.request({ type: 'menu', title: t(ctx, '选择模板', 'CHOOSE A TEMPLATE'), subtitle: '2 / 3 · weapp-vite', selected: Math.max(0, TEMPLATES.findIndex(name => name === template)), entries: TEMPLATES.map(name => ({ value: name, label: name, description: TEMPLATE_DETAILS[name][ctx.lang === 'en' ? 'en' : 'zh'] })) })
        if (selected === null) {
          continue
        }
        template = selected
        plan = await scaffoldPlan(route, directory, { ...options, template })
      }
      const confirmed = await workbench.request({ type: 'summary', title: t(ctx, '准备创建', 'READY TO CREATE'), subtitle: route === 'weapp-vite' ? '3 / 3 · weapp-vite' : `2 / 2 · ${route}`, lines: [
        `${t(ctx, '目录', 'Directory')}: ${plan.directory}`,
        ...(route === 'weapp-vite' ? [`${t(ctx, '模板', 'Template')}: ${template}`, TEMPLATE_DETAILS[TEMPLATES.find(name => name === template) || 'default'][ctx.lang === 'en' ? 'en' : 'zh']] : []),
        '',
        displayCommand(npmExecArgs(plan)),
        '',
        t(ctx, '将查询官方版本与 Node 要求，再运行脚手架。', 'Checks the official version and Node requirements before scaffolding.'),
        t(ctx, '依赖由你稍后安装；已有目录不会被覆盖。', 'Install dependencies afterward. Existing directories are preserved.'),
      ] })
      if (confirmed) {
        return { args: [route, directory], options: { ...options, ...(route === 'weapp-vite' ? { template } : {}) } }
      }
    }
    return null
  })
}
