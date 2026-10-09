interface LoadedFontFace {
  family: string
  status: FontFaceLoadStatus
  weight: string
}

interface WordmarkFontSet {
  load: (font: string, text?: string) => Promise<LoadedFontFace[]>
}

/** A missing or late brand font must never turn into an animated fallback face. */
export function loadWordmarkFont(fonts: WordmarkFontSet | undefined, wordmark: string, signal?: AbortSignal): Promise<boolean> {
  if (!fonts || typeof fonts.load !== 'function' || signal?.aborted) {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: () => void
    function finish(loaded: boolean) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(loaded)
    }
    onAbort = () => finish(false)
    timer = setTimeout(finish, 3000, false)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      void fonts.load('700 100px "Syne"', wordmark).then((faces) => {
        finish(faces.some((face) => {
          const weights = face.weight === 'bold' ? [700] : face.weight.split(/\s+/).map(Number)
          const supportsWeight = weights.length === 1 ? weights[0] === 700 : weights[0]! <= 700 && weights[1]! >= 700
          return face.family.replace(/["']/g, '').trim() === 'Syne' && face.status === 'loaded' && supportsWeight
        }))
      }, () => finish(false))
    }
    catch {
      finish(false)
    }
  })
}
