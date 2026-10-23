import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './app/App.jsx'
import { isModuleAuthenticated } from './modules/Food/utils/auth.js'
import { syncThemeForPath } from './shared/utils/theme.js'
import {
  ACTIVE_MODULE_KEY,
  NATIVE_LAST_ROUTE_AT_KEY,
  NATIVE_LAST_ROUTE_KEY,
  resolveCurrentAppHomeRoute,
} from './shared/utils/activeModule.js'
import './shared/styles/global.css'
import { registerSW } from 'virtual:pwa-register'

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In development mode, unregister any service workers so they don't cache or break Vite HMR dynamic modules
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister()
      }
    }).catch(() => {})
  } else {
    registerSW({
      immediate: true,
      onNeedRefresh() {},
      onOfflineReady() {}
    })
  }
}

// Automatically recover when Vite rebuilds or updates chunk hashes during development / deployment
const handleChunkModuleError = (event) => {
  try {
    const lastReload = Number(sessionStorage.getItem('chunk-auto-reload-ts') || 0)
    const count = Number(sessionStorage.getItem('chunk-auto-reload-count') || 0)
    const now = Date.now()
    if (now - lastReload < 3000) return
    // At most 2 automatic reloads within a minute. After that stop looping and let the error screen
    // (with its manual Reload button) show, instead of refreshing the whole app every few seconds.
    const withinWindow = now - lastReload < 60000
    if (withinWindow && count >= 2) {
      console.warn('[chunk-recovery] Auto-reload limit reached; not reloading again.')
      return
    }
    sessionStorage.setItem('chunk-auto-reload-ts', String(now))
    sessionStorage.setItem('chunk-auto-reload-count', String(withinWindow ? count + 1 : 1))
  } catch { /* ignore */ }
  window.location.reload()
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  handleChunkModuleError(event)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason
  const msg = String(reason?.message || reason || '').toLowerCase()
  if (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('dynamically imported module')
  ) {
    event.preventDefault()
    handleChunkModuleError(event)
  }
})

// ─── Quick-spicy Food Module Initialization ───────────────────────────────────

// Load food module business settings (favicon, title) — non-critical
import('./modules/Food/utils/businessSettings.js')
  .then(({ loadBusinessSettings }) => loadBusinessSettings())
  .catch(() => { /* Silently fail — settings load when admin authenticates */ })

function getInitialPathname() {
  if (typeof window === 'undefined') return '/'

  const hash = String(window.location?.hash || '')
  if (hash.startsWith('#/')) {
    return hash.slice(1).split('?')[0] || '/'
  }

  const pathname = String(window.location?.pathname || '/')
  return pathname.replace(/\/index\.html$/i, '') || '/'
}

function isNativeLikeShell() {
  if (typeof window === 'undefined') return false

  const protocol = String(window.location?.protocol || '').toLowerCase()
  const userAgent = String(window.navigator?.userAgent || '').toLowerCase()

  return (
    Boolean(window.flutter_inappwebview) ||
    Boolean(window.ReactNativeWebView) ||
    protocol === 'file:' ||
    userAgent.includes(' wv') ||
    userAgent.includes('; wv')
  )
}

// Entry routes across apps: relaunching soon after leaving with the Home button reopens the page the user was on.
// Exiting with Back always happens from a home screen, which is never restored, so that relaunch starts fresh.
const APP_ENTRY_ROUTES = [
  '/',
  '/food/user',
  '/taxi/user',
  '/food/delivery',
  '/delivery',
  '/food/restaurant',
  '/restaurant',
  '/taxi/driver',
  '/taxi/driver/home',
  '/driver',
  '/taxi/owner',
  '/taxi/owner/dashboard',
  '/owner',
  '/admin',
]
const RESUME_LAST_ROUTE_MAX_AGE_MS = 30 * 60 * 1000

function getHomeRouteForResuming(resumeRoute) {
  if (resumeRoute.startsWith('/food/delivery')) return '/food/delivery'
  if (resumeRoute.startsWith('/food/restaurant')) return '/food/restaurant'
  if (resumeRoute.startsWith('/taxi/driver')) return '/taxi/driver/home'
  if (resumeRoute.startsWith('/taxi/owner')) return '/taxi/owner/dashboard'
  if (resumeRoute.startsWith('/admin')) return '/admin'
  if (resumeRoute.startsWith('/taxi/')) return '/taxi/user'
  return '/food/user'
}

function resolveResumableUserRoute(pathname) {
  const cleanPath = pathname.replace(/\/$/, '') || '/'
  if (!APP_ENTRY_ROUTES.includes(cleanPath)) return ''
  try {
    const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()
    const leftAt = Number(localStorage.getItem(NATIVE_LAST_ROUTE_AT_KEY) || 0)
    if (!storedRoute || !leftAt || Date.now() - leftAt > RESUME_LAST_ROUTE_MAX_AGE_MS) return ''

    const storedPath = storedRoute.split('?')[0].replace(/\/$/, '')
    const isInnerPage =
      (storedPath.startsWith('/food/user/') ||
        storedPath.startsWith('/taxi/user/') ||
        storedPath.startsWith('/food/delivery/') ||
        storedPath.startsWith('/food/restaurant/') ||
        storedPath.startsWith('/taxi/driver/') ||
        storedPath.startsWith('/taxi/owner/')) &&
      !/\/(auth|login|signup|onboarding|verify-otp)(\/|$)/.test(storedPath)
    if (!isInnerPage) return ''

    // Pages that need in-memory router state cannot be rebuilt after a relaunch.
    const TRANSIENT_SEGMENTS = [
      '/ride/select-vehicle', '/ride/select-location', '/ride/searching',
      '/ride/tracking', '/ride/complete', '/ride/chat',
      '/parcel/searching', '/parcel/tracking', '/parcel/details', '/parcel/contacts',
      '/intercity/details', '/intercity/confirm',
      '/rental/vehicle', '/rental/schedule', '/rental/kyc', '/rental/deposit', '/rental/confirmed',
    ]
    if (TRANSIENT_SEGMENTS.some((s) => storedPath.includes(s))) return ''

    if (cleanPath === '/') {
      if (storedPath.startsWith('/food/delivery') && !isModuleAuthenticated('delivery')) return ''
      if (storedPath.startsWith('/food/restaurant') && !isModuleAuthenticated('restaurant')) return ''
      if (storedPath.startsWith('/taxi/driver') && !isModuleAuthenticated('driver')) return ''
      if (storedPath.startsWith('/taxi/owner') && !isModuleAuthenticated('driver')) return ''
      if (storedPath.startsWith('/admin') && !isModuleAuthenticated('admin')) return ''
      if ((storedPath.startsWith('/food/user') || storedPath.startsWith('/taxi/user')) && !isModuleAuthenticated('user')) return ''
    }

    return storedRoute
  } catch {
    return ''
  }
}

function resolveNativeInitialRoute() {
  if (typeof window === 'undefined') return '/'

  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'

  const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()

  // Routes that depend on React Router state (pickup/drop etc.) must never
  // be restored after an app restart — the state is gone, showing stale data.
  const TRANSIENT_SEGMENTS = [
    '/ride/select-vehicle', '/ride/select-location', '/ride/searching',
    '/ride/tracking', '/ride/complete', '/ride/chat',
    '/parcel/searching', '/parcel/tracking', '/parcel/details', '/parcel/contacts',
    '/intercity/details', '/intercity/confirm',
    '/rental/vehicle', '/rental/schedule', '/rental/kyc', '/rental/deposit', '/rental/confirmed',
  ]
  const isTransient = (r) => TRANSIENT_SEGMENTS.some((s) => r.includes(s))

  if (pathname.startsWith('/taxi/driver')) return '/taxi/driver/home'
  if (pathname.startsWith('/taxi/owner')) return '/taxi/owner/dashboard'
  if (pathname.startsWith('/taxi/')) return isTransient(pathname) ? '/taxi/user' : pathname
  if (pathname.startsWith('/food/delivery')) return pathname
  if (pathname.startsWith('/food/restaurant')) return pathname
  if (pathname.startsWith('/food/')) return pathname
  if (pathname.startsWith('/restaurant')) return `/food${pathname}`
  if (pathname.startsWith('/delivery')) return `/food${pathname}`
  if (pathname.startsWith('/driver')) return `/taxi/driver/home`
  if (pathname.startsWith('/owner')) return `/taxi/owner/dashboard`
  if (pathname.startsWith('/user')) return `/food${pathname}`
  if (pathname.startsWith('/admin')) return pathname

  if (isNativeLikeShell()) {
    if (storedRoute) {
      if (storedRoute.startsWith('/taxi/driver')) return '/taxi/driver/home'
      if (storedRoute.startsWith('/taxi/owner')) return '/taxi/owner/dashboard'
      if (storedRoute.startsWith('/taxi/')) return isTransient(storedRoute) ? '/taxi/user' : storedRoute
      if (storedRoute.startsWith('/food/') || storedRoute.startsWith('/admin')) return storedRoute
    }

    if (isModuleAuthenticated('delivery')) return '/food/delivery'
    if (isModuleAuthenticated('restaurant')) return '/food/restaurant'
    if (isModuleAuthenticated('driver')) return '/taxi/driver/home'
    if (isModuleAuthenticated('admin')) return '/admin'
    if (isModuleAuthenticated('user')) {
      const activeModule = String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
      return activeModule === 'taxi' ? '/taxi/user' : '/food/user'
    }

    const currentHome = resolveCurrentAppHomeRoute()
    if (currentHome && currentHome !== '/') return currentHome
  } else {
    if (isModuleAuthenticated('delivery')) return '/food/delivery'
    if (isModuleAuthenticated('restaurant')) return '/food/restaurant'
    if (isModuleAuthenticated('driver')) return '/taxi/driver/home'
    if (isModuleAuthenticated('admin')) return '/admin'
  }

  return '/'
}

function bootstrapNativeHashRoute() {
  if (!isNativeLikeShell() || typeof window === 'undefined') return

  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'
  const currentHash = String(window.location?.hash || '')

  // Fresh launch (no hash yet) on an entry route: reopen the page left a moment ago,
  // with home underneath so Back returns home instead of closing the app.
  if (!currentHash.startsWith('#/')) {
    const resumeRoute = resolveResumableUserRoute(pathname)
    if (resumeRoute) {
      const homeRoute = getHomeRouteForResuming(resumeRoute)
      window.history.replaceState(null, '', `#${homeRoute}`)
      window.history.pushState(null, '', `#${resumeRoute}`)
      return
    }
  }

  const targetPath = resolveNativeInitialRoute()
  const search = String(window.location?.search || '')

  // If already at root domain and targetPath is '/', do nothing
  if ((pathname === '/' || pathname === '') && targetPath === '/' && !currentHash.startsWith('#/')) {
    return
  }

  const hashPath = currentHash.startsWith('#') ? currentHash.slice(1).split('?')[0] : ''

  if (currentHash.startsWith('#/')) {
    const nativePathPrefix = targetPath.startsWith('/taxi/')
      ? '/taxi/'
      : targetPath.startsWith('/food/')
        ? '/food/'
        : targetPath.startsWith('/admin')
          ? '/admin'
          : ''

    const hashMatchesPrefix = nativePathPrefix ? hashPath.startsWith(nativePathPrefix) : false
    const pathSuggestsTaxi = pathname.startsWith('/taxi/')

    // Normalize stale hash routes in native shells (e.g. /taxi/... with #/food/...)
    if ((pathSuggestsTaxi && !hashPath.startsWith('/taxi/')) || !hashMatchesPrefix) {
      window.history.replaceState(null, '', `#${targetPath}${search}`)
    }
    return
  }

  window.history.replaceState(null, '', `#${targetPath}${search}`)
}

bootstrapNativeHashRoute()
syncThemeForPath(getInitialPathname())

// ─── Suppress known non-critical errors ──────────────────────────────────────

const originalError = console.error
console.error = (...args) => {
  const errorStr = args
    .map(arg => (arg instanceof Error ? `${arg.name}: ${arg.message} ${arg.stack || ''}` : String(arg)))
    .join(' ')

  if (typeof args[0] === 'string' && (
    args[0].includes('chrome-extension://') ||
    args[0].includes('_$initialUrl') ||
    args[0].includes('_$onReInit') ||
    args[0].includes('_$bindListeners') ||
    args[0].includes('simulator.js') ||
    args[0].includes('spoofer.js')
  )) return

  if (
    errorStr.includes('Timeout expired') ||
    errorStr.includes('GeolocationPositionError') ||
    errorStr.includes('Geolocation error') ||
    errorStr.includes('User denied Geolocation') ||
    errorStr.includes('permission denied')
  ) return

  const hasNetworkError = args.some(arg =>
    arg && typeof arg === 'object' &&
    (arg.name === 'AxiosError') &&
    (arg.code === 'ERR_NETWORK' || arg.message === 'Network Error')
  )
  if (hasNetworkError) return

  if (
    errorStr.includes('🌐 Network Error') ||
    errorStr.includes('Network Error - Backend server may not be running') ||
    errorStr.includes('ERR_INTERNET_DISCONNECTED') ||
    errorStr.includes('ERR_NETWORK_CHANGED') ||
    errorStr.includes('fonts.googleapis.com') ||
    errorStr.includes('maps.googleapis.com') ||
    errorStr.includes('Failed to fetch settings') ||
    errorStr.includes('Failed to load services') ||
    (errorStr.includes('ERR_NETWORK') && errorStr.includes('AxiosError'))
  ) return

  if (
    errorStr.includes('Restaurant Socket connection error') ||
    errorStr.includes('xhr poll error') ||
    errorStr.includes('[socket] connect_error') ||
    errorStr.includes('ERR_CONNECTION_REFUSED') ||
    errorStr.includes('Failed to fetch dynamically imported module') ||
    errorStr.includes('Importing a module script failed') ||
    errorStr.includes('Expected length, "undefined"') ||
    (errorStr.includes('attribute cx') && errorStr.includes('Expected length')) ||
    (errorStr.includes('attribute cy') && errorStr.includes('Expected length')) ||
    (errorStr.includes('socket.io') && (errorStr.includes('400 (Bad Request)') || errorStr.includes('500 (Internal Server Error)'))) ||
    (errorStr.includes('WebSocket connection to') && errorStr.includes('socket.io') && errorStr.includes('failed')) ||
    errorStr.includes('WebSocket is closed before the connection is established') ||
    errorStr.includes('reason: \'transport close\'') ||
    errorStr.includes('reason: \'io client disconnect\'') ||
    errorStr.includes('fcmregistrations.googleapis.com') ||
    errorStr.includes('messaging/token-unsubscribe-failed') ||
    errorStr.includes('messaging/token-subscribe-failed') ||
    errorStr.includes('FCM Web Push')
  ) return

  originalError.apply(console, args)
}

const originalWarn = console.warn
console.warn = (...args) => {
  const warnStr = args.join(' ')
  if (
    warnStr.includes('Slow network is detected') ||
    warnStr.includes('Fallback font will be used') ||
    warnStr.includes('Download the React DevTools') ||
    warnStr.includes('Failed to load Google Maps script') ||
    (warnStr.includes('attribute cx') && warnStr.includes('Expected length')) ||
    (warnStr.includes('attribute cy') && warnStr.includes('Expected length')) ||
    warnStr.includes('messaging/token-unsubscribe-failed') ||
    warnStr.includes('token-unsubscribe-failed') ||
    warnStr.includes('fcmregistrations.googleapis.com') ||
    warnStr.includes('The caller does not have permission')
  ) return
  originalWarn.apply(console, args)
}

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason || event
  const errorMsg = error?.message || String(error) || ''
  const errorName = error?.name || ''
  if (
    errorMsg.includes('Timeout expired') ||
    errorMsg.includes('User denied Geolocation') ||
    errorMsg.includes('permission denied') ||
    errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
    errorMsg.includes('ERR_NETWORK_CHANGED') ||
    errorMsg.includes('fonts.googleapis.com') ||
    errorMsg.includes('messaging/token-unsubscribe-failed') ||
    errorMsg.includes('token-unsubscribe-failed') ||
    errorMsg.includes('fcmregistrations.googleapis.com') ||
    errorMsg.includes('The caller does not have permission') ||
    errorName === 'GeolocationPositionError'
  ) {
    event.preventDefault()
    return
  }
})

// ─────────────────────────────────────────────────────────────────────────────

import { AppProviders } from './app/providers.jsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <AppProviders>
    <App />
  </AppProviders>
)
