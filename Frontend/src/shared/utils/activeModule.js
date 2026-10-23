export const ACTIVE_MODULE_KEY = 'eqosy_active_module'
export const NATIVE_LAST_ROUTE_KEY = 'native_last_route'
// When the user was last on NATIVE_LAST_ROUTE_KEY (updated when the app goes to the background).
export const NATIVE_LAST_ROUTE_AT_KEY = 'native_last_route_at'

export const FOOD_ADMIN_HOME = '/admin/food'
export const TAXI_ADMIN_HOME = '/taxi/admin/dashboard'
export const GLOBAL_ADMIN_HOME = '/admin/global/branding'

export function getModuleFromPath(pathname = '') {
  const path = String(pathname || '').toLowerCase()
  if (path.startsWith('/food/delivery') || path.startsWith('/delivery')) return 'delivery'
  if (path.startsWith('/food/restaurant') || path.startsWith('/restaurant')) return 'restaurant'
  if (path.startsWith('/taxi/driver') || path.startsWith('/driver')) return 'taxi_driver'
  if (path.startsWith('/taxi/owner') || path.startsWith('/owner')) return 'taxi_owner'
  if (path.startsWith('/admin') || path.startsWith('/food/admin') || path.startsWith('/taxi/admin')) return 'admin'
  if (path.startsWith('/taxi')) return 'taxi'
  if (path.startsWith('/food')) return 'food'
  return null
}

export function getModuleHomeRoute(module) {
  if (module === 'delivery') return '/food/delivery'
  if (module === 'restaurant') return '/food/restaurant'
  if (module === 'taxi_driver' || module === 'driver') return '/taxi/driver/home'
  if (module === 'taxi_owner' || module === 'owner') return '/taxi/owner/dashboard'
  if (module === 'admin') return '/admin'
  if (module === 'taxi' || module === 'taxi_user') return '/taxi/user'
  if (module === 'food' || module === 'food_user') return '/food/user'
  return '/food/user'
}

export function isRoleAuthenticated(role) {
  if (typeof localStorage === 'undefined') return false
  try {
    const isTokenNotExpired = (token) => {
      if (!token) return false
      try {
        const parts = token.split('.')
        if (parts.length !== 3) return false
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (!payload || !payload.exp) return true
        return payload.exp * 1000 > Date.now()
      } catch {
        return false
      }
    }

    if (role === 'delivery') {
      const t = localStorage.getItem('delivery_accessToken')
      return Boolean(t && isTokenNotExpired(t))
    }
    if (role === 'restaurant') {
      const t = localStorage.getItem('restaurant_accessToken')
      return Boolean(t && isTokenNotExpired(t))
    }
    if (role === 'driver') {
      const t =
        localStorage.getItem('driver_accessToken') ||
        localStorage.getItem('driverToken') ||
        (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('driverToken') : null) ||
        (localStorage.getItem('role') === 'driver' ? localStorage.getItem('token') : null)
      return Boolean(t && isTokenNotExpired(t))
    }
    if (role === 'owner') {
      const t =
        localStorage.getItem('owner_accessToken') ||
        localStorage.getItem('driverToken') ||
        (localStorage.getItem('role') === 'owner' ? localStorage.getItem('token') : null)
      return Boolean(t && isTokenNotExpired(t))
    }
    if (role === 'admin') {
      const t = localStorage.getItem('admin_accessToken')
      return Boolean(t && isTokenNotExpired(t))
    }
    if (role === 'user') {
      const t =
        localStorage.getItem('user_accessToken') ||
        localStorage.getItem('userToken') ||
        (localStorage.getItem('role') === 'user' ? localStorage.getItem('token') : null)
      return Boolean(t && isTokenNotExpired(t))
    }
  } catch {
    return false
  }
  return false
}

export function resolveCurrentAppHomeRoute(candidatePath = '') {
  if (typeof window === 'undefined') return '/food/user'

  const getCleanPath = (raw) => {
    if (!raw) return ''
    const noHash = raw.startsWith('#') ? raw.slice(1) : raw
    return noHash.split('?')[0].replace(/\/$/, '').toLowerCase()
  }

  // 1. Check candidatePath or window.location.hash or window.location.pathname
  const hash = String(window.location?.hash || '')
  const currentHashPath = hash.startsWith('#/') ? getCleanPath(hash) : ''
  const currentPathname = getCleanPath(window.location?.pathname || '')
  const checkPath = getCleanPath(candidatePath) || currentHashPath || currentPathname

  if (checkPath && checkPath !== '/' && checkPath !== '') {
    if (checkPath.startsWith('/food/delivery') || checkPath.startsWith('/delivery')) {
      return '/food/delivery'
    }
    if (checkPath.startsWith('/food/restaurant') || checkPath.startsWith('/restaurant')) {
      return '/food/restaurant'
    }
    if (checkPath.startsWith('/taxi/driver') || checkPath.startsWith('/driver')) {
      return '/taxi/driver/home'
    }
    if (checkPath.startsWith('/taxi/owner') || checkPath.startsWith('/owner')) {
      return '/taxi/owner/dashboard'
    }
    if (checkPath.startsWith('/admin') || checkPath.startsWith('/food/admin') || checkPath.startsWith('/taxi/admin')) {
      return '/admin'
    }
    if (checkPath.startsWith('/taxi')) {
      return '/taxi/user'
    }
    if (checkPath.startsWith('/food')) {
      return '/food/user'
    }
  }

  // 2. Check stored native last route
  try {
    const storedRoute = getCleanPath(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '')
    if (storedRoute && storedRoute !== '/') {
      const isAuthPath = storedRoute.includes('/login') || storedRoute.includes('/auth/') || storedRoute.includes('/register') || storedRoute.includes('/reg-') || storedRoute.includes('/otp');
      if (storedRoute.startsWith('/food/delivery') || storedRoute.startsWith('/delivery')) {
        if (isRoleAuthenticated('delivery')) return '/food/delivery';
        if (isAuthPath) return storedRoute;
        return '/food/delivery/login';
      }
      if (storedRoute.startsWith('/food/restaurant') || storedRoute.startsWith('/restaurant')) {
        if (isRoleAuthenticated('restaurant')) return '/food/restaurant';
        if (isAuthPath) return storedRoute;
        return '/food/restaurant/login';
      }
      if (storedRoute.startsWith('/taxi/driver') || storedRoute.startsWith('/driver')) {
        if (isRoleAuthenticated('driver')) return '/taxi/driver/home';
        if (isAuthPath) return storedRoute;
        return '/taxi/driver/login';
      }
      if (storedRoute.startsWith('/taxi/owner') || storedRoute.startsWith('/owner')) {
        if (isRoleAuthenticated('owner')) return '/taxi/owner/dashboard';
        if (isAuthPath) return storedRoute;
        return '/taxi/owner/login';
      }
      if (storedRoute.startsWith('/admin')) {
        if (isRoleAuthenticated('admin')) return '/admin';
        return '/admin/login';
      }
      if (storedRoute.startsWith('/taxi')) {
        return '/taxi/user';
      }
      if (storedRoute.startsWith('/food')) {
        return '/food/user';
      }
    }
  } catch { /* ignore */ }

  // 3. Check active module stored in localStorage
  try {
    const activeModule = String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
    if (activeModule) {
      if (activeModule === 'taxi_driver' && !isRoleAuthenticated('driver')) {
        return '/taxi/driver/login';
      }
      if (activeModule === 'taxi_owner' && !isRoleAuthenticated('owner')) {
        return '/taxi/owner/login';
      }
      if (activeModule === 'restaurant' && !isRoleAuthenticated('restaurant')) {
        return '/food/restaurant/login';
      }
      if (activeModule === 'delivery' && !isRoleAuthenticated('delivery')) {
        return '/food/delivery/login';
      }
      const home = getModuleHomeRoute(activeModule)
      if (home && home !== '/food/user') return home
      if (activeModule === 'food' || activeModule === 'food_user') return '/food/user'
    }
  } catch { /* ignore */ }

  // 4. Check authenticated role from tokens
  if (isRoleAuthenticated('delivery')) return '/food/delivery'
  if (isRoleAuthenticated('restaurant')) return '/food/restaurant'
  if (isRoleAuthenticated('driver')) return '/taxi/driver/home'
  if (isRoleAuthenticated('owner')) return '/taxi/owner/dashboard'
  if (isRoleAuthenticated('admin')) return '/admin'
  if (isRoleAuthenticated('user')) {
    const activeModule = String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
    return activeModule === 'taxi' ? '/taxi/user' : '/food/user'
  }

  return '/'
}

export function syncActiveModule(pathname = '') {
  if (typeof localStorage === 'undefined') return null

  const module = getModuleFromPath(pathname)
  if (module) {
    localStorage.setItem(ACTIVE_MODULE_KEY, module)
  }
  return module
}

/** Warm Food admin chunks so Food ↔ Taxi admin tab switches stay SPA-smooth. */
export function prefetchFoodAdmin() {
  return Promise.all([
    import('../../modules/Food/components/admin/AdminRouter.jsx'),
    import('../../modules/Food/pages/admin/AdminHome.jsx'),
  ]).catch(() => {})
}

/** Warm Global settings chunks so switching to the Global tab does not flash a loader. */
export function prefetchGlobalAdmin() {
  return Promise.all([
    prefetchFoodAdmin(),
    import('../../modules/Taxi/modules/admin/pages/settings/GeneralSettings.jsx'),
    import('../../modules/Taxi/shared/context/SettingsContext.jsx'),
  ]).catch(() => {})
}

/** Warm Taxi admin chunks so Food ↔ Taxi admin tab switches stay SPA-smooth. */
export function prefetchTaxiAdmin() {
  return Promise.all([
    import('../../modules/Taxi/TaxiApp.jsx'),
    import('../../modules/Taxi/modules/admin/components/AdminLayout.jsx'),
    import('../../modules/Taxi/modules/admin/pages/dashboard/MainDashboard.jsx'),
  ]).catch(() => {})
}

/**
 * Routes that rely on React Router state and must never be restored
 * after an app restart — the state would be lost, showing stale data.
 */
const TRANSIENT_ROUTE_SEGMENTS = [
  '/ride/select-vehicle',
  '/ride/select-location',
  '/ride/searching',
  '/ride/tracking',
  '/ride/complete',
  '/ride/chat',
  '/parcel/searching',
  '/parcel/tracking',
  '/parcel/details',
  '/parcel/contacts',
  '/intercity/details',
  '/intercity/confirm',
  '/rental/vehicle',
  '/rental/schedule',
  '/rental/kyc',
  '/rental/deposit',
  '/rental/confirmed',
]

const isTransientRoute = (route) =>
  TRANSIENT_ROUTE_SEGMENTS.some((seg) => route.includes(seg))

/**
 * Post-login destination for the consumer (/login) auth flow only.
 * Must never send users to admin/restaurant/delivery panels — those have
 * their own login screens. Leftover `eqosy_active_module=admin` or
 * `native_last_route=/admin/...` from an earlier admin visit must not
 * override a normal user login.
 */
export function resolvePostLoginRoute() {
  if (typeof localStorage === 'undefined') return '/food/user'

  const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()

  // Never restore transient ride-flow routes — state is lost on restart.
  if (isTransientRoute(storedRoute)) {
    if (storedRoute.startsWith('/taxi/')) return '/taxi/user'
    return '/food/user'
  }

  if (storedRoute.startsWith('/taxi/')) return storedRoute.split('?')[0]
  if (storedRoute.startsWith('/food/user')) return '/food/user'
  if (
    storedRoute.startsWith('/food/') &&
    !storedRoute.startsWith('/food/restaurant') &&
    !storedRoute.startsWith('/food/delivery') &&
    !storedRoute.startsWith('/food/admin')
  ) {
    return storedRoute.split('?')[0]
  }

  const activeModule = String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
  if (activeModule === 'taxi') return '/taxi/user'
  // food (or anything else, including stale "admin") → consumer home
  return '/food/user'
}
