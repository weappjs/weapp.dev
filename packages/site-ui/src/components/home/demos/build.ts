import type { CodePart } from './code'

// weapp-vite add5d6c7: website/guide/multi-platform.md, multi-platform template.
export const buildTargets = [
  { id: 'weapp', markup: 'wxml', style: 'wxss' },
  { id: 'alipay', markup: 'axml', style: 'acss' },
  { id: 'tt', markup: 'ttml', style: 'ttss' },
] as const

export function buildExample(index: number) {
  const target = buildTargets[index]
  const directory = `dist/${target.id}/dist`
  const command = `pnpm exec wv build -p ${target.id}`
  const parts: CodePart[] = [
    { text: 'import', tone: 'keyword' },
    { text: ' { defineConfig } ' },
    { text: 'from ', tone: 'keyword' },
    { text: '\'weapp-vite\'\n\n', tone: 'string' },
    { text: 'export default ', tone: 'keyword' },
    { text: 'defineConfig({\n  weapp: {\n    multiPlatform: {\n      enabled: true,\n      targets: [' },
    { text: `'${target.id}'`, tone: 'string' },
    { text: '],\n    },\n  },\n})' },
  ]
  return { ...target, directory, command, parts, files: [`index.${target.markup}`, `index.${target.style}`, 'index.js', 'index.json'] }
}
