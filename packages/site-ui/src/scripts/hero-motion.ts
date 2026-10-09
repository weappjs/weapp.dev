const PAUSED_ATTRIBUTE = 'data-hero-motion-paused'
const CHANGE_EVENT = 'hero-motion-change'

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
