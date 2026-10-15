import type { CliContext, CliInput, CliOptions } from '../types.js'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import QRCode from 'qrcode/lib/core/qrcode.js'
import SvgRenderer from 'qrcode/lib/renderer/svg-tag.js'
import { safeWrite, sanitize, t, write, writeError } from '../shared.js'

export function qrTerminal(content: string): string {
  const code = QRCode.create(content, { errorCorrectionLevel: 'M' })
  const margin = 4
  const size = code.modules.size + margin * 2
  const dark = (x: number, y: number): boolean => x >= margin && y >= margin && x < size - margin && y < size - margin && Boolean(code.modules.get(y - margin, x - margin))
  // White quiet zone and black modules remain unambiguous without ANSI colors.
  const lines: string[] = []
  for (let y = 0; y < size; y += 2) {
    let line = ''
    for (let x = 0; x < size; x++) {
      const top = !dark(x, y)
      const bottom = y + 1 >= size || !dark(x, y + 1)
      line += top ? (bottom ? '█' : '▀') : (bottom ? '▄' : ' ')
    }
    lines.push(line)
  }
  return lines.join('\n')
}
export async function readQrInput(stdin: Pick<CliInput, typeof Symbol.asyncIterator>, limit = 4096): Promise<string> {
  let content = ''
  let bytes = 0
  const decoder = new StringDecoder('utf8')
  const iterator = stdin[Symbol.asyncIterator]
  if (!iterator) {
    throw new Error('stdin-not-readable')
  }
  for await (const chunk of { [Symbol.asyncIterator]: () => iterator.call(stdin) }) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > limit) {
      throw new Error('too-large')
    }
    content += decoder.write(buffer)
  }
  content += decoder.end()
  return content.replace(/\r?\n$/, '')
}
export async function runQr(ctx: CliContext, args: string[], options: CliOptions): Promise<number> {
  if (args.length > 1 || (args.length === 0 && ctx.stdin.isTTY) || (options.force && !options.output)) {
    writeError(ctx, t(ctx, '用法：weapp qr <内容|-> [--output 文件.svg] [--force]，也可通过管道输入。', 'Usage: weapp qr <content|-> [--output file.svg] [--force], or pipe content to stdin.'))
    return 1
  }
  try {
    const content = !args.length || (args[0] === '-' && !ctx.hub) ? await readQrInput(ctx.stdin) : args[0]
    if (!content || Buffer.byteLength(content, 'utf8') > 4096) {
      throw new Error('content')
    }
    if (options.output) {
      if (path.extname(options.output).toLowerCase() !== '.svg') {
        writeError(ctx, t(ctx, '二维码输出须使用 .svg 扩展名。', 'QR output must use the .svg extension.'))
        return 1
      }
      const svg = SvgRenderer.render(QRCode.create(content, { errorCorrectionLevel: 'M' }), { margin: 4, color: { dark: '#000000', light: '#ffffff' } })
      try {
        await safeWrite(path.resolve(options.output), svg, options.force)
      }
      catch {
        writeError(ctx, t(ctx, '无法写入文件。已有文件请使用 --force；请检查父目录和权限。', 'Unable to write the file. Use --force for an existing file, and check the parent directory and permissions.'))
        return 1
      }
      write(ctx, `${t(ctx, '已保存', 'Saved')}: ${sanitize(path.resolve(options.output))}`)
    }
    else {
      // Fixed black/white colors ensure scanning also works on light terminals.
      const terminal = qrTerminal(content)
      write(ctx, ctx.color ? `\x1B[37;40m${terminal.replaceAll('\n', '\x1B[0m\n\x1B[37;40m')}\x1B[0m` : terminal)
    }
    return 0
  }
  catch {
    writeError(ctx, t(ctx, '二维码内容为空、过长或超出二维码容量。请缩短内容后重试。', 'QR content is empty, too long, or exceeds QR capacity. Shorten the content and retry.'))
    return 1
  }
}
