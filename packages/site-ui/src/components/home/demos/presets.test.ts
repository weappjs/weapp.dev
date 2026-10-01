import { describe, expect, it } from 'vitest'
import { buildExample } from './build'
import { codeText } from './code'
import { registryCode } from './registry'
import { buttonClasses, styleCode } from './style'

describe('homepage demo presets', () => {
  it('prints exactly the classes used by every style preview', () => {
    for (const color of [0, 1, 2]) {
      for (const radius of [0, 1, 2]) {
        for (const compact of [false, true]) {
          const state = { color, radius, compact }
          const code = codeText(styleCode(state, 'Build'))
          const printedClasses = code.match(/class="([^"]+)"/)![1].replace(/\s+/g, ' ')
          expect(printedClasses).toBe(buttonClasses(state))
          expect(code).toContain('Build')
        }
      }
    }
  })

  it('keeps platform config, CLI command and native file types aligned', () => {
    const expected = [
      { id: 'weapp', markup: 'wxml', style: 'wxss' },
      { id: 'alipay', markup: 'axml', style: 'acss' },
      { id: 'tt', markup: 'ttml', style: 'ttss' },
    ]
    expected.forEach((target, index) => {
      const example = buildExample(index)
      expect(codeText(example.parts)).toContain(`targets: ['${target.id}']`)
      expect(example.command).toBe(`pnpm exec wv build -p ${target.id}`)
      expect(example.directory).toBe(`dist/${target.id}/dist`)
      expect(example.files).toEqual([`index.${target.markup}`, `index.${target.style}`, 'index.js', 'index.json'])
    })
  })

  it('emits deterministic registry commands and rejects an empty selection', () => {
    expect(codeText(registryCode(['card', 'button', 'button']))).toBe('pnpm dlx @varo-ui/cli add \\\n  --target weapp \\\n  button card')
    expect(codeText(registryCode(['input']))).toContain('--target weapp \\\n  input')
    expect(() => registryCode([])).toThrow('Select at least one')
  })
})
