import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Search, ChevronRight, MapPin, X, Bell, Star, MessageSquare, Loader2 } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import { createPortal } from "react-dom"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const extractRestaurantPayload = (response) =>
  response?.data?.data?.restaurant ||
  response?.data?.restaurant ||
  response?.data?.data?.user ||
  response?.data?.user ||
  response?.data?.data ||
  null


export default function RestaurantNavbar({
  restaurantName: propRestaurantName,
  location: propLocation,
  showSearch = true,
  showOfflineOnlineTag = true,
  showNotifications = true,
}) {
  const navigate = useNavigate()
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [status, setStatus] = useState("Offline")
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState("")
  const [logoUrl, setLogoUrl] = useState(null)
  const { unreadCount } = useNotificationInbox("restaurant", { limit: 20, pollMs: 5 * 60 * 1000 })
  const [showReviewsModal, setShowReviewsModal] = useState(false)
  const [reviewsData, setReviewsData] = useState({ rating: 0, totalRatings: 0, reviews: [] })
  const [loadingReviews, setLoadingReviews] = useState(false)

  // Load business settings for branding
  useEffect(() => {
    const loadSettings = async () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.companyName) setCompanyName(cached.companyName)
        if (cached.logo?.url) setLogoUrl(cached.logo.url)
      } else {
        const settings = await loadBusinessSettings()
        if (settings) {
          if (settings.companyName) setCompanyName(settings.companyName)
          if (settings.logo?.url) setLogoUrl(settings.logo.url)
        }
      }
    }
    loadSettings()

    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.companyName) setCompanyName(cached.companyName)
        if (cached.logo?.url) setLogoUrl(cached.logo.url)
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
  }, [])

  // Fetch restaurant data on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = extractRestaurantPayload(response)
        if (data) {
          setRestaurantData(data)
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error fetching restaurant data:", error)
        }
        // Continue with default values if fetch fails
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [])

  // Format full address from location object - using stored data only, no live fetching
  const formatAddress = (location) => {
    if (!location) return ""
    
    // Priority 1: Use formattedAddress if available (stored address from database)
    if (location.formattedAddress && location.formattedAddress.trim() !== "" && location.formattedAddress !== "Select location") {
      // Check if it's just coordinates (latitude, longitude format)
      const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.formattedAddress.trim())
      if (!isCoordinates) {
        return location.formattedAddress.trim()
      }
    }
    
    // Priority 2: Use address field if available
    if (location.address && location.address.trim() !== "") {
      return location.address.trim()
    }
    
    // Priority 3: Build from individual components
    const parts = []
    
    // Add street address (addressLine1 or street)
    if (location.addressLine1) {
      parts.push(location.addressLine1.trim())
    } else if (location.street) {
      parts.push(location.street.trim())
    }
    
    // Add addressLine2 if available
    if (location.addressLine2) {
      parts.push(location.addressLine2.trim())
    }
    
    // Add area if available
    if (location.area) {
      parts.push(location.area.trim())
    }
    
    // Add landmark if available
    if (location.landmark) {
      parts.push(location.landmark.trim())
    }
    
    // Add city if available and not already in area
    if (location.city) {
      const city = location.city.trim()
      // Only add city if it's not already included in previous parts
      const cityAlreadyIncluded = parts.some(part => part.toLowerCase().includes(city.toLowerCase()))
      if (!cityAlreadyIncluded) {
        parts.push(city)
      }
    }
    
    // Add state if available
    if (location.state) {
      const state = location.state.trim()
      // Only add state if it's not already included
      const stateAlreadyIncluded = parts.some(part => part.toLowerCase().includes(state.toLowerCase()))
      if (!stateAlreadyIncluded) {
        parts.push(state)
      }
    }
    
    // Add zipCode/pincode if available
    if (location.zipCode || location.pincode || location.postalCode) {
      const zip = (location.zipCode || location.pincode || location.postalCode).trim()
      parts.push(zip)
    }
    
    return parts.length > 0 ? parts.join(", ") : ""
  }

  // Get restaurant name (use prop if provided, otherwise use fetched data)
  const restaurantName = propRestaurantName || restaurantData?.name || "Restaurant"

  const [location, setLocation] = useState("")

  // Update location when restaurantData or propLocation changes
  useEffect(() => {
    let newLocation = ""
    
    // Priority 1: Explicit prop takes highest priority
    if (propLocation && propLocation.trim() !== "") {
      newLocation = propLocation.trim()
    }
    // Priority 2: Check restaurantData location
    else if (restaurantData) {
      debugLog('?? Checking restaurant data for address:', {
        hasLocation: !!restaurantData.location,
        locationKeys: restaurantData.location ? Object.keys(restaurantData.location) : [],
        formattedAddress: restaurantData.location?.formattedAddress,
        address: restaurantData.location?.address,
        directAddress: restaurantData.address,
        fullLocation: restaurantData.location
      })
      
      if (restaurantData.location) {
        // Use stored formattedAddress first (from database)
        if (restaurantData.location.formattedAddress && 
            restaurantData.location.formattedAddress.trim() !== "" && 
            restaurantData.location.formattedAddress !== "Select location") {
          // Check if it's just coordinates (latitude, longitude format)
          const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(restaurantData.location.formattedAddress.trim())
          if (!isCoordinates) {
            newLocation = restaurantData.location.formattedAddress.trim()
            debugLog('? Using formattedAddress:', newLocation)
          }
        }
        
        // If formattedAddress is not available or is coordinates, try formatAddress function
        if (!newLocation) {
          const formatted = formatAddress(restaurantData.location)
          if (formatted && formatted.trim() !== "") {
            newLocation = formatted.trim()
            debugLog('? Using formatAddress result:', newLocation)
          }
        }
        
        // Additional fallback: check if address is directly on location
        if (!newLocation && restaurantData.location.address && restaurantData.location.address.trim() !== "") {
          newLocation = restaurantData.location.address.trim()
          debugLog('? Using location.address:', newLocation)
        }
      }
      
      // Priority 3: Fallback - check if address is directly on restaurantData (not in location object)
      if (!newLocation && restaurantData.address && restaurantData.address.trim() !== "") {
        newLocation = restaurantData.address.trim()
        debugLog('? Using restaurantData.address:', newLocation)
      }
    }
    
    setLocation(newLocation)
    
    // Debug log
    if (newLocation) {
      debugLog('?? Restaurant address displayed:', newLocation)
    } else if (restaurantData) {
      debugLog('?? Restaurant data available but no address found')
    }
  }, [restaurantData, propLocation])

  // Load status from localStorage on mount and listen for changes
  useEffect(() => {
    const updateStatus = () => {
      try {
        const savedStatus = localStorage.getItem('restaurant_online_status')
        if (savedStatus !== null) {
          const isOnline = JSON.parse(savedStatus)
          setStatus(isOnline ? "Online" : "Offline")
        } else {
          // If not stored yet, fallback to backend value (when available).
          const isOnline = Boolean(restaurantData?.isAcceptingOrders)
          setStatus(isOnline ? "Online" : "Offline")
        }
      } catch (error) {
        debugError("Error loading restaurant status:", error)
        const isOnline = Boolean(restaurantData?.isAcceptingOrders)
        setStatus(isOnline ? "Online" : "Offline")
      }
    }

    // Load initial status
    updateStatus()

    // Listen for status changes from RestaurantStatus page
  const handleStatusChange = (event) => {
      const isOnline = event.detail?.isOnline || false
      setStatus(isOnline ? "Online" : "Offline")
  }

    window.addEventListener('restaurantStatusChanged', handleStatusChange)
    
    return () => {
      window.removeEventListener('restaurantStatusChanged', handleStatusChange)
    }
  }, [restaurantData])

  const handleStatusClick = () => {
    navigate("/restaurant/status")
  }

  const handleSearchClick = () => {
    setIsSearchActive(true)
  }

  const handleSearchClose = () => {
    setIsSearchActive(false)
    setSearchValue("")
  }

  const handleSearchChange = (e) => {
    setSearchValue(e.target.value)
  }



  const handleNotificationsClick = () => {
    navigate("/restaurant/notifications")
  }

  // Show search input when search is active
  if (isSearchActive) {
    return (
      <div className="w-full bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search by order ID"
            className="w-full px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Close Button */}
        <button
          onClick={handleSearchClose}
          className="w-6 h-6 bg-black rounded-full flex items-center justify-center shrink-0"
          aria-label="Close search"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 py-3.5 flex items-center justify-between sticky top-0 z-[60]">
      {/* Left Side - Restaurant Info */}
      <div className="flex-1 min-w-0 pr-2 flex items-center gap-2.5">
        {logoUrl && (
          <img src={logoUrl} alt="Logo" className="h-9 w-9 object-contain rounded-lg shadow-sm" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="text-[14px] font-bold text-gray-900 truncate leading-none">
              {loading ? "Loading..." : (restaurantName || "Restaurant")}
            </h1>

          </div>
          {!loading && location && location.trim() !== "" && (
            <div className="flex items-center gap-1 mt-1 opacity-70">
              <MapPin className="w-2 h-2 text-gray-400 shrink-0" />
              <p className="text-[9px] text-gray-500 truncate font-medium max-w-[150px]" title={location}>
                {location}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Interactive Elements */}
      <div className="flex items-center gap-0.5">
        {showOfflineOnlineTag && (
          <button
            onClick={handleStatusClick}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-xl hover:opacity-80 transition-all ${
              status === "Online" 
                ? "bg-green-50 border-green-100" 
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === "Online" ? "bg-green-500 animate-pulse" : "bg-gray-400"
            }`}></span>
            <span className={`text-[12px] font-bold hidden sm:inline ${
              status === "Online" ? "text-green-700" : "text-gray-600"
            }`}>
              {status}
            </span>
            <ChevronRight className={`w-3.5 h-3.5 ${
              status === "Online" ? "text-green-500" : "text-gray-400"
            }`} />
          </button>
        )}

        <div className="flex items-center">
          {showSearch && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSearchClick();
              }}
              className="p-1.5 hover:bg-gray-50 rounded-full transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5 text-gray-600" />
            </button>
          )}

          {showNotifications && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNotificationsClick();
              }}
              className="relative p-1.5 hover:bg-gray-50 rounded-full transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border border-white" />
              )}
            </button>
          )}

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("[RestaurantNavbar] Star clicked. Current state:", { showReviewsModal, loadingReviews });
              console.log("[RestaurantNavbar] restaurantAPI object:", restaurantAPI);
              setShowReviewsModal(true);
              setLoadingReviews(true);
              try {
                if (typeof restaurantAPI?.getReviews === 'function') {
                  console.log("[RestaurantNavbar] Calling getReviews API...");
                  restaurantAPI.getReviews()
                    .then(res => {
                      if (res?.data?.success && res?.data?.data) {
                        setReviewsData(res.data.data);
                      }
                    })
                    .catch(err => {
                      console.error("Error fetching restaurant reviews:", err);
                    })
                    .finally(() => setLoadingReviews(false));
                } else {
                  console.error("restaurantAPI.getReviews is not a function", restaurantAPI);
                  setLoadingReviews(false);
                }
              } catch (err) {
                console.error("Exception in reviews click handler:", err);
                setLoadingReviews(false);
              }
            }}
            className="relative p-1.5 hover:bg-amber-50 rounded-full transition-colors text-amber-500"
            title="Customer Ratings & Reviews"
          >
            <Star className="w-5 h-5 fill-amber-400" />
          </button>
        </div>
      </div>

      {/* Ratings & Reviews Modal */}
      {showReviewsModal && createPortal(
        <div 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowReviewsModal(false);
          }}
          className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-4 sm:p-6"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-3xl my-8 sm:my-16 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl transition-all duration-300"
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <Star className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Restaurant Ratings & Reviews</h3>
                  <p className="text-xs text-gray-500 font-medium">Customer reviews for {restaurantName}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowReviewsModal(false);
                }}
                className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Summary Banner */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block mb-1">Average Rating</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-gray-900">
                      {reviewsData.rating ? Number(reviewsData.rating).toFixed(1) : (restaurantData?.rating ? Number(restaurantData.rating).toFixed(1) : "0.0")}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">out of 5.0</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= Math.round(reviewsData.rating || restaurantData?.rating || 0)
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 fill-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-gray-600">
                    {reviewsData.totalRatings || restaurantData?.totalRatings || reviewsData.reviews.length} Total Ratings
                  </span>
                </div>
              </div>

              {/* Reviews List */}
              {loadingReviews ? (
                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading reviews...</span>
                </div>
              ) : reviewsData.reviews.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-medium">
                  <MessageSquare className="w-12 h-12 mx-auto text-gray-200 mb-2" />
                  <p>No customer reviews yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewsData.reviews.map((item) => (
                    <div key={item._id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700 text-xs">
                            {item.customerName ? item.customerName.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-gray-900 block leading-tight">{item.customerName}</span>
                            <span className="text-[10px] text-gray-400">Order #{item.orderId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-bold text-amber-700">{item.rating}</span>
                        </div>
                      </div>
                      {item.comment ? (
                        <p className="text-xs text-gray-600 mt-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 italic">
                          "{item.comment}"
                        </p>
                      ) : null}
                      <p className="text-[10px] text-gray-400 mt-2 text-right">
                        {new Date(item.createdAt).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

