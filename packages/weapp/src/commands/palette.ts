import type { CliContext, CliOptions } from '../types.js'
import path from 'node:path'
import { safeWrite, sanitize, t, write, writeError } from '../shared.js'

export interface PaletteColor {
  step: number
  hex: string
  contrast: { black: number, white: number }
  text: '#000000' | '#ffffff'
}
export interface Palette {
  base: string
  colors: PaletteColor[]
}
export function parseHex(value: string): number[] {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value || '')
  if (!match) {
    throw new Error('hex')
  }
  const hex = match[1].length === 3 ? [...match[1]].map(char => char + char).join('') : match[1]
  return [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
}
function toHex(rgb: readonly number[]): string {
  return `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}
export function luminance(rgb: readonly number[]): number {
  const channels = rgb.map((value) => {
    const v = value / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
export function generatePalette(value: string): Palette {
  const base = parseHex(value)
  const colors: PaletteColor[] = [0.75, 0.4, 0, -0.25, -0.5].map((amount, index) => {
    const rgb = base.map(channel => Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount)))
    const lum = luminance(rgb)
    const black = (lum + 0.05) / 0.05
    const white = 1.05 / (lum + 0.05)
    return { step: [100, 300, 500, 700, 900][index], hex: toHex(rgb), contrast: { black: Number(black.toFixed(2)), white: Number(white.toFixed(2)) }, text: black >= white ? '#000000' : '#ffffff' }
  })
  return { base: toHex(base), colors }
}
export function paletteCss(palette: Palette): string {
  return `:root {\n${palette.colors.map(color => `  --weapp-${color.step}: ${color.hex};`).join('\n')}\n}\n`
}
export function paletteText(palette: Palette, ctx: Pick<CliContext, 'color' | 'lang'>): string {
  return palette.colors.map((color) => {
    const swatch = ctx.color ? `\x1B[48;2;${parseHex(color.hex).join(';')}m  \x1B[0m ` : ''
    return `${swatch}${color.step}  ${color.hex}  ${t(ctx, '黑字', 'black')} ${color.contrast.black}:1  ${t(ctx, '白字', 'white')} ${color.contrast.white}:1  ${t(ctx, '推荐', 'recommended')} ${color.text}`
  }).join('\n')
}
export async function runPalette(ctx: CliContext, args: string[], options: CliOptions): Promise<number> {
  if (args.length !== 1 || (options.format && !['css', 'json', 'text'].includes(options.format)) || (options.json && options.format && options.format !== 'json') || (options.force && !options.output)) {
    writeError(ctx, t(ctx, '用法：weapp palette <HEX> [--format css|json|text] [--json] [--output 文件] [--force]', 'Usage: weapp palette <HEX> [--format css|json|text] [--json] [--output file] [--force]'))
    return 1
  }
  let palette: Palette
  try {
    palette = generatePalette(args[0])
  }
  catch {
    writeError(ctx, t(ctx, '颜色须为三位或六位 HEX，例如 #2ba245。', 'Use a three- or six-digit HEX color, such as #2ba245.'))
    return 1
  }
  const format = options.json ? 'json' : options.format || (options.output ? 'css' : 'text')
  const output = format === 'css' ? paletteCss(palette) : format === 'json' ? `${JSON.stringify(palette, null, 2)}\n` : `${paletteText(palette, { ...ctx, color: options.output ? false : ctx.color })}\n`
  if (options.output) {
    try {
      await safeWrite(path.resolve(options.output), output, options.force)
      write(ctx, format === 'json' ? JSON.stringify({ ...palette, output: path.resolve(options.output) }) : `${t(ctx, '已保存', 'Saved')}: ${sanitize(path.resolve(options.output))}`)
    }
    catch {
      writeError(ctx, t(ctx, '无法写入文件。已有文件请使用 --force；请检查父目录和权限。', 'Unable to write the file. Use --force for an existing file, and check the parent directory and permissions.'))
      return 1
    }
  }
  else {
    write(ctx, output.trimEnd())
  }
  return 0
}
