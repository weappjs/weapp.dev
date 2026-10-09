export interface GlyphInkMetrics {
  width: number
  actualBoundingBoxLeft: number
  actualBoundingBoxRight: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
}

/** Advance widths position letters; actual ink bounds center and fit the word. */
export function measureGlyphLayout(metrics: readonly GlyphInkMetrics[], tracking: number) {
  const positions: number[] = []
  let cursor = 0
  let left = Infinity
  let right = -Infinity
  let ascent = 0
  let descent = 0
  for (const glyph of metrics) {
    positions.push(cursor)
    left = Math.min(left, cursor - glyph.actualBoundingBoxLeft)
    right = Math.max(right, cursor + glyph.actualBoundingBoxRight)
    ascent = Math.max(ascent, glyph.actualBoundingBoxAscent)
    descent = Math.max(descent, glyph.actualBoundingBoxDescent)
    cursor += glyph.width + tracking
  }
  if (metrics.length === 0) {
    left = 0
    right = 0
  }
  return { positions, left, right, ascent, descent, width: right - left, height: ascent + descent }
}

/** Fit the ink rectangle plus planet radius and clearance inside the ellipse. */
export function ellipseWordmarkWidth(inkHeight: number, orbitRx: number, orbitRy: number, planetRadius: number, clearance = 21): number {
  const padding = planetRadius + clearance
  const vertical = (inkHeight / 2 + padding) / orbitRy
  if (!Number.isFinite(vertical) || orbitRx <= padding || vertical >= 1) {
    return 0
  }
  return Math.max(0, 2 * (orbitRx * Math.sqrt(1 - vertical ** 2) - padding))
}

/** Width and height both change with size, so solve the coupled fit together. */
export function fitGlyphLayout<T extends { width: number, height: number }>(
  maximumFontSize: number,
  measure: (fontSize: number) => T,
  widthForHeight: (inkHeight: number) => number,
): { fontSize: number, layout: T } | null {
  const fits = (layout: T) => layout.width > 0 && layout.height > 0 && layout.width <= widthForHeight(layout.height)
  const maximumLayout = measure(maximumFontSize)
  if (fits(maximumLayout)) {
    return { fontSize: maximumFontSize, layout: maximumLayout }
  }
  let lower = 0
  let upper = maximumFontSize
  let best: { fontSize: number, layout: T } | null = null
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const fontSize = (lower + upper) / 2
    const layout = measure(fontSize)
    if (fits(layout)) {
      lower = fontSize
      best = { fontSize, layout }
    }
    else {
      upper = fontSize
    }
  }
  return best
}
