// eslint-disable-next-line e18e/ban-dependencies -- Version 7 preserves the CLI's Node 18 baseline.
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../src/templates.js'
import { previewPoints, projectPreview } from '../src/terminal/preview.js'
import { renderProjectPreview } from '../src/terminal/scenes.js'

describe('project constellations', () => {
  it('seeds the same project independently of its machine-specific parent path', () => {
    const first = projectPreview('/home/developer/my-app', 'wevu')
    expect(first).toEqual(projectPreview('C:\\projects\\my-app', 'wevu'))
    const options = { width: 65, height: 16, from: first, to: first }
    expect(renderProjectPreview(options)).toEqual(renderProjectPreview(options))
    const other = projectPreview('/home/developer/another-app', 'wevu')
    expect(renderProjectPreview(options)).not.toEqual(renderProjectPreview({ ...options, from: other, to: other }))
  })

  it('gives all five templates distinct bounded structures', () => {
    const structures = TEMPLATES.map(template => previewPoints(template))
    expect(new Set(structures.map(points => JSON.stringify(points))).size).toBe(5)
    for (const points of structures) {
      expect(points).toHaveLength(180)
      expect(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true)
    }
    const frames = TEMPLATES.map((template) => {
      const preview = projectPreview('my-app', template)
      return renderProjectPreview({ width: 65, height: 16, from: preview, to: preview }).join('\n')
    })
    expect(new Set(frames).size).toBe(5)
  })

  it('morphs continuously between complete static compositions', () => {
    const from = projectPreview('my-app', 'default')
    const to = projectPreview('my-app', 'react')
    const options = { width: 65, height: 16, from, to }
    const beginning = renderProjectPreview({ ...options, transition: 0 })
    const end = renderProjectPreview({ ...options, transition: 1 })
    expect(beginning).toEqual(renderProjectPreview({ ...options, to: from }))
    expect(end).toEqual(renderProjectPreview({ ...options, from: to }))
    expect(renderProjectPreview({ ...options, transition: 0.5 })).not.toEqual(beginning)
    expect(renderProjectPreview({ ...options, transition: 0.5 })).not.toEqual(end)
  })

  it.each([[19, 3], [42, 7], [100, 25]])('fits monochrome output into %i × %i cells', (width, height) => {
    const preview = projectPreview('a-very-long-project-name-for-a-small-terminal', 'multi-platform-sfc')
    const lines = renderProjectPreview({ width, height, from: preview, to: preview })
    expect(lines).toHaveLength(height)
    expect(lines.every(line => line.length <= width)).toBe(true)
    expect(lines.join('')).not.toContain('\u001B')
  })

  it.each([19, 42])('keeps Chinese and emoji names intact within %i terminal cells', (width) => {
    const preview = projectPreview('中文👩🏽‍💻计划🚀', 'react')
    const lines = renderProjectPreview({ width, height: 7, from: preview, to: preview })
    expect(lines.every(line => stringWidth(line) <= width)).toBe(true)
    expect(lines.join('\n')).toContain(preview.name)
    expect(projectPreview(`${'a'.repeat(63)}👩🏽‍💻tail`).name).toBe(`${'a'.repeat(63)}👩🏽‍💻`)
  })

  it('finishes the success expansion at its static final composition', () => {
    const preview = projectPreview('my-app', 'react')
    const options = { width: 65, height: 16, from: preview, to: preview }
    const beginning = renderProjectPreview({ ...options, celebration: 0 })
    const middle = renderProjectPreview({ ...options, celebration: 0.5 })
    const final = renderProjectPreview({ ...options, celebration: 1 })
    expect(beginning).not.toEqual(middle)
    expect(middle).not.toEqual(final)
    expect(final).toEqual(renderProjectPreview({ ...options, celebration: 2 }))
    expect(final.every(line => stringWidth(line) <= options.width)).toBe(true)
  })
})
