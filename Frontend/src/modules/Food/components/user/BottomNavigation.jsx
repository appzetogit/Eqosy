import { Link, useLocation } from "react-router-dom"
import { Tag, User, Truck, UtensilsCrossed } from "lucide-react"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname

  // Check active routes - support both /user/* and /* paths
  const isDining = pathname === "/food/dining" || pathname.startsWith("/food/user/dining")
  const isUnder250 = pathname === "/food/under-250" || pathname.startsWith("/food/user/under-250")
  const isProfile = pathname.startsWith("/food/profile") || pathname.startsWith("/food/user/profile")
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

  return (
    <div
      className="md:hidden fixed bottom-6 left-5 right-5 z-50 pointer-events-none"
    >
      <div className="flex items-center justify-around h-auto px-2 py-1.5 bg-white/85 dark:bg-[#1a1a1a]/85 backdrop-blur-[20px] border border-white/50 dark:border-white/10 rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.15)] pointer-events-auto">
        
        {/* Delivery Tab */}
        <Link
          to="/food/user"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isDelivery
              ? "text-[#F97316] bg-[#F97316]/10"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
        >
          <div className="relative">
            <Truck className={`h-5 w-5 transition-transform duration-300 ${isDelivery ? "text-[#F97316] fill-[#F97316]/20 scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isDelivery ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isDelivery ? "text-[#F97316]" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Delivery
          </span>
        </Link>

        {/* Dining Tab */}
        <Link
          to="/food/user/dining"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isDining
              ? "text-[#F97316] bg-[#F97316]/10"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
        >
          <div className="relative">
            <UtensilsCrossed className={`h-5 w-5 transition-transform duration-300 ${isDining ? "text-[#F97316] scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isDining ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isDining ? "text-[#F97316]" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Dining
          </span>
        </Link>

        {/* Under 250 Tab */}
        <Link
          to="/food/user/under-250"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isUnder250
              ? "text-[#F97316] bg-[#F97316]/10"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
        >
          <div className="relative">
            <Tag className={`h-5 w-5 transition-transform duration-300 ${isUnder250 ? "text-[#F97316] fill-[#F97316]/20 scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isUnder250 ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isUnder250 ? "text-[#F97316]" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Switch 99
          </span>
        </Link>

        {/* Profile Tab */}
        <Link
          to="/food/user/profile"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isProfile
              ? "text-[#F97316] bg-[#F97316]/10"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
        >
          <div className="relative">
            <User className={`h-5 w-5 transition-transform duration-300 ${isProfile ? "text-[#F97316] fill-[#F97316]/20 scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isProfile ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isProfile ? "text-[#F97316]" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Profile
          </span>
        </Link>
      </div>
    </div>
  )
}
