import { constrainDisplacement, smoothValue } from './hero-particle-motion'

interface Point {
  x: number
  y: number
}

export interface HeroBackgroundSnapshot {
  position: Point
  target: Point
}

/** Active-time input smoothing; the existing renderer owns scheduling and pause. */
export function createHeroBackgroundMotion(snapshot?: HeroBackgroundSnapshot) {
  let position = snapshot ? { ...snapshot.position } : { x: 0, y: 0 }
  let target = snapshot ? { ...snapshot.target } : { x: 0, y: 0 }
  const epsilon = 0.0001

  return {
    setPointer(x: number, y: number, width: number, height: number) {
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        target = { x: 0, y: 0 }
        return
      }
      // Opposite camera movement creates depth without translating the stage.
      target = constrainDisplacement(1 - x / width * 2, 1 - y / height * 2, 1)
    },
    release() {
      target = { x: 0, y: 0 }
    },
    reset() {
      position = { x: 0, y: 0 }
      target = { x: 0, y: 0 }
    },
    advance(deltaMs: number): Point {
      if (deltaMs <= 0) {
        return position
      }
      // Three time constants converge by 95% in about 250ms of active time.
      position = {
        x: smoothValue(position.x, target.x, deltaMs, 250 / 3),
        y: smoothValue(position.y, target.y, deltaMs, 250 / 3),
      }
      if (Math.hypot(position.x - target.x, position.y - target.y) < epsilon) {
        position = { ...target }
      }
      return position
    },
    get moving() {
      return Math.hypot(position.x - target.x, position.y - target.y) >= epsilon
    },
    snapshot(): HeroBackgroundSnapshot {
      return { position: { ...position }, target: { ...target } }
    },
  }
}
