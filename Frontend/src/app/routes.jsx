import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'
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

const LandingPage = lazy(() => import('../modules/Taxi/modules/shared/pages/LandingPage'))
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

    // Do NOT persist transient ride-flow routes that rely on React Router state.
    // If the app reopens on these pages the state is lost, showing stale data.
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
    const isTransient = TRANSIENT_ROUTE_SEGMENTS.some(seg => route.includes(seg))
    if (isTransient) return

    if (route.startsWith('/taxi/') || route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
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
      <Route path="/user/*" element={<Navigate to="/food/user" replace />} />
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
