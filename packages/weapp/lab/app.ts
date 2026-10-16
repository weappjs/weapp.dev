export {}

type Language = 'zh-CN' | 'en'
type Scene = 'particles' | 'orbit' | 'flow'
type Scope = 'weapp' | 'all'
type Palette = 'project' | 'jade' | 'ice' | 'amber' | 'pearl'
type ProjectStatus = 'stable' | 'beta' | 'planned'
interface Point { x: number, y: number }
interface ColoredPoint extends Point { color: string }
interface LogoPoint extends Point {
  brightness: number
  size: number
  colorIndex: number
  sparkle?: number
}
interface Star extends Point { r: number, alpha: number }
interface FlowPoint extends Point { age: number, life: number, color: number }
interface OrbitalNode extends Point { radius: number }
interface ProjectContent {
  name: string
  tagline: string
  description: string
  capabilities: string[]
}
interface CatalogProject {
  slug: string
  id?: string
  packageName?: string
  name?: string
  description?: string
  ecosystem: string
  status: ProjectStatus
  accent: string
  locales: Record<Language, ProjectContent>
  docsUrl?: string
  github?: string
  quickStart?: { command?: string }
  installCommand?: string
}
interface BrowserProject extends Omit<CatalogProject, 'name' | 'description'>, ProjectContent {}
interface ProjectLogo { url: string, fallback: boolean }
interface LabData {
  lang: Language
  motion: boolean
  catalog: CatalogProject[]
  projectLogos: Record<string, ProjectLogo>
  logo: { points: LogoPoint[] }
}

const ORBIT_LOGO_SCALE = 1.38

// The local server is a typed producer, but HTTP remains an unknown-data boundary.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}
function isContent(value: unknown): value is ProjectContent {
  return isRecord(value) && typeof value.name === 'string'
    && typeof value.tagline === 'string' && typeof value.description === 'string'
    && isStringList(value.capabilities)
}
function isCatalogProject(value: unknown): value is CatalogProject {
  return isRecord(value) && typeof value.slug === 'string'
    && typeof value.ecosystem === 'string' && typeof value.accent === 'string'
    && ['stable', 'beta', 'planned'].includes(String(value.status))
    && isRecord(value.locales) && isContent(value.locales['zh-CN']) && isContent(value.locales.en)
    && (value.docsUrl === undefined || typeof value.docsUrl === 'string')
    && (value.github === undefined || typeof value.github === 'string')
    && (value.installCommand === undefined || typeof value.installCommand === 'string')
    && (value.quickStart === undefined || (isRecord(value.quickStart) && (value.quickStart.command === undefined || typeof value.quickStart.command === 'string')))
}
function isLogoPoint(value: unknown): value is LogoPoint {
  return isRecord(value)
    && ['x', 'y', 'brightness', 'size', 'colorIndex'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && (value.sparkle === undefined || (typeof value.sparkle === 'number' && Number.isFinite(value.sparkle)))
}
function isLabData(value: unknown): value is LabData {
  if (!isRecord(value) || !['zh-CN', 'en'].includes(String(value.lang))
    || typeof value.motion !== 'boolean' || !Array.isArray(value.catalog)
    || !value.catalog.every(isCatalogProject) || !isRecord(value.projectLogos)
    || !Object.values(value.projectLogos).every(logo => isRecord(logo)
      && typeof logo.url === 'string' && /^\/logos\/[a-z0-9.-]+$/i.test(logo.url)
      && typeof logo.fallback === 'boolean')
    || !isRecord(value.logo) || !Array.isArray(value.logo.points)
    || !value.logo.points.every(isLogoPoint)) {
    return false
  }
  return true
}
function parseLabData(value: unknown): LabData {
  if (!isLabData(value)) {
    throw new Error('Invalid visual lab data')
  }
  return value
}

interface LabElements {
  '#canvas': HTMLCanvasElement
  '#pause': HTMLButtonElement
  '#replay': HTMLButtonElement
  '#download': HTMLButtonElement
  '#copy-command': HTMLButtonElement
  '#density': HTMLInputElement
  '#speed': HTMLInputElement
  '#palette': HTMLSelectElement
  '#scope': HTMLSelectElement
  '#project-select': HTMLSelectElement
  '#project-logo': HTMLImageElement
  '#density-output': HTMLOutputElement
  '#speed-output': HTMLOutputElement
}
function $<K extends keyof LabElements>(selector: K): LabElements[K]
function $<T extends Element = HTMLElement>(selector: string): T
function $(selector: string): Element {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Missing visual lab element: ${selector}`)
  }
  return element
}
const copy = {
  'zh-CN': {
    local: '本地 · 离线',
    title: '让灵感动起来。',
    intro: '从一颗星出发，找到你下一次创作的工具。',
    scene: '视觉场景',
    particles: '粒子字标',
    orbit: '生态星系',
    flow: '指针流场',
    particleHint: 'WEAPP 与项目 Logo 交替聚合。移动指针，让粒子散开。',
    orbitHint: '拖拽一颗星，重新安排你的生态。方向键也可选星。',
    flowHint: '滑动指针，给这片流场一个方向。',
    density: '密度',
    speed: '速度',
    palette: '配色',
    jade: '玉绿',
    ice: '冰蓝',
    amber: '琥珀',
    pearl: '珍珠',
    projectPalette: '项目配色',
    pause: '暂停',
    resume: '继续',
    replay: '重播',
    download: '保存 PNG',
    keyboard: '空格暂停 · R 重播 · 1 / 2 / 3 切换场景',
    reduced: '已减少动态效果',
    fallback: '此浏览器无法绘制画布。请换一个支持 Canvas 的浏览器。',
    loading: '正在准备粒子…',
    failed: '场景数据未能加载，请刷新重试。',
    saved: 'PNG 已保存。',
    exportFailed: '图片未能保存，请重试。',
    assembling: '正在聚合',
    expanding: '正在展开',
    ready: '由你来玩',
    paused: '已暂停',
    static: '静态预览',
    canvas: 'weapp 交互视觉画布',
    scope: '探索范围',
    scopeWeapp: 'weapp 生态 · 6',
    scopeAll: '全部项目 · 11',
    project: '项目',
    copyCommand: '复制开始命令',
    copied: '开始命令已复制。',
    copyFailed: '未能复制。请选中开始命令手动复制。',
    docs: '官方文档',
    repo: '源代码',
    stable: '稳定',
    beta: '测试中',
    planned: '规划中',
    plannedNotice: '规划中，暂无安装或创建命令。',
    logoFallback: '共享小程序标记 · 暂无独立项目 Logo',
  },
  'en': {
    local: 'Local · offline',
    title: 'Make room for play.',
    intro: 'Start with one star. Find the tools for your next creation.',
    scene: 'Visual scene',
    particles: 'Particles',
    orbit: 'Ecosystem',
    flow: 'Flow field',
    particleHint: 'WEAPP morphs into the project mark. Move your pointer to scatter the particles.',
    orbitHint:
      'Drag a star to rearrange your ecosystem. Arrow keys select stars, too.',
    flowHint: 'Move your pointer to give the flow field a new direction.',
    density: 'Density',
    speed: 'Speed',
    palette: 'Palette',
    jade: 'Jade',
    ice: 'Ice',
    amber: 'Amber',
    pearl: 'Pearl',
    projectPalette: 'Project colors',
    pause: 'Pause',
    resume: 'Resume',
    replay: 'Replay',
    download: 'Save PNG',
    keyboard: 'Space to pause · R to replay · 1 / 2 / 3 to switch',
    reduced: 'Reduced motion',
    fallback:
      'This browser cannot draw the canvas. Try a browser with Canvas support.',
    loading: 'Preparing the particles…',
    failed: 'Scene data could not load. Refresh to try again.',
    saved: 'PNG saved.',
    exportFailed: 'Could not save the image. Try again.',
    assembling: 'Assembling',
    expanding: 'Unfolding',
    ready: 'Yours to play',
    paused: 'Paused',
    static: 'Static preview',
    canvas: 'weapp interactive visual canvas',
    scope: 'Explore',
    scopeWeapp: 'weapp ecosystem · 6',
    scopeAll: 'All projects · 11',
    project: 'Project',
    copyCommand: 'Copy start command',
    copied: 'Start command copied.',
    copyFailed: 'Could not copy. Select the start command and copy it manually.',
    docs: 'Official docs',
    repo: 'Source code',
    stable: 'Stable',
    beta: 'Beta',
    planned: 'Planned',
    plannedNotice: 'Planned. No install or create command is available yet.',
    logoFallback: 'Shared mini-app mark · no independent project logo yet',
  },
}
const palettes = {
  jade: ['#71d6ae', '#87bdec', '#f2c28a', '#d7e8e5'],
  ice: ['#87bdec', '#b5dbf4', '#739ac8', '#d7e8e5'],
  amber: ['#f2c28a', '#db975b', '#f7d8ad', '#d7e8e5'],
  pearl: ['#d7e8e5', '#adbdbb', '#f5f5f7', '#71d6ae'],
}
const canvas = $('#canvas')
let context: CanvasRenderingContext2D | null = null
try {
  context = canvas.getContext('2d', { alpha: false })
}
catch {
  /* The visible fallback also works when getContext throws. */
}
const query = new URLSearchParams(location.search)
let lang: Language = query.get('lang') === 'en' ? 'en' : 'zh-CN'
let text = copy[lang]
let data: LabData = { lang: 'zh-CN', catalog: [], projectLogos: {}, logo: { points: [] }, motion: true }
let scene: Scene = 'orbit'
let scope: Scope = 'weapp'
let density = 0.7
let speed = 1
let palette: Palette = 'project'
let paused = false
let reduced = query.get('motion') === '0'
const media = matchMedia('(prefers-reduced-motion: reduce)')
let width = 1
let height = 1
let elapsed = 0
let lastFrame = 0
let frameId = 0
let ready = false
let source: LogoPoint[] = []
let targets: Point[] = []
let markTargets: ColoredPoint[] = []
let flow: FlowPoint[] = []
let stars: Star[] = []
let projects: BrowserProject[] = []
let allProjects: BrowserProject[] = []
const images = new Map<string, HTMLImageElement>()
const logoSamples = new Map<string, ColoredPoint[]>()
let orbitalNodes: OrbitalNode[] = []
let selected = -1
let dragging = -1
let dragPointer: number | null = null
const offsets = new Map<string, Point>()
const pointer = { x: -10_000, y: -10_000, active: false }
let particleOffsets: Point[] = []

function random(seed = 0x57454150) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let n = Math.imul(value ^ (value >>> 15), 1 | value)
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}
function localize() {
  text = copy[lang]
  document.documentElement.lang = lang
  document.title = lang === 'en' ? 'weapp · Visual lab' : 'weapp · 视觉实验室'
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach((node) => {
    const key = node.dataset.copy
    if (key && key in text) {
      node.textContent = text[key as keyof typeof text]
    }
  })
  $('.brand').setAttribute('aria-label', document.title)
  $('.scene-switch').setAttribute('aria-label', text.scene)
  $('.stage').setAttribute('aria-label', text.canvas)
  $('.toolbar').setAttribute(
    'aria-label',
    lang === 'en' ? 'Scene controls' : '场景控制',
  )
  canvas.setAttribute('aria-label', text.canvas)
  $('#project-select').setAttribute('aria-label', lang === 'en' ? 'Select a project' : '选择项目')
  $('#project-capabilities').setAttribute('aria-label', lang === 'en' ? 'Project capabilities' : '项目能力')
  updateControls()
}
function status(message: string) {
  $('#status').textContent = message
}
function sceneColors() {
  if (palette !== 'project') {
    return palettes[palette]
  }
  const accent = projects[selected]?.accent || '#69c7a5'
  const components = [1, 3, 5].map(index => Number.parseInt(accent.slice(index, index + 2), 16))
  const tint = (weight: number) => `rgb(${components.map(value => Math.round(value + (255 - value) * weight)).join(',')})`
  return [accent, tint(0.25), tint(0.55), '#d7e8e5']
}
function stageInk(color: string) {
  const rgb = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16))
  const luminance = (channels: number[]) => channels.map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const background = luminance([4, 6, 7])
  let ink = rgb
  // Lift display lettering only. Official logo assets and catalog accents keep
  // their source colors; 3.5 gives large text margin above the 3:1 minimum.
  for (let tint = 0.02; (luminance(ink) + 0.05) / (background + 0.05) < 3.5; tint += 0.02) {
    ink = rgb.map(channel => Math.round(channel + (255 - channel) * tint))
  }
  return `#${ink.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}
function updateControls() {
  $('#pause span').textContent = paused ? text.resume : text.pause
  $('#pause').setAttribute('aria-pressed', String(paused))
  $('#pause-icon').innerHTML = paused
    ? '<path d="m7 4 8 6-8 6Z"/>'
    : '<path d="M7 4v12M13 4v12"/>'
  $('#pause').disabled = reduced || !context || !ready
  $('#replay').disabled = !context || !ready
  $('#download').disabled = !context || !ready
  $('#motion-notice').hidden = !reduced
  $('#density-output').value = `${Math.round(density * 100)}%`
  $('#speed-output').value = `${Number(speed.toFixed(2))}×`
  $('#scene-hint').textContent
    = text[
      scene === 'particles'
        ? 'particleHint'
        : scene === 'orbit'
          ? 'orbitHint'
          : 'flowHint'
    ]
  $('#scene-name').textContent
    = `WEAPP / ${scene === 'orbit' ? 'ECOSYSTEM' : scene.toUpperCase()}`
  const phase = reduced
    ? text.static
    : paused
      ? text.paused
      : scene !== 'flow' && elapsed < 2.2
        ? scene === 'orbit' ? text.expanding : text.assembling
        : text.ready
  if ($('#phase').textContent !== phase) {
    $('#phase').textContent = phase
  }
}
function count() {
  return Math.max(120, Math.round((width < 600 ? 1300 : 2400) * density))
}
function shuffle<T>(points: T[], seed: number): T[] {
  const rng = random(seed)
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]]
  }
  return points
}
function sampleLogo(project: BrowserProject | undefined): ColoredPoint[] {
  if (!project) {
    return []
  }
  let points = logoSamples.get(project.slug)
  if (!points) {
    const buffer = document.createElement('canvas')
    buffer.width = buffer.height = 240
    const ctx = buffer.getContext('2d')
    const image = images.get(project.slug)
    if (!ctx || !image) {
      return []
    }
    const size = 224
    const scale = size / Math.max(image.naturalWidth, image.naturalHeight)
    const w = image.naturalWidth * scale
    const h = image.naturalHeight * scale
    ctx.drawImage(image, (240 - w) / 2, (240 - h) / 2, w, h)
    const pixels = ctx.getImageData(0, 0, 240, 240).data
    points = []
    for (let y = 0; y < 240; y += 2) {
      for (let x = 0; x < 240; x += 2) {
        const index = (y * 240 + x) * 4
        if (pixels[index + 3] > 150) {
          const r = pixels[index]
          const g = pixels[index + 1]
          const b = pixels[index + 2]
          // Very dark pixels remain visible on the dark canvas. Preserve the
          // official mark itself unchanged in the orbit and information rail.
          const color = Math.max(r, g, b) < 60 ? '#d7e8e5' : `rgb(${r},${g},${b})`
          points.push({ x: x / 240 - 0.5, y: y / 240 - 0.5, color })
        }
      }
    }
    shuffle(points, 41)
    logoSamples.set(project.slug, points)
  }
  const size = Math.min(width * 0.54, height * 0.64)
  return points.map(point => ({
    x: point.x * size + width / 2,
    y: point.y * size + height / 2,
    color: point.color,
  }))
}
function sampleWord(): Point[] {
  const buffer = document.createElement('canvas')
  buffer.width = 1200
  buffer.height = 260
  const ctx = buffer.getContext('2d')
  if (!ctx) {
    return []
  }
  ctx.fillStyle = '#fff'
  ctx.font = '700 200px Syne'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('WEAPP', 600, 135)
  const pixels = ctx.getImageData(0, 0, 1200, 260).data
  const points: Point[] = []
  for (let y = 0; y < 260; y += 3) {
    for (let x = 0; x < 1200; x += 3) {
      if (pixels[(y * 1200 + x) * 4 + 3] > 160) {
        points.push({ x, y })
      }
    }
  }
  if (!points.length) {
    return []
  }
  const minX = Math.min(...points.map(p => p.x))
  const maxX = Math.max(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const maxY = Math.max(...points.map(p => p.y))
  const scale = Math.min(
    (width * 0.76) / (maxX - minX),
    (height * 0.35) / (maxY - minY),
  )
  // Deterministic shuffle keeps every density uniformly distributed over the word.
  shuffle(points, 73)
  return points.map(p => ({
    x: (p.x - (minX + maxX) / 2) * scale + width / 2,
    y: (p.y - (minY + maxY) / 2) * scale + height / 2,
  }))
}
function rebuild() {
  const rng = random()
  stars = Array.from({ length: Math.round(80 + density * 110) }, () => ({
    x: rng() * width,
    y: rng() * height,
    r: 0.35 + rng() * 0.75,
    alpha: 0.15 + rng() * 0.32,
  }))
  const points = data.logo?.points || []
  targets = sampleWord()
  markTargets = sampleLogo(projects[selected])
  source = Array.from({ length: Math.min(count(), Math.max(points.length, targets.length, markTargets.length)) }, (_, i) => points[i % points.length] || { x: 0.5, y: 0.5, brightness: 0.8, size: 0.007, colorIndex: i % 4 })
  particleOffsets = source.map(() => ({ x: 0, y: 0 }))
  const flowCount = Math.round((width < 600 ? 550 : 1050) * density)
  flow = Array.from({ length: flowCount }, (_, i) => ({
    x: rng() * width,
    y: rng() * height,
    age: rng() * 3,
    life: 1.2 + rng() * 3,
    color: i % 4,
  }))
  orbitalNodes = []
}
function resize() {
  const bounds = canvas.getBoundingClientRect()
  const oldWidth = width
  const oldHeight = height
  width = Math.max(1, bounds.width)
  height = Math.max(1, bounds.height)
  const ratio = Math.min(devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  if (oldWidth > 1) {
    for (const offset of offsets.values()) {
      offset.x *= width / oldWidth
      offset.y *= height / oldHeight
    }
  }
  if (ready) {
    rebuild()
    draw(0)
    schedule()
  }
}
function dot(x: number, y: number, radius: number, color: string, alpha = 1) {
  if (!context) {
    return
  }
  context.globalAlpha = alpha
  context.fillStyle = color
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}
function backdrop() {
  if (!context) {
    return
  }
  context.globalAlpha = 1
  context.fillStyle = '#040607'
  context.fillRect(0, 0, width, height)
  for (const star of stars) {
    dot(star.x, star.y, star.r, '#d7e8e5', star.alpha)
  }
  context.globalAlpha = 1
}
function drawParticles(dt: number) {
  if (!context) {
    return
  }
  const beat = elapsed % 8
  const t = reduced ? 1 : beat < 4 ? Math.max(0, Math.min(1, (beat - 0.7) / 1.5)) : 1 - Math.max(0, Math.min(1, (beat - 4.7) / 1.5))
  const eased = t < 0.5 ? 8 * t ** 4 : 1 - 8 * (1 - t) ** 4
  const logoSize = Math.min(width * 0.47, height * 0.63)
  const colors = sceneColors()
  canvas.dataset.morph = eased > 0.95 ? 'project' : eased < 0.05 ? 'wordmark' : 'transition'
  for (let i = 0; i < source.length; i++) {
    const point = source[i]
    const target = markTargets[i % markTargets.length]
    const word = targets[i % targets.length]
    const fromX = word?.x ?? ((point.x || 0.5) - 0.5) * logoSize + width / 2
    const fromY = word?.y ?? ((point.y || 0.5) - 0.5) * logoSize + height / 2
    const spin = Math.sin(t * Math.PI) * 17
    let x
      = fromX
        + ((target?.x ?? fromX) - fromX) * eased
        + Math.cos(i * 1.91) * spin
    let y
      = fromY
        + ((target?.y ?? fromY) - fromY) * eased
        + Math.sin(i * 1.91) * spin
    const offset = particleOffsets[i]
    if (!reduced && !paused && dt > 0) {
      let dx = 0
      let dy = 0
      if (pointer.active) {
        const vx = x - pointer.x
        const vy = y - pointer.y
        const distance = Math.hypot(vx, vy)
        if (distance < 86 && distance > 0) {
          const force = (1 - distance / 86) ** 2 * 36
          dx = (vx / distance) * force
          dy = (vy / distance) * force
        }
      }
      const follow = Math.min(1, dt * 8)
      offset.x += (dx - offset.x) * follow
      offset.y += (dy - offset.y) * follow
    }
    x += offset.x
    y += offset.y
    const radius = Math.max(
      0.65,
      Math.min(2, (point.size || 0.007) * logoSize * 0.32),
    )
    const brightness
      = (point.brightness || 0.7)
        * (0.82 + Math.sin(i * 7.1 + elapsed * 0.55) * (reduced ? 0 : 0.12))
    const color = eased > 0.5 ? target?.color || colors[0] : colors[point.colorIndex % 4 || 0]
    dot(x, y, radius, color, brightness)
    if (point.sparkle && radius > 1.1) {
      context.strokeStyle = colors[point.colorIndex % 4 || 0]
      context.lineWidth = 0.55
      context.beginPath()
      context.moveTo(x - radius * 2, y)
      context.lineTo(x + radius * 2, y)
      context.moveTo(x, y - radius * 2)
      context.lineTo(x, y + radius * 2)
      context.stroke()
    }
  }
  if (!source.length) {
    context.globalAlpha = 1
    context.fillStyle = colors[0]
    context.font = `700 ${Math.min(width * 0.18, 120)}px Syne`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('WEAPP', width / 2, height / 2)
  }
}
function nodeBase(index: number, trail = 0) {
  const outer = index >= 6
  const ringCount = outer ? projects.length - 6 : Math.min(6, projects.length)
  const ringIndex = outer ? index - 6 : index
  const angle = ringIndex / ringCount * Math.PI * 2 - Math.PI / 2 + (outer ? 0.35 : 0) + (reduced ? 0 : Math.max(0, elapsed - 2.2) * (outer ? -0.03 : 0.045)) - trail
  const radiusX = width * (outer ? 0.42 : projects.length > 6 ? 0.29 : 0.35)
  const radiusY = height * (outer ? 0.34 : projects.length > 6 ? 0.22 : 0.3)
  const depth = (Math.sin(angle) + 1) / 2
  return {
    x: width / 2 + Math.cos(angle) * radiusX,
    y: height / 2 + Math.sin(angle) * radiusY,
    depth,
  }
}
function drawOrbit() {
  if (!context) {
    return
  }
  const progress = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - 0.55) / 1.65))
  const unfolded = 1 - (1 - progress) ** 4
  const reveal = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - 1.4) / 0.8))
  if (!reduced && elapsed < 2.2 && projects.length) {
    const size = Math.min(width * 0.43, height * 0.59)
    const colors = sceneColors()
    for (let i = 0; i < source.length; i++) {
      const point = source[i]
      const node = nodeBase(i % projects.length)
      const fromX = (point.x - 0.5) * size + width / 2
      const fromY = (point.y - 0.5) * size + height / 2
      const spread = 8 * progress
      const x = fromX + (node.x + Math.cos(i * 2.31) * spread - fromX) * unfolded
      const y = fromY + (node.y + Math.sin(i * 2.31) * spread - fromY) * unfolded
      const color = progress < 0.45 ? colors[point.colorIndex % 4 || 0] : projects[i % projects.length].accent
      dot(x, y, Math.max(0.7, Math.min(1.8, point.size * size * 0.32)), color, point.brightness * (1 - reveal))
    }
  }
  context.globalAlpha = 1
  context.strokeStyle = '#20352e'
  context.lineWidth = 0.8
  for (const outer of projects.length > 6 ? [false, true] : [false]) {
    context.beginPath()
    context.ellipse(
      width / 2,
      height / 2,
      width * (outer ? 0.42 : projects.length > 6 ? 0.29 : 0.35) * unfolded,
      height * (outer ? 0.34 : projects.length > 6 ? 0.22 : 0.3) * unfolded,
      0,
      0,
      Math.PI * 2,
    )
    context.globalAlpha = progress
    context.stroke()
  }
  context.globalAlpha = reveal
  context.fillStyle = stageInk(sceneColors()[0])
  context.font = `700 ${width < 600 ? 43 : 64}px Syne`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('weapp', width / 2, height / 2 - 5)
  context.font = '12px Geist Variable'
  context.fillStyle = '#98aaa4'
  context.fillText(
    lang === 'en'
      ? `${projects.length} projects · ${scope === 'weapp' ? 'weapp ecosystem' : 'mini-app tools'}`
      : `${projects.length} 个项目 · ${scope === 'weapp' ? 'weapp 生态' : '小程序工具'}`,
    width / 2,
    height / 2 + 38,
  )
  const nodes = projects.map((project, index) => {
    const base = nodeBase(index)
    const offset = offsets.get(project.slug) || { x: 0, y: 0 }
    const depthRadius = (width < 600 ? 16 : 22) * (0.78 + base.depth * 0.28) * (selected === index ? 1.2 : 1)
    // The official SQLite icon needs at least 32 CSS px, including on the far orbit.
    const radius = project.slug === 'weapp-sqlite' ? Math.max(depthRadius, 32 / ORBIT_LOGO_SCALE) : depthRadius
    const edge = project.slug === 'weapp-sqlite' ? Math.max(22, radius) : 22
    const x = Math.max(
      edge,
      Math.min(width - edge, index === dragging ? pointer.x : width / 2 + (base.x - width / 2) * unfolded + offset.x),
    )
    const y = Math.max(
      58,
      Math.min(height - 64, index === dragging ? pointer.y : height / 2 + (base.y - height / 2) * unfolded + offset.y),
    )
    return { project, index, x, y, radius, depth: base.depth, offset }
  })
  orbitalNodes = reveal > 0.95 ? nodes.map(({ x, y, radius }) => ({ x, y, radius: Math.max(22, radius + 8) })) : []
  for (const { project, index, x, y, radius, depth, offset } of nodes.sort((a, b) => a.depth - b.depth)) {
    if (!reveal) {
      continue
    }
    if (!reduced && dragging !== index && progress === 1) {
      for (let segment = 0; segment < 12; segment++) {
        const from = nodeBase(index, (segment + 1) * 0.012)
        const to = nodeBase(index, segment * 0.012)
        context.globalAlpha = (1 - segment / 12) * (selected === index ? 0.55 : 0.22)
        context.strokeStyle = project.accent
        context.lineWidth = (selected === index ? 2 : 1.2) * (0.7 + depth * 0.5)
        context.beginPath()
        context.moveTo(from.x + offset.x, from.y + offset.y)
        context.lineTo(to.x + offset.x, to.y + offset.y)
        context.stroke()
      }
    }
    if (selected === index) {
      context.globalAlpha = 0.9 * reveal
      context.strokeStyle = project.accent
      context.lineWidth = 1
      context.beginPath()
      context.arc(x, y, radius + 7, 0, Math.PI * 2)
      context.stroke()
    }
    dot(x, y, radius, '#eff2ef', reveal * (selected === index ? 1 : 0.65 + depth * 0.23))
    const image = images.get(project.slug)
    if (image) {
      context.globalAlpha = reveal * (selected === index ? 1 : 0.65 + depth * 0.23)
      const size = radius * ORBIT_LOGO_SCALE
      const ratio = size / Math.max(image.naturalWidth, image.naturalHeight)
      const w = image.naturalWidth * ratio
      const h = image.naturalHeight * ratio
      context.drawImage(image, x - w / 2, y - h / 2, w, h)
    }
    if (width >= 600 || selected === index) {
      context.globalAlpha = reveal * (selected === index ? 1 : 0.78)
      context.fillStyle = selected === index ? '#f5f5f7' : '#bec7c3'
      context.font = `${selected === index ? 550 : 450} ${width < 600 ? 11 : 12}px Geist Variable`
      context.textBaseline = 'top'
      const labelX = Math.max(82, Math.min(width - 82, x))
      context.fillText(project.name, labelX, y + radius + 10)
    }
  }
  // Read-only geometry enables interaction tests without a second animation model.
  canvas.dataset.nodes = JSON.stringify(orbitalNodes.map((node, index) => ({ slug: projects[index].slug, x: Math.round(node.x), y: Math.round(node.y) })))
}
function drawFlow(dt: number) {
  if (!context) {
    return
  }
  const colors = sceneColors()
  context.lineWidth = width < 600 ? 1.1 : 1.3
  context.lineCap = 'round'
  for (let i = 0; i < flow.length; i++) {
    const point = flow[i]
    // A steady curl field supplies shape even before the first pointer gesture.
    const u = point.x / width
    const v = point.y / height
    let angle
      = Math.sin(u * 5 + elapsed * 0.22) * 2
        + Math.cos(v * 5 - elapsed * 0.15) * 1.8
    if (pointer.active) {
      const dx = pointer.x - point.x
      const dy = pointer.y - point.y
      const influence = Math.max(0, 1 - Math.hypot(dx, dy) / (width * 0.5))
      angle
        += Math.sin(Math.atan2(dy, dx) - angle + Math.PI / 2) * influence * 2.4
    }
    const vx = Math.cos(angle)
    const vy = Math.sin(angle)
    const length = 8 + Math.sin(i * 2.31) * 5
    context.strokeStyle = colors[point.color]
    context.globalAlpha
      = 0.35 + Math.sin(Math.PI * Math.min(1, point.age / point.life)) * 0.45
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.lineTo(point.x - vx * length, point.y - vy * length)
    context.stroke()
    if (dt > 0) {
      point.x += vx * dt * 30
      point.y += vy * dt * 30
      point.age += dt
      if (point.x < -10) {
        point.x = width + 5
      }
      if (point.x > width + 10) {
        point.x = -5
      }
      if (point.y < -10) {
        point.y = height + 5
      }
      if (point.y > height + 10) {
        point.y = -5
      }
      if (point.age > point.life) {
        point.age = 0
      }
    }
  }
  if (pointer.active) {
    context.strokeStyle = colors[0]
    context.globalAlpha = 0.45
    context.lineWidth = 0.8
    context.beginPath()
    context.arc(pointer.x, pointer.y, 14, 0, Math.PI * 2)
    context.stroke()
  }
}
function draw(dt = 0) {
  if (!context || !ready) {
    return
  }
  backdrop()
  if (scene === 'particles') {
    drawParticles(dt)
  }
  else if (scene === 'orbit') {
    drawOrbit()
  }
  else {
    drawFlow(dt)
  }
  context.globalAlpha = 1
  updateControls()
}
function animate(time: number) {
  frameId = 0
  if (!ready || paused || reduced || document.hidden) {
    lastFrame = 0
    return
  }
  const dt = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) * speed : 0
  lastFrame = time
  elapsed += dt
  draw(dt)
  schedule()
}
function schedule() {
  if (ready && context && !paused && !reduced && !document.hidden && !frameId) {
    frameId = requestAnimationFrame(animate)
  }
}
function stop() {
  if (frameId) {
    cancelAnimationFrame(frameId)
  }
  frameId = 0
  lastFrame = 0
}
function replay() {
  stop()
  elapsed = 0
  paused = false
  offsets.clear()
  dragging = -1
  dragPointer = null
  pointer.active = false
  rebuild()
  draw(0)
  updateControls()
  status('')
  schedule()
}
function selectScene(value: string) {
  if (!['particles', 'orbit', 'flow'].includes(value)) {
    return
  }
  scene = value as Scene
  $<HTMLInputElement>(`input[name="scene"][value="${value}"]`).checked = true
  replay()
}
function selectProject(index: number) {
  if (!projects[index]) {
    return
  }
  selected = index
  const project = projects[index]
  $('#project-detail').hidden = false
  $('#project-select').value = project.slug
  $('#project-name').textContent = project.name
  $('#project-tagline').textContent = project.tagline
  $('#project-description').textContent = project.description
  $('#project-status').textContent = text[project.status] || project.status
  $('#project-status').dataset.status = project.status
  $('#project-logo').src = data.projectLogos[project.slug].url
  $('#project-logo').alt = `${project.name} Logo`
  $('#logo-note').hidden = !data.projectLogos[project.slug].fallback
  $('#project-capabilities').replaceChildren(...project.capabilities.map((capability) => {
    const item = document.createElement('li')
    item.textContent = capability
    return item
  }))
  const command = project.status === 'planned' ? '' : project.slug === 'weapp-vite' ? 'npx weapp create weapp-vite my-app' : project.quickStart?.command || project.installCommand || ''
  $('#project-command').textContent = command
  $('#command-action').hidden = !command
  $('#planned-notice').hidden = project.status !== 'planned'
  for (const [id, url] of [['project-docs', project.docsUrl], ['project-repo', project.github && `https://github.com/${project.github}`]]) {
    const link = $<HTMLAnchorElement>(`#${id}`)
    // Catalog actions are external references; reject schemes with executable content.
    link.hidden = !/^https:\/\//.test(url || '')
    if (!link.hidden) {
      link.href = url || ''
    }
    else {
      link.removeAttribute('href')
    }
  }
  canvas.setAttribute('aria-label', `${text.canvas}: ${project.name}. ${project.tagline}`)
  canvas.dataset.project = project.slug
  markTargets = sampleLogo(project)
  particleOffsets = source.map(() => ({ x: 0, y: 0 }))
  if (scene === 'particles') {
    elapsed = 0
  }
  draw(0)
}
function selectScope(value: string) {
  const current = projects[selected]?.slug || 'weapp-vite'
  scope = value === 'all' ? 'all' : 'weapp'
  projects = allProjects.filter(project => scope === 'all' || project.ecosystem === 'weapp')
  $('#project-select').replaceChildren(...projects.map((project) => {
    const option = document.createElement('option')
    option.value = project.slug
    option.textContent = project.name
    return option
  }))
  selected = Math.max(0, projects.findIndex(project => project.slug === current))
  canvas.dataset.scope = scope
  canvas.dataset.projectCount = String(projects.length)
  if (projects.length) {
    selectProject(selected)
  }
  replay()
}
function setReduced() {
  reduced
    = query.get('motion') === '0' || data.motion === false || media.matches
  stop()
  draw(0)
  updateControls()
  schedule()
}
function coordinates(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}
function showFallback(message = text.fallback) {
  $('#fallback').hidden = false
  $('#fallback p').textContent = message
  canvas.hidden = true
  stop()
  context = null
  updateControls()
}

document
  .querySelectorAll<HTMLInputElement>('[name="scene"]')
  .forEach(input =>
    input.addEventListener('change', () => selectScene(input.value)),
  )
$('#density').addEventListener('input', (event) => {
  density = Number((event.currentTarget as HTMLInputElement).value) / 100
  rebuild()
  draw(0)
  updateControls()
})
$('#speed').addEventListener('input', (event) => {
  speed = Number((event.currentTarget as HTMLInputElement).value) / 100
  updateControls()
})
$('#palette').addEventListener('change', (event) => {
  const value = (event.currentTarget as HTMLSelectElement).value
  if (value === 'project' || value in palettes) {
    palette = value as Palette
  }
  draw(0)
})
$('#pause').addEventListener('click', () => {
  paused = !paused
  stop()
  draw(0)
  updateControls()
  schedule()
})
$('#replay').addEventListener('click', replay)
$('#scope').addEventListener('change', event => selectScope((event.currentTarget as HTMLSelectElement).value))
$('#project-select').addEventListener('change', (event) => {
  selectProject(projects.findIndex(project => project.slug === (event.currentTarget as HTMLSelectElement).value))
})
$('#copy-command').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#project-command').textContent || '')
    status(text.copied)
  }
  catch {
    status(text.copyFailed)
  }
})
$('#download').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob) {
      status(text.exportFailed)
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url || ''
    link.download = `weapp-${scene}.png`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
    status(text.saved)
  }, 'image/png')
})
canvas.addEventListener('pointerdown', (event) => {
  if (!ready) {
    return
  }
  Object.assign(pointer, coordinates(event), { active: true })
  canvas.focus({ preventScroll: true })
  if (scene === 'orbit') {
    const hit = orbitalNodes.findIndex(
      node =>
        Math.hypot(node.x - pointer.x, node.y - pointer.y) < node.radius,
    )
    selectProject(hit)
    dragging = hit
    if (hit >= 0) {
      dragPointer = event.pointerId
      canvas.setPointerCapture(event.pointerId)
    }
  }
  draw(0)
})
canvas.addEventListener('pointermove', (event) => {
  Object.assign(pointer, coordinates(event), { active: true })
  if (scene === 'orbit' && dragging >= 0 && event.pointerId === dragPointer) {
    const base = nodeBase(dragging)
    offsets.set(projects[dragging].slug, {
      x: Math.max(22, Math.min(width - 22, pointer.x)) - base.x,
      y: Math.max(58, Math.min(height - 64, pointer.y)) - base.y,
    })
  }
  if (paused || reduced || dragging >= 0) {
    draw(0)
  }
})
function release(event: PointerEvent) {
  if (event.pointerId === dragPointer) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    dragging = -1
    dragPointer = null
  }
  if (event.pointerType !== 'mouse') {
    pointer.active = false
  }
}
canvas.addEventListener('pointerup', release)
canvas.addEventListener('pointercancel', release)
canvas.addEventListener('pointerleave', () => {
  if (dragging < 0) {
    pointer.active = false
  }
})
document.addEventListener('keydown', (event) => {
  if (!ready || !context) {
    return
  }
  if (
    event.altKey
    || event.ctrlKey
    || event.metaKey
    || (event.target instanceof Element && event.target.closest('input,select,button,a'))
  ) {
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    if (!reduced && context && ready) {
      $('#pause').click()
    }
  }
  else if (event.key.toLowerCase() === 'r') {
    replay()
  }
  else if (/^[123]$/.test(event.key)) {
    selectScene(['particles', 'orbit', 'flow'][Number(event.key) - 1])
  }
  else if (
    scene === 'orbit'
    && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    && projects.length
  ) {
    event.preventDefault()
    const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1
    selectProject((selected + step + projects.length) % projects.length)
    status(`${projects[selected].name} · ${projects[selected].tagline}`)
  }
})
document.addEventListener('visibilitychange', () => {
  stop()
  schedule()
})
window.addEventListener('pagehide', stop)
media.addEventListener('change', setReduced)
const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe($('.stage'))
localize()
status(text.loading)
async function initialize() {
  try {
    const response = await fetch('/data.json')
    if (!response.ok) {
      throw new Error('data')
    }
    data = parseLabData(await response.json())
    if (!query.has('lang')) {
      lang = data.lang === 'en' ? 'en' : 'zh-CN'
    }
    allProjects = (data.catalog || []).filter(project => data.projectLogos[project.slug]).map(project => ({
      ...project,
      slug: project.slug,
      name: project.locales[lang].name,
      tagline: project.locales[lang].tagline,
      description: project.locales[lang].description,
      capabilities: project.locales[lang].capabilities,
      accent: /^#[0-9a-f]{6}$/i.test(project.accent)
        ? project.accent
        : '#69c7a5',
    }))
    await Promise.all(allProjects.map(async (project) => {
      const image = new Image()
      image.src = data.projectLogos[project.slug].url
      await image.decode()
      images.set(project.slug, image)
    }))
    // Fonts are shipped with the CLI; the scene has no remote startup dependency.
    await Promise.all([
      document.fonts.load('700 200px Syne'),
      document.fonts.load('450 12px "Geist Variable"'),
    ])
    ready = true
    localize()
    selectScope('weapp')
    resize()
    setReduced()
    if (!context) {
      showFallback()
    }
    status('')
    document.documentElement.dataset.ready = 'true'
  }
  catch {
    status(text.failed)
    showFallback(text.failed)
  }
}
void initialize()
