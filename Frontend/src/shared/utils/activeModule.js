export const ACTIVE_MODULE_KEY = 'eqosy_active_module'
export const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

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

export function resolvePostLoginRoute() {
  if (typeof localStorage === 'undefined') return '/food/user'

  const storedRoute = String(localStorage.getItem(NATIVE_LAST_ROUTE_KEY) || '').trim()
  if (storedRoute.startsWith('/taxi/')) return '/taxi/user'
  if (storedRoute.startsWith('/food/user')) return '/food/user'
  if (storedRoute.startsWith('/food/')) return storedRoute.split('?')[0]
  if (storedRoute.startsWith('/admin')) return storedRoute.split('?')[0]

  const activeModule = String(localStorage.getItem(ACTIVE_MODULE_KEY) || '').trim()
  if (activeModule === 'taxi') return '/taxi/user'
  if (activeModule === 'food') return '/food/user'
  if (activeModule === 'admin') return '/admin'

  return '/food/user'
}
