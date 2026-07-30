export const ACTIVE_MODULE_KEY = 'eqosy_active_module'
export const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

export const FOOD_ADMIN_HOME = '/admin/food'
export const TAXI_ADMIN_HOME = '/taxi/admin/dashboard'

export function getModuleFromPath(pathname = '') {
  const path = String(pathname || '')
  if (path.startsWith('/taxi/')) return 'taxi'
  if (path.startsWith('/food/')) return 'food'
  if (path.startsWith('/admin')) return 'admin'
  return null
}

export function getModuleHomeRoute(module) {
  if (module === 'taxi') return '/taxi/user'
  if (module === 'food') return '/food/user'
  if (module === 'admin') return '/admin'
  return '/food/user'
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

/** Warm Taxi admin chunks so Food ↔ Taxi admin tab switches stay SPA-smooth. */
export function prefetchTaxiAdmin() {
  return Promise.all([
    import('../../modules/Taxi/TaxiApp.jsx'),
    import('../../modules/Taxi/modules/admin/components/AdminLayout.jsx'),
    import('../../modules/Taxi/modules/admin/pages/dashboard/MainDashboard.jsx'),
  ]).catch(() => {})
}

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
