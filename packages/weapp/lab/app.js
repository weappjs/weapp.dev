const copy = {
  'zh-CN': {
    local: '本地 · 离线',
    title: '让灵感动起来。',
    intro: '一枚 Logo，十一颗星，一片由你牵动的流场。',
    scene: '视觉场景',
    particles: '粒子字标',
    orbit: '生态星系',
    flow: '指针流场',
    particleHint: '移动指针，让粒子轻轻散开。',
    orbitHint: '拖拽一颗星，重新安排你的生态。方向键也可选星。',
    flowHint: '滑动指针，给这片流场一个方向。',
    density: '密度',
    speed: '速度',
    palette: '配色',
    jade: '玉绿',
    ice: '冰蓝',
    amber: '琥珀',
    pearl: '珍珠',
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
    ready: '由你来玩',
    paused: '已暂停',
    static: '静态预览',
    canvas: 'weapp 交互视觉画布',
  },
  'en': {
    local: 'Local · offline',
    title: 'Make room for play.',
    intro: 'One mark. Eleven stars. A flow field that follows your lead.',
    scene: 'Visual scene',
    particles: 'Particles',
    orbit: 'Ecosystem',
    flow: 'Flow field',
    particleHint: 'Move your pointer to gently scatter the particles.',
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
    ready: 'Yours to play',
    paused: 'Paused',
    static: 'Static preview',
    canvas: 'weapp interactive visual canvas',
  },
}
const palettes = {
  jade: ['#71d6ae', '#87bdec', '#f2c28a', '#d7e8e5'],
  ice: ['#87bdec', '#b5dbf4', '#739ac8', '#d7e8e5'],
  amber: ['#f2c28a', '#db975b', '#f7d8ad', '#d7e8e5'],
  pearl: ['#d7e8e5', '#adbdbb', '#f5f5f7', '#71d6ae'],
}
const $ = selector => document.querySelector(selector)
const canvas = $('#canvas')
let context
try {
  context = canvas.getContext('2d', { alpha: false })
}
catch {
  /* The visible fallback also works when getContext throws. */
}
const query = new URLSearchParams(location.search)
let lang = query.get('lang') === 'en' ? 'en' : 'zh-CN'
let text = copy[lang]
let data = { catalog: [], logo: { points: [] }, motion: true }
let scene = 'particles'
let density = 0.7
let speed = 1
let palette = 'jade'
let paused = false
let reduced = query.get('motion') === '0'
const media = matchMedia('(prefers-reduced-motion: reduce)')
let width = 1
let height = 1
let elapsed = 0
let lastFrame = 0
let frameId = 0
let ready = false
let source = []
let targets = []
let flow = []
let stars = []
let projects = []
let orbitalNodes = []
let selected = -1
let dragging = -1
let dragPointer = null
const offsets = new Map()
const pointer = { x: -10_000, y: -10_000, active: false }
let particleOffsets = []

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
  document.querySelectorAll('[data-copy]').forEach((node) => {
    node.textContent = text[node.dataset.copy]
  })
  $('.brand').setAttribute('aria-label', document.title)
  $('.scene-switch').setAttribute('aria-label', text.scene)
  $('.stage').setAttribute('aria-label', text.canvas)
  $('.toolbar').setAttribute(
    'aria-label',
    lang === 'en' ? 'Scene controls' : '场景控制',
  )
  canvas.setAttribute('aria-label', text.canvas)
  updateControls()
}
function status(message) {
  $('#status').textContent = message
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
      : scene === 'particles' && elapsed < 2.2
        ? text.assembling
        : text.ready
  if ($('#phase').textContent !== phase) {
    $('#phase').textContent = phase
  }
}
function count() {
  return Math.max(120, Math.round((width < 600 ? 1300 : 2400) * density))
}
function sampleWord() {
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
  const points = []
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
  const rng = random(73)
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]]
  }
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
  source = points.slice(0, count())
  targets = sampleWord()
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
    draw(0, true)
    schedule()
  }
}
function dot(x, y, radius, color, alpha = 1) {
  context.globalAlpha = alpha
  context.fillStyle = color
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}
function backdrop() {
  context.globalAlpha = 1
  context.fillStyle = '#040607'
  context.fillRect(0, 0, width, height)
  for (const star of stars) {
    dot(star.x, star.y, star.r, '#d7e8e5', star.alpha)
  }
  context.globalAlpha = 1
}
function drawParticles(dt) {
  const t = reduced ? 0 : Math.max(0, Math.min(1, (elapsed - 0.7) / 1.5))
  const eased = 1 - (1 - t) ** 4
  const logoSize = Math.min(width * 0.47, height * 0.63)
  const colors = palettes[palette]
  for (let i = 0; i < source.length; i++) {
    const point = source[i]
    const target = targets[i % targets.length]
    const fromX = (point.x - 0.5) * logoSize + width / 2
    const fromY = (point.y - 0.5) * logoSize + height / 2
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
    dot(x, y, radius, colors[point.colorIndex % 4 || 0], brightness)
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
function nodeBase(index) {
  const angle
    = (index / projects.length) * Math.PI * 2
      - Math.PI / 2
      + (reduced ? 0 : elapsed * 0.035)
  const radiusX = width * (width < 600 ? 0.35 : 0.36)
  const radiusY = height * 0.3
  const tier = index % 3 === 0 ? 0.82 : 1
  return {
    x: width / 2 + Math.cos(angle) * radiusX * tier,
    y: height / 2 + Math.sin(angle) * radiusY * tier,
  }
}
function drawOrbit() {
  context.globalAlpha = 1
  context.strokeStyle = '#20352e'
  context.lineWidth = 0.8
  for (const scale of [0.82, 1]) {
    context.beginPath()
    context.ellipse(
      width / 2,
      height / 2,
      width * (width < 600 ? 0.35 : 0.36) * scale,
      height * 0.3 * scale,
      0,
      0,
      Math.PI * 2,
    )
    context.stroke()
  }
  context.fillStyle = palettes[palette][0]
  context.font = `700 ${width < 600 ? 43 : 64}px Syne`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('weapp', width / 2, height / 2 - 5)
  context.font = '12px Geist Variable'
  context.fillStyle = '#98aaa4'
  context.fillText(
    lang === 'en'
      ? `${projects.length} projects · one ecosystem`
      : `${projects.length} 个项目 · 一个生态`,
    width / 2,
    height / 2 + 38,
  )
  orbitalNodes = projects.map((project, index) => {
    const base = nodeBase(index)
    const offset = offsets.get(project.slug) || { x: 0, y: 0 }
    const x = Math.max(
      22,
      Math.min(width - 22, index === dragging ? pointer.x : base.x + offset.x),
    )
    const y = Math.max(
      58,
      Math.min(height - 64, index === dragging ? pointer.y : base.y + offset.y),
    )
    const radius = width < 600 ? 8 : 10
    if (selected === index) {
      context.globalAlpha = 0.9
      context.strokeStyle = project.accent
      context.lineWidth = 1
      context.beginPath()
      context.arc(x, y, radius + 7, 0, Math.PI * 2)
      context.stroke()
    }
    dot(x, y, radius, project.accent, selected === index ? 1 : 0.8)
    dot(x - radius * 0.22, y - radius * 0.24, radius * 0.32, '#fff', 0.35)
    if (width >= 600 || selected === index) {
      context.globalAlpha = selected === index ? 1 : 0.78
      context.fillStyle = selected === index ? '#f5f5f7' : '#bec7c3'
      context.font = `${selected === index ? 550 : 450} ${width < 600 ? 11 : 12}px Geist Variable`
      context.textBaseline = 'top'
      const labelX = Math.max(72, Math.min(width - 72, x))
      context.fillText(project.name, labelX, y + radius + 10)
    }
    return { x, y, radius: radius + 14 }
  })
}
function drawFlow(dt) {
  const colors = palettes[palette]
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
function animate(time) {
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
  selected = -1
  dragging = -1
  pointer.active = false
  $('#project-detail').hidden = true
  rebuild()
  draw(0)
  updateControls()
  status('')
  schedule()
}
function selectScene(value) {
  if (!['particles', 'orbit', 'flow'].includes(value)) {
    return
  }
  scene = value
  $(`input[name="scene"][value="${value}"]`).checked = true
  replay()
}
function selectProject(index) {
  selected = index
  const project = projects[index]
  $('#project-detail').hidden = !project
  if (project) {
    $('#project-name').textContent = project.name
    $('#project-tagline').textContent = project.tagline
    canvas.setAttribute(
      'aria-label',
      `${text.canvas}: ${project.name}. ${project.tagline}`,
    )
  }
  else {
    canvas.setAttribute('aria-label', text.canvas)
  }
  draw(0)
}
function setReduced() {
  reduced
    = query.get('motion') === '0' || data.motion === false || media.matches
  stop()
  draw(0)
  updateControls()
  schedule()
}
function coordinates(event) {
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
  .querySelectorAll('[name="scene"]')
  .forEach(input =>
    input.addEventListener('change', () => selectScene(input.value)),
  )
$('#density').addEventListener('input', (event) => {
  density = Number(event.target.value) / 100
  rebuild()
  draw(0)
  updateControls()
})
$('#speed').addEventListener('input', (event) => {
  speed = Number(event.target.value) / 100
  updateControls()
})
$('#palette').addEventListener('change', (event) => {
  palette = event.target.value
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
$('#download').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob) {
      status(text.exportFailed)
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
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
function release(event) {
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
    || event.target.closest('input,select,button,a')
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
  if (!context) {
    showFallback()
    return
  }
  try {
    const response = await fetch('/data.json')
    if (!response.ok) {
      throw new Error('data')
    }
    data = await response.json()
    if (!query.has('lang')) {
      lang = data.lang === 'en' ? 'en' : 'zh-CN'
    }
    projects = (data.catalog || []).map(project => ({
      slug: project.slug || project.id || project.packageName,
      name:
        project.locales?.[lang]?.name
        || project.name
        || project.slug
        || project.packageName,
      tagline: project.locales?.[lang]?.tagline || project.description || '',
      accent: /^#[0-9a-f]{6}$/i.test(project.accent)
        ? project.accent
        : '#69c7a5',
    }))
    // Fonts are shipped with the CLI; the scene has no remote startup dependency.
    await Promise.all([
      document.fonts.load('700 200px Syne'),
      document.fonts.load('450 12px "Geist Variable"'),
    ])
    ready = true
    localize()
    resize()
    setReduced()
    status('')
    document.documentElement.dataset.ready = 'true'
  }
  catch {
    status(text.failed)
    showFallback(text.failed)
  }
}
initialize()
