import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { useSearchParams, Link, useNavigate } from "react-router-dom"
import { 
  ArrowLeft, Star, Clock, Search, SlidersHorizontal, 
  ChevronDown, Bookmark, BadgePercent, Mic, Grid2x2,
  X, Utensils, Store, Loader2, History
} from "lucide-react"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { useProfile } from "@food/context/ProfileContext"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import OutOfServiceView from "@food/components/user/OutOfServiceView"
import { searchAPI } from "@/services/api"
import { motion, AnimatePresence } from "framer-motion"

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const DEFAULT_RESTAURANT_IMAGE = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80";
const DEFAULT_DISH_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";

const extractImageUrl = (item) => {
  if (!item) return null;

  const candidates = [
    item.coverImages?.[0]?.url,
    item.coverImages?.[0],
    item.profileImage?.url,
    item.profileImage,
    item.bannerImage?.url,
    item.bannerImage,
    item.banner,
    item.image?.url,
    item.image,
    item.images?.[0]?.url,
    item.images?.[0],
    item.recommendedImages?.[0]?.url,
    item.recommendedImages?.[0],
    item.logo?.url,
    item.logo,
    item.matchedDishImage,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    let url = typeof raw === 'object' ? raw.url || raw.src || raw.path : raw;
    if (typeof url === 'string' && url.trim()) {
      return url.trim();
    }
  }

  return null;
};

const getMediaUrl = (input) => {
  if (!input) return null;
  let url = input;
  if (typeof url === 'object') {
    url = url.url || url.src || url.path || null;
  }
  if (!url || typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;

  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  const apiBase = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : "";
  
  let origin = "";
  if (apiBase.startsWith('http')) {
    try {
      const parsed = new URL(apiBase);
      if (typeof window !== 'undefined' && LOCAL_HOSTS.has(parsed.hostname) && !LOCAL_HOSTS.has(window.location.hostname)) {
        origin = "";
      } else {
        origin = parsed.origin;
      }
    } catch (_) {}
  }
  
  return `${origin}${url.startsWith('/') ? url : '/' + url}`;
};

// Debounce hook for real-time search
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

const SEARCH_HISTORY_KEY = "professional_search_history_v1"

export default function ProfessionalSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const isGrocerySearch = searchParams.get("vertical") === "grocery"
  const isRestaurantParam = isGrocerySearch ? "false" : "true"
  const navigate = useNavigate()
  const { getDefaultAddress } = useProfile()
  const { location: userCoords, requestLocation } = useGeoLocation()
  
  // Auto-track location when visiting search page
  const hasAttemptedAutoLocation = useRef(false)
  useEffect(() => {
    if (hasAttemptedAutoLocation.current) return;
    
    const isMissingLocation = !userCoords || 
      userCoords.city === "Current Location" || 
      userCoords.address === "Select location" || 
      userCoords.formattedAddress === "Select location";
      
    if (isMissingLocation && requestLocation) {
      hasAttemptedAutoLocation.current = true;
      requestLocation();
    }
  }, [userCoords, requestLocation]);
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    try {
      return window.localStorage.getItem("deliveryAddressMode") || "saved"
    } catch {
      return "saved"
    }
  })
  const defaultSavedAddress = useMemo(
    () => getDefaultAddress?.() || null,
    [getDefaultAddress],
  )
  const defaultSavedAddressLocation = useMemo(() => {
    const coords = defaultSavedAddress?.location?.coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0])
      const lat = Number(coords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }

    const lat = Number(defaultSavedAddress?.latitude || defaultSavedAddress?.lat)
    const lng = Number(defaultSavedAddress?.longitude || defaultSavedAddress?.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng }
    }

    return null
  }, [defaultSavedAddress])
  const effectiveLocation = useMemo(() => {
    const useSavedAddress =
      deliveryAddressMode === "saved" &&
      Number.isFinite(defaultSavedAddressLocation?.latitude) &&
      Number.isFinite(defaultSavedAddressLocation?.longitude)

    return useSavedAddress ? defaultSavedAddressLocation : userCoords
  }, [deliveryAddressMode, defaultSavedAddressLocation, userCoords])
  const { zoneId, zoneStatus, isOutOfService, loading: zoneLoading } = useZone(effectiveLocation)
  const hasEffectiveCoordinates = useMemo(
    () =>
      Number.isFinite(effectiveLocation?.latitude) &&
      Number.isFinite(effectiveLocation?.longitude),
    [effectiveLocation],
  )
  
  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebounce(query, 500)
  
  const [results, setResults] = useState({ restaurants: [], dishes: [] })
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(searchParams.get("cat") || null)
  const [history, setHistory] = useState([])

  // Load search history
  useEffect(() => {
    const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (savedHistory) setHistory(JSON.parse(savedHistory))
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [zoneId, zoneStatus, zoneLoading, hasEffectiveCoordinates, isGrocerySearch, isRestaurantParam])

  useEffect(() => {
    const readMode = () => {
      try {
        setDeliveryAddressMode(window.localStorage.getItem("deliveryAddressMode") || "saved")
      } catch {
        setDeliveryAddressMode("saved")
      }
    }

    window.addEventListener("deliveryAddressModeChanged", readMode)
    return () => {
      window.removeEventListener("deliveryAddressModeChanged", readMode)
    }
  }, [])

  const fetchCategories = async () => {
    try {
      const params = {}
      if (zoneId) params.zoneId = zoneId
      if (isRestaurantParam) params.isRestaurant = isRestaurantParam

      const res = await searchAPI.getAdminCategories(params)
      const fetched = res.data?.data?.categories || res.data?.categories || []

      if (Array.isArray(fetched) && fetched.length > 0) {
        setCategories(fetched)
        return
      }

      // Fallback: fetch all active categories without zone constraint
      const fallbackRes = await searchAPI.getAdminCategories({ isRestaurant: isRestaurantParam })
      const fallbackCategories = fallbackRes.data?.data?.categories || fallbackRes.data?.categories || []
      setCategories(Array.isArray(fallbackCategories) ? fallbackCategories : [])
    } catch (err) {
      console.error("Failed to fetch categories", err)
    }
  }

  const buildSearchParams = useCallback((overrides = {}) => {
    const next = { ...overrides }
    if (isGrocerySearch) next.vertical = "grocery"
    return next
  }, [isGrocerySearch])

  const addToHistory = (term) => {
    const newHistory = [term, ...history.filter(h => h !== term)].slice(0, 5)
    setHistory(newHistory)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  }

  const performSearch = useCallback(async (searchTerm, catId) => {
    if (!searchTerm && !catId) {
      setResults({ restaurants: [], dishes: [] })
      return
    }
    
    setLoading(true)
    try {
      const res = await searchAPI.unifiedSearch({
        q: searchTerm,
        categoryId: catId,
        lat: effectiveLocation?.latitude,
        lng: effectiveLocation?.longitude,
        zoneId,
        isRestaurant: isRestaurantParam,
      })
      
      const all = res.data?.data?.restaurants || res.data?.restaurants || []

      setResults({
        restaurants: all.filter(r => r.matchType === 'restaurant' || !r.matchType),
        dishes: all.filter(r => r.matchType === 'food')
      })
    } catch (err) {
      console.error("Search failed", err)
    } finally {
      setLoading(false)
    }
  }, [effectiveLocation, zoneId, isRestaurantParam])

  useEffect(() => {
    performSearch(debouncedQuery, selectedCategoryId)
    if (debouncedQuery) {
        setSearchParams(buildSearchParams({
          q: debouncedQuery,
          ...(selectedCategoryId ? { cat: selectedCategoryId } : {}),
        }), { replace: true })
    }
  }, [debouncedQuery, selectedCategoryId, performSearch, setSearchParams, buildSearchParams])

  // Speech Recognition Implementation
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setQuery(transcript)
      addToHistory(transcript)
    }
    recognition.start()
  }

  const handleClear = () => {
    setQuery("")
    setSelectedCategoryId(null)
    setSearchParams(buildSearchParams(), { replace: true })
    setResults({ restaurants: [], dishes: [] })
  }

  const handleCategoryClick = (id) => {
    const newCat = selectedCategoryId === id ? null : id
    setSelectedCategoryId(newCat)
    const base = Object.fromEntries(searchParams)
    if (newCat) {
        setSearchParams(buildSearchParams({ ...base, cat: newCat }), { replace: true })
    } else {
        const p = { ...base }
        delete p.cat
        setSearchParams(buildSearchParams(p), { replace: true })
    }
  }

  const handleBack = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (typeof document !== 'undefined') {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur()
      }
      document.querySelectorAll('input, textarea').forEach((el) => {
        if (el && typeof el.blur === 'function') el.blur()
      })
    }
    if (typeof window !== 'undefined' && window.flutter_inappwebview) {
      try {
        window.flutter_inappwebview.callHandler('hideKeyboard')
      } catch (_) {}
    }

    const fallbackPath = isGrocerySearch ? '/food/user?vertical=grocery' : '/food/user'

    setTimeout(() => {
      if (typeof window !== 'undefined' && window.history.state && window.history.state.idx > 0) {
        navigate(-1)
      } else {
        navigate(fallbackPath, { replace: true })
      }
    }, 20)
  }

  const buildStoreLink = (restaurant, dishId) => {
    const slug = restaurant.slug || restaurant._id
    const base = `/food/user/restaurants/${slug}`
    if (!dishId) return base
    return `${base}?dish=${encodeURIComponent(String(dishId))}`
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={handleBack} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              autoFocus
              placeholder={isGrocerySearch ? 'Search for stores or products...' : 'Search for restaurants or dishes...'} 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-10 h-11 bg-slate-100 dark:bg-zinc-800 border-none focus:ring-2 focus:ring-rose-500 rounded-xl"
            />
            {query && (
              <button onClick={handleClear} className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleVoiceSearch}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all ${isListening ? 'text-rose-500 scale-125 animate-pulse' : 'text-slate-400'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {isOutOfService ? (
        <OutOfServiceView />
      ) : (
        <div className="max-w-3xl mx-auto p-4">
        {/* Categories (Admin only) */}
        {!query && !loading && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 px-1">Top Categories</h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4">
              {categories.map((cat) => {
                const catImgUrl = getMediaUrl(cat.image);
                return (
                <button 
                  key={cat._id} 
                  onClick={() => handleCategoryClick(cat._id)}
                  className={`flex flex-col items-center group transition-all ${selectedCategoryId === cat._id ? 'scale-110' : ''}`}
                >
                  <div className={`w-14 h-14 rounded-2xl mb-2 flex items-center justify-center overflow-hidden border-2 transition-all ${selectedCategoryId === cat._id ? 'border-rose-500 shadow-lg shadow-rose-100' : 'border-transparent bg-slate-100 dark:bg-zinc-900'}`}>
                    {catImgUrl ? (
                      <img 
                        src={catImgUrl} 
                        alt={cat.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className="w-full h-full flex items-center justify-center bg-rose-50 dark:bg-rose-950/40 text-rose-500 font-black text-xs"
                      style={{ display: catImgUrl ? 'none' : 'flex' }}
                    >
                      {cat.name?.slice(0, 2)?.toUpperCase() || 'FC'}
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium text-center line-clamp-1 ${selectedCategoryId === cat._id ? 'text-rose-600' : 'text-slate-600 dark:text-slate-400'}`}>
                    {cat.name}
                  </span>
                </button>
              );
              })}
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        <AnimatePresence>
          {loading && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="flex flex-col items-center justify-center py-20"
            >
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-3" />
              <p className="text-slate-400 text-sm">Finding the best for you...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent History */}
        {!query && !loading && history.length > 0 && (
          <div className="mb-8">
             <div className="flex items-center justify-between mb-2 px-1">
               <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recently Searched</h3>
               <button
                 type="button"
                 onClick={clearHistory}
                 className="text-xs font-semibold text-rose-500 hover:text-rose-600 uppercase tracking-wider"
               >
                 Clear
               </button>
             </div>
             <div className="flex flex-wrap gap-2">
                {history.map((term, i) => (
                  <button 
                    key={i} 
                    onClick={() => setQuery(term)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-full text-sm text-slate-600 dark:text-zinc-400 hover:bg-slate-50 transition-colors"
                  >
                    <History className="w-3 h-3" />
                    {term}
                  </button>
                ))}
             </div>
          </div>
        )}

        {/* Search Results */}
        {!loading && (query || selectedCategoryId) && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Dish Results Section */}
            {results.dishes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-1 h-5 bg-orange-500 rounded-full" />
                   <h2 className="text-lg font-bold dark:text-white">
                     {isGrocerySearch ? 'Products from stores' : 'Dishes from restaurants'}
                   </h2>
                </div>
                <div className="grid gap-4">
                   {results.dishes.map((r) => {
                     const dishImgUrl = getMediaUrl(r.matchedDishImage || extractImageUrl(r)) || DEFAULT_DISH_IMAGE;
                     return (
                    <Link
                      to={buildStoreLink(r, r.matchedDishId)}
                      key={`${r._id}-${r.matchedDishId || "dish"}`}
                      onClick={() => addToHistory(query)}
                      className="flex gap-4 p-3 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-100 dark:border-zinc-800 hover:shadow-md transition-shadow group"
                    >
                       <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 relative">
                           <img 
                            src={dishImgUrl} 
                            alt={r.matchedDish || r.restaurantName}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = DEFAULT_DISH_IMAGE;
                            }}
                          />
                          {r.pureVegRestaurant && (
                            <div className="absolute top-1 left-1 w-4 h-4 border border-green-600 p-[1px] bg-white rounded-sm">
                               <div className="w-full h-full bg-green-600 rounded-full" />
                            </div>
                          )}
                       </div>
                       <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="text-rose-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                             Matched: {r.matchedDish || query}
                          </div>
                          <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{r.restaurantName}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                             <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-orange-500 fill-orange-500" />
                                <span className="font-semibold text-slate-700 dark:text-white">{r.rating || "New"}</span>
                             </div>
                             <span>•</span>
                             <span>{r.estimatedDeliveryTime || r.estimatedDeliveryTimeMinutes ? `${r.estimatedDeliveryTimeMinutes} mins` : "30-40 mins"}</span>
                             {r.cuisines?.length > 0 && (
                               <>
                                 <span>•</span>
                                 <span className="line-clamp-1">{r.cuisines.slice(0, 2).join(", ")}</span>
                               </>
                             )}
                          </div>
                          {isGrocerySearch && (
                            <span className="mt-2 inline-flex w-fit rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                              Open now
                            </span>
                          )}
                       </div>
                    </Link>
                   );
                  })}
                </div>
              </section>
            )}

            {/* Restaurant Results Section */}
            {results.restaurants.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-1 h-5 bg-rose-500 rounded-full" />
                   <h2 className="text-lg font-bold dark:text-white">
                     {isGrocerySearch ? 'Stores' : 'Restaurants'}
                   </h2>
                </div>
                <div className="grid gap-6">
                  {results.restaurants.map((r) => {
                    const restImgUrl = getMediaUrl(extractImageUrl(r)) || DEFAULT_RESTAURANT_IMAGE;
                    return (
                    <Link to={buildStoreLink(r)} key={r._id} className="block group">
                      <div className="relative rounded-3xl overflow-hidden aspect-[16/9] mb-3 bg-slate-200">
                         <img 
                          src={restImgUrl} 
                          alt={r.restaurantName || "Restaurant"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = DEFAULT_RESTAURANT_IMAGE;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                           <div>
                              <h3 className="text-xl font-bold text-white mb-1">{r.restaurantName}</h3>
                              <p className="text-white/80 text-xs line-clamp-1">{r.cuisines?.join(", ")}</p>
                           </div>
                           <div className="bg-white/20 backdrop-blur-md border border-white/30 px-2 py-1 rounded-lg flex items-center gap-1">
                              <Star className="w-3 h-3 text-white fill-white" />
                              <span className="text-white text-xs font-bold">{r.rating ? Number(r.rating).toFixed(1) : "NEW"}</span>
                           </div>
                        </div>
                        {r.offer && (
                           <div className="absolute top-4 left-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-r-lg shadow-lg flex items-center gap-1 tracking-tighter">
                              <BadgePercent className="w-3 h-3" />
                              {r.offer.toUpperCase()}
                           </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-1">
                         <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                            <div className="flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               {r.estimatedDeliveryTime || "30 mins"}
                            </div>
                            <span>•</span>
                            <span>{r.location?.area || "Nearby"}</span>
                         </div>
                         <div className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Top Pick
                         </div>
                      </div>
                     </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Empty State */}
            {!loading && results.restaurants.length === 0 && results.dishes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                 <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-slate-300" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">We couldn't find any results</h2>
                 <p className="text-slate-500 text-sm max-w-xs">Maybe try searching for something else or check your spelling</p>
                 <Button variant="outline" onClick={handleClear} className="mt-6 rounded-xl border-rose-500 text-rose-500 hover:bg-rose-50">
                    Clear all filters
                 </Button>
              </div>
            )}

          </div>
        )}
        </div>
      )}
    </div>
  )
}
