/** Exponential smoothing stays consistent when frames arrive at different rates. */
export function smoothValue(current: number, target: number, deltaMs: number, timeConstantMs: number): number {
  if (deltaMs <= 0) {
    return current
  }
  if (timeConstantMs <= 0) {
    return target
  }
  return current + (target - current) * -Math.expm1(-deltaMs / timeConstantMs)
}

export function constrainDisplacement(x: number, y: number, radius: number): { x: number, y: number } {
  if (radius <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0 }
  }
  const distance = Math.hypot(x, y)
  if (distance === 0 || distance <= radius) {
    return { x, y }
  }
  const scale = radius / distance
  return { x: x * scale, y: y * scale }
}

/**
 * Safe movement radii for the centers of pixels inside an RGBA glyph mask.
 * The two-pass chamfer transform takes linear time. Octile distance can exceed
 * Euclidean distance by at most this factor; dividing by it and subtracting a
 * pixel's half diagonal keeps every radius inside the glyph's alpha boundary.
 */
export function glyphSafeRadii(alpha: Uint8ClampedArray, width: number, height: number): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0 || alpha.length < width * height * 4) {
    throw new RangeError('Glyph mask dimensions must match its RGBA pixels')
  }
  const distance = new Float32Array(width * height)
  const diagonal = Math.SQRT2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      // Include the canvas exterior even when the mask touches its edges.
      distance[index] = alpha[index * 4 + 3]! >= 36
        ? Math.min(x + 1, width - x, y + 1, height - y)
        : 0
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      let closest = distance[index]!
      if (x > 0) {
        closest = Math.min(closest, distance[index - 1]! + 1)
      }
      if (y > 0) {
        closest = Math.min(closest, distance[index - width]! + 1)
        if (x > 0) {
          closest = Math.min(closest, distance[index - width - 1]! + diagonal)
        }
        if (x + 1 < width) {
          closest = Math.min(closest, distance[index - width + 1]! + diagonal)
        }
      }
      distance[index] = closest
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const index = y * width + x
      let closest = distance[index]!
      if (x + 1 < width) {
        closest = Math.min(closest, distance[index + 1]! + 1)
      }
      if (y + 1 < height) {
        closest = Math.min(closest, distance[index + width]! + 1)
        if (x > 0) {
          closest = Math.min(closest, distance[index + width - 1]! + diagonal)
        }
        if (x + 1 < width) {
          closest = Math.min(closest, distance[index + width + 1]! + diagonal)
        }
      }
      distance[index] = closest
    }
  }
  const maximumStretch = Math.sqrt(4 - 2 * Math.SQRT2)
  for (let index = 0; index < distance.length; index++) {
    distance[index] = Math.max(0, distance[index]! / maximumStretch - Math.SQRT1_2)
  }
  return distance
}

export function createActiveClock(initialElapsed = 0): {
  advance: (now: number) => number
  setRunning: (running: boolean, now: number) => void
  current: () => number
} {
  let elapsed = initialElapsed
  let previous: number | undefined
  let running = true
  function advance(now: number): number {
    if (!Number.isFinite(now)) {
      return elapsed
    }
    if (previous !== undefined && running) {
      elapsed += Math.max(0, now - previous)
    }
    previous = previous === undefined ? now : Math.max(previous, now)
    return elapsed
  }
  return {
    advance,
    setRunning(nextRunning, now) {
      advance(now)
      running = nextRunning
    },
    current: () => elapsed,
  }
}

export function particleFrameInterval(desktop: boolean, assembled: boolean, interacting: boolean): number {
  if (!desktop) {
    return 100
  }
  return 1000 / (assembled && !interacting ? 30 : 60)
}
