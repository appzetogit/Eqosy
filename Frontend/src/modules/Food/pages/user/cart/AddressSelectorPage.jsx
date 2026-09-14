import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, ChevronDown, Target, CloudRain, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair, Search } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Textarea } from "@food/components/ui/textarea"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"
import { locationAPI, userAPI } from "@food/api"
import { Loader } from '@googlemaps/js-api-loader'
import AnimatedPage from "@food/components/user/AnimatedPage"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

function formatDistanceText(meters) {
  if (meters === null || meters === undefined || isNaN(meters)) return null
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  const km = meters / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

export default function AddressSelectorPage() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { location, loading } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress, userProfile } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const greenMarkerRef = useRef(null) // Green marker for address selection
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const blueDotCircleRef = useRef(null) // Accuracy circle for Google Maps
  const [currentAddress, setCurrentAddress] = useState("")
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState("")
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([])
  const [googlePlacesSuggestions, setGooglePlacesSuggestions] = useState([])
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [lockMapToAutocomplete, setLockMapToAutocomplete] = useState(true)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [formScrollTop, setFormScrollTop] = useState(0)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [baseMapHeight, setBaseMapHeight] = useState(320)
  const formBodyRef = useRef(null)
  const manualFieldRefs = useRef({})
  const suppressAutocompleteFetchRef = useRef(true)

  // Top location search bar state
  const [topSearchQuery, setTopSearchQuery] = useState("")
  const [topSearchResults, setTopSearchResults] = useState([])
  const [isTopSearching, setIsTopSearching] = useState(false)

  const dismissSuggestions = useCallback(() => {
    setIsSearchFocused(false)
    setGooglePlacesSuggestions([])
    setKeywordAddressSuggestions([])
    if (typeof document !== "undefined" && document.activeElement && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }, [])

  const persistActiveLocation = useCallback(async (locationData, mode = "current") => {
    if (!locationData) return
    try {
      const dataToSave = { ...locationData, isManual: mode === "saved" || locationData.isManual === true }
      localStorage.setItem("userLocation", JSON.stringify(dataToSave))
      localStorage.setItem("deliveryAddressMode", mode)
      window.dispatchEvent(new Event("deliveryAddressModeChanged"))
      window.dispatchEvent(new Event("storage"))
    } catch {
      // ignore storage errors
    }

    try {
      await userAPI.updateLocation(locationData)
    } catch {
      // ignore API errors for guest/fallback mode
    }
  }, [])

  const reverseGeocodeTimeoutRef = useRef(null)
  const lastGeocodedCoordsRef = useRef(null)

  const handleMapMoveEnd = useCallback(async (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current)
    }

    reverseGeocodeTimeoutRef.current = setTimeout(async () => {
      if (lastGeocodedCoordsRef.current) {
        const dLat = Math.abs(lat - lastGeocodedCoordsRef.current.lat)
        const dLng = Math.abs(lng - lastGeocodedCoordsRef.current.lng)
        if (dLat < 0.00005 && dLng < 0.00005) return
      }

      lastGeocodedCoordsRef.current = { lat, lng }

      try {
        let formattedAddress = ""
        let street = ""
        let city = ""
        let state = ""
        let postcode = ""

        if (window.google && window.google.maps && window.google.maps.Geocoder) {
          const geocoder = new window.google.maps.Geocoder()
          const res = await new Promise((resolve) => {
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              if (status === "OK" && results?.[0]) resolve(results[0])
              else resolve(null)
            })
          })

          if (res) {
            formattedAddress = res.formatted_address || ""
            ;(res.address_components || []).forEach((comp) => {
              const types = comp.types || []
              if (types.includes("route") || types.includes("sublocality") || types.includes("neighborhood")) {
                street = street ? `${street}, ${comp.long_name}` : comp.long_name
              } else if (types.includes("locality")) {
                city = comp.long_name
              } else if (types.includes("administrative_area_level_1")) {
                state = comp.long_name
              } else if (types.includes("postal_code")) {
                postcode = comp.long_name
              }
            })
          }
        }

        if (!formattedAddress) {
          try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
            const r = await fetch(url, { headers: { Accept: "application/json" } })
            const json = await r.json()
            if (json?.display_name) {
              formattedAddress = json.display_name
              const a = json.address || {}
              street = a.road || a.suburb || a.neighbourhood || street
              city = a.city || a.town || a.village || city
              state = a.state || state
              postcode = a.postcode || postcode
            }
          } catch {}
        }

        if (!formattedAddress) {
          formattedAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        }

        let cleanAddress = formattedAddress
        if (cleanAddress.endsWith(", India")) {
          cleanAddress = cleanAddress.replace(", India", "").trim()
        }

        // 1. Update top search bar value
        suppressAutocompleteFetchRef.current = true
        setAddressAutocompleteValue(cleanAddress)

        // 2. Update Pinned Location box
        setCurrentAddress(cleanAddress)

        // 3. Update Primary Address Form field
        setAddressFormData((prev) => ({
          ...prev,
          street: street || cleanAddress.split(",")[0] || prev.street,
          city: city || prev.city,
          state: state || prev.state,
          zipCode: postcode || prev.zipCode,
        }))

        // 4. Save active location so map selection is persisted
        const locationData = {
          latitude: lat,
          longitude: lng,
          street: street || cleanAddress.split(",")[0] || "",
          city: city || "",
          state: state || "",
          postalCode: postcode || "",
          area: street || cleanAddress.split(",")[0] || "",
          address: cleanAddress,
          formattedAddress: cleanAddress,
          isManual: true,
        }
        persistActiveLocation(locationData, "saved")
      } catch (err) {
        debugError("Reverse geocode error:", err)
      }
    }, 250)
  }, [persistActiveLocation])

  const ENABLE_LOCATION_REVERSE_GEOCODE = import.meta.env.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== "false"
  const ENABLE_NOMINATIM_SEARCH = import.meta.env.VITE_ENABLE_NOMINATIM_SEARCH !== "false"
  const getAddressId = (address) => address?.id || address?._id || address?.addressId || null

  const handleBack = () => {
    goBack()
  }

  // Real-time keyword address searching for top search bar
  useEffect(() => {
    const q = topSearchQuery.trim()
    if (!q || q.length < 2) {
      setTopSearchResults([])
      setIsTopSearching(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsTopSearching(true)
        const refLat = Number.isFinite(location?.latitude) ? location.latitude : mapPosition?.[0] ?? 22.7196
        const refLng = Number.isFinite(location?.longitude) ? location.longitude : mapPosition?.[1] ?? 75.8577

        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=12&q=${encodeURIComponent(q)}`
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        })
        const json = await res.json()
        const list = Array.isArray(json) ? json : []
        const mapped = list.map((r) => {
          const displayParts = (r.display_name || "").split(",")
          const title = displayParts[0]?.trim() || r.name || "Location"
          const subtitle = displayParts.slice(1).join(",").trim()
          const lat = Number(r.lat)
          const lng = Number(r.lon)
          const meters = (Number.isFinite(refLat) && Number.isFinite(refLng) && Number.isFinite(lat) && Number.isFinite(lng))
            ? calculateDistance(refLat, refLng, lat, lng)
            : null
          return {
            id: r.place_id || r.osm_id || `${lat},${lng}`,
            title,
            subtitle,
            lat,
            lng,
            distanceMeters: meters,
            raw: r,
          }
        })

        mapped.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
        setTopSearchResults(mapped)
      } catch (e) {
        setTopSearchResults([])
      } finally {
        setIsTopSearching(false)
      }
    }, 300)

    return () => clearTimeout(t)
  }, [topSearchQuery, location?.latitude, location?.longitude, mapPosition])

  const matchingSavedAddresses = useMemo(() => {
    const q = topSearchQuery.trim().toLowerCase()
    if (!q) return addresses
    return (addresses || []).filter((addr) => {
      const text = [
        addr?.label,
        addr?.additionalDetails,
        addr?.street,
        addr?.city,
        addr?.state,
        addr?.zipCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return text.includes(q)
    })
  }, [addresses, topSearchQuery])

  const handleSelectSearchSuggestion = async (suggestion) => {
    try {
      const latitude = suggestion.lat
      const longitude = suggestion.lng
      const displayAddress = suggestion.subtitle
        ? `${suggestion.title}, ${suggestion.subtitle}`
        : suggestion.title

      const locationData = {
        latitude,
        longitude,
        city: suggestion.raw?.address?.city || suggestion.raw?.address?.town || suggestion.raw?.address?.village || "",
        state: suggestion.raw?.address?.state || "",
        area: suggestion.raw?.address?.suburb || suggestion.raw?.address?.neighbourhood || "",
        street: displayAddress,
        postalCode: suggestion.raw?.address?.postcode || "",
        address: displayAddress,
        formattedAddress: displayAddress,
        label: suggestion.title,
      }

      await persistActiveLocation(locationData, "current")
      setMapPosition([latitude, longitude])
      setCurrentAddress(displayAddress)
      toast.success(`Location set: ${suggestion.title}`, { duration: 2000 })
      handleBack()
    } catch (error) {
      debugError("Error selecting location suggestion:", error)
      toast.error("Failed to set location")
    }
  }

  const getSavedAddressDistanceText = (address) => {
    let lat = address.latitude || address.lat
    let lng = address.longitude || address.lng
    if (!lat && address.location?.coordinates && address.location.coordinates.length >= 2) {
      lng = address.location.coordinates[0]
      lat = address.location.coordinates[1]
    }
    const userLat = location?.latitude || mapPosition?.[0]
    const userLng = location?.longitude || mapPosition?.[1]
    if (!userLat || !userLng || !lat || !lng) return null
    const meters = calculateDistance(Number(userLat), Number(userLng), Number(lat), Number(lng))
    return formatDistanceText(meters)
  }

  const addressAutocompleteSuggestions = useMemo(() => {
    const q = String(addressAutocompleteValue || "").trim().toLowerCase()
    if (!q) return []
    const list = Array.isArray(addresses) ? addresses : []
    return list
      .map((addr) => {
        const text = [
          addr?.label,
          addr?.additionalDetails,
          addr?.street,
          addr?.city,
          addr?.state,
          addr?.zipCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return { addr, text }
      })
      .filter((x) => x.text.includes(q))
      .slice(0, 6)
      .map((x) => x.addr)
  }, [addresses, addressAutocompleteValue])

  // Load Google Maps API key
  useEffect(() => {
    if (!MAPS_ENABLED) return
    import('@food/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  useEffect(() => {
    const parseStored = () => {
      try {
        const stored = localStorage.getItem("userLocation")
        return stored ? JSON.parse(stored) : null
      } catch {
        return null
      }
    }

    const stored = parseStored()
    const source = stored || location
    if (!source) return

    const lat = Number(source?.latitude)
    const lng = Number(source?.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setMapPosition([lat, lng])
    }

    const formatted =
      source?.formattedAddress ||
      source?.address ||
      [source?.street, source?.city, source?.state, source?.postalCode || source?.zipCode]
        .filter(Boolean)
        .join(", ")

    if (formatted) {
      setCurrentAddress(formatted)
      setAddressAutocompleteValue(formatted)
      suppressAutocompleteFetchRef.current = true
    }

    setAddressFormData((prev) => ({
      ...prev,
      street: source?.street || prev.street,
      city: source?.city || prev.city,
      state: source?.state || prev.state,
      zipCode: source?.postalCode || source?.zipCode || prev.zipCode,
    }))
  }, [location])

  // Google Places Autocomplete search
  useEffect(() => {
    if (suppressAutocompleteFetchRef.current) {
      setGooglePlacesSuggestions([])
      return
    }
    if (!showAddressForm || !GOOGLE_MAPS_API_KEY || !addressAutocompleteValue || addressAutocompleteValue.length < 3) {
      setGooglePlacesSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        if (!window.google || !window.google.maps || !window.google.maps.places) {
          const loader = new Loader({ apiKey: GOOGLE_MAPS_API_KEY, version: "weekly", libraries: ["places"] });
          await loader.load();
        }
        
        const service = new window.google.maps.places.AutocompleteService();
        const request = {
          input: String(addressAutocompleteValue || "").trim(),
          componentRestrictions: { country: 'in' }, // Restrict to India
          types: ["geocode"],
          origin: location ? { lat: location.latitude, lng: location.longitude } : undefined,
        };

        service.getPlacePredictions(request, (predictions, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            const normalized = predictions.map((p, index) => ({
              id: p.place_id,
              display: p.description,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text,
              source: 'google',
              distanceMeters: Number.isFinite(Number(p.distance_meters)) ? Number(p.distance_meters) : null,
              _index: index,
            }))

            normalized.sort((a, b) => {
              const aDist = a.distanceMeters
              const bDist = b.distanceMeters
              const aHas = Number.isFinite(aDist)
              const bHas = Number.isFinite(bDist)
              if (aHas && bHas) return aDist - bDist
              if (aHas) return -1
              if (bHas) return 1
              return a._index - b._index
            })

            setGooglePlacesSuggestions(
              normalized.map(({ _index, ...rest }) => rest)
            );
          } else {
            setGooglePlacesSuggestions([]);
          }
        });
      } catch (e) {
        debugError("Google Places error:", e);
        setGooglePlacesSuggestions([]);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [addressAutocompleteValue, showAddressForm, GOOGLE_MAPS_API_KEY, location]);

  // Nominatim search fallback
  useEffect(() => {
    if (suppressAutocompleteFetchRef.current) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }
    if (!showAddressForm || googlePlacesSuggestions.length > 0) {
      setKeywordAddressSuggestions([])
      return
    }
    const q = String(addressAutocompleteValue || "").trim()
    if (!ENABLE_NOMINATIM_SEARCH || q.length < 3) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsKeywordSearching(true)
        const refLat = location?.latitude ?? 22.7196
        const refLng = location?.longitude ?? 75.8577
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map(r => ({
          id: r.place_id || r.osm_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          address: r.address || {},
        }))
        const withDistance = mapped
          .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .map(x => ({ ...x, distanceMeters: calculateDistance(refLat, refLng, x.lat, x.lng) }))
          .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
          .slice(0, 4)
        setKeywordAddressSuggestions(withDistance)
      } catch (e) {
        setKeywordAddressSuggestions([])
      } finally {
        setIsKeywordSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [addressAutocompleteValue, showAddressForm, location, ENABLE_NOMINATIM_SEARCH])

  // Map Initialization logic
  useEffect(() => {
    if (!MAPS_ENABLED || !showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) return

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({ apiKey: GOOGLE_MAPS_API_KEY, version: "weekly", libraries: ["places"] })
        const google = await loader.load()
        if (!isMounted || !mapContainerRef.current) return

        const initialPos = { lat: mapPosition[0], lng: mapPosition[1] }
        
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialPos,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] }
          ]
        })
        googleMapRef.current = map

        map.addListener("dragstart", () => {
          dismissSuggestions()
        })

        // Update coordinates on map idle (center of the map is the chosen location)
        map.addListener("idle", () => {
          const center = map.getCenter()
          const lat = center.lat()
          const lng = center.lng()
          setMapPosition([lat, lng])
          handleMapMoveEnd(lat, lng)
        })

        setMapLoading(false)
      } catch (err) {
        debugError("Map init error:", err)
        setMapLoading(false)
      }
    }
    initializeGoogleMap()
    return () => { isMounted = false }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY])

  const handleUseCurrentLocation = async () => {
    try {
      toast.loading("Getting location...", { id: "geo" })
      let apiKey = GOOGLE_MAPS_API_KEY
      if (!apiKey) {
        const mod = await import("@food/utils/googleMapsApiKey.js")
        apiKey = await mod.getGoogleMapsApiKey()
      }
      if (!apiKey) throw new Error("Google Maps API key not configured")

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        throw new Error("Geolocation not supported in this browser")
      }

      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "geolocation" })
        if (permission.state === "denied") {
          toast.error("Location permission is blocked. Please enable it in browser settings.", { id: "geo" })
          return
        }
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })

      const lat = Number(position?.coords?.latitude)
      const lng = Number(position?.coords?.longitude)
      const accuracy = Number(position?.coords?.accuracy)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Could not fetch current coordinates")
      }

      if (!window.google || !window.google.maps) {
        const loader = new Loader({ apiKey, version: "weekly", libraries: ["places"] })
        await loader.load()
      }

      const geocoder = new window.google.maps.Geocoder()
      const geocodeResult = await geocoder.geocode({ location: { lat, lng } })
      const firstResult = geocodeResult?.results?.[0]
      if (!firstResult) throw new Error("Failed to reverse geocode location")

      let street = ""
      let city = ""
      let state = ""
      let postcode = ""
      ;(firstResult.address_components || []).forEach((comp) => {
        const types = comp.types || []
        if (types.includes("route") || types.includes("sublocality") || types.includes("neighborhood")) {
          street = street ? `${street}, ${comp.long_name}` : comp.long_name
        } else if (types.includes("locality")) {
          city = comp.long_name
        } else if (types.includes("administrative_area_level_1")) {
          state = comp.long_name
        } else if (types.includes("postal_code")) {
          postcode = comp.long_name
        }
      })

      const formattedAddress = firstResult.formatted_address || ""
      const locationData = {
        latitude: lat,
        longitude: lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        street: street || "",
        city: city || "",
        state: state || "",
        postalCode: postcode || "",
        area: street || "",
        address: formattedAddress || [street, city, state, postcode].filter(Boolean).join(", "),
        formattedAddress: formattedAddress || [street, city, state, postcode].filter(Boolean).join(", "),
      }

      setMapPosition([lat, lng])
      setCurrentAddress(locationData.formattedAddress || locationData.address || "")
      setAddressAutocompleteValue(locationData.formattedAddress || locationData.address || "")
      setAddressFormData((prev) => ({
        ...prev,
        street: locationData.street || prev.street,
        city: locationData.city || prev.city,
        state: locationData.state || prev.state,
        zipCode: locationData.postalCode || locationData.zipCode || prev.zipCode,
      }))

      await persistActiveLocation(locationData, "current")

      const addressPayload = {
        label: "Other",
        additionalDetails: "",
        street: locationData.street || locationData.formattedAddress || "",
        city: locationData.city || "",
        state: locationData.state || "",
        zipCode: locationData.postalCode || "",
        phone: String(userProfile?.phone || userProfile?.mobile || "").trim(),
        location: { type: "Point", coordinates: [lng, lat] },
        latitude: lat,
        longitude: lng,
        formattedAddress: locationData.formattedAddress || "",
      }

      if (userProfile) {
        const existingOther = (addresses || []).find(
          (addr) => String(addr?.label || "").toLowerCase() === "other"
        )
        let savedAddress = null
        if (existingOther && getAddressId(existingOther)) {
          savedAddress = await updateAddress(getAddressId(existingOther), addressPayload)
        } else {
          savedAddress = await addAddress(addressPayload)
        }
        const savedAddressId = getAddressId(savedAddress)
        if (savedAddressId) {
          await setDefaultAddress(savedAddressId)
        }
      }
      await persistActiveLocation(locationData, "saved")

      if (googleMapRef.current) {
        googleMapRef.current.panTo({ lat, lng })
        googleMapRef.current.setZoom(17)
      }

      toast.success("Location updated", { id: "geo" })
    } catch (e) {
      console.error("Location error:", e)
      toast.error(e.message || "Failed to get location", { id: "geo" })
    }
  }

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address)
    if (id) {
      await setDefaultAddress(id)
    }
    const coords = address?.location?.coordinates
    const lng =
      Array.isArray(coords) && coords.length >= 2
        ? Number(coords[0])
        : Number(address?.longitude || address?.lng)
    const lat =
      Array.isArray(coords) && coords.length >= 2
        ? Number(coords[1])
        : Number(address?.latitude || address?.lat)

    const formattedAddress =
      address?.formattedAddress ||
      [
        address?.additionalDetails,
        address?.street,
        address?.city,
        address?.state,
        address?.zipCode,
      ]
        .filter(Boolean)
        .join(", ")

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setMapPosition([lat, lng])
    }
    setCurrentAddress(formattedAddress || address?.street || "")
    setAddressAutocompleteValue(formattedAddress || address?.street || "")
    setAddressFormData((prev) => ({
      ...prev,
      street: address?.street || "",
      city: address?.city || "",
      state: address?.state || "",
      zipCode: address?.zipCode || "",
      additionalDetails: address?.additionalDetails || "",
      label: address?.label === "Office" ? "Work" : (address?.label || prev.label),
      phone: address?.phone || prev.phone || "",
    }))
    suppressAutocompleteFetchRef.current = true
    setGooglePlacesSuggestions([])
    setKeywordAddressSuggestions([])
    try {
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const locationData = {
          latitude: lat,
          longitude: lng,
          city: address?.city || "",
          state: address?.state || "",
          area: address?.area || "",
          street: address?.street || "",
          postalCode: address?.zipCode || "",
          address: address?.street || formattedAddress || "",
          formattedAddress: formattedAddress || address?.street || "",
          label: address?.label || "",
        }
        await persistActiveLocation(locationData, "saved")
      }
    } catch {}

    toast.success("Location updated", { id: "saved-location" })
    handleBack()
  }

  const handleAddAddressClick = () => {
    setShowAddressForm(true)
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
  }

  const scrollFieldIntoView = useCallback((fieldName) => {
    const el = manualFieldRefs.current?.[fieldName]
    if (!el) return
    setTimeout(() => {
      try {
        const scrollHost = formBodyRef.current
        if (!scrollHost) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        const hostRect = scrollHost.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const viewportHeight =
          typeof window !== "undefined" && window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight
        const safeBottom = viewportHeight - keyboardInset - 90
        const overBy = elRect.bottom - safeBottom
        if (overBy > 0) {
          scrollHost.scrollTo({
            top: scrollHost.scrollTop + overBy + 24,
            behavior: "smooth",
          })
          return
        }
        if (elRect.top < hostRect.top + 70) {
          const upBy = hostRect.top + 70 - elRect.top
          scrollHost.scrollTo({
            top: Math.max(0, scrollHost.scrollTop - upBy - 12),
            behavior: "smooth",
          })
          return
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {
        // Ignore scrolling errors.
      }
    }, 120)
  }, [keyboardInset])

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    const street = String(addressFormData.street || "").trim()
    const city = String(addressFormData.city || "").trim()
    const state = String(addressFormData.state || "").trim()
    if (!street || !city || !state) {
      toast.error("Please fill Street, City and State")
      return
    }
    setLoadingAddress(true)
    try {
      const lat = Number(mapPosition[0])
      const lng = Number(mapPosition[1])
      const validGeo = Number.isFinite(lat) && Number.isFinite(lng)
      const payload = {
        ...addressFormData,
        label: addressFormData.label === "Work" ? "Office" : addressFormData.label,
        street,
        city,
        state,
        zipCode: String(addressFormData.zipCode || "").trim(),
        phone: String(addressFormData.phone || "").trim(),
        ...(validGeo ? {
          location: { type: "Point", coordinates: [lng, lat] },
          latitude: lat,
          longitude: lng
        } : {})
      }
      if (userProfile) {
        const created = await addAddress(payload)
        if (created) {
          const id = getAddressId(created)
          if (id) await setDefaultAddress(id)
        }
      }

      try {
        await persistActiveLocation({
          latitude: validGeo ? lat : undefined,
          longitude: validGeo ? lng : undefined,
          street: addressFormData.street || "",
          city: addressFormData.city || "",
          state: addressFormData.state || "",
          postalCode: addressFormData.zipCode || "",
          area: addressFormData.street || "",
          address: [addressFormData.additionalDetails, addressFormData.street, addressFormData.city, addressFormData.state, addressFormData.zipCode]
            .filter(Boolean)
            .join(", "),
          formattedAddress: currentAddress || [addressFormData.additionalDetails, addressFormData.street, addressFormData.city, addressFormData.state, addressFormData.zipCode]
            .filter(Boolean)
            .join(", "),
          label: addressFormData.label || "Home",
        }, "saved")
      } catch {}
      toast.success("Address saved")
      handleBack()
    } catch (error) {
      const msg = error?.response?.data?.message || error?.response?.data?.error || error?.message || "Failed to save address"
      toast.error(msg)
    } finally {
      setLoadingAddress(false)
    }
  }

  useEffect(() => {
    if (!showAddressForm) return
    const updateBaseMapHeight = () => {
      const vh = typeof window !== "undefined" ? window.innerHeight : 800
      const target = Math.round(vh * 0.45)
      setBaseMapHeight(Math.max(260, Math.min(420, target)))
    }
    updateBaseMapHeight()
    window.addEventListener("resize", updateBaseMapHeight)
    return () => window.removeEventListener("resize", updateBaseMapHeight)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm) return
    setFormScrollTop(0)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm || typeof window === "undefined" || !window.visualViewport) return
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [showAddressForm])

  if (showAddressForm) {
    const mapHeight = baseMapHeight 
    return (
      <AnimatedPage
        className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden"
      >
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">Add delivery location</h1>
        </div>

        <div
          ref={formBodyRef}
          onScroll={(e) => {
            setFormScrollTop(e.currentTarget.scrollTop)
          }}
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: `${96 + keyboardInset}px` }}
        >
          {/* Map Section - Parallax enabled */}
          <div
            className="flex-shrink-0 relative z-0"
            style={{ 
              height: `${mapHeight}px`,
              transform: `translateY(${formScrollTop * 0.4}px)`,
              opacity: clamp(1 - (formScrollTop / 500), 0.4, 1)
            }}
          >
            <div className="absolute top-4 left-4 right-4 z-20">
              <div className="relative group shadow-2xl">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  value={addressAutocompleteValue}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setIsSearchFocused(true)
                    suppressAutocompleteFetchRef.current = false
                    setAddressAutocompleteValue(e.target.value)
                  }}
                  placeholder="Search area, street, landmark..."
                  className="pl-10 h-12 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border-none rounded-xl shadow-lg focus:ring-2 focus:ring-[#EB590E] transition-all"
                />
                {isKeywordSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                     <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#EB590E] border-t-transparent" />
                  </div>
                )}

                {isSearchFocused && googlePlacesSuggestions.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-y-auto overflow-x-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    style={{ maxHeight: "min(42vh, 280px)" }}
                  >
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-800/50">Google Suggestions</p>
                    {googlePlacesSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={async () => {
                          const geocoder = new window.google.maps.Geocoder();
                          geocoder.geocode({ placeId: s.id }, (results, status) => {
                            if (status === "OK" && results[0]) {
                              const res = results[0];
                              const lat = res.geometry.location.lat();
                              const lng = res.geometry.location.lng();
                              setMapPosition([lat, lng]);
                              if (googleMapRef.current) {
                                googleMapRef.current.panTo({ lat, lng });
                                googleMapRef.current.setZoom(17);
                              }
                              setAddressAutocompleteValue(s.display);
                              
                              let street = "", city = "", state = "", postcode = "";
                              res.address_components.forEach(comp => {
                                const types = comp.types;
                                if (types.includes("route") || types.includes("sublocality") || types.includes("neighborhood")) {
                                  street = street ? `${street}, ${comp.long_name}` : comp.long_name;
                                } else if (types.includes("locality")) {
                                  city = comp.long_name;
                                } else if (types.includes("administrative_area_level_1")) {
                                  state = comp.long_name;
                                } else if (types.includes("postal_code")) {
                                  postcode = comp.long_name;
                                }
                              });

                              setAddressFormData((prev) => ({
                                ...prev,
                                street: street || s.mainText || prev.street,
                                city: city || prev.city,
                                state: state || prev.state,
                                zipCode: postcode || prev.zipCode,
                              }));
                              setCurrentAddress(res.formatted_address);
                              suppressAutocompleteFetchRef.current = true;
                              setIsSearchFocused(false);
                              setGooglePlacesSuggestions([]);
                              setKeywordAddressSuggestions([]);
                            }
                          });
                        }}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-none"
                      >
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.mainText}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.secondaryText}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {isSearchFocused && keywordAddressSuggestions.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-y-auto overflow-x-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    style={{ maxHeight: "min(42vh, 280px)" }}
                  >
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-800/50">Suggestions</p>
                    {keywordAddressSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const { lat, lng, display, address: a } = s
                          setMapPosition([lat, lng])
                          if (googleMapRef.current) {
                            googleMapRef.current.panTo({ lat, lng })
                            googleMapRef.current.setZoom(17)
                          }
                          setAddressAutocompleteValue(display)
                          const city = a.city || a.town || a.village || a.county || ""
                          const state = a.state || ""
                          const zipCode = a.postcode || ""
                          setAddressFormData((prev) => ({
                            ...prev,
                            street: display || prev.street,
                            city: city || prev.city,
                            state: state || prev.state,
                            zipCode: zipCode || prev.zipCode,
                          }))
                          suppressAutocompleteFetchRef.current = true
                          setIsSearchFocused(false)
                          setGooglePlacesSuggestions([])
                          setKeywordAddressSuggestions([])
                        }}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-none"
                      >
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.display}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.address?.city || s.address?.state}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              ref={mapContainerRef}
              onPointerDown={dismissSuggestions}
              onTouchStart={dismissSuggestions}
              className="w-full h-full bg-gray-100 dark:bg-gray-800"
            />
            
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className="relative mb-8 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center p-2 mb-[-6px] shadow-sm animate-bounce-short">
                     <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center border-2 border-white">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                     </div>
                  </div>
                  <div className="w-1.5 h-6 bg-green-600 border-x border-white shadow-xl rounded-b-full shadow-green-900/40" />
                  <div className="w-3 h-1.5 bg-black/20 rounded-full blur-[1px] transform scale-x-150 absolute bottom-[-4px]" />
               </div>
            </div>

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#EB590E]" />
              </div>
            )}
            
            <div className="absolute bottom-10 right-4 z-10">
              <Button 
                  onClick={handleUseCurrentLocation} 
                  className="bg-white text-black hover:bg-gray-100 shadow-xl border border-gray-200 rounded-full h-12 px-6"
              >
                <Navigation className="h-4 w-4 mr-2 text-[#EB590E]" /> Use My Location
              </Button>
            </div>
          </div>

          <div className="relative bg-white dark:bg-[#0a0a0a] rounded-t-[32px] -mt-8 z-10 p-4 space-y-6 shadow-[0_-12px_24px_-10px_rgba(0,0,0,0.1)]">
            <div className="bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl p-4 flex gap-3">
               <MapPin className="h-5 w-5 text-[#EB590E] mt-0.5" />
               <div className="min-w-0">
                  <p className="text-xs font-bold text-orange-800 dark:text-orange-200 uppercase mb-1">Pinnned Location</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{currentAddress || "Select a location on map"}</p>
               </div>
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block">Primary Address (Street / Area / Landmark)</Label>
              <Input 
                placeholder="Search or drag to update street/area" 
                value={addressFormData.street} 
                onChange={e => setAddressFormData({...addressFormData, street: e.target.value})}
                onFocus={() => scrollFieldIntoView("street")}
                ref={(el) => { manualFieldRefs.current.street = el }}
                className="mb-4 h-12 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                required
              />

              <Label className="text-sm font-bold mb-2 block text-orange-600 dark:text-orange-400">Secondary Address (House No. / Flat / Floor)</Label>
              <Input 
                placeholder="E.g. Flat 402, 4th Floor, Eqosy Building" 
                value={addressFormData.additionalDetails} 
                onChange={e => setAddressFormData({...addressFormData, additionalDetails: e.target.value})}
                onFocus={() => scrollFieldIntoView("additionalDetails")}
                ref={(el) => { manualFieldRefs.current.additionalDetails = el }}
                className="h-12 rounded-xl border-orange-200 dark:border-orange-900/40 focus:ring-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">City</Label>
                <Input 
                  value={addressFormData.city} 
                  onChange={e => setAddressFormData({...addressFormData, city: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("city")}
                  ref={(el) => { manualFieldRefs.current.city = el }}
                  className="h-12 rounded-xl"
                  required 
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">State</Label>
                <Input 
                  value={addressFormData.state} 
                  onChange={e => setAddressFormData({...addressFormData, state: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("state")}
                  ref={(el) => { manualFieldRefs.current.state = el }}
                  className="h-12 rounded-xl"
                  required 
                />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Pincode / ZIP</Label>
              <Input 
                placeholder="Pincode" 
                value={addressFormData.zipCode || ""} 
                onChange={e => setAddressFormData({...addressFormData, zipCode: e.target.value})} 
                onFocus={() => scrollFieldIntoView("zipCode")}
                ref={(el) => { manualFieldRefs.current.zipCode = el }}
                className="h-12 rounded-xl"
              />
            </div>

            <div>
               <Label className="text-sm font-bold mb-2 block">Save address as</Label>
               <div className="flex gap-2">
                 {["Home", "Work", "Other"].map(l => (
                   <Button 
                     key={l}
                     variant={addressFormData.label === l ? "default" : "outline"}
                     onClick={() => setAddressFormData({...addressFormData, label: l})}
                     className="flex-1"
                     style={addressFormData.label === l ? {backgroundColor: '#EB590E', color: 'white'} : {}}
                   >
                     {l}
                   </Button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 transition-[bottom] duration-150"
          style={{ bottom: `${keyboardInset}px` }}
        >
          <Button 
            className="w-full h-12 text-white font-bold text-lg" 
            style={{backgroundColor: '#EB590E'}}
            onClick={handleAddressFormSubmit}
            disabled={loadingAddress}
          >
            {loadingAddress ? "Saving..." : "Save Address \u0026 Proceed"}
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex flex-col">
      {/* Header & Top Search Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 pt-4 pb-3 shadow-xs space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 -ml-2 h-9 w-9">
            <ChevronLeft className="h-6 w-6 text-gray-800 dark:text-gray-200" />
          </Button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Select Location</h1>
        </div>

        {/* Search Bar Input matching reference image design */}
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 h-5 w-5 text-rose-500 flex-shrink-0 pointer-events-none" />
          <input
            type="text"
            value={topSearchQuery}
            onChange={(e) => setTopSearchQuery(e.target.value)}
            placeholder="Search location..."
            className="w-full bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl pl-11 pr-10 py-3 text-sm font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-xs"
          />
          {topSearchQuery && (
            <button
              type="button"
              onClick={() => setTopSearchQuery("")}
              className="absolute right-3.5 p-1 rounded-full bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-3 pb-10">
        {/* Use Current Location Button */}
        <button
          onClick={handleUseCurrentLocation}
          disabled={loading}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-rose-50/40 dark:hover:bg-rose-900/10 rounded-2xl transition-colors border border-gray-100 dark:border-gray-800 shadow-xs group"
        >
          <div className="flex items-center gap-3.5">
            <Target className="h-5 w-5 text-rose-500 dark:text-rose-400 flex-shrink-0 stroke-[2.2]" />
            <span className="font-semibold text-rose-600 dark:text-rose-400 text-base">
              Use Current Location
            </span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        </button>

        {/* Add Address Button (when query is empty) */}
        {!topSearchQuery && (
          <button
            onClick={handleAddAddressClick}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded-2xl transition-colors border border-gray-100 dark:border-gray-800 shadow-xs group"
          >
            <div className="flex items-center gap-3.5">
              <div className="h-7 w-7 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                <Plus className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-base">
                Add Address
              </span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </button>
        )}

        {/* Loading Indicator for Top Search */}
        {isTopSearching && (
          <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-rose-500 border-t-transparent" />
            Searching locations...
          </div>
        )}

        {/* Unified Cards List for Saved Addresses & Search Results */}
        {(matchingSavedAddresses.length > 0 || topSearchResults.length > 0) && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800/60 overflow-hidden shadow-xs">
            {/* Matching Saved Addresses */}
            {matchingSavedAddresses.map((address) => {
              const IconComponent = getAddressIcon(address)
              const distStr = getSavedAddressDistanceText(address)
              const isHome = (address.label || "").toLowerCase().includes("home")
              return (
                <div key={getAddressId(address) || address.id} className="p-4 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                  <button
                    onClick={() => handleSelectSavedAddress(address)}
                    className="w-full flex items-start gap-4 text-left"
                  >
                    <div className="flex flex-col items-center min-w-[48px]">
                      <div className="h-10 w-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                        <IconComponent className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </div>
                      {distStr && (
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">
                          {distStr}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white text-base capitalize">
                        {address.label || address.additionalDetails || "Home"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">
                        {[
                          address.additionalDetails,
                          address.street,
                          address.city,
                          address.state,
                          address.zipCode
                        ].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </button>

                  {/* Weather Alert Banner for Home address */}
                  {isHome && (
                    <div className="mt-3 bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-3 flex items-center gap-2.5">
                      <CloudRain className="h-5 w-5 text-indigo-500 flex-shrink-0" />
                      <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                        It's raining here, delivery partners may take longer to reach
                      </p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Keyword Search Suggestions */}
            {topSearchResults.map((item) => {
              const distStr = item.distanceMeters !== null ? formatDistanceText(item.distanceMeters) : null
              const isStation = item.title.toLowerCase().includes("station") || item.subtitle.toLowerCase().includes("station") || item.title.toLowerCase().includes("railway")
              return (
                <div key={item.id} className="p-4 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                  <button
                    onClick={() => handleSelectSearchSuggestion(item)}
                    className="w-full flex items-start gap-4 text-left"
                  >
                    <div className="flex flex-col items-center min-w-[48px]">
                      <div className="h-10 w-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </div>
                      {distStr && (
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">
                          {distStr}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white text-base">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">
                        {item.subtitle}
                      </p>

                      {/* IRCTC Train delivery badge */}
                      {isStation && (
                        <div className="mt-2 inline-flex items-center px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-medium">
                          Train seat delivery, partnered with IRCTC
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state when searching and no results found */}
        {topSearchQuery && !isTopSearching && matchingSavedAddresses.length === 0 && topSearchResults.length === 0 && (
          <div className="p-8 text-center bg-white dark:bg-[#1a1a1a] rounded-3xl border border-gray-100 dark:border-gray-800">
            <MapPin className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="font-semibold text-gray-700 dark:text-gray-300 text-base">No locations found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try searching with a different keyword or area name</p>
          </div>
        )}
      </div>
      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1s infinite ease-in-out;
        }
      `}</style>
    </AnimatedPage>
  )
}

