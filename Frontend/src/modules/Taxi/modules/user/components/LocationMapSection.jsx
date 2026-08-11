import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LoaderCircle, Navigation } from 'lucide-react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { getSavedLocation, saveLocation } from '../services/locationStore';
import api from '../../../shared/api/axiosInstance';
// Inline SVG data URLs used as Google Maps marker icons (no external file dependency)
const carIcon =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40">
      <rect x="8" y="22" width="48" height="24" rx="8" fill="#1e293b"/>
      <rect x="14" y="26" width="36" height="14" rx="4" fill="#7dd3fc"/>
      <circle cx="18" cy="48" r="6" fill="#334155"/>
      <circle cx="18" cy="48" r="3" fill="#94a3b8"/>
      <circle cx="46" cy="48" r="6" fill="#334155"/>
      <circle cx="46" cy="48" r="3" fill="#94a3b8"/>
      <rect x="6" y="32" width="6" height="8" rx="2" fill="#f59e0b"/>
      <rect x="52" y="32" width="6" height="8" rx="2" fill="#ef4444"/>
    </svg>`
  );

const bikeIcon =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="36" height="36">
      <circle cx="14" cy="44" r="10" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
      <circle cx="14" cy="44" r="5" fill="#94a3b8"/>
      <circle cx="50" cy="44" r="10" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
      <circle cx="50" cy="44" r="5" fill="#94a3b8"/>
      <path d="M14 44 L32 20 L50 44" stroke="#f59e0b" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="32" cy="20" r="4" fill="#f59e0b"/>
    </svg>`
  );

const autoIcon =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="38" height="38">
      <rect x="10" y="24" width="38" height="22" rx="6" fill="#f59e0b"/>
      <rect x="14" y="28" width="30" height="12" rx="3" fill="#fef9c3"/>
      <circle cx="18" cy="48" r="6" fill="#1e293b"/>
      <circle cx="18" cy="48" r="3" fill="#94a3b8"/>
      <circle cx="42" cy="48" r="6" fill="#1e293b"/>
      <circle cx="42" cy="48" r="3" fill="#94a3b8"/>
      <rect x="4" y="30" width="8" height="6" rx="2" fill="#fbbf24"/>
    </svg>`
  );

const deliveryIcon =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="42" height="42">
      <rect x="4" y="20" width="40" height="26" rx="4" fill="#334155"/>
      <rect x="44" y="28" width="16" height="18" rx="3" fill="#475569"/>
      <rect x="8" y="24" width="32" height="16" rx="3" fill="#7dd3fc"/>
      <circle cx="16" cy="48" r="6" fill="#1e293b"/>
      <circle cx="16" cy="48" r="3" fill="#94a3b8"/>
      <circle cx="48" cy="48" r="6" fill="#1e293b"/>
      <circle cx="48" cy="48" r="3" fill="#94a3b8"/>
    </svg>`
  );

const DEFAULT_CENTER = { lat: 17.385, lon: 78.4867 };
const DEFAULT_ZOOM = 16;
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const areCentersNearlyEqual = (first, second, threshold = 0.00001) => (
  Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
  Math.abs(Number(first?.lon ?? 0) - Number(second?.lon ?? 0)) < threshold
);

const getDriverIconAsset = (driver) => {
  const iconType = String(driver?.vehicleIconType || driver?.vehicleType || '').toLowerCase();
  if (iconType.includes('bike')) return bikeIcon;
  if (iconType.includes('auto')) return autoIcon;
  if (iconType.includes('truck') || iconType.includes('delivery')) return deliveryIcon;
  return carIcon;
};

const LocationMapSection = ({ plain = false }) => {
  const [coords, setCoords] = useState(null);
  const [centerCoords, setCenterCoords] = useState(DEFAULT_CENTER);
  const [status, setStatus] = useState('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [map, setMap] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const isDraggingRef = useRef(false);
  const requestedLocationRef = useRef(false);
  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  const persistCoords = (next) => {
    setCoords(next);
    setCenterCoords(next);
    setStatus('ready');
    saveLocation({
      ...next,
      updatedAt: Date.now(),
    });
  };

  const persistAddress = (address) => {
    saveLocation({ address: String(address || '').trim() });
  };

  useEffect(() => {
    const saved = getSavedLocation();
    if (typeof saved?.lat === 'number' && typeof saved?.lon === 'number') {
      persistCoords({ lat: saved.lat, lon: saved.lon });
    }

    const shouldRefreshCurrentLocation =
      !saved
      || typeof saved?.lat !== 'number'
      || typeof saved?.lon !== 'number'
      || !saved?.updatedAt
      || (Date.now() - saved.updatedAt) > AUTO_REFRESH_INTERVAL_MS;

    if (shouldRefreshCurrentLocation && !requestedLocationRef.current) {
      requestedLocationRef.current = true;
      requestLocation();
    }
  }, []);

  useEffect(() => {
    if (coords && map) {
      map.panTo({ lat: coords.lat, lng: coords.lon });
      map.setZoom(DEFAULT_ZOOM);
    }
  }, [coords, map]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    
    const onSuccess = (position) => {
      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };

      persistCoords(next);
      if (map) {
        map.panTo({ lat: next.lat, lng: next.lon });
        map.setZoom(DEFAULT_ZOOM);
      }

      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat: next.lat, lng: next.lon } }, (results, geocodeStatus) => {
          if (geocodeStatus === 'OK' && results?.[0]?.formatted_address) {
            try {
              persistAddress(results[0].formatted_address);
            } catch {
              // ignore
            }
          }
        });
      }
    };

    const onError = (error) => {
      if (error?.code === 1) {
        setStatus('denied');
        return;
      }
      setStatus('error');
    };

    const optionsHigh = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };
    const optionsLow = { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        console.warn("LocationMapSection GPS high accuracy failed, trying low accuracy...", err);
        navigator.geolocation.getCurrentPosition(onSuccess, onError, optionsLow);
      },
      optionsHigh
    );
  };

  useEffect(() => {
    if (!centerCoords?.lat || !centerCoords?.lon) return;
    let active = true;

    const fetchNearby = async () => {
      try {
        const response = await api.get('/rides/available-drivers', {
          params: {
            lat: centerCoords.lat,
            lng: centerCoords.lon,
            maxDistance: 10000,
            limit: 20,
          },
        });
        const driversList = response?.data?.data?.drivers || response?.data?.drivers || [];
        if (active && Array.isArray(driversList)) {
          setNearbyDrivers(driversList);
        }
      } catch (_err) {
        if (active) setNearbyDrivers([]);
      }
    };

    fetchNearby();
    const interval = setInterval(fetchNearby, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [centerCoords?.lat, centerCoords?.lon]);

  const helperText = (() => {
    if (status === 'loading') return 'Pinning your current location...';
    if (status === 'denied') return 'Location permission denied. Tap to try again.';
    if (status === 'error') return 'Unable to fetch location. Tap to retry.';
    if (isDragging) return 'Move the map to set the pin.';
    if (status === 'ready') return 'Drag the map to fine-tune. Tap Update to refresh GPS.';
    return 'Pin your current location, then adjust by dragging.';
  })();

  const containerClass = plain
    ? 'relative z-10 px-5 mt-1'
    : 'mx-5 my-4 rounded-[32px] bg-gradient-to-br from-[#EBF1FA] via-[#F3F7FC] to-[#F8FAFC] border border-blue-100/30 shadow-[0_24px_50px_rgba(30,41,59,0.04)] relative overflow-visible px-5 py-5.5';

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={containerClass}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Map</p>
          <h3 className="mt-0.5 flex items-baseline gap-1 text-[16px] font-black tracking-tight text-slate-900">
            <span className="truncate">Pin your location</span>
            <span className="inline-flex" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="inline-block"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{
                    duration: 1.05,
                    delay: dot * 0.18,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  .
                </motion.span>
              ))}
            </span>
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{helperText}</p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={requestLocation}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-black text-slate-800 shadow-[0_8px_16px_-4px_rgba(15,23,42,0.1)] transition-all active:shadow-inner"
        >
          <div className="relative">
            <Navigation 
              size={14} 
              strokeWidth={2.8} 
              className={`transition-colors ${status === 'loading' ? 'animate-pulse text-emerald-600' : 'text-slate-500'}`} 
            />
            {coords && (
              <motion.span
                layoutId="active-dot"
                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>
          <span className="uppercase tracking-wider">{coords ? 'Update' : 'Pin'}</span>
        </motion.button>
      </div>

      <div className="relative mt-3 rounded-[20px] bg-[linear-gradient(135deg,rgba(16,185,129,0.40)_0%,rgba(56,189,248,0.22)_50%,rgba(251,146,60,0.16)_100%)] p-[1px] shadow-[0_0_0_1px_rgba(16,185,129,0.10),0_10px_22px_rgba(15,23,42,0.06)]">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 rounded-[20px] blur-xl"
          animate={{ opacity: [0.14, 0.26, 0.14] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(56,189,248,0.14) 52%, rgba(251,146,60,0.10) 100%)',
          }}
        />

        <div className="relative z-10 overflow-hidden rounded-[19px] border border-white/70 bg-white/85">
          <div className="relative h-[170px] w-full">
            {!HAS_VALID_GOOGLE_MAPS_KEY && (
              <div className="flex h-full w-full items-center justify-center px-5 text-center">
                <div>
                  <p className="text-[12px] font-black text-slate-900">Google Maps key missing</p>
                  <p className="mt-1 text-[11px] font-bold text-slate-500">Add `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</p>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && loadError && (
              <div className="flex h-full w-full items-center justify-center px-5 text-center">
                <div>
                  <p className="text-[12px] font-black text-slate-900">Map failed to load</p>
                  <p className="mt-1 text-[11px] font-bold text-slate-500">Check your Google Maps browser key restrictions.</p>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && !loadError && !isLoaded && (
              <div className="flex h-full w-full items-center justify-center">
                <div className="flex items-center gap-2 rounded-[16px] bg-white/90 px-4 py-3 shadow-sm">
                  <LoaderCircle size={18} className="animate-spin text-slate-500" />
                  <span className="text-[12px] font-black text-slate-700">Loading map</span>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && !loadError && isLoaded && (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={{ lat: centerCoords.lat, lng: centerCoords.lon }}
                zoom={DEFAULT_ZOOM}
                onLoad={(nextMap) => setMap(nextMap)}
                onUnmount={() => setMap(null)}
                onDragStart={() => {
                  isDraggingRef.current = true;
                  setIsDragging(true);
                }}
                onDragEnd={() => {
                  isDraggingRef.current = false;
                  setIsDragging(false);
                  if (!map) {
                    return;
                  }

                  const center = map.getCenter();
                  if (!center) {
                    return;
                  }

                  persistCoords({ lat: center.lat(), lon: center.lng() });
                  if (window.google?.maps?.Geocoder) {
                    const geocoder = new window.google.maps.Geocoder();
                    geocoder.geocode(
                      { location: { lat: center.lat(), lng: center.lng() } },
                      (results, geocodeStatus) => {
                        if (geocodeStatus === 'OK' && results?.[0]?.formatted_address) {
                          persistAddress(results[0].formatted_address);
                        }
                      },
                    );
                  }
                }}
                onIdle={() => {
                  if (!map) {
                    return;
                  }

                  const center = map.getCenter();
                  if (!center) {
                    return;
                  }

                  const next = { lat: center.lat(), lon: center.lng() };

                  if (areCentersNearlyEqual(centerCoords, next)) {
                    return;
                  }

                  setCenterCoords(next);

                  if (!isDraggingRef.current && status === 'ready') {
                    saveLocation(next);
                  }
                }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  clickableIcons: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                  mapTypeControl: false,
                  gestureHandling: 'greedy',
                }}
              >
                {nearbyDrivers.map((driver, index) => {
                  const coordsPair = driver?.location?.coordinates;
                  if (!Array.isArray(coordsPair) || coordsPair.length < 2) return null;
                  const pos = { lat: Number(coordsPair[1]), lng: Number(coordsPair[0]) };
                  const iconAsset = getDriverIconAsset(driver);
                  return (
                    <MarkerF
                      key={driver.id || driver._id || index}
                      position={pos}
                      title={driver.name || 'Available Rider'}
                      icon={{
                        url: iconAsset,
                        scaledSize: new window.google.maps.Size(32, 32),
                      }}
                    />
                  );
                })}
              </GoogleMap>
            )}

            {/* The Pinpoint */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2">
              {/* Point Shadow - anchored at the map center */}
              <motion.div
                initial={false}
                animate={{
                  scale: isDragging ? [1, 1.22, 1.15] : 1,
                  opacity: isDragging ? 0.28 : 0.55,
                  y: isDragging ? 7 : 0,
                }}
                className="absolute left-1/2 top-0 h-[3px] w-3.5 -translate-x-1/2 rounded-[100%] bg-slate-900/30 blur-[1.5px]"
              />

              {/* Pin Body */}
              <motion.div
                initial={false}
                animate={{
                  y: isDragging ? -31 : -2,
                  scale: isDragging ? 1.04 : 1,
                }}
                transition={{
                  type: 'spring',
                  stiffness: isDragging ? 450 : 350,
                  damping: 25,
                }}
                className="relative flex flex-col items-center -translate-y-full"
              >
                <div className="relative h-[42px] w-[28px] drop-shadow-[0_10px_18px_rgba(15,23,42,0.2)]">
                  <svg
                    viewBox="0 0 32 48"
                    className="h-full w-full overflow-visible"
                    aria-hidden="true"
                  >
                    <path
                      d="M16 2C9.1 2 4 7.21 4 13.88c0 9.54 8.58 18.76 11.13 28.42.18.69.58 1.7.87 2.7.29-1 .69-2.01.87-2.7C19.42 32.64 28 23.42 28 13.88 28 7.21 22.9 2 16 2Z"
                      fill="white"
                      stroke="#10b981"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                    />
                    <circle cx="16" cy="14" r="6.5" fill="#10b981" />
                    <circle cx="16" cy="14" r="2.4" fill="white" fillOpacity="0.95" />
                  </svg>
                </div>
              </motion.div>
            </div>

            {!coords && status !== 'loading' && (
              <button
                type="button"
                onClick={requestLocation}
                className="absolute bottom-2 left-2 z-20 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm active:scale-[0.99]"
              >
                Use my location
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default LocationMapSection;
