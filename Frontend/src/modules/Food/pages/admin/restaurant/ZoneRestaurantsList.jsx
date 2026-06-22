import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import {
  ArrowLeft,
  Search,
  RefreshCw,
  MapPin,
  Building2,
  Loader2,
} from "lucide-react"
import { adminAPI } from "@food/api"

const debugError = (...args) => {}

const PLACEHOLDER_40 =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect fill='%23e2e8f0' width='40' height='40'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='12' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E"

const RANK_OPTIONS = ["", ...Array.from({ length: 10 }, (_, i) => String(i + 1))]

const normalizeImageUrl = (image) => {
  if (!image) return ""
  if (typeof image === "string") return image
  if (typeof image === "object") return image.url || image.secure_url || ""
  return ""
}

const getPrimaryRestaurantImage = (restaurant) => {
  const coverImages = Array.isArray(restaurant?.coverImages) ? restaurant.coverImages : []
  const firstCover = coverImages.map(normalizeImageUrl).find(Boolean)
  if (firstCover) return firstCover
  const menuImages = Array.isArray(restaurant?.menuImages) ? restaurant.menuImages : []
  const firstMenu = menuImages.map(normalizeImageUrl).find(Boolean)
  if (firstMenu) return firstMenu
  return (
    normalizeImageUrl(restaurant?.profileImage) ||
    normalizeImageUrl(restaurant?.logo) ||
    normalizeImageUrl(restaurant?.restaurantImage) ||
    PLACEHOLDER_40
  )
}

const getRestaurantAddress = (restaurant) => {
  const loc = restaurant?.location || {}
  return (
    loc.formattedAddress ||
    [loc.addressLine1, loc.addressLine2, loc.area, loc.city, restaurant?.area, restaurant?.city]
      .filter(Boolean)
      .join(", ") ||
    "N/A"
  )
}

const statusLabel = (status) => {
  const raw = String(status || "").trim().toLowerCase()
  if (raw === "approved") return "Approved"
  if (raw === "rejected") return "Rejected"
  if (raw === "pending") return "Pending"
  return status || "Unknown"
}

const statusBadgeClass = (status) => {
  const raw = String(status || "").trim().toLowerCase()
  if (raw === "approved") return "bg-emerald-100 text-emerald-700"
  if (raw === "rejected") return "bg-rose-100 text-rose-700"
  if (raw === "pending") return "bg-amber-100 text-amber-700"
  return "bg-slate-100 text-slate-700"
}

export default function ZoneRestaurantsList() {
  const navigate = useNavigate()
  const { zoneId } = useParams()
  const location = useLocation()
  const isMountedRef = useRef(true)

  const [zone, setZone] = useState(location.state?.zone || null)
  const [zoneLoading, setZoneLoading] = useState(!location.state?.zone)
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [updatingRankId, setUpdatingRankId] = useState(null)

  const fetchZone = useCallback(async () => {
    if (!zoneId) return
    try {
      setZoneLoading(true)
      const response = await adminAPI.getZoneById(zoneId)
      if (response.data?.success && response.data.data?.zone) {
        if (isMountedRef.current) setZone(response.data.data.zone)
      }
    } catch (error) {
      debugError("Error fetching zone:", error)
      if (isMountedRef.current) {
        alert("Failed to load zone details")
        navigate("/admin/food/zone-setup")
      }
    } finally {
      if (isMountedRef.current) setZoneLoading(false)
    }
  }, [zoneId, navigate])

  const fetchRestaurants = useCallback(async ({ silent = false } = {}) => {
    if (!zoneId) return
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const response = await adminAPI.getRestaurants({ zoneId, limit: 1000 })
      const rawList = response?.data?.data?.restaurants || []
      if (isMountedRef.current) setRestaurants(Array.isArray(rawList) ? rawList : [])
    } catch (error) {
      debugError("Error fetching zone restaurants:", error)
      if (isMountedRef.current) setRestaurants([])
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [zoneId])

  const refetch = useCallback(() => {
    fetchRestaurants({ silent: true })
  }, [fetchRestaurants])

  useEffect(() => {
    isMountedRef.current = true
    if (!location.state?.zone) {
      fetchZone()
    }
    fetchRestaurants()

    window.addEventListener("focus", refetch)
    return () => {
      isMountedRef.current = false
      window.removeEventListener("focus", refetch)
    }
  }, [fetchZone, fetchRestaurants, refetch, location.state?.zone])

  const handleRankChange = async (restaurant, nextRankValue) => {
    const restaurantId = restaurant._id || restaurant.id
    if (!restaurantId || !zoneId) return

    const rank = nextRankValue === "" ? null : Number(nextRankValue)
    if (rank !== null && (!Number.isFinite(rank) || rank < 1 || rank > 10)) return

    try {
      setUpdatingRankId(restaurantId)
      const response = await adminAPI.updateRestaurantZoneFeaturedRank(restaurantId, {
        zoneId,
        rank,
      })
      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Failed to update rank")
      }
      await fetchRestaurants({ silent: true })
    } catch (error) {
      debugError("Error updating restaurant rank:", error)
      alert(error?.response?.data?.message || error?.message || "Failed to update rank")
    } finally {
      if (isMountedRef.current) setUpdatingRankId(null)
    }
  }

  const filteredRestaurants = useMemo(() => {
    if (!searchQuery.trim()) return restaurants
    const query = searchQuery.toLowerCase().trim()
    return restaurants.filter((restaurant) => {
      const name = (restaurant.restaurantName || restaurant.name || "").toLowerCase()
      const owner = (restaurant.ownerName || "").toLowerCase()
      const phone = String(restaurant.ownerPhone || restaurant.phone || "")
      return name.includes(query) || owner.includes(query) || phone.includes(query)
    })
  }, [restaurants, searchQuery])

  const pageLoading = zoneLoading && !zone

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                onClick={() => navigate("/admin/food/zone-setup")}
                className="mt-1 p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Back to Zone Setup"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                {pageLoading ? (
                  <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-2" />
                ) : (
                  <h1 className="text-2xl font-bold text-slate-900">
                    {zone?.name || zone?.zoneName || "Zone Restaurants"}
                  </h1>
                )}
                {pageLoading ? (
                  <div className="h-4 w-64 bg-slate-200 rounded animate-pulse" />
                ) : (
                  <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                    <MapPin className="w-4 h-4 shrink-0" />
                    {zone?.serviceLocation || "N/A"}
                  </p>
                )}
                {!pageLoading && zone && (
                  <span
                    className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${
                      zone.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {zone.isActive ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => fetchRestaurants({ silent: true })}
              disabled={refreshing || loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 self-start"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by restaurant name, owner name, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider w-12">
                    SL
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Restaurant
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider w-28">
                    Rank
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                      <p className="text-slate-600">Loading restaurants...</p>
                    </td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-lg font-semibold text-slate-900 mb-1">
                        {searchQuery ? "No matching restaurants" : "No restaurants pinned in this zone"}
                      </p>
                      {searchQuery && (
                        <p className="text-sm text-slate-600">Try adjusting your search query</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((restaurant, index) => {
                    const id = restaurant._id || restaurant.id
                    const name = restaurant.restaurantName || restaurant.name || "Unnamed Restaurant"
                    const ownerName = restaurant.ownerName || "N/A"
                    const phone = restaurant.ownerPhone || restaurant.phone || "N/A"
                    const address = getRestaurantAddress(restaurant)
                    const image = getPrimaryRestaurantImage(restaurant)
                    const currentRank = restaurant.zoneFeaturedRank
                    const rankValue =
                      currentRank >= 1 && currentRank <= 10 ? String(currentRank) : ""

                    return (
                      <tr key={id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-[180px]">
                            <img
                              src={image}
                              alt={name}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = PLACEHOLDER_40
                              }}
                            />
                            <span className="text-sm font-medium text-slate-900">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                          {ownerName}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                          {phone}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-xs">
                          <span className="line-clamp-2">{address}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(
                              restaurant.status
                            )}`}
                          >
                            {statusLabel(restaurant.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select
                            value={rankValue}
                            disabled={updatingRankId === id}
                            onChange={(e) => handleRankChange(restaurant, e.target.value)}
                            className="w-full min-w-[88px] px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {RANK_OPTIONS.map((option) => (
                              <option key={option || "none"} value={option}>
                                {option === "" ? "—" : option}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
