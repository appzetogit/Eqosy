import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect, Suspense, lazy } from "react"
import ProtectedRoute from "@food/components/ProtectedRoute"
import AuthRedirect from "@food/components/AuthRedirect"
import Loader from "@food/components/Loader"
import PushSoundEnableButton from "@food/components/PushSoundEnableButton"
import { registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { isModuleAuthenticated } from "@food/utils/auth"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import lazyWithRetry from "@/shared/utils/lazyWithRetry"

// Lazy Loading Components
const UserRouter = lazyWithRetry(() => import("@food/components/user/UserRouter"))

// Restaurant Module
const RestaurantRouter = lazyWithRetry(() => import("@food/components/restaurant/RestaurantRouter"))

// Admin Module
const AdminRouter = lazyWithRetry(() => import("@food/components/admin/AdminRouter"))
const AdminLogin = lazyWithRetry(() => import("@food/pages/admin/auth/AdminLogin"))
const AdminSignup = lazyWithRetry(() => import("@food/pages/admin/auth/AdminSignup"))
const AdminForgotPassword = lazyWithRetry(() => import("@food/pages/admin/auth/AdminForgotPassword"))

// Delivery Module
const DeliveryRouter = lazyWithRetry(() => import("../DeliveryV2"))

function UserPathRedirect() {
  const location = useLocation()
  // Correctly handle the /food/user -> /food redirect regardless of where it starts
  const newPath = location.pathname.replace("/user", "") || "/food"
  return <Navigate to={newPath} replace />
}

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RestaurantGlobalNotificationListenerInner() {
  useRestaurantNotifications()
  return null
}

function RestaurantGlobalNotificationListener() {
  const location = useLocation()
  const isRestaurantRoute =
    location.pathname.startsWith("/food/restaurant") &&
    !location.pathname.startsWith("/food/restaurants")
  const isRestaurantAuthRoute =
    location.pathname === "/food/restaurant/login" ||
    location.pathname === "/food/restaurant/auth/sign-in" ||
    location.pathname === "/food/restaurant/signup" ||
    location.pathname === "/food/restaurant/signup-email" ||
    location.pathname === "/food/restaurant/forgot-password" ||
    location.pathname === "/food/restaurant/otp" ||
    location.pathname === "/food/restaurant/welcome" ||
    location.pathname === "/food/restaurant/auth/google-callback"
  const isOrderManagedRoute =
    location.pathname === "/food/restaurant" ||
    location.pathname === "/food/restaurant/orders" ||
    location.pathname.startsWith("/food/restaurant/orders/")

  const shouldListen =
    isRestaurantRoute &&
    !isRestaurantAuthRoute &&
    !isOrderManagedRoute &&
    isModuleAuthenticated("restaurant")

  if (!shouldListen) {
    return null
  }

  return <RestaurantGlobalNotificationListenerInner />
}

const FoodRootRedirect = () => {
  if (isModuleAuthenticated('delivery')) return <Navigate to="/food/delivery" replace />
  if (isModuleAuthenticated('restaurant')) return <Navigate to="/food/restaurant" replace />
  return <Navigate to="/food/user" replace />
}

const FoodFallbackRedirect = () => {
  const location = useLocation()
  const pathname = location.pathname.toLowerCase()
  if (pathname.includes('/delivery')) return <Navigate to="/food/delivery" replace />
  if (pathname.includes('/restaurant')) return <Navigate to="/food/restaurant" replace />
  return <Navigate to="/food/user" replace />
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    registerWebPushForCurrentModule(location.pathname)
  }, [location.pathname])

  return (
    <>
      <ScrollToTop />
      <RestaurantGlobalNotificationListener />
      <PushSoundEnableButton />
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* User Module - Explicitly mapped to /user */}
          <Route
            path="user/*"
            element={<UserRouter />}
          />

          {/* Restaurant Module - Already mapped to /restaurant */}
          <Route
            path="restaurant"
            element={<RestaurantRouter />}
          />
          <Route
            path="restaurant/*"
            element={<RestaurantRouter />}
          />

          {/* Delivery Module - Already mapped to /delivery */}
          <Route
            path="delivery"
            element={<DeliveryRouter />}
          />
          <Route
            path="delivery/*"
            element={<DeliveryRouter />}
          />

          {/* Fallbacks preserving app context */}
          <Route path="/" element={<FoodRootRedirect />} />
          <Route path="*" element={<FoodFallbackRedirect />} />
        </Routes>
      </Suspense>
    </>
  )
}
