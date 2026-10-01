import type { CodePart } from './code'

// Varo d00ea30f: README.md, "Install editable source".
export const registryComponents = ['button', 'input', 'card'] as const
export type RegistryComponent = typeof registryComponents[number]

export function registryCode(selected: readonly RegistryComponent[]): CodePart[] {
  const ordered = registryComponents.filter(name => selected.includes(name))
  if (!ordered.length) {
    throw new Error('Select at least one registry component')
  }
  return [
    { text: 'pnpm dlx ', tone: 'keyword' },
    { text: '@varo-ui/cli', tone: 'string' },
    { text: ' add \\\n  --target weapp \\\n  ' },
    { text: ordered.join(' '), tone: 'string' },
  ]
}
