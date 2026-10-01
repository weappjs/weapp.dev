import type { CodePart } from './code'

export const styleColors = [
  { id: 'green', classes: 'bg-emerald-700 text-white', swatch: '#047857' },
  { id: 'blue', classes: 'bg-blue-700 text-white', swatch: '#1d4ed8' },
  { id: 'rose', classes: 'bg-rose-700 text-white', swatch: '#be123c' },
] as const
export const styleRadii = ['rounded-none', 'rounded-md', 'rounded-lg'] as const
export interface StyleState { color: number, radius: number, compact: boolean }
export const defaultStyle: StyleState = { color: 0, radius: 1, compact: false }

export function buttonClasses(state: StyleState) {
  return `${styleColors[state.color].classes} ${styleRadii[state.radius]} ${state.compact ? 'px-4 py-2' : 'px-6 py-3'} font-medium`
}

export function styleCode(state: StyleState, label: string): CodePart[] {
  const classes = buttonClasses(state).split(' ')
  return [
    { text: '<button', tone: 'keyword' },
    { text: '\n  class=' },
    { text: `"${classes.slice(0, 2).join(' ')}\n    ${classes.slice(2, 5).join(' ')}\n    ${classes.slice(5).join(' ')}"`, tone: 'string' },
    { text: '>\n  ' },
    { text: label },
    { text: '\n</button>', tone: 'keyword' },
  ]
}
