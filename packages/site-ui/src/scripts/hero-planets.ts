import { readHeroMotionPaused, setHeroMotionPaused, subscribeHeroMotionPaused } from './hero-motion'
import { subscribeHeroPhase } from './hero-phase'

export interface PlanetEnvironment {
  desktop: boolean
  reducedMotion: boolean
  visible: boolean
  pageHidden: boolean
  revealed: boolean
}

export interface PlanetPresentation {
  activeId: string | null
  orbitRunning: boolean
  controlsVisible: boolean
  userPaused: boolean
}

interface PlanetBounds {
  left: number
  top: number
  width: number
  height: number
}

/** Conic masks start at the top; use rendered centers rather than ellipse path progress. */
export function getPlanetOrbitHighlightAngle(planet: PlanetBounds | undefined, orbit: PlanetBounds): number | null {
  if (!planet || ![planet.left, planet.top, planet.width, planet.height, orbit.left, orbit.top, orbit.width, orbit.height].every(Number.isFinite)
    || planet.width <= 0 || planet.height <= 0 || orbit.width <= 0 || orbit.height <= 0) {
    return null
  }
  const dx = planet.left + planet.width / 2 - (orbit.left + orbit.width / 2)
  const dy = planet.top + planet.height / 2 - (orbit.top + orbit.height / 2)
  if (dx === 0 && dy === 0) {
    return null
  }
  return (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360
}

const INTRO_DELAY = 3000
const HIGHLIGHT_DURATION = 4000

/** Schedule attention without moving keyboard focus or catching up after a pause. */
export function createPlanetController(
  projectIds: readonly string[],
  present: (state: PlanetPresentation) => void,
  initialEnvironment: PlanetEnvironment,
  initiallyPaused = false,
) {
  let environment = { ...initialEnvironment }
  let focusId: string | null = null
  let hoverId: string | null = null
  let automaticId: string | null = null
  let userPaused = initiallyPaused
  let cursor = -1
  let timer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  const eligible = () => environment.desktop && !environment.reducedMotion
    && environment.visible && !environment.pageHidden && environment.revealed
  const interacting = () => focusId !== null || hoverId !== null
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const render = () => {
    if (destroyed) {
      return
    }
    const activeId = environment.desktop && environment.revealed ? focusId ?? hoverId ?? automaticId : null
    present({
      activeId,
      orbitRunning: environment.revealed && environment.visible && !environment.pageHidden && !environment.reducedMotion
        && !userPaused && !interacting() && automaticId === null,
      controlsVisible: !environment.reducedMotion,
      userPaused,
    })
  }
  const wait = () => {
    if (destroyed || !eligible() || userPaused || interacting() || projectIds.length === 0) {
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      cursor = (cursor + 1) % projectIds.length
      automaticId = projectIds[cursor]!
      render()
      timer = setTimeout(() => {
        timer = undefined
        automaticId = null
        render()
        wait()
      }, HIGHLIGHT_DURATION)
    }, INTRO_DELAY)
  }
  const restart = () => {
    cancel()
    automaticId = null
    render()
    wait()
  }
  const setInteraction = (kind: 'focus' | 'hover', id: string | null) => {
    if (destroyed || !environment.revealed || (kind === 'focus' ? focusId : hoverId) === id) {
      return
    }
    if (kind === 'focus') {
      focusId = id
    }
    else {
      hoverId = id
    }
    cancel()
    // A user pause preserves the selected automatic project beneath manual inspection.
    if (!userPaused) {
      automaticId = null
    }
    render()
    wait()
  }
  const setPaused = (paused: boolean) => {
    if (destroyed || userPaused === paused) {
      return
    }
    userPaused = paused
    cancel()
    if (userPaused) {
      render()
    }
    else {
      restart()
    }
  }

  render()
  wait()

  return {
    setEnvironment(next: Partial<PlanetEnvironment>) {
      if (destroyed) {
        return
      }
      const previous = eligible()
      environment = { ...environment, ...next }
      if (!environment.revealed) {
        focusId = null
        hoverId = null
      }
      if (!eligible()) {
        cancel()
        automaticId = null
        render()
      }
      else if (!previous) {
        restart()
      }
      else {
        render()
      }
    },
    setFocus(id: string | null) {
      setInteraction('focus', id)
    },
    setHover(id: string | null) {
      setInteraction('hover', id)
    },
    setPaused,
    togglePause() {
      setPaused(!userPaused)
    },
    destroy() {
      destroyed = true
      cancel()
    },
  }
}

export function defineHeroPlanets() {
  if (customElements.get('hero-planets')) {
    return
  }
  class HeroPlanets extends HTMLElement {
    #cleanup: (() => void) | undefined

    connectedCallback() {
      if (this.#cleanup) {
        return
      }
      const screen = this.closest<HTMLElement>('.home-hero-screen')
      if (!screen) {
        return
      }
      const planets = [...this.querySelectorAll<HTMLAnchorElement>('.home-hero-planet')]
      const orbit = this.querySelector<HTMLElement>('.home-hero-orbit')
      let selectedPlanet: HTMLAnchorElement | undefined
      let highlightGeneration = 0
      const updateHighlight = () => {
        const angle = orbit && selectedPlanet
          ? getPlanetOrbitHighlightAngle(selectedPlanet.getBoundingClientRect(), orbit.getBoundingClientRect())
          : null
        this.toggleAttribute('data-planets-highlight', angle !== null)
        if (angle !== null) {
          this.style.setProperty('--orbit-highlight-angle', `${angle}deg`)
        }
        else {
          this.style.removeProperty('--orbit-highlight-angle')
        }
      }
      const settleHighlight = () => {
        const generation = ++highlightGeneration
        const planet = selectedPlanet
        if (!planet || !orbit || this.hasAttribute('data-planets-orbit-running')) {
          return
        }
        const animations = planet.getAnimations().filter(animation => animation instanceof CSSAnimation
          && animation.animationName === 'home-hero-revolve')
        if (animations.length === 0) {
          return
        }
        // CSS pause finalizes its hold time asynchronously. Keep the immediate
        // feedback, then measure again once the actual path has stopped.
        void Promise.allSettled(animations.map(animation => animation.ready)).then((results) => {
          if (generation !== highlightGeneration || !this.isConnected || selectedPlanet !== planet
            || this.hasAttribute('data-planets-orbit-running')
            || results.some(result => result.status === 'rejected')
            || animations.some(animation => animation.playState !== 'paused')) {
            return
          }
          updateHighlight()
        })
      }
      const caption = screen.querySelector<HTMLElement>('[data-planet-caption]')
      const captionName = screen.querySelector<HTMLElement>('[data-planet-caption-name]')
      const captionTagline = screen.querySelector<HTMLElement>('[data-planet-caption-tagline]')
      const toggle = screen.querySelector<HTMLButtonElement>('[data-planet-toggle]')
      const toggleLabel = toggle?.querySelector<HTMLElement>('[data-planet-toggle-label]')
      const pauseIcon = toggle?.querySelector('[data-planet-pause-icon]')
      const playIcon = toggle?.querySelector('[data-planet-play-icon]')
      const desktop = window.matchMedia('(min-width: 1024px)')
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
      const controller = createPlanetController(
        planets.map(planet => planet.dataset.analyticsProject!).filter(Boolean),
        (state) => {
          selectedPlanet = undefined
          for (const planet of planets) {
            const active = planet.dataset.analyticsProject === state.activeId
            planet.toggleAttribute('data-planet-active', active)
            if (active) {
              selectedPlanet = planet
            }
          }
          this.toggleAttribute('data-planets-orbit-running', state.orbitRunning)
          // Pause the path before measuring the stable link target, not its enlarged visual.
          updateHighlight()
          settleHighlight()
          if (caption) {
            caption.hidden = !selectedPlanet
          }
          if (captionName) {
            captionName.textContent = selectedPlanet?.dataset.planetName ?? ''
          }
          if (captionTagline) {
            captionTagline.textContent = selectedPlanet?.dataset.planetTagline ?? ''
          }
          if (toggle) {
            toggle.hidden = !state.controlsVisible
            toggle.setAttribute('aria-pressed', String(state.userPaused))
          }
          if (toggleLabel) {
            toggleLabel.textContent = state.userPaused
              ? toggle?.dataset.resumeLabel ?? ''
              : toggle?.dataset.pauseLabel ?? ''
          }
          pauseIcon?.toggleAttribute('hidden', state.userPaused)
          playIcon?.toggleAttribute('hidden', !state.userPaused)
        },
        { desktop: desktop.matches, reducedMotion: reducedMotion.matches, visible: false, pageHidden: document.hidden, revealed: false },
        readHeroMotionPaused(screen),
      )
      const focusedPlanet = (target: EventTarget | null) => {
        const planet = target instanceof Element ? target.closest<HTMLAnchorElement>('.home-hero-planet') : null
        return planet && this.contains(planet) ? planet.dataset.analyticsProject ?? null : null
      }
      const onFocusIn = (event: FocusEvent) => controller.setFocus(focusedPlanet(event.target))
      const onFocusOut = (event: FocusEvent) => controller.setFocus(focusedPlanet(event.relatedTarget))
      const onDesktop = () => controller.setEnvironment({ desktop: desktop.matches })
      const onReducedMotion = () => controller.setEnvironment({ reducedMotion: reducedMotion.matches })
      const onVisibility = () => controller.setEnvironment({ pageHidden: document.hidden })
      const onToggle = () => setHeroMotionPaused(screen, !readHeroMotionPaused(screen))
      const unsubscribeMotion = subscribeHeroMotionPaused(screen, paused => controller.setPaused(paused))
      const intersection = new IntersectionObserver((entries) => {
        controller.setEnvironment({ visible: entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.08) })
      }, { threshold: [0, 0.08] })
      const resize = new ResizeObserver(updateHighlight)
      const pointerBindings = planets.map((planet) => {
        const onEnter = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') {
            controller.setHover(planet.dataset.analyticsProject ?? null)
          }
        }
        const onLeave = () => controller.setHover(null)
        planet.addEventListener('pointerenter', onEnter)
        planet.addEventListener('pointerleave', onLeave)
        return () => {
          planet.removeEventListener('pointerenter', onEnter)
          planet.removeEventListener('pointerleave', onLeave)
        }
      })
      this.addEventListener('focusin', onFocusIn)
      this.addEventListener('focusout', onFocusOut)
      desktop.addEventListener('change', onDesktop)
      reducedMotion.addEventListener('change', onReducedMotion)
      document.addEventListener('visibilitychange', onVisibility)
      toggle?.addEventListener('click', onToggle)
      const unsubscribePhase = subscribeHeroPhase(screen, (phase) => {
        const revealed = phase === 'ready'
        controller.setEnvironment({ revealed })
        this.inert = !revealed
        if (revealed) {
          this.removeAttribute('aria-hidden')
          updateHighlight()
        }
        else {
          this.setAttribute('aria-hidden', 'true')
          const active = document.activeElement
          if (active instanceof HTMLElement && focusedPlanet(active)) {
            active.blur()
          }
        }
      })
      controller.setFocus(focusedPlanet(document.activeElement))
      intersection.observe(screen)
      resize.observe(screen)
      if (orbit) {
        resize.observe(orbit)
      }
      this.setAttribute('data-planets-ready', '')
      this.#cleanup = () => {
        ++highlightGeneration
        controller.destroy()
        unsubscribeMotion()
        unsubscribePhase()
        intersection.disconnect()
        resize.disconnect()
        for (const unbind of pointerBindings) {
          unbind()
        }
        this.removeEventListener('focusin', onFocusIn)
        this.removeEventListener('focusout', onFocusOut)
        desktop.removeEventListener('change', onDesktop)
        reducedMotion.removeEventListener('change', onReducedMotion)
        document.removeEventListener('visibilitychange', onVisibility)
        toggle?.removeEventListener('click', onToggle)
        this.removeAttribute('data-planets-ready')
        this.removeAttribute('data-planets-orbit-running')
        selectedPlanet = undefined
        updateHighlight()
        this.inert = true
        this.setAttribute('aria-hidden', 'true')
        for (const planet of planets) {
          planet.removeAttribute('data-planet-active')
        }
        if (caption) {
          caption.hidden = true
        }
        if (toggle) {
          toggle.hidden = true
        }
      }
    }

    disconnectedCallback() {
      this.#cleanup?.()
      this.#cleanup = undefined
    }
  }
  customElements.define('hero-planets', HeroPlanets)
}
