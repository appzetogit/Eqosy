import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './app/App.jsx'
import { isModuleAuthenticated } from './modules/Food/utils/auth.js'
import { syncThemeForPath } from './shared/utils/theme.js'
import { NATIVE_LAST_ROUTE_KEY } from './shared/utils/activeModule.js'
import './shared/styles/global.css'

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

function resolveNativeInitialRoute() {
  if (typeof window === 'undefined') return '/'

  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'

  // Root domain '/' or empty pathname must ALWAYS stay on '/' (Landing Page)
  if (pathname === '/' || pathname === '') return '/'

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

  if (pathname.startsWith('/taxi/')) return isTransient(pathname) ? '/taxi/user' : pathname
  if (pathname.startsWith('/food/')) return pathname
  if (pathname.startsWith('/restaurant')) return `/food${pathname}`
  if (pathname.startsWith('/delivery')) return `/food${pathname}`
  if (pathname.startsWith('/user')) return `/food${pathname}`
  if (pathname.startsWith('/admin')) return pathname
  if (storedRoute.startsWith('/taxi/')) {
    return isTransient(storedRoute) ? '/taxi/user' : storedRoute
  }
  if (storedRoute.startsWith('/food/') || storedRoute.startsWith('/admin')) {
    return storedRoute
  }

  if (isModuleAuthenticated('restaurant')) return '/food/restaurant'
  if (isModuleAuthenticated('delivery')) return '/food/delivery'
  if (isModuleAuthenticated('admin')) return '/admin'
  if (isModuleAuthenticated('user')) return '/food/user'

  return '/'
}

function bootstrapNativeHashRoute() {
  if (!isNativeLikeShell() || typeof window === 'undefined') return

  const rawPathname = String(window.location?.pathname || '')
  const pathname = rawPathname.replace(/\/index\.html$/i, '') || '/'

  // Web root domain '/' must never be redirected to a hash route
  if (pathname === '/' || pathname === '') return

  const currentHash = String(window.location?.hash || '')
  const hashPath = currentHash.startsWith('#') ? currentHash.slice(1).split('?')[0] : ''
  const targetPath = resolveNativeInitialRoute()
  const search = String(window.location?.search || '')

  if (currentHash.startsWith('#/')) {
    const nativePathPrefix = targetPath.startsWith('/taxi/')
      ? '/taxi/'
      : targetPath.startsWith('/food/')
        ? '/food/'
        : targetPath.startsWith('/admin')
          ? '/admin'
          : ''

    const hashMatchesPrefix = nativePathPrefix ? hashPath.startsWith(nativePathPrefix) : false;
    const pathSuggestsTaxi = pathname.startsWith('/taxi/');

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
  const errorStr = args.join(' ')

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
    (warnStr.includes('attribute cy') && warnStr.includes('Expected length'))
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
