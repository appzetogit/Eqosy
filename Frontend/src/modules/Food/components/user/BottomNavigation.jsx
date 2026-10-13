import React from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Tag,
  User,
  Truck,
  UtensilsCrossed,
  Store,
  LayoutGrid,
  ShoppingCart,
  Receipt,
} from "lucide-react"
import { useHideOnScroll } from "@/shared/hooks/useHideOnScroll"
import { useCart } from "@food/context/CartContext"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname
  const search = location.search
  const searchParams = new URLSearchParams(search)
  const isVisible = useHideOnScroll({ threshold: 6, topOffset: 20 })
  const { cart = [] } = useCart()
  const itemCount = (Array.isArray(cart) ? cart : [])
    .filter((item) => Boolean(item?.isGrocery) === (new URLSearchParams(search).get("vertical") === "grocery"))
    .reduce((sum, item) => sum + (item?.quantity || 0), 0)

  // Detect whether currently in Grocery/Quick Mart mode
  const isGrocery =
    searchParams.get("vertical") === "grocery" ||
    pathname.includes("/grocery") ||
    pathname.startsWith("/food/user/grocery")

  // ==================== FOOD NAVIGATION STATE ====================
  const isDining =
    pathname === "/food/dining" || pathname.startsWith("/food/user/dining")
  const isUnder250 =
    pathname === "/food/under-250" || pathname.startsWith("/food/user/under-250")
  const isProfile =
    pathname.startsWith("/food/profile") || pathname.startsWith("/food/user/profile")
  const isDelivery =
    !isDining &&
    !isUnder250 &&
    !isProfile &&
    (pathname === "/food" ||
      pathname === "/food/" ||
      pathname === "/food/user" ||
      (pathname.startsWith("/food/user") &&
        !pathname.includes("/dining") &&
        !pathname.includes("/under-250") &&
        !pathname.includes("/profile")))

  // ==================== GROCERY NAVIGATION STATE ====================
  const isGroceryHome =
    isGrocery &&
    (pathname === "/food/user" ||
      pathname === "/food" ||
      pathname === "/food/" ||
      pathname.includes("/grocery")) &&
    !pathname.includes("/categories") &&
    !pathname.includes("/cart") &&
    !pathname.includes("/orders") &&
    !pathname.includes("/profile")
  const isGroceryCategories = pathname.includes("/categories") || pathname.includes("/category")
  const isGroceryCart = pathname.includes("/cart")
  const isGroceryOrders = pathname.includes("/orders")
  const isGroceryProfile = pathname.includes("/profile")

  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 z-50 will-change-transform transition-all duration-300 ease-in-out transform ${
        isVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-around h-auto px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-white/10 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {isGrocery ? (
          /* ===================================================================
           * GROCERY / QUICK MART BOTTOM NAVIGATION (Zepto / Blinkit Style)
           * =================================================================== */
          <>
            {/* Quick Mart (Home) Tab */}
            <Link
              to="/food/user?vertical=grocery"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isGroceryHome
                  ? "text-[#16A34A] bg-[#16A34A]/10 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <Store
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isGroceryHome
                      ? "text-[#16A34A] scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isGroceryHome ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isGroceryHome
                    ? "text-[#16A34A]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Quick Mart
              </span>
            </Link>

            {/* Categories Tab */}
            <Link
              to="/food/user/categories?vertical=grocery"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isGroceryCategories
                  ? "text-[#16A34A] bg-[#16A34A]/10 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <LayoutGrid
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isGroceryCategories
                      ? "text-[#16A34A] scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isGroceryCategories ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isGroceryCategories
                    ? "text-[#16A34A]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Categories
              </span>
            </Link>

            {/* Cart Tab */}
            <Link
              to="/food/user/cart?vertical=grocery"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isGroceryCart
                  ? "text-[#16A34A] bg-[#16A34A]/10 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <ShoppingCart
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isGroceryCart
                      ? "text-[#16A34A] scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isGroceryCart ? 2.5 : 2}
                />
                {itemCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[#16A34A] text-white text-[9px] font-black flex items-center justify-center leading-none shadow-sm">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isGroceryCart
                    ? "text-[#16A34A]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Cart
              </span>
            </Link>

            {/* Orders Tab */}
            <Link
              to="/food/user/orders?vertical=grocery"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isGroceryOrders
                  ? "text-[#16A34A] bg-[#16A34A]/10 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <Receipt
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isGroceryOrders
                      ? "text-[#16A34A] scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isGroceryOrders ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isGroceryOrders
                    ? "text-[#16A34A]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Orders
              </span>
            </Link>

            {/* Profile Tab */}
            <Link
              to="/food/user/profile?vertical=grocery"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isGroceryProfile
                  ? "text-[#16A34A] bg-[#16A34A]/10 font-bold"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <User
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isGroceryProfile
                      ? "text-[#16A34A] scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isGroceryProfile ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isGroceryProfile
                    ? "text-[#16A34A]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Profile
              </span>
            </Link>
          </>
        ) : (
          /* ===================================================================
           * FOOD DELIVERY BOTTOM NAVIGATION (Delivery, Dining, Switch 99, Profile)
           * =================================================================== */
          <>
            {/* Delivery Tab */}
            <Link
              to="/food/user"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isDelivery
                  ? "text-[#F97316] bg-[#F97316]/10"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <Truck
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isDelivery
                      ? "text-[#F97316] fill-[#F97316]/20 scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isDelivery ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isDelivery
                    ? "text-[#F97316]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Delivery
              </span>
            </Link>

            {/* Dining Tab */}
            <Link
              to="/food/user/dining"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isDining
                  ? "text-[#F97316] bg-[#F97316]/10"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <UtensilsCrossed
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isDining ? "text-[#F97316] scale-110" : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isDining ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isDining
                    ? "text-[#F97316]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Dining
              </span>
            </Link>

            {/* Under 250 (Switch 99) Tab */}
            <Link
              to="/food/user/under-250"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isUnder250
                  ? "text-[#F97316] bg-[#F97316]/10"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <Tag
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isUnder250
                      ? "text-[#F97316] fill-[#F97316]/20 scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isUnder250 ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isUnder250
                    ? "text-[#F97316]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Switch 99
              </span>
            </Link>

            {/* Profile Tab */}
            <Link
              to="/food/user/profile"
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${
                isProfile
                  ? "text-[#F97316] bg-[#F97316]/10"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="relative">
                <User
                  className={`h-5 w-5 transition-transform duration-300 ${
                    isProfile
                      ? "text-[#F97316] fill-[#F97316]/20 scale-110"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                  strokeWidth={isProfile ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${
                  isProfile
                    ? "text-[#F97316]"
                    : "text-gray-500 dark:text-gray-400 opacity-80"
                }`}
              >
                Profile
              </span>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
