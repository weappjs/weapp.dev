import type { ProjectVisual } from '../src/types/project'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { projectAssetsDirectory, projectMediaSourceDirectory, showcasesDirectory } from '@weapp/project-catalog/paths'
import sharp from 'sharp'

const sourceRoot = pathToFileURL(`${projectMediaSourceDirectory}/showcase/`)
const publicRoot = pathToFileURL(`${projectAssetsDirectory}/media/showcase/`)
const contentRoot = pathToFileURL(`${showcasesDirectory}/`)
const manifest = JSON.parse(await readFile(new URL('captures.json', sourceRoot), 'utf8'))
const scenes = [
  {
    name: 'retail-home',
    project: 'weapp-tailwindcss',
    crop: { top: 91, height: 574 },
    locales: {
      'zh-CN': { alt: 'TDesign 零售参考案例的首页，包含搜索、轮播和服装商品列表', caption: 'TDesign 原生零售参考案例。界面来自 TDesign，作为样式与组件组合的参考；非 Tailwind 移植版截图。' },
      'en': { alt: 'TDesign retail reference home with search, a banner and apparel products', caption: 'Native TDesign retail reference for styling and component composition. UI by TDesign; not a capture of the Tailwind port.' },
    },
  },
  {
    name: 'retail-detail',
    project: 'weapp-vite',
    crop: { top: 91, height: 590 },
    locales: {
      'zh-CN': { alt: 'weapp-vite 构建的 TDesign 原生零售商品详情，展示连衣裙、价格和商品信息', caption: '由 weapp-vite 构建的 TDesign 原生零售案例：商品详情。' },
      'en': { alt: 'TDesign native retail product detail built with weapp-vite, showing a dress, price and product information', caption: 'TDesign native retail example built with weapp-vite: product detail.' },
    },
  },
  {
    name: 'retail-specs',
    project: 'weapp-vite',
    crop: { top: 327, height: 450 },
    locales: {
      'zh-CN': { alt: 'TDesign 零售案例中的真实规格弹层，包含颜色、S M L 尺码、数量和购买按钮', caption: '打开规格选择后的实际状态，支持颜色、尺码与数量选择。' },
      'en': { alt: 'Actual TDesign retail specification popup with color, S M L sizes, quantity and purchase buttons', caption: 'The actual specification picker with color, size and quantity controls.' },
    },
  },
  {
    name: 'varo-agent-chat',
    project: 'varo',
    crop: undefined,
    locales: {
      'zh-CN': { alt: 'Varo AgentChat 组件演示，包含对话历史、registry.inspect 工具事件、确认区域和输入框', caption: 'Varo AgentChat 组件演示：对话、工具事件、审批与输入区。' },
      'en': { alt: 'Varo AgentChat demo with message history, a registry.inspect tool event, approval controls and composer', caption: 'Varo AgentChat component demo: conversation, tool events, approvals, and composer.' },
    },
  },
]

await mkdir(publicRoot, { recursive: true })
await mkdir(contentRoot, { recursive: true })
const showcases: Record<string, ProjectVisual[]> = {}
const generated = []
for (const scene of scenes) {
  const capture = manifest.captures.find((item: { name: string }) => item.name === scene.name)
  assert(capture, `Missing capture: ${scene.name}`)
  const source = await readFile(new URL(`${scene.name}.png`, sourceRoot))
  assert.equal(createHash('sha256').update(source).digest('hex'), capture.sha256, `${scene.name}: source changed since capture`)
  let pipeline = sharp(source)
  let crop
  if (scene.crop) {
    // Crop the application content out of the native simulator chrome at its recorded scale.
    assert.equal(capture.viewport.screenWidth, 390, 'Reframe native captures when the simulator viewport changes.')
    const scale = capture.width / capture.viewport.screenWidth
    crop = { left: 0, top: Math.round(scene.crop.top * scale), width: capture.width, height: Math.round(scene.crop.height * scale) }
    pipeline = pipeline.extract(crop)
  }
  const original = await pipeline.png().toBuffer()
  const metadata = await sharp(original).metadata()
  assert(metadata.width && metadata.height)
  const variants = []
  for (const width of [...new Set([390, 780, metadata.width].filter(width => width <= metadata.width))].sort((a, b) => a - b)) {
    const basename = `${scene.name}-${width}`
    const resized = sharp(original).resize({ width, withoutEnlargement: true })
    await resized.clone().webp({ quality: 88, effort: 5 }).toFile(fileURLToPath(new URL(`${basename}.webp`, publicRoot)))
    await resized.clone().avif({ quality: 65, effort: 5 }).toFile(fileURLToPath(new URL(`${basename}.avif`, publicRoot)))
    variants.push({ src: `/media/showcase/${basename}.webp`, avif: `/media/showcase/${basename}.avif`, width })
  }
  const largest = variants.at(-1)!
  const visual: ProjectVisual = { ...largest, height: metadata.height, variants, locales: scene.locales }
  ;(showcases[scene.project] ??= []).push(visual)
  generated.push({ ...capture, crop, output: visual })
}
for (const [project, showcase] of Object.entries(showcases)) {
  const file = new URL(`${project}.json`, contentRoot)
  await writeFile(file, `${JSON.stringify({ images: showcase }, null, 2)}\n`)
}
await writeFile(new URL('sources.json', publicRoot), `${JSON.stringify({ capturedAt: manifest.capturedAt, scenes: generated }, null, 2)}\n`)
console.log(`Generated ${generated.length} showcases and their responsive WebP/AVIF variants.`)
