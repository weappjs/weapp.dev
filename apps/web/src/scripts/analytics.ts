export const ANALYTICS_CONSENT_KEY = 'weapp-analytics-consent:v1'

export const ANALYTICS_SITE_IDS = {
  baidu: '170dbb85ce799398a8d96083303bf374',
  ga4: 'G-P7XL4TEVNM',
} as const

export const PRODUCTION_ANALYTICS_HOSTS = ['weapp.dev'] as const

export function isProductionAnalyticsHost(hostname: string): boolean {
  return (PRODUCTION_ANALYTICS_HOSTS as readonly string[]).includes(hostname)
}

type AnalyticsProvider = keyof typeof ANALYTICS_SITE_IDS

export type AnalyticsEventName
  = | 'change_theme'
    | 'click_outbound'
    | 'copy_command'
    | 'navigate_section'
    | 'select_project'
    | 'select_related_project'
    | 'switch_language'

export type AnalyticsEventParams = Record<string, string | undefined>
export type AnalyticsConsent = 'granted' | 'denied'

interface ConsentRecord {
  choice: AnalyticsConsent
  version: 1
}

interface PrivacyNavigator {
  doNotTrack?: string | null
  globalPrivacyControl?: boolean
}

declare global {
  interface Window {
    _hmt?: Array<Array<boolean | number | string>>
    __WEAPP_ANALYTICS_TEST__?: boolean
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    weappAnalytics?: {
      openPreferences: () => void
      track: (name: AnalyticsEventName, params?: AnalyticsEventParams) => void
    }
  }
}

const EVENT_PARAM_KEYS: Record<AnalyticsEventName, readonly string[]> = {
  change_theme: ['theme'],
  click_outbound: ['target', 'project'],
  copy_command: ['project'],
  navigate_section: ['section'],
  select_project: ['project'],
  select_related_project: ['from', 'project'],
  switch_language: ['from', 'to'],
}

const UTM_PARAMS = new Set([
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
])

export function readAnalyticsConsent(storage: Pick<Storage, 'getItem'>): AnalyticsConsent | null {
  try {
    const value = storage.getItem(ANALYTICS_CONSENT_KEY)
    if (!value) {
      return null
    }
    const record = JSON.parse(value) as Partial<ConsentRecord>
    return record.version === 1 && (record.choice === 'granted' || record.choice === 'denied')
      ? record.choice
      : null
  }
  catch {
    return null
  }
}

export function writeAnalyticsConsent(
  storage: Pick<Storage, 'setItem'>,
  choice: AnalyticsConsent,
): void {
  storage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ choice, version: 1 } satisfies ConsentRecord))
}

export function hasPrivacySignal(navigatorLike: PrivacyNavigator): boolean {
  return navigatorLike.globalPrivacyControl === true || navigatorLike.doNotTrack === '1'
}

export function sanitizeAnalyticsUrl(value: string): string {
  const url = new URL(value)
  const query = new URLSearchParams()
  for (const [key, parameter] of url.searchParams) {
    if (UTM_PARAMS.has(key)) {
      query.append(key, parameter.slice(0, 120))
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return `${url.origin}${url.pathname}${suffix}`
}

export function normalizeAnalyticsEvent(
  name: AnalyticsEventName,
  params: AnalyticsEventParams = {},
): Record<string, string> {
  return Object.fromEntries(
    EVENT_PARAM_KEYS[name]
      .map(key => [key, params[key]?.slice(0, 80)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  )
}

export function mapBaiduEvent(
  name: AnalyticsEventName,
  params: AnalyticsEventParams = {},
): [category: string, action: string, label: string] {
  const normalized = normalizeAnalyticsEvent(name, params)
  const category = name === 'click_outbound' ? 'outbound' : 'site'
  const label = EVENT_PARAM_KEYS[name]
    .map(key => normalized[key])
    .filter(Boolean)
    .join(':')
  return [category, name, label]
}

function appendProviderScript(id: string, src: string): Promise<void> {
  let current = document.getElementById(id) as HTMLScriptElement | null
  if (current?.dataset.loaded === 'true') {
    return Promise.resolve()
  }

  if (current?.dataset.failed === 'true') {
    current.remove()
    current = null
  }

  return new Promise((resolve, reject) => {
    const script = current ?? document.createElement('script')
    let handleLoad: () => void
    const handleError = () => {
      script.dataset.failed = 'true'
      script.removeEventListener('load', handleLoad)
      reject(new Error(`Unable to load ${id}`))
    }
    handleLoad = () => {
      script.dataset.loaded = 'true'
      script.removeEventListener('error', handleError)
      resolve()
    }
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    if (!current) {
      script.id = id
      script.async = true
      script.src = src
      document.head.appendChild(script)
    }
  })
}

function getPreferenceElements() {
  return {
    dialog: document.querySelector<HTMLDialogElement>('[data-analytics-dialog]'),
    enabled: document.querySelector<HTMLInputElement>('[data-analytics-enabled]'),
    privacyNotice: document.querySelector<HTMLElement>('[data-analytics-privacy-signal]'),
  }
}

export function initAnalytics(): void {
  if (window.weappAnalytics) {
    return
  }

  const privacySignal = hasPrivacySignal(navigator)
  const shouldRun = isProductionAnalyticsHost(window.location.hostname) || window.__WEAPP_ANALYTICS_TEST__ === true
  const preferenceElements = getPreferenceElements()
  let lastPreferenceTrigger: HTMLElement | null = null
  const providerStates: Record<AnalyticsProvider, {
    configured: boolean
    loaded: boolean
    loading: Promise<void> | null
  }> = {
    baidu: { configured: false, loaded: false, loading: null },
    ga4: { configured: false, loaded: false, loading: null },
  }

  const hasConfiguredProvider = () => Object.values(providerStates).some(state => state.configured)

  const track = (name: AnalyticsEventName, params: AnalyticsEventParams = {}) => {
    const normalized = normalizeAnalyticsEvent(name, params)
    if (providerStates.ga4.configured) {
      window.gtag?.('event', name, normalized)
    }
    if (providerStates.baidu.configured) {
      const [category, action, label] = mapBaiduEvent(name, normalized)
      window._hmt?.push(['_trackEvent', category, action, label])
    }
  }

  const openPreferences = () => {
    const { dialog, enabled, privacyNotice } = preferenceElements
    if (!dialog || !enabled) {
      return
    }
    const choice = readAnalyticsConsent(localStorage)
    enabled.checked = !privacySignal && choice !== 'denied'
    enabled.disabled = privacySignal
    privacyNotice?.toggleAttribute('hidden', !privacySignal)
    dialog.showModal()
  }

  const closePreferences = () => {
    preferenceElements.dialog?.close()
    lastPreferenceTrigger?.focus()
  }

  preferenceElements.dialog?.addEventListener('cancel', (event) => {
    event.preventDefault()
    closePreferences()
  })

  window.weappAnalytics = { openPreferences, track }

  const getPageViewParams = () => {
    const pageLocation = sanitizeAnalyticsUrl(window.location.href)
    const pagePath = new URL(pageLocation).pathname + new URL(pageLocation).search
    return {
      page_location: pageLocation,
      page_path: pagePath,
      page_title: document.title.slice(0, 120),
    }
  }

  const loadProvider = (provider: AnalyticsProvider): Promise<void> => {
    const state = providerStates[provider]
    if (!shouldRun || privacySignal || state.loading || state.loaded) {
      return state.loading ?? Promise.resolve()
    }

    if (!state.configured) {
      state.configured = true
      if (provider === 'ga4') {
        window.dataLayer = window.dataLayer ?? []
        window.gtag = window.gtag ?? function () {
          // Google tag distinguishes its commands by the IArguments object shape.
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer?.push(arguments)
        }
        window.gtag('consent', 'default', {
          ad_personalization: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          analytics_storage: 'granted',
        })
        window.gtag('js', new Date())
        window.gtag('config', ANALYTICS_SITE_IDS.ga4, {
          allow_ad_personalization_signals: false,
          allow_google_signals: false,
          ...getPageViewParams(),
          send_page_view: true,
        })
      }
      else {
        window._hmt = window._hmt ?? []
        window._hmt.push(['_setAutoPageview', false])
      }
    }

    if (provider === 'ga4') {
      state.loading = appendProviderScript(
        'weapp-ga4',
        `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_SITE_IDS.ga4)}`,
      )
    }
    else {
      state.loading = appendProviderScript(
        'weapp-baidu-tongji',
        `https://hm.baidu.com/hm.js?${encodeURIComponent(ANALYTICS_SITE_IDS.baidu)}`,
      )
    }

    const loading = state.loading.then(() => {
      state.loaded = true
      if (provider === 'baidu') {
        window._hmt?.push(['_trackPageview', getPageViewParams().page_path])
      }
    }).catch(() => undefined)
    state.loading = loading.finally(() => {
      state.loading = null
    })
    return state.loading
  }

  const loadProviders = async () => {
    await Promise.all([loadProvider('baidu'), loadProvider('ga4')])
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-analytics-event]')
      : null
    if (!target) {
      return
    }
    const name = target.dataset.analyticsEvent as AnalyticsEventName
    if (!(name in EVENT_PARAM_KEYS)) {
      return
    }
    track(name, {
      from: target.dataset.analyticsFrom,
      project: target.dataset.analyticsProject,
      section: target.dataset.analyticsSection,
      target: target.dataset.analyticsTarget,
      theme: name === 'change_theme' ? document.documentElement.dataset.theme : undefined,
      to: target.dataset.analyticsTo,
    })
  })

  document.querySelectorAll<HTMLElement>('[data-analytics-preferences-open]').forEach((button) => {
    button.addEventListener('click', () => {
      lastPreferenceTrigger = button
      openPreferences()
    })
  })
  document.querySelectorAll<HTMLElement>('[data-analytics-preferences-close]').forEach((button) => {
    button.addEventListener('click', closePreferences)
  })
  document.querySelector<HTMLFormElement>('[data-analytics-preferences-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const enabled = preferenceElements.enabled?.checked === true && !privacySignal
    writeAnalyticsConsent(localStorage, enabled ? 'granted' : 'denied')
    closePreferences()
    if (enabled) {
      void loadProviders()
    }
    else if (hasConfiguredProvider()) {
      window.location.reload()
    }
  })

  if (!shouldRun) {
    return
  }

  if (!privacySignal && readAnalyticsConsent(localStorage) !== 'denied') {
    void loadProviders()
  }
}
