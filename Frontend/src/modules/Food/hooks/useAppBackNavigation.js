import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { isUnifiedAuthenticated } from "@food/utils/auth"

const toFoodPath = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("/food/")) return trimmed
  if (trimmed === "/food") return trimmed
  if (trimmed.startsWith("/user/")) return `/food${trimmed}`
  if (trimmed === "/user") return "/food/user"
  return null
}

const getNormalizedUserPath = (pathname) => {
  if (pathname.startsWith("/food")) {
    return pathname.slice(5) || "/"
  }
  return pathname || "/"
}

const resolveBackPath = ({ pathname, search, state }) => {
  const normalizedPath = getNormalizedUserPath(pathname)
  const explicitBackPath = toFoodPath(state?.backTo) || toFoodPath(state?.from)
  if (explicitBackPath && explicitBackPath !== pathname) {
    return explicitBackPath
  }
  const searchParams = new URLSearchParams(search || "")

  if (
    normalizedPath === "/user/profile/payments/new" ||
    /^\/user\/profile\/payments\/[^/]+\/edit$/.test(normalizedPath)
  ) {
    return "/food/user/profile/payments"
  }

  if (
    /^\/user\/profile\/(edit|favorites|support|coupons|about|report-safety-emergency|accessibility|logout|refer-earn|payments)$/.test(
      normalizedPath,
    )
  ) {
    return "/food/user/profile"
  }

  if (
    /^\/user\/profile\/(terms|privacy|refund|shipping|cancellation)$/.test(
      normalizedPath,
    )
  ) {
    return explicitBackPath || (isUnifiedAuthenticated() ? "/food/user/profile" : "/login")
  }

  if (normalizedPath === "/user/wallet") {
    return "/food/user/profile"
  }

  if (normalizedPath === "/user/notifications") {
    return explicitBackPath || (isUnifiedAuthenticated() ? "/food/user" : "/login")
  }

  if (/^\/user\/restaurants\/[^/]+$/.test(normalizedPath)) {
    if (searchParams.get("under250") === "true") {
      return "/food/user/under-250"
    }
    return explicitBackPath || (isUnifiedAuthenticated() ? "/food/user" : "/login")
  }

  if (/^\/user\/dining\/book(\/|$)/.test(normalizedPath)) {
    return explicitBackPath || "/food/user/dining"
  }

  if (/^\/user\/dining\/[^/]+\/[^/]+$/.test(normalizedPath)) {
    return explicitBackPath || "/food/user/dining"
  }

  if (
    normalizedPath === "/user/dining/restaurants" ||
    normalizedPath === "/user/dining/explore/upto50" ||
    normalizedPath === "/user/dining/explore/near-rated" ||
    normalizedPath === "/user/dining/coffee"
  ) {
    return "/food/user/dining"
  }

  if (/^\/user\/dining\/[^/]+$/.test(normalizedPath)) {
    return "/food/user/dining"
  }

  if (/^\/user\/orders\/[^/]+(\/invoice|\/details)?$/.test(normalizedPath)) {
    return "/food/user/orders"
  }

  if (
    normalizedPath === "/user/cart/checkout" ||
    normalizedPath === "/user/cart/select-address" ||
    normalizedPath === "/user/cart/address-selector"
  ) {
    return "/food/user/cart"
  }

  if (/^\/user\/collections\/[^/]+$/.test(normalizedPath)) {
    return "/food/user/collections"
  }

  if (normalizedPath === "/user/categories") {
    return isUnifiedAuthenticated() ? "/food/user" : "/login"
  }

  if (/^\/user\/category\/[^/]+$/.test(normalizedPath)) {
    return "/food/user/categories"
  }

  if (
    normalizedPath === "/user/offers" ||
    normalizedPath === "/user/gourmet" ||
    normalizedPath === "/user/coffee"
  ) {
    return isUnifiedAuthenticated() ? "/food/user" : "/login"
  }

  if (/^\/user\/product\/[^/]+$/.test(normalizedPath)) {
    return explicitBackPath || (isUnifiedAuthenticated() ? "/food/user" : "/login")
  }

  if (/^\/user\/complaints(\/|$)/.test(normalizedPath)) {
    return explicitBackPath || "/food/user/orders"
  }

  if (explicitBackPath && explicitBackPath !== pathname) {
    return explicitBackPath
  }

  return isUnifiedAuthenticated() ? "/food/user" : "/login"
}

export default function useAppBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const explicitBackPath = toFoodPath(location.state?.backTo) || toFoodPath(location.state?.from)

    // If an explicit back path was provided via navigation state
    if (explicitBackPath && explicitBackPath !== location.pathname) {
      // If explicit path is cart and we are on a restaurant page, prefer /food/user
      if (
        explicitBackPath.includes("/cart") &&
        (location.pathname.includes("/restaurants/") || location.pathname.includes("/restaurant/"))
      ) {
        navigate("/food/user")
        return
      }
      navigate(explicitBackPath)
      return
    }

    // Check if resolveBackPath has a specific route rule for the current location
    const resolvedPath = resolveBackPath(location)
    const normalizedPath = getNormalizedUserPath(location.pathname)

    // For specific structured routes, always use the resolved hierarchy path over random browser history
    const hasSpecificRule =
      /^\/user\/restaurants\/[^/]+$/.test(normalizedPath) ||
      /^\/user\/profile\/(edit|favorites|support|coupons|about|report-safety-emergency|accessibility|logout|refer-earn|payments|terms|privacy|refund|shipping|cancellation)(\/|$)/.test(
        normalizedPath,
      ) ||
      normalizedPath === "/user/profile/payments/new" ||
      normalizedPath === "/user/wallet" ||
      normalizedPath === "/user/notifications" ||
      /^\/user\/dining\//.test(normalizedPath) ||
      /^\/user\/orders\/[^/]+/.test(normalizedPath) ||
      /^\/user\/cart\/(checkout|select-address|address-selector)$/.test(normalizedPath) ||
      /^\/user\/collections\/[^/]+$/.test(normalizedPath) ||
      /^\/user\/category\/[^/]+$/.test(normalizedPath) ||
      /^\/user\/product\/[^/]+$/.test(normalizedPath) ||
      /^\/user\/complaints/.test(normalizedPath)

    if (hasSpecificRule) {
      if (!isUnifiedAuthenticated() && (resolvedPath.startsWith("/food/user") || resolvedPath.startsWith("/user"))) {
        navigate("/login", { replace: true })
        return
      }
      navigate(resolvedPath)
      return
    }

    // Fallback: If browser history is available, navigate(-1)
    if (typeof window !== "undefined" && window.history && window.history.length > 2) {
      navigate(-1)
      return
    }

    if (!isUnifiedAuthenticated() && (resolvedPath.startsWith("/food/user") || resolvedPath.startsWith("/user"))) {
      navigate("/login", { replace: true })
      return
    }
    navigate(resolvedPath)
  }, [location, navigate])
}
