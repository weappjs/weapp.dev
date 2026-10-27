export type HeroPhase = 'logo' | 'assembling' | 'ready'

const PHASE_ATTRIBUTE = 'data-hero-phase'
const CHANGE_EVENT = 'hero-phase-change'

export function readHeroPhase(scope: HTMLElement): HeroPhase {
  const phase = scope.getAttribute(PHASE_ATTRIBUTE)
  return phase === 'assembling' || phase === 'ready' ? phase : 'logo'
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

/** Overlapping layers finish within the existing 320ms active-time window. */
export function heroRevealState(reveal: number): { orbit: number, planets: number, labels: number } {
  const time = (Number.isFinite(reveal) ? Math.min(1, Math.max(0, reveal)) : 0) * 320
  return {
    orbit: Math.min(1, time / 180),
    planets: Math.min(1, Math.max(0, (time - 60) / 200)),
    labels: Math.min(1, Math.max(0, (time - 160) / 160)),
  }
}

/** The same active clock advances assembly and the subsequent planet reveal. */
export function heroEntranceState(elapsed: number): {
  progress: number
  phase: HeroPhase
  reveal: number
  settled: boolean
} {
  const activeTime = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
  return {
    progress: Math.min(1, Math.max(0, (activeTime - 700) / 1500)),
    phase: activeTime < 700 ? 'logo' : activeTime < 2200 ? 'assembling' : 'ready',
    reveal: Math.min(1, Math.max(0, (activeTime - 2200) / 320)),
    settled: activeTime >= 2520,
  }
}
