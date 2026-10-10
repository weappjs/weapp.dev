export type HeroPhase = 'stars' | 'assembling' | 'ready'

const PHASE_ATTRIBUTE = 'data-hero-phase'
const CHANGE_EVENT = 'hero-phase-change'

export function readHeroPhase(scope: HTMLElement): HeroPhase {
  const phase = scope.getAttribute(PHASE_ATTRIBUTE)
  return phase === 'assembling' || phase === 'ready' ? phase : 'stars'
}

export function setHeroPhase(scope: HTMLElement, phase: HeroPhase): void {
  if (readHeroPhase(scope) === phase) {
    return
  }
  scope.setAttribute(PHASE_ATTRIBUTE, phase)
  scope.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeHeroPhase(scope: HTMLElement, listener: (phase: HeroPhase) => void): () => void {
  const notify = () => listener(readHeroPhase(scope))
  scope.addEventListener(CHANGE_EVENT, notify)
  notify()
  return () => scope.removeEventListener(CHANGE_EVENT, notify)
}

/** The same active clock advances assembly and the subsequent planet reveal. */
export function heroEntranceState(elapsed: number): {
  progress: number
  phase: 'assembling' | 'ready'
  reveal: number
  settled: boolean
} {
  const activeTime = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
  return {
    progress: Math.min(1, activeTime / 1500),
    phase: activeTime < 1500 ? 'assembling' : 'ready',
    reveal: Math.min(1, Math.max(0, (activeTime - 1500) / 320)),
    settled: activeTime >= 1820,
  }
}
