import React, { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { MapPin, Phone, RefreshCw, Navigation, Bike, Clock, AlertCircle, Copy, Check, ShieldCheck, User } from "lucide-react"
import { Loader } from "@googlemaps/js-api-loader"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { subscribeDeliveryLocation } from "@food/realtimeTracking"
import bikeLogo from "@food/assets/bikelogo.png"
import { toast } from "sonner"

export default function DriverLiveLocationModal({ deliveryman, isOpen, onClose }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)

  const [mapLoading, setMapLoading] = useState(true)
  const [copiedCoords, setCopiedCoords] = useState(false)
  const [locationData, setLocationData] = useState({
    lat: null,
    lng: null,
    heading: 0,
    speed: 0,
    isOnline: false,
    lastUpdated: null,
    activeOrderId: null,
  })

  const driverId = String(deliveryman?._id || deliveryman?.id || deliveryman?.deliveryId || "")

  // Initialize initial location state from prop
  useEffect(() => {
    if (!deliveryman) return

    const initialLat = Number(deliveryman?.lastLat ?? deliveryman?.currentLocation?.coordinates?.[1] ?? deliveryman?.availability?.currentLocation?.coordinates?.[1])
    const initialLng = Number(deliveryman?.lastLng ?? deliveryman?.currentLocation?.coordinates?.[0] ?? deliveryman?.availability?.currentLocation?.coordinates?.[0])
    const isOnline = deliveryman?.availabilityStatus === "online" || deliveryman?.status === "Online" || deliveryman?.isOnline === true

    setLocationData({
      lat: Number.isFinite(initialLat) ? initialLat : null,
      lng: Number.isFinite(initialLng) ? initialLng : null,
      heading: 0,
      speed: 0,
      isOnline,
      lastUpdated: deliveryman?.lastLocationAt ? new Date(deliveryman.lastLocationAt).getTime() : Date.now(),
      activeOrderId: deliveryman?.activeOrderId || null,
    })
  }, [deliveryman])

  // Real-time listener for location updates
  useEffect(() => {
    if (!isOpen || !driverId) return

    const unsubscribe = subscribeDeliveryLocation(
      driverId,
      (data) => {
        if (!data) return
        const lat = Number(data.lat)
        const lng = Number(data.lng)
        const isOnline = data.isOnline === true || data.status === "online"

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setLocationData({
            lat,
            lng,
            heading: Number(data.heading) || 0,
            speed: Number(data.speed) || 0,
            isOnline,
            lastUpdated: Number(data.last_updated || data.timestamp) || Date.now(),
            activeOrderId: data.activeOrderId || null,
          })
        }
      },
      (err) => {
        console.warn("Real-time delivery location listener error:", err)
      }
    )

    return () => {
      if (typeof unsubscribe === "function") unsubscribe()
    }
  }, [isOpen, driverId])

  // Load Google Maps
  useEffect(() => {
    if (!isOpen || !mapRef.current) return

    let isMounted = true

    const loadMap = async () => {
      try {
        setMapLoading(true)
        const apiKey = await getGoogleMapsApiKey()

        if (window.google && window.google.maps) {
          if (isMounted) initGoogleMap(window.google)
          return
        }

        if (apiKey) {
          const loader = new Loader({
            apiKey,
            version: "weekly",
            libraries: ["places", "geometry"],
          })
          const google = await loader.load()
          if (isMounted) initGoogleMap(google)
        } else {
          if (isMounted) setMapLoading(false)
        }
      } catch (err) {
        console.error("Error loading Google Maps in modal:", err)
        if (isMounted) setMapLoading(false)
      }
    }

    loadMap()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  const initGoogleMap = (google) => {
    if (!mapRef.current) return

    const centerLat = locationData.lat ?? 20.5937
    const centerLng = locationData.lng ?? 78.9629

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: locationData.lat ? 16 : 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    })

    mapInstanceRef.current = map

    if (locationData.lat && locationData.lng) {
      updateMapMarker(google, map, locationData.lat, locationData.lng, locationData.heading)
    }

    setMapLoading(false)
  }

  // Update map marker when location changes
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !locationData.lat || !locationData.lng) return

    updateMapMarker(window.google, mapInstanceRef.current, locationData.lat, locationData.lng, locationData.heading)
  }, [locationData.lat, locationData.lng, locationData.heading])

  const updateMapMarker = (google, map, lat, lng, heading = 0) => {
    const latLng = new google.maps.LatLng(lat, lng)

    const bikeIcon = {
      url: bikeLogo,
      scaledSize: new google.maps.Size(48, 48),
      anchor: new google.maps.Point(24, 24),
    }

    if (markerRef.current) {
      markerRef.current.setPosition(latLng)
    } else {
      const marker = new google.maps.Marker({
        position: latLng,
        map,
        icon: bikeIcon,
        title: deliveryman?.name || "Delivery Partner",
        zIndex: 100,
      })
      markerRef.current = marker
    }

    map.panTo(latLng)
  }

  const handleRecenter = () => {
    if (mapInstanceRef.current && locationData.lat && locationData.lng) {
      mapInstanceRef.current.panTo({ lat: locationData.lat, lng: locationData.lng })
      mapInstanceRef.current.setZoom(16)
    }
  }

  const handleCopyCoords = () => {
    if (!locationData.lat || !locationData.lng) return
    const text = `${locationData.lat}, ${locationData.lng}`
    navigator.clipboard.writeText(text)
    setCopiedCoords(true)
    toast.success("Coordinates copied to clipboard")
    setTimeout(() => setCopiedCoords(false), 2000)
  }

  const formatLastUpdated = (ts) => {
    if (!ts) return "Unknown"
    const diffSec = Math.floor((Date.now() - ts) / 1000)
    if (diffSec < 10) return "Just now"
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden rounded-2xl border-0 shadow-2xl bg-white">
        {/* Header */}
        <DialogHeader className="p-5 bg-slate-900 text-white flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white overflow-hidden font-bold border-2 border-slate-700 shadow-inner">
                {deliveryman?.profilePhoto || deliveryman?.profileImage?.url ? (
                  <img
                    src={deliveryman?.profilePhoto || deliveryman?.profileImage?.url}
                    alt={deliveryman?.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-6 h-6" />
                )}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                  locationData.isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                }`}
                title={locationData.isOnline ? "Online" : "Offline"}
              />
            </div>

            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                {deliveryman?.name || "Delivery Partner"}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal border border-slate-700">
                  {deliveryman?.vehicleType || "Bike"} • {deliveryman?.vehicleNumber || "N/A"}
                </span>
              </DialogTitle>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                {deliveryman?.phone && (
                  <a
                    href={`tel:${deliveryman.phone}`}
                    className="flex items-center gap-1 text-blue-400 hover:underline font-medium"
                  >
                    <Phone className="w-3 h-3" />
                    {deliveryman.phone}
                  </a>
                )}
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  Ping: {formatLastUpdated(locationData.lastUpdated)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                locationData.isOnline
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${locationData.isOnline ? "bg-emerald-400 animate-ping" : "bg-slate-400"}`}
              />
              {locationData.isOnline ? "LIVE TRACKING" : "OFFLINE"}
            </div>
          </div>
        </DialogHeader>

        {/* Info Banner */}
        <div className="bg-slate-100 px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-700 gap-2">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-900">
              Coords:{" "}
              <span className="font-mono text-blue-700">
                {locationData.lat ? `${locationData.lat.toFixed(5)}, ${locationData.lng.toFixed(5)}` : "No GPS signal"}
              </span>
            </span>
            {locationData.speed > 0 && (
              <span className="font-semibold text-slate-900">
                Speed: <span className="text-emerald-700">{locationData.speed} km/h</span>
              </span>
            )}
            {locationData.activeOrderId && (
              <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-300">
                On Order #{locationData.activeOrderId}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCoords}
              disabled={!locationData.lat}
              className="px-2.5 py-1 rounded bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center gap-1 font-medium transition-all disabled:opacity-50"
              title="Copy Latitude & Longitude"
            >
              {copiedCoords ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copiedCoords ? "Copied" : "Copy Coords"}
            </button>
            <button
              onClick={handleRecenter}
              disabled={!locationData.lat}
              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 font-medium shadow-sm transition-all disabled:opacity-50"
            >
              <Navigation className="w-3 h-3" />
              Recenter
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative w-full h-[450px] bg-slate-100">
          <div ref={mapRef} className="w-full h-full" />

          {mapLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/90 backdrop-blur-sm z-10">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-sm font-semibold text-slate-700">Loading interactive tracking map...</span>
            </div>
          )}

          {!locationData.lat && !mapLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10 p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mb-3 animate-bounce" />
              <h3 className="text-base font-bold text-slate-900">No Real-Time GPS Location Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mt-1">
                This delivery partner has not broadcasted their live GPS coordinates recently. Location updates will appear automatically as soon as the driver app connects online.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
