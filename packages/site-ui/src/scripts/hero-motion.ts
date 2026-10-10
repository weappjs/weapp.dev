import { setHeroPhase } from './hero-phase'

const PAUSED_ATTRIBUTE = 'data-hero-motion-paused'
const CHANGE_EVENT = 'hero-motion-change'
const REPLAY_ATTRIBUTE = 'data-hero-replay-version'
const REPLAY_EVENT = 'hero-replay'

/** User intent belongs to the hero scope, independently of either renderer. */
export function readHeroMotionPaused(scope: HTMLElement): boolean {
  return scope.hasAttribute(PAUSED_ATTRIBUTE)
}

export function setHeroMotionPaused(scope: HTMLElement, paused: boolean): void {
  if (readHeroMotionPaused(scope) === paused) {
    return
  }
  scope.toggleAttribute(PAUSED_ATTRIBUTE, paused)
  scope.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeHeroMotionPaused(scope: HTMLElement, listener: (paused: boolean) => void): () => void {
  const notify = () => listener(readHeroMotionPaused(scope))
  scope.addEventListener(CHANGE_EVENT, notify)
  notify()
  return () => scope.removeEventListener(CHANGE_EVENT, notify)
}

/** Persist requests across renderer reconnections without coupling their lifetimes. */
export function readHeroReplayVersion(scope: HTMLElement): number {
  const version = Number(scope.getAttribute(REPLAY_ATTRIBUTE))
  return Number.isSafeInteger(version) && version >= 0 ? Math.max(0, version) : 0
}

export function requestHeroReplay(scope: HTMLElement): number {
  const current = readHeroReplayVersion(scope)
  // Keep a request distinguishable and safe even when an externally stored
  // counter reaches its limit. Consumers deduplicate by equality, not ordering.
  const version = current === Number.MAX_SAFE_INTEGER ? 1 : current + 1
  scope.setAttribute(REPLAY_ATTRIBUTE, String(version))
  scope.removeAttribute('data-particles-active')
  scope.removeAttribute('data-particles-ready')
  scope.style.removeProperty('--hero-planet-reveal')
  setHeroPhase(scope, 'logo')
  scope.dispatchEvent(new Event(REPLAY_EVENT))
  // A paused renderer must reset its phase before resuming or drawing a frame.
  setHeroMotionPaused(scope, false)
  return version
}

export function subscribeHeroReplay(scope: HTMLElement, listener: (version: number) => void): () => void {
  const notify = () => listener(readHeroReplayVersion(scope))
  scope.addEventListener(REPLAY_EVENT, notify)
  notify()
  return () => scope.removeEventListener(REPLAY_EVENT, notify)
}
