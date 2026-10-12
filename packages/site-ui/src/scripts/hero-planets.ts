import { readHeroMotionPaused, readHeroReplayVersion, requestHeroReplay, setHeroMotionPaused, subscribeHeroMotionPaused, subscribeHeroReplay } from './hero-motion'
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
        && !userPaused,
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
    replay() {
      if (destroyed) {
        return
      }
      cancel()
      cursor = -1
      focusId = null
      hoverId = null
      automaticId = null
      render()
      wait()
    },
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
    #replayVersion: number | undefined
    #orbitTime = 0

    connectedCallback() {
      if (this.#cleanup) {
        return
      }
      const screen = this.closest<HTMLElement>('.home-hero-screen')
      if (!screen) {
        return
      }
      const planets = [...this.querySelectorAll<HTMLAnchorElement>('.home-hero-planet')]
      // Own one native timeline. Unlike a CSS animation, removing the host
      // does not discard its current time before disconnectedCallback runs.
      const orbitAnimation = this.animate({ '--orbit-turn': [0, 1] }, {
        duration: 240000,
        iterations: Number.POSITIVE_INFINITY,
        easing: 'linear',
      })
      orbitAnimation.pause()
      orbitAnimation.currentTime = this.#orbitTime
      let orbitRunning = false
      const caption = screen.querySelector<HTMLElement>('[data-planet-caption]')
      const captionName = screen.querySelector<HTMLElement>('[data-planet-caption-name]')
      const captionTagline = screen.querySelector<HTMLElement>('[data-planet-caption-tagline]')
      const toggle = screen.querySelector<HTMLButtonElement>('[data-planet-toggle]')
      const replay = screen.querySelector<HTMLButtonElement>('[data-hero-replay]')
      const controls = screen.querySelector<HTMLElement>('[data-hero-controls]')
      const toggleLabel = toggle?.querySelector<HTMLElement>('[data-planet-toggle-label]')
      const pauseIcon = toggle?.querySelector('[data-planet-pause-icon]')
      const playIcon = toggle?.querySelector('[data-planet-play-icon]')
      const desktop = window.matchMedia('(min-width: 1024px)')
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
      const controller = createPlanetController(
        planets.map(planet => planet.dataset.analyticsProject!).filter(Boolean),
        (state) => {
          let selectedPlanet: HTMLAnchorElement | undefined
          for (const planet of planets) {
            const active = planet.dataset.analyticsProject === state.activeId
            planet.toggleAttribute('data-planet-active', active)
            if (active) {
              selectedPlanet = planet
            }
          }
          this.toggleAttribute('data-planets-orbit-running', state.orbitRunning)
          if (orbitRunning !== state.orbitRunning) {
            orbitRunning = state.orbitRunning
            if (orbitRunning) {
              orbitAnimation.play()
            }
            else {
              orbitAnimation.pause()
            }
          }
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
            const label = state.userPaused ? toggle.dataset.resumeLabel ?? '' : toggle.dataset.pauseLabel ?? ''
            toggle.hidden = !state.controlsVisible
            toggle.setAttribute('aria-pressed', String(state.userPaused))
            toggle.setAttribute('aria-label', label)
            toggle.title = label
            if (toggleLabel) {
              toggleLabel.textContent = label
            }
          }
          if (replay) {
            replay.hidden = !state.controlsVisible
          }
          if (controls) {
            controls.hidden = !state.controlsVisible
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
      const onReplay = () => requestHeroReplay(screen)
      const unsubscribeMotion = subscribeHeroMotionPaused(screen, paused => controller.setPaused(paused))
      this.#replayVersion ??= readHeroReplayVersion(screen)
      const unsubscribeReplay = subscribeHeroReplay(screen, (version) => {
        if (version === this.#replayVersion) {
          return
        }
        this.#replayVersion = version
        this.#orbitTime = 0
        controller.replay()
        orbitAnimation.currentTime = 0
      })
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
      replay?.addEventListener('click', onReplay)
      const unsubscribePhase = subscribeHeroPhase(screen, (phase) => {
        const revealed = phase === 'ready'
        controller.setEnvironment({ revealed })
        this.inert = !revealed
        if (revealed) {
          this.removeAttribute('aria-hidden')
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
      this.setAttribute('data-planets-ready', '')
      this.#cleanup = () => {
        orbitAnimation.pause()
        const orbitTime = orbitAnimation.currentTime
        if (typeof orbitTime === 'number' && Number.isFinite(orbitTime) && orbitTime >= 0) {
          this.#orbitTime = orbitTime
        }
        orbitAnimation.cancel()
        controller.destroy()
        unsubscribeMotion()
        unsubscribeReplay()
        unsubscribePhase()
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
        replay?.removeEventListener('click', onReplay)
        this.removeAttribute('data-planets-ready')
        this.removeAttribute('data-planets-orbit-running')
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
        if (replay) {
          replay.hidden = true
        }
        if (controls) {
          controls.hidden = true
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
