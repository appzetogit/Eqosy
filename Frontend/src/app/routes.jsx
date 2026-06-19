import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useLayoutEffect } from 'react'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'
import { scheduleFoodThemeReassert } from '../shared/utils/theme.js'
import {
  NATIVE_LAST_ROUTE_KEY,
  syncActiveModule,
} from '../shared/utils/activeModule.js'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const TaxiApp = lazy(() => import('../modules/Taxi/TaxiApp'))
const AuthApp = lazy(() => import('../modules/auth/routes'))

const PageLoader = () => <AppShellSkeleton />

const FoodAppWrapper = () => {
  const location = useLocation()
  const vertical = new URLSearchParams(location.search).get('vertical')

  useLayoutEffect(() => {
    scheduleFoodThemeReassert()
  }, [location.pathname])

  // Taxi lives under /taxi/* only — never embed it on /food/user.
  if (
    location.pathname.replace(/\/$/, '') === '/food/user' &&
    vertical === 'taxi'
  ) {
    return <Navigate to="/taxi/user" replace />
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const TaxiAppWrapper = () => (
  <Suspense fallback={<PageLoader />}>
    <TaxiApp />
  </Suspense>
)

const RedirectToFood = () => {
  const location = useLocation()
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />
}

const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    syncActiveModule(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route.startsWith('/taxi/') || route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login/*" element={<Suspense fallback={<PageLoader />}><AuthApp /></Suspense>} />
      <Route path="/food/*" element={<FoodAppWrapper />} />
      <Route path="/taxi/*" element={<TaxiAppWrapper />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />
      <Route path="/user/*" element={<RedirectToFood />} />
      <Route path="/restaurant/*" element={<RedirectToFood />} />
      <Route path="/delivery/*" element={<RedirectToFood />} />
      <Route path="/usermain/*" element={<RedirectToFood />} />
      <Route path="/profile/*" element={<RedirectToFood />} />
      <Route path="/cart/*" element={<Navigate to="/food/user/cart" replace />} />
      <Route path="/orders/*" element={<RedirectToFood />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
