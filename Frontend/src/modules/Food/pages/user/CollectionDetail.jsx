import { useEffect, useMemo, useState } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Check, Clock, FolderOpen, MapPin, Plus, Search, Star, Trash2, X } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useUserCollections } from "@food/utils/userCollections"
import { useLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { restaurantAPI } from "@food/api"

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80"

const toItem = (r) => ({
  slug: r.slug || String(r._id || r.id || ""),
  name: r.restaurantName || r.name || "Restaurant",
  image:
    r.profileImage?.url ||
    (typeof r.profileImage === "string" ? r.profileImage : "") ||
    r.coverImages?.[0]?.url ||
    (typeof r.coverImages?.[0] === "string" ? r.coverImages[0] : "") ||
    r.image ||
    "",
  rating: r.rating || 0,
  cuisine: Array.isArray(r.cuisines) ? r.cuisines.join(", ") : r.cuisine || "",
  deliveryTime: r.estimatedDeliveryTime || r.deliveryTime || "",
  distance: r.distance || "",
})

// Your own collection: its restaurants, add / remove restaurants, delete the collection.
export default function CollectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { collections, remove, toggleItem } = useUserCollections()
  const collection = collections.find((c) => c.id === id)

  const { location } = useLocation()
  const { zoneId } = useZone(location)
  const [addOpen, setAddOpen] = useState(false)
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!addOpen || all.length || !zoneId) return undefined
    let alive = true
    setLoading(true)
    const params = { zoneId, isRestaurant: "true" }
    if (location?.latitude && location?.longitude) {
      params.lat = location.latitude
      params.lng = location.longitude
    }
    restaurantAPI
      .getRestaurants(params)
      .then((res) => {
        const list = res?.data?.data?.restaurants || []
        if (alive) setAll(list.map(toItem).filter((r) => r.slug))
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [addOpen, zoneId, all.length, location?.latitude, location?.longitude])

  const shown = useMemo(
    () => all.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())),
    [all, query],
  )

  if (!collection) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a] p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg mb-4">This collection was not found</p>
              <Link to="/user/collections">
                <Button className="bg-primary-orange hover:opacity-90 text-white">Back to collections</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  const handleDelete = () => {
    if (window.confirm(`Delete "${collection.name}"?`)) {
      remove(collection.id)
      navigate("/user/collections", { replace: true })
    }
  }

  const handleRemoveItem = (e, slug) => {
    e.preventDefault()
    e.stopPropagation()
    toggleItem(collection.id, { slug })
  }

  const has = (slug) => collection.items.some((i) => i.slug === slug)

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a] p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">{collection.name}</h1>
                <p className="text-muted-foreground mt-1">
                  {collection.items.length} {collection.items.length === 1 ? "restaurant" : "restaurants"}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full text-red-500" onClick={handleDelete} aria-label="Delete collection">
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </ScrollReveal>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--app-primary,#EB590E)] py-4 font-semibold text-[color:var(--app-primary,#EB590E)]"
        >
          <Plus className="h-5 w-5" /> Add restaurants
        </button>

        {collection.items.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">This collection is empty. Add some restaurants.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            {collection.items.map((restaurant, index) => (
              <ScrollReveal key={restaurant.slug} delay={index * 0.05}>
                <Link to={`/food/user/restaurants/${restaurant.slug}`}>
                  <Card className="overflow-hidden h-full p-0 gap-0">
                    <div className="h-48 w-full relative overflow-hidden">
                      <img
                        src={restaurant.image || FALLBACK_IMAGE}
                        alt={restaurant.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.target.src = FALLBACK_IMAGE
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute top-4 right-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-red-500"
                          onClick={(e) => handleRemoveItem(e, restaurant.slug)}
                          aria-label="Remove from collection"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-lg font-bold line-clamp-1 flex-1">{restaurant.name}</h3>
                        <div className="flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded-lg ml-2">
                          <Star className="h-3 w-3 fill-white" />
                          <span className="text-sm font-bold">{restaurant.rating ? Number(restaurant.rating).toFixed(1) : "NEW"}</span>
                        </div>
                      </div>
                      {(restaurant.deliveryTime || restaurant.distance) && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <Clock className="h-4 w-4" />
                          <span>{restaurant.deliveryTime || "-"}</span>
                          <MapPin className="h-4 w-4" />
                          <span>{restaurant.distance || "-"}</span>
                        </div>
                      )}
                      {restaurant.cuisine && <p className="text-sm text-muted-foreground line-clamp-1">{restaurant.cuisine}</p>}
                    </CardContent>
                  </Card>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddOpen(false)} />
          <div className="relative bg-white dark:bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add to {collection.name}</h2>
              <button
                onClick={() => setAddOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="p-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search restaurants"
                  className="pl-9 h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading restaurants...</p>
              ) : shown.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {zoneId ? "No restaurants found" : "Set your delivery location first to see restaurants."}
                </p>
              ) : (
                shown.map((r) => {
                  const on = has(r.slug)
                  return (
                    <button
                      key={r.slug}
                      type="button"
                      onClick={() => toggleItem(collection.id, r)}
                      className={`w-full flex items-center gap-3 rounded-xl p-2 text-left border-2 ${on ? "border-[color:var(--app-primary,#EB590E)]" : "border-transparent bg-gray-50 dark:bg-gray-800"}`}
                    >
                      <img
                        src={r.image || FALLBACK_IMAGE}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover bg-gray-100"
                        onError={(e) => {
                          e.target.src = FALLBACK_IMAGE
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate text-gray-900 dark:text-gray-100">{r.name}</p>
                        {r.cuisine && <p className="text-xs text-muted-foreground truncate">{r.cuisine}</p>}
                      </div>
                      <span
                        className={`h-6 w-6 rounded-full flex items-center justify-center ${on ? "bg-[color:var(--app-primary,#EB590E)] text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}
                      >
                        {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            <div className="p-4 border-t dark:border-gray-800">
              <Button onClick={() => setAddOpen(false)} className="w-full h-11 rounded-xl bg-[color:var(--app-primary,#EB590E)] text-white font-semibold">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </AnimatedPage>
  )
}
