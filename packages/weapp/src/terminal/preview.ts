import type { Template } from '../templates.js'
import { TEMPLATES } from '../templates.js'
import { graphemes } from './session.js'

export interface ProjectPreview {
  name: string
  template: Template
}
export interface PreviewPoint { x: number, y: number, group: number }

/** The preview uses the project name, never the machine-specific parent path. */
export function projectPreview(directory = '', template = 'default'): ProjectPreview {
  const name = directory.trim().split(/[\\/]/).filter(Boolean).at(-1) || 'my-app'
  return { name: graphemes(name).slice(0, 64).join(''), template: TEMPLATES.find(value => value === template) || 'default' }
}

/** Equal-size normalized point sets let template changes share one short morph. */
export function previewPoints(template: Template): PreviewPoint[] {
  return Array.from({ length: 180 }, (_, index) => {
    const turn = index / 180 * Math.PI * 2
    let x: number
    let y: number
    let group = 0
    if (template === 'wevu') {
      x = Math.sin(turn) * 0.4
      y = Math.sin(turn * 2) * 0.29
      group = Math.floor(index / 90)
    }
    else if (template === 'react') {
      group = Math.floor(index / 60)
      const angle = index % 60 / 60 * Math.PI * 2
      const rotation = group * Math.PI / 3
      const px = Math.cos(angle) * 0.41
      const py = Math.sin(angle) * 0.13
      x = px * Math.cos(rotation) - py * Math.sin(rotation)
      y = px * Math.sin(rotation) + py * Math.cos(rotation)
    }
    else if (template === 'tailwindcss') {
      group = Math.floor(index / 36)
      const progress = index % 36 / 35
      x = (progress - 0.5) * 0.8
      y = (group - 2) * 0.115 + Math.sin(progress * Math.PI * 2) * 0.055
    }
    else if (template === 'multi-platform-sfc') {
      group = Math.floor(index / 36)
      const angle = group / 5 * Math.PI * 2 - Math.PI / 2
      const progress = index % 36 / 35
      const radius = progress < 0.65 ? progress / 0.65 * 0.34 : 0.34
      const halo = progress < 0.65 ? 0 : (progress - 0.65) / 0.35 * Math.PI * 2
      x = Math.cos(angle) * radius + (halo ? Math.cos(halo) * 0.065 : 0)
      y = Math.sin(angle) * radius + (halo ? Math.sin(halo) * 0.065 : 0)
    }
    else {
      x = Math.cos(turn) * 0.41
      y = Math.sin(turn) * 0.29
    }
    return { x: x + 0.5, y: y + 0.5, group }
  })
}
