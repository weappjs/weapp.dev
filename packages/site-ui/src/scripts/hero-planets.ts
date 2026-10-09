import { readHeroMotionPaused, setHeroMotionPaused, subscribeHeroMotionPaused } from './hero-motion'

export interface PlanetEnvironment {
  desktop: boolean
  reducedMotion: boolean
  visible: boolean
  pageHidden: boolean
}

export interface PlanetPresentation {
  activeId: string | null
  orbitRunning: boolean
  controlsVisible: boolean
  userPaused: boolean
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
    && environment.visible && !environment.pageHidden
  const interacting = () => focusId !== null || hoverId !== null
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const render = () => {
    if (destroyed) {
      return
    }
    const activeId = environment.desktop ? focusId ?? hoverId ?? automaticId : null
    present({
      activeId,
      orbitRunning: environment.visible && !environment.pageHidden && !environment.reducedMotion
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
    if (destroyed || (kind === 'focus' ? focusId : hoverId) === id) {
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
          let selected: HTMLAnchorElement | undefined
          for (const planet of planets) {
            const active = planet.dataset.analyticsProject === state.activeId
            planet.toggleAttribute('data-planet-active', active)
            if (active) {
              selected = planet
            }
          }
          this.toggleAttribute('data-planets-orbit-running', state.orbitRunning)
          if (caption) {
            caption.hidden = !selected
          }
          if (captionName) {
            captionName.textContent = selected?.dataset.planetName ?? ''
          }
          if (captionTagline) {
            captionTagline.textContent = selected?.dataset.planetTagline ?? ''
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
        { desktop: desktop.matches, reducedMotion: reducedMotion.matches, visible: false, pageHidden: document.hidden },
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
      controller.setFocus(focusedPlanet(document.activeElement))
      intersection.observe(screen)
      this.setAttribute('data-planets-ready', '')
      this.#cleanup = () => {
        controller.destroy()
        unsubscribeMotion()
        intersection.disconnect()
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
