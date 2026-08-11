import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Contact,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Mic,
  Navigation,
  PackageCheck,
  Phone,
  Plus,
  User,
  X,
} from 'lucide-react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { userAuthService } from '../../services/authService';
import api from '../../../../shared/api/axiosInstance';
import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import deliveryIcon from '../../../../assets/icons/Delivery.png';

const Motion = motion;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const PARCEL_BOOKING_DRAFT_KEY = 'parcelBookingDraft';
const DELIVERY_CATEGORY_SEARCH_TOKENS = {
  trucks: ['truck', 'lcv', 'hcv', 'mcv', 'loader'],
  '2wheeler': ['bike', 'scooter', 'cycle', '2-wheeler'],
  movers: ['mover', 'packers'],
};
const LOCATION_COORDS = {
  'Pipaliyahana, Indore': [75.9048, 22.7039],
  'Vijay Nagar': [75.8937, 22.7533],
  'Vijay Nagar Square': [75.8947, 22.7518],
  Rajwada: [75.8553, 22.7187],
  Bhawarkua: [75.8586, 22.6926],
  'MG Road': [75.8721, 22.7196],
  'Palasia Square': [75.8863, 22.7242],
  'LIG Colony': [75.8904, 22.7322],
  'Scheme No 54': [75.8978, 22.7567],
  'AB Road': [75.8878, 22.7423],
  'Geeta Bhawan': [75.8834, 22.7208],
  'Sapna Sangeeta': [75.8587, 22.6984],
  'Mahalaxmi Nagar': [75.9114, 22.7676],
};
const POPULAR_LOCATIONS = Object.keys(LOCATION_COORDS);
const DEFAULT_COORDS = { lat: 22.7196, lng: 75.8577 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const getCoords = (title, fallback = [75.8577, 22.7196]) => LOCATION_COORDS[title] || fallback;

const readStoredUserInfo = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const readParcelBookingDraft = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.sessionStorage.getItem(PARCEL_BOOKING_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
};

const coordPairToLatLng = (coords, fallback = DEFAULT_COORDS) => {
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return fallback;
};

const latLngToCoordPair = (position) => [Number(position.lng), Number(position.lat)];

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (fromCoords, toCoords) => {
  const from = coordPairToLatLng(fromCoords, null);
  const to = coordPairToLatLng(toCoords, null);

  if (!from || !to) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getNearbyPopularLocations = (anchorCoords, excludedLocations = [], limit = 4) => {
  if (!Array.isArray(anchorCoords) || anchorCoords.length < 2) {
    return POPULAR_LOCATIONS.slice(0, limit);
  }

  const excluded = new Set(
    excludedLocations
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  );

  return Object.entries(LOCATION_COORDS)
    .filter(([name]) => !excluded.has(name.toLowerCase()))
    .map(([name, coords]) => ({
      name,
      distanceKm: calculateDistanceKm(anchorCoords, coords),
    }))
    .filter((item) => item.distanceKm <= 100)
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, limit)
    .map((item) => item.name);
};

const fetchDynamicNearbySuggestions = (coords) => {
  return new Promise((resolve) => {
    if (!coords || !Array.isArray(coords) || coords.length < 2 || !window.google?.maps?.places?.PlacesService) {
      resolve([]);
      return;
    }
    try {
      const dummy = document.createElement('div');
      const service = new window.google.maps.places.PlacesService(dummy);
      service.nearbySearch(
        {
          location: { lat: coords[1], lng: coords[0] }, // [lng, lat] to {lat, lng}
          radius: 15000, // 15km
        },
        (results, status) => {
          if (status === 'OK' && Array.isArray(results)) {
            const places = results
              .filter((r) => r.name && r.geometry?.location)
              .map((r) => ({
                name: r.name,
                coords: [r.geometry.location.lng(), r.geometry.location.lat()],
              }))
              .filter((place, idx, self) => self.findIndex((p) => p.name === place.name) === idx) // unique
              .slice(0, 5);
            resolve(places);
          } else {
            resolve([]);
          }
        }
      );
    } catch (e) {
      console.warn('Nearby search failed:', e);
      resolve([]);
    }
  });
};

const fetchDynamicPopularSuggestions = (coords) => {
  return new Promise((resolve) => {
    if (!coords || !Array.isArray(coords) || coords.length < 2 || !window.google?.maps?.places?.PlacesService) {
      resolve([]);
      return;
    }
    try {
      const dummy = document.createElement('div');
      const service = new window.google.maps.places.PlacesService(dummy);
      service.nearbySearch(
        {
          location: { lat: coords[1], lng: coords[0] },
          radius: 25000, // 25km radius for popular landmarks
          type: 'tourist_attraction',
        },
        (results, status) => {
          if (status === 'OK' && Array.isArray(results)) {
            const places = results
              .filter((r) => r.name && r.geometry?.location)
              .map((r) => ({
                name: r.name,
                coords: [r.geometry.location.lng(), r.geometry.location.lat()],
              }))
              .filter((place, idx, self) => self.findIndex((p) => p.name === place.name) === idx) // unique
              .slice(0, 4);
            resolve(places);
          } else {
            resolve([]);
          }
        }
      );
    } catch (e) {
      console.warn('Popular search failed:', e);
      resolve([]);
    }
  });
};

const normalizeDeliveryPricing = (vehicle = {}) => {
  const basePrice = Number(vehicle?.delivery_distance_pricing?.base_price ?? 0);
  const freeDistance = Number(vehicle?.delivery_distance_pricing?.free_distance ?? 0);
  const distancePrice = Number(vehicle?.delivery_distance_pricing?.distance_price ?? 0);
  const timePrice = Number(vehicle?.delivery_distance_pricing?.time_price ?? 0);

  return {
    enabled: Boolean(
      vehicle?.delivery_distance_pricing?.enabled ||
      basePrice > 0 ||
      distancePrice > 0 ||
      timePrice > 0
    ),
    basePrice,
    freeDistance,
    distancePrice,
  };
};

const calculateVehicleFare = (vehicle, distanceKm) => {
  const pricing = normalizeDeliveryPricing(vehicle);
  if (!pricing.enabled) {
    return null;
  }

  const extraDistanceKm = Math.max(Number(distanceKm || 0) - pricing.freeDistance, 0);
  const total = pricing.basePrice + extraDistanceKm * pricing.distancePrice;
  return Math.max(0, Math.round(total));
};

const formatCoordLabel = (coords) => {
  const position = coordPairToLatLng(coords);
  return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
};

const formatLatLngLabel = (position) => `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
const COORDINATE_LABEL_REGEX = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const isCoordinateLabel = (value = '') => COORDINATE_LABEL_REGEX.test(String(value || '').trim());
const getVehicleId = (vehicle) => String(vehicle?._id || vehicle?.id || '').trim();
const isDeliveryVehicle = (vehicle) => vehicle?.active && ['delivery', 'both'].includes(String(vehicle?.transport_type || '').trim().toLowerCase());
const matchesDeliveryCategory = (vehicle, categoryId) => {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  if (!normalizedCategoryId) return false;

  const vehicleName = String(vehicle?.name || '').toLowerCase();
  const iconType = String(vehicle?.icon_types || '').toLowerCase();
  const isTwoWheeler = vehicleName.includes('bike') || vehicleName.includes('scooter') || iconType.includes('bike') || iconType.includes('2wheel') || iconType.includes('scooter');

  if ((normalizedCategoryId === 'movers' || normalizedCategoryId === 'trucks') && isTwoWheeler) {
    return false;
  }

  const configuredCategory = String(vehicle?.delivery_category || '').trim().toLowerCase();
  if (configuredCategory) {
    return configuredCategory === normalizedCategoryId;
  }

  const searchTokens = DELIVERY_CATEGORY_SEARCH_TOKENS[normalizedCategoryId] || [];
  return searchTokens.some((token) => vehicleName.includes(token) || iconType.includes(token));
};

const PhoneInput = ({ label, value, onChange, error, name, onClearError, disabled = false }) => (
  <div className="space-y-2">
    <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    <div
      className={`flex items-center gap-3 rounded-[18px] border p-4 transition-all ${
        error
          ? 'border-red-200 bg-red-50'
          : value && PHONE_REGEX.test(value)
            ? 'border-emerald-100 bg-emerald-50'
            : 'border-slate-200 bg-slate-50/80'
      }`}
    >
      <Phone
        size={18}
        className={
          error ? 'text-red-500' : value && PHONE_REGEX.test(value) ? 'text-emerald-500' : 'text-slate-400'
        }
      />
      <input
        type="tel"
        maxLength={10}
        disabled={disabled}
        className="flex-1 bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:text-slate-300"
        value={value}
        placeholder="10-digit mobile number"
        onChange={(event) => {
          const nextValue = event.target.value.replace(/\D/g, '');
          onChange(nextValue);
          if (onClearError) onClearError(name, nextValue);
        }}
      />
      {value && PHONE_REGEX.test(value) ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : null}
    </div>
    {error ? (
      <p className="ml-2 flex items-center gap-1 text-[11px] font-black text-red-500">
        <AlertCircle size={11} strokeWidth={3} />
        {error}
      </p>
    ) : null}
  </div>
);

const MapPickerSheet = ({ open, title, confirmLabel, value, initialCoords, mapNearbyDrivers = [], onClose, onConfirm }) => {
  const { isLoaded, loadError } = useAppGoogleMapsLoader();
  const [center, setCenter] = useState(coordPairToLatLng(initialCoords));
  const [selectedAddress, setSelectedAddress] = useState(value || formatCoordLabel(initialCoords));
  const [addressInput, setAddressInput] = useState(value || formatCoordLabel(initialCoords));
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const mapRef = useRef(null);
  const draggingRef = useRef(false);
  const geocodeTimerRef = useRef(null);
  const addressSearchTimerRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const isAddressEditingRef = useRef(false);

  const getAutocompleteService = () => {
    if (!window.google?.maps?.places?.AutocompleteService) {
      return null;
    }

    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }

    return autocompleteServiceRef.current;
  };

  const panMapToCoords = (nextCenter) => {
    setCenter(nextCenter);
    if (mapRef.current) {
      mapRef.current.panTo(nextCenter);
      mapRef.current.setZoom(16);
    }
  };

  const resolveAddressToMap = (addressText, placeId = '') => {
    if (!window.google?.maps?.Geocoder) {
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    const request = placeId ? { placeId } : { address: String(addressText || '').trim() };

    geocoder.geocode(request, (results, status) => {
      if (status !== 'OK' || !results?.[0]?.geometry?.location) {
        return;
      }

      const location = results[0].geometry.location;
      const formattedAddress = results[0].formatted_address || addressText;
      isAddressEditingRef.current = false;
      setSelectedAddress(formattedAddress);
      setAddressInput(formattedAddress);
      setShowAddressSuggestions(false);
      panMapToCoords({
        lat: location.lat(),
        lng: location.lng(),
      });
    });
  };

  useEffect(() => {
    if (!open) return undefined;

    const resetTimer = setTimeout(() => {
      const nextAddress = value || formatCoordLabel(initialCoords);
      isAddressEditingRef.current = false;
      setCenter(coordPairToLatLng(initialCoords));
      setSelectedAddress(nextAddress);
      setAddressInput(nextAddress);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    }, 0);

    return () => clearTimeout(resetTimer);
  }, [initialCoords, open, value]);

  useEffect(() => {
    if (!open || !isLoaded || !window.google?.maps?.Geocoder || isAddressEditingRef.current) {
      return undefined;
    }

    clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(() => {
      setIsResolvingAddress(true);
      const geocoder = new window.google.maps.Geocoder();

      geocoder.geocode({ location: center }, (results, status) => {
        setIsResolvingAddress(false);

        if (status === 'OK' && results?.[0]?.formatted_address) {
          setSelectedAddress(results[0].formatted_address);
          setAddressInput(results[0].formatted_address);
          return;
        }

        const fallbackLabel = formatLatLngLabel(center);
        setSelectedAddress(fallbackLabel);
        setAddressInput(fallbackLabel);
      });
    }, 450);

    return () => clearTimeout(geocodeTimerRef.current);
  }, [center, isLoaded, open]);

  useEffect(() => () => clearTimeout(addressSearchTimerRef.current), []);

  const handleAddressInputChange = (event) => {
    const nextValue = event.target.value;
    isAddressEditingRef.current = true;
    setAddressInput(nextValue);
    setSelectedAddress(nextValue);
    setShowAddressSuggestions(true);

    clearTimeout(addressSearchTimerRef.current);

    if (nextValue.trim().length < 3 || !HAS_VALID_GOOGLE_MAPS_KEY || !isLoaded) {
      setAddressSuggestions([]);
      setIsSearchingAddress(false);
      return;
    }

    addressSearchTimerRef.current = setTimeout(() => {
      const autocompleteService = getAutocompleteService();
      if (!autocompleteService) {
        return;
      }

      setIsSearchingAddress(true);
      autocompleteService.getPlacePredictions(
        {
          input: nextValue.trim(),
          componentRestrictions: { country: 'in' },
        },
        (predictions, status) => {
          setIsSearchingAddress(false);
          const nextSuggestions = status === 'OK'
            ? predictions.slice(0, 5).map((prediction) => ({
              title: prediction.structured_formatting?.main_text || prediction.description,
              address: prediction.description,
              placeId: prediction.place_id,
            }))
            : [];

          setAddressSuggestions(nextSuggestions);
        },
      );
    }, 300);
  };

  const handleAddressSuggestionSelect = (suggestion) => {
    resolveAddressToMap(suggestion.address, suggestion.placeId);
  };

  const handleAddressInputKeyDown = (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    setShowAddressSuggestions(false);
    resolveAddressToMap(addressInput);
  };

  const commitMapCenter = () => {
    if (!mapRef.current) return;
    const mapCenter = mapRef.current.getCenter();
    if (!mapCenter) return;

    setCenter({
      lat: mapCenter.lat(),
      lng: mapCenter.lng(),
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSelectedAddress('Location access is not available on this device.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        isAddressEditingRef.current = false;
        setIsLocating(false);
        setCenter(next);
        if (mapRef.current) {
          mapRef.current.panTo(next);
          mapRef.current.setZoom(16);
        }
      },
      () => {
        setIsLocating(false);
        setSelectedAddress('Could not fetch your current location.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
        <Motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute inset-x-0 bottom-0 top-[10%] mx-auto flex max-w-lg flex-col overflow-hidden rounded-t-[34px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Map Picker</p>
              <h3 className="text-lg font-black tracking-tight text-slate-900">{title}</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
              <X size={18} />
            </button>
          </div>

          <div className="relative flex-1 bg-slate-100">
            {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={center}
                zoom={16}
                onLoad={(map) => {
                  mapRef.current = map;
                }}
                onUnmount={() => {
                  mapRef.current = null;
                }}
                onDragStart={() => {
                  draggingRef.current = true;
                  isAddressEditingRef.current = false;
                }}
                onDragEnd={() => {
                  draggingRef.current = false;
                  commitMapCenter();
                }}
                onIdle={() => {
                  if (!mapRef.current || draggingRef.current) return;
                  commitMapCenter();
                }}
                onClick={(e) => {
                  if (e?.latLng) {
                    const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                    isAddressEditingRef.current = false;
                    setCenter(next);
                    if (mapRef.current) mapRef.current.panTo(next);
                  }
                }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: false,
                  clickableIcons: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                  gestureHandling: 'greedy',
                }}
              >
                {mapNearbyDrivers.map((driver, index) => {
                  const coordsPair = driver?.location?.coordinates;
                  if (!Array.isArray(coordsPair) || coordsPair.length < 2) return null;
                  const pos = { lat: Number(coordsPair[1]), lng: Number(coordsPair[0]) };
                  const iconType = String(driver?.vehicleIconType || driver?.vehicleType || '').toLowerCase();
                  const iconAsset = iconType.includes('bike') ? bikeIcon : iconType.includes('auto') ? autoIcon : iconType.includes('truck') ? deliveryIcon : carIcon;
                  return (
                    <MarkerF
                      key={driver.id || driver._id || index}
                      position={pos}
                      title={driver.name || 'Available Driver'}
                      icon={{
                        url: iconAsset,
                        scaledSize: new window.google.maps.Size(32, 32),
                      }}
                    />
                  );
                })}
              </GoogleMap>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-500">
                {loadError ? 'Map could not be loaded right now.' : 'Loading map...'}
              </div>
            )}

            {/* Map Controls: Zoom In, Zoom Out, Use Current Location */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2.5 z-30">
              <button
                type="button"
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.setZoom((mapRef.current.getZoom() || 16) + 1);
                  }
                }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white text-lg font-black text-slate-800 shadow-xl active:scale-90 transition-transform"
                aria-label="Zoom in map"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.setZoom((mapRef.current.getZoom() || 16) - 1);
                  }
                }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white text-lg font-black text-slate-800 shadow-xl active:scale-90 transition-transform"
                aria-label="Zoom out map"
              >
                -
              </button>
              <button
                type="button"
                onClick={useCurrentLocation}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-800 shadow-xl active:scale-90 transition-transform"
                aria-label="My location"
              >
                {isLocating ? <LoaderCircle size={20} className="animate-spin text-blue-500" /> : <Navigation size={20} className="text-slate-900" />}
              </button>
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-4">
              <div className="pointer-events-auto rounded-[22px] border border-white bg-white/92 px-4 py-4 shadow-xl backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {isResolvingAddress ? 'Resolving address...' : 'Selected location'}
                </p>
                <input
                  type="text"
                  value={addressInput}
                  onChange={handleAddressInputChange}
                  onKeyDown={handleAddressInputKeyDown}
                  onFocus={() => setShowAddressSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => setShowAddressSuggestions(false), 180);
                  }}
                  placeholder="Search or edit address"
                  className="mt-1 w-full bg-transparent text-[13px] font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                />
                {showAddressSuggestions && (isSearchingAddress || addressSuggestions.length > 0) ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg">
                    {isSearchingAddress ? (
                      <p className="px-3 py-2 text-[12px] font-semibold text-slate-400">Searching...</p>
                    ) : (
                      addressSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.placeId || suggestion.address}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleAddressSuggestionSelect(suggestion)}
                          className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left last:border-none hover:bg-slate-50"
                        >
                          <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                          <span className="min-w-0">
                            <span className="block text-[12px] font-bold text-slate-800">{suggestion.title}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{suggestion.address}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-blue-600 shadow-xl">
                <MapPin size={18} className="text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white px-5 pb-8 pt-5">
            <button
              type="button"
              onClick={() => onConfirm(latLngToCoordPair(center), addressInput.trim() || selectedAddress)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 text-sm font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
            >
              {confirmLabel}
              <ChevronRight size={16} />
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

const ContactDetailsSheet = ({
  open,
  onClose,
  onSave,
  senderName,
  setSenderName,
  senderMobile,
  setSenderMobile,
  useSelfForReceiver,
  setUseSelfForReceiver,
  receiverName,
  setReceiverName,
  receiverMobile,
  setReceiverMobile,
  errors,
  clearError,
}) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
        <Motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="absolute inset-x-0 bottom-0 mx-auto max-w-lg overflow-hidden rounded-t-[34px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Booking Details</p>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Sender & receiver</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
              <X size={18} />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-5 py-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <User size={16} />
                </div>
                <p className="text-sm font-black text-slate-900">Sender</p>
              </div>

              <div className="space-y-2">
                <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 ${errors.senderName ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50/80'}`}>
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={senderName}
                    placeholder="Sender name"
                    onChange={(event) => {
                      setSenderName(event.target.value);
                      clearError('senderName');
                    }}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
                {errors.senderName ? <p className="text-[11px] font-black text-red-500">{errors.senderName}</p> : null}
              </div>

              <PhoneInput label="Mobile Number" value={senderMobile} onChange={setSenderMobile} error={errors.senderMobile} name="senderMobile" onClearError={clearError} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <Contact size={16} />
                </div>
                <p className="text-sm font-black text-slate-900">Receiver</p>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-[24px] border-2 border-dashed border-slate-100 bg-slate-50/30 px-4 py-4 transition-colors hover:bg-blue-50/30 group">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={useSelfForReceiver}
                    onChange={(event) => setUseSelfForReceiver(event.target.checked)}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 bg-white checked:bg-blue-600 checked:border-blue-600 transition-all"
                  />
                  <CheckCircle2 size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-black text-slate-900 group-hover:text-blue-600 transition-colors">Same as Sender</p>
                  <p className="text-[11px] font-bold text-slate-400">Use sender's name and mobile for receiver</p>
                </div>
              </label>

              <div className="space-y-2">
                <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 ${errors.receiverName ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50/80'} ${useSelfForReceiver ? 'opacity-70' : ''}`}>
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={receiverName}
                    placeholder="Receiver name"
                    disabled={useSelfForReceiver}
                    onChange={(event) => {
                      setReceiverName(event.target.value);
                      clearError('receiverName');
                    }}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
                {errors.receiverName ? <p className="text-[11px] font-black text-red-500">{errors.receiverName}</p> : null}
              </div>

              <PhoneInput label="Mobile Number" value={receiverMobile} onChange={setReceiverMobile} error={errors.receiverMobile} name="receiverMobile" onClearError={clearError} disabled={useSelfForReceiver} />
            </div>
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onSave}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 text-sm font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
            >
              Save Details
              <ChevronRight size={16} />
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

const getItemDistanceKm = (item, pickupCoords) => {
  if (!pickupCoords || !Array.isArray(pickupCoords) || pickupCoords.length < 2) return null;

  if (typeof item === 'string') {
    const coords = LOCATION_COORDS[item];
    if (coords) {
      const dist = calculateDistanceKm(pickupCoords, coords);
      return dist > 0 ? dist.toFixed(1) : null;
    }
    return null;
  }

  if (item?.distanceKm) {
    return String(item.distanceKm);
  }

  if (item?.coords) {
    const dist = calculateDistanceKm(pickupCoords, item.coords);
    return dist > 0 ? dist.toFixed(1) : null;
  }

  const nameKey = item?.label || item?.name || item?.description || '';
  const matchedCoords = LOCATION_COORDS[nameKey] || Object.entries(LOCATION_COORDS).find(([k]) => nameKey.toLowerCase().includes(k.toLowerCase()))?.[1];
  if (matchedCoords) {
    const dist = calculateDistanceKm(pickupCoords, matchedCoords);
    return dist > 0 ? dist.toFixed(1) : null;
  }

  return null;
};

const SenderReceiverDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const { isLoaded: isGoogleMapsLoaded } = useAppGoogleMapsLoader();
  const storedParcelDraft = useMemo(() => readParcelBookingDraft(), []);
  const parcelState = useMemo(
    () => ({ ...storedParcelDraft, ...(location.state || {}) }),
    [location.state, storedParcelDraft],
  );
  const storedUser = useMemo(() => readStoredUserInfo(), []);
  const [senderName, setSenderName] = useState(() => parcelState.senderName || storedUser?.name || '');
  const [senderMobile, setSenderMobile] = useState(() => parcelState.senderMobile || storedUser?.phone || '');
  const [useSelfForReceiver, setUseSelfForReceiver] = useState(() => {
    const receiverNameSeed = String(parcelState.receiverName || '').trim();
    const receiverMobileSeed = String(parcelState.receiverMobile || '').trim();
    const userNameSeed = String(storedUser?.name || '').trim();
    const userPhoneSeed = String(storedUser?.phone || '').trim();
    return Boolean(
      receiverNameSeed &&
      receiverMobileSeed &&
      receiverNameSeed === userNameSeed &&
      receiverMobileSeed === userPhoneSeed,
    );
  });
  const [receiverName, setReceiverName] = useState(() => parcelState.receiverName || '');
  const [receiverMobile, setReceiverMobile] = useState(() => parcelState.receiverMobile || '');
  const [pickup, setPickup] = useState(() => parcelState.pickup || '');
  const [drop, setDrop] = useState(() => parcelState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => parcelState.pickupCoords || getCoords(parcelState.pickup || '', [75.8577, 22.7196]));
  const [dropCoords, setDropCoords] = useState(() => parcelState.dropCoords || (parcelState.drop ? getCoords(parcelState.drop || '') : null));
  const [activeMapPicker, setActiveMapPicker] = useState(null);
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [isLocatingPickup, setIsLocatingPickup] = useState(false);
  const [errors, setErrors] = useState({});
  const [recoveredSelectedVehicles, setRecoveredSelectedVehicles] = useState([]);
  const [googleDropSuggestions, setGoogleDropSuggestions] = useState([]);
  const [isFetchingDropSuggestions, setIsFetchingDropSuggestions] = useState(false);
  const [isDropInputFocused, setIsDropInputFocused] = useState(false);
  const autoPickupRequestedRef = useRef(false);
  const livePickupHydratedRef = useRef(false);
  const dropInputRef = useRef(null);
  const dropGeocodeTimerRef = useRef(null);
  const dropSuggestionTimerRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);

  const [googlePickupSuggestions, setGooglePickupSuggestions] = useState([]);
  const [isFetchingPickupSuggestions, setIsFetchingPickupSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState(null);
  const pickupInputRef = useRef(null);
  const pickupGeocodeTimerRef = useRef(null);
  const pickupSuggestionTimerRef = useRef(null);
  const pickupSuggestionCacheRef = useRef(new Map());
  const dropSuggestionCacheRef = useRef(new Map());

  const [dynamicNearbySuggestions, setDynamicNearbySuggestions] = useState([]);
  const [dynamicPopularSuggestions, setDynamicPopularSuggestions] = useState([]);
  const [isFetchingNearbySuggestions, setIsFetchingNearbySuggestions] = useState(false);
  const [mapNearbyDrivers, setMapNearbyDrivers] = useState([]);

  useEffect(() => {
    if (!activeMapPicker) return;
    const targetCoords = activeMapPicker === 'pickup' ? pickupCoords : dropCoords;
    const pos = coordPairToLatLng(targetCoords);
    if (!pos?.lat || !pos?.lng) return;
    let active = true;

    const fetchDrivers = async () => {
      try {
        const response = await api.get('/rides/available-drivers', {
          params: {
            lat: pos.lat,
            lng: pos.lng,
            transport_type: 'delivery',
            maxDistance: 10000,
            limit: 20,
          },
        });
        const list = response?.data?.data?.drivers || response?.data?.drivers || [];
        if (active && Array.isArray(list)) {
          setMapNearbyDrivers(list);
        }
      } catch (_e) {
        if (active) setMapNearbyDrivers([]);
      }
    };

    fetchDrivers();
    const interval = setInterval(fetchDrivers, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeMapPicker, pickupCoords, dropCoords]);

  const handleGoBack = () => {
    if (activeMapPicker) {
      setActiveMapPicker(null);
      return;
    }
    if (isContactSheetOpen) {
      setIsContactSheetOpen(false);
      return;
    }
    if (window.history.length > 1 && window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(`${routePrefix || '/taxi/user'}/parcel/type`, { replace: true });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleGoBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMapPicker, isContactSheetOpen, routePrefix]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PARCEL_BOOKING_DRAFT_KEY, JSON.stringify({
      ...parcelState,
      senderName,
      senderMobile,
      receiverName,
      receiverMobile,
      pickup,
      drop,
      pickupCoords,
      dropCoords,
    }));
  }, [drop, dropCoords, parcelState, pickup, pickupCoords, receiverMobile, receiverName, senderMobile, senderName]);

  useEffect(() => {
    if (dropInputRef.current) {
      dropInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateSenderDetails = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || response?.data?.data || {};

        if (!active || (!user?.name && !user?.phone)) return;

        const nextName = user.name || '';
        const nextPhone = user.phone || '';

        if (nextName || nextPhone) {
          window.localStorage.setItem('userInfo', JSON.stringify({ ...storedUser, ...user }));
        }

        setSenderName((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.name || '').trim() ? nextName || current : current));
        setSenderMobile((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.phone || '').trim() ? nextPhone || current : current));
      } catch {
        // ignore and keep fallback info
      }
    };

    hydrateSenderDetails();

    return () => {
      active = false;
    };
  }, [storedUser]);

  useEffect(() => {
    if (!pickupCoords || !isGoogleMapsLoaded) {
      setDynamicNearbySuggestions([]);
      setDynamicPopularSuggestions([]);
      return;
    }

    let active = true;
    setIsFetchingNearbySuggestions(true);
    Promise.all([
      fetchDynamicNearbySuggestions(pickupCoords),
      fetchDynamicPopularSuggestions(pickupCoords)
    ]).then(([nearby, popular]) => {
      if (active) {
        setDynamicNearbySuggestions(nearby);
        setDynamicPopularSuggestions(popular);
        setIsFetchingNearbySuggestions(false);
      }
    });

    return () => {
      active = false;
    };
  }, [pickupCoords, isGoogleMapsLoaded]);

  useEffect(() => {
    const routeSelectedVehicles = Array.isArray(parcelState.selectedVehicles)
      ? parcelState.selectedVehicles.filter(Boolean)
      : parcelState.selectedVehicle
        ? [parcelState.selectedVehicle].filter(Boolean)
        : [];

    if (routeSelectedVehicles.length > 0) {
      setRecoveredSelectedVehicles(routeSelectedVehicles);
      return undefined;
    }

    const selectedVehicleIds = Array.isArray(parcelState.selectedVehicleIds)
      ? parcelState.selectedVehicleIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const selectedVehicleId = String(parcelState.selectedVehicleId || '').trim();
    const selectedIdSet = new Set([...selectedVehicleIds, selectedVehicleId].filter(Boolean));
    const deliveryCategory = String(parcelState.deliveryCategory || parcelState.category || '').trim().toLowerCase();

    if (!selectedIdSet.size && !deliveryCategory) {
      setRecoveredSelectedVehicles([]);
      return undefined;
    }

    let active = true;

    const recoverSelectedVehicles = async () => {
      try {
        const response = await api.get('/users/vehicle-types');
        const items = response?.data?.results || response?.results || response?.data?.data?.results || [];
        const deliveryVehicles = Array.isArray(items) ? items.filter(isDeliveryVehicle) : [];

        let matchedVehicles = deliveryVehicles.filter((vehicle) => selectedIdSet.has(getVehicleId(vehicle)));
        if (matchedVehicles.length === 0 && deliveryCategory) {
          matchedVehicles = deliveryVehicles.filter((vehicle) => matchesDeliveryCategory(vehicle, deliveryCategory));
        }

        if (!active) return;
        setRecoveredSelectedVehicles(matchedVehicles);
      } catch {
        if (!active) return;
        setRecoveredSelectedVehicles([]);
      }
    };

    recoverSelectedVehicles();

    return () => {
      active = false;
    };
  }, [parcelState.category, parcelState.deliveryCategory, parcelState.selectedVehicle, parcelState.selectedVehicleId, parcelState.selectedVehicleIds, parcelState.selectedVehicles]);

  const pickupSuggestions = useMemo(() => {
    if (pickupCoords && Array.isArray(pickupCoords)) {
      return POPULAR_LOCATIONS.filter((item) => {
         const coords = LOCATION_COORDS[item];
         return coords && calculateDistanceKm(pickupCoords, coords) <= 100 && item.toLowerCase().includes(String(pickup || '').toLowerCase());
      }).slice(0, 4);
    }
    return POPULAR_LOCATIONS.filter((item) => item.toLowerCase().includes(String(pickup || '').toLowerCase())).slice(0, 4);
  }, [pickup, pickupCoords]);

  const dropSuggestions = useMemo(() => {
    if (pickupCoords && Array.isArray(pickupCoords)) {
      return POPULAR_LOCATIONS.filter((item) => {
         const coords = LOCATION_COORDS[item];
         return coords && calculateDistanceKm(pickupCoords, coords) <= 100 && item.toLowerCase().includes(String(drop || '').toLowerCase());
      }).slice(0, 4);
    }
    return POPULAR_LOCATIONS.filter((item) => item.toLowerCase().includes(String(drop || '').toLowerCase())).slice(0, 4);
  }, [drop, pickupCoords]);
  const nearbyDropSuggestions = useMemo(
    () => getNearbyPopularLocations(pickupCoords, [pickup, drop], 4),
    [drop, pickup, pickupCoords],
  );
  const selectedVehicles = useMemo(() => {
    if (Array.isArray(recoveredSelectedVehicles) && recoveredSelectedVehicles.length) {
      return recoveredSelectedVehicles;
    }
    return [];
  }, [recoveredSelectedVehicles]);
  const estimatedDistanceKm = useMemo(
    () => calculateDistanceKm(pickupCoords, dropCoords),
    [dropCoords, pickupCoords],
  );
  const estimatedFare = useMemo(() => {
    if (!drop.trim()) {
      return null;
    }

    const dynamicFares = selectedVehicles
      .map((vehicle) => calculateVehicleFare(vehicle, estimatedDistanceKm))
      .filter((value) => Number.isFinite(value));

    if (dynamicFares.length > 0) {
      const minFare = Math.min(...dynamicFares);
      const maxFare = Math.max(...dynamicFares);
      return {
        min: minFare,
        max: maxFare,
        approx: Math.round((minFare + maxFare) / 2),
        dynamic: true,
      };
    }

    return null;
  }, [drop, estimatedDistanceKm, selectedVehicles]);

  const validate = () => {
    const nextErrors = {};
    if (!senderName.trim()) nextErrors.senderName = 'Sender name is required';
    if (!PHONE_REGEX.test(senderMobile)) nextErrors.senderMobile = 'Enter a valid 10-digit number';
    if (!receiverName.trim()) nextErrors.receiverName = 'Receiver name is required';
    if (!PHONE_REGEX.test(receiverMobile)) nextErrors.receiverMobile = 'Enter a valid 10-digit number';
    if (!pickup.trim()) nextErrors.pickup = 'Pickup location is required';
    if (!drop.trim()) nextErrors.drop = 'Drop location is required';
    setErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      nextErrors,
    };
  };

  const clearError = (key) => {
    if (!errors[key]) return;
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const syncReceiverWithSelf = () => {
    const nextName = String(storedUser?.name || senderName || '').trim();
    const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

    setReceiverName(nextName);
    setReceiverMobile(nextPhone);
    setErrors((prev) => ({
      ...prev,
      receiverName: '',
      receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
    }));
  };

  useEffect(() => {
    if (!useSelfForReceiver) return;
    const timer = setTimeout(() => {
      const nextName = String(storedUser?.name || senderName || '').trim();
      const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

      setReceiverName(nextName);
      setReceiverMobile(nextPhone);
      setErrors((prev) => ({
        ...prev,
        receiverName: '',
        receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
      }));
    }, 0);

    return () => clearTimeout(timer);
  }, [senderMobile, senderName, storedUser, useSelfForReceiver]);

  const validatePhoneField = (key, value) => {
    const trimmedValue = String(value || '').trim();

    setErrors((prev) => {
      const nextError = trimmedValue && !PHONE_REGEX.test(trimmedValue) ? 'Enter a valid 10-digit number' : '';
      if (prev[key] === nextError) return prev;
      return { ...prev, [key]: nextError };
    });
  };

  const clearPhoneError = (key, value) => {
    validatePhoneField(key, value);
  };

  const resolveAddressFromCoords = useEffectEvent((position) =>
    new Promise((resolve) => {
      if (!isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(formatLatLngLabel(position));
        return;
      }
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          resolve(results[0].formatted_address);
          return;
        }
        resolve(formatLatLngLabel(position));
      });
    }));

  const resolveCoordsFromAddress = useEffectEvent((address) =>
    new Promise((resolve) => {
      const trimmedAddress = String(address || '').trim();

      if (!trimmedAddress || !isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: trimmedAddress }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        resolve(latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() }));
      });
    }));

  const resolveCoordsFromPlaceId = useEffectEvent((placeId) =>
    new Promise((resolve) => {
      const trimmedPlaceId = String(placeId || '').trim();

      if (!trimmedPlaceId || !isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: trimmedPlaceId }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        resolve(latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() }));
      });
    }));

  const requestCurrentPickupLocation = useEffectEvent(() => {
    if (!navigator.geolocation) {
      setErrors((prev) => ({ ...prev, pickup: 'Current location is not available' }));
      return;
    }

    setIsLocatingPickup(true);

    const onSuccess = async (position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      const coords = latLngToCoordPair(next);
      setPickupCoords(coords);
      const address = await resolveAddressFromCoords(next);
      setPickup(address || formatLatLngLabel(next));
      clearError('pickup');
      setIsLocatingPickup(false);
    };

    const onError = (err) => {
      console.warn('High accuracy geolocation failed, trying low accuracy...', err);
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        () => {
          setIsLocatingPickup(false);
          setErrors((prev) => ({ ...prev, pickup: 'Could not detect current location' }));
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });

  useEffect(() => {
    if (autoPickupRequestedRef.current) return;
    autoPickupRequestedRef.current = true;
    livePickupHydratedRef.current = true;
    const timer = setTimeout(() => {
      requestCurrentPickupLocation();
    }, 0);

    return () => clearTimeout(timer);
  }, [requestCurrentPickupLocation]);

  useEffect(() => {
    if (!pickupCoords || !pickup || !isCoordinateLabel(pickup) || !isGoogleMapsLoaded) {
      return;
    }

    let active = true;

    resolveAddressFromCoords(coordPairToLatLng(pickupCoords)).then((resolvedAddress) => {
      if (!active || !resolvedAddress || isCoordinateLabel(resolvedAddress)) {
        return;
      }

      setPickup((current) => (isCoordinateLabel(current) ? resolvedAddress : current));
    });

    return () => {
      active = false;
    };
  }, [isGoogleMapsLoaded, pickup, pickupCoords]);

  useEffect(() => {
    const trimmedDrop = String(drop || '').trim();

    clearTimeout(dropGeocodeTimerRef.current);
    clearTimeout(dropSuggestionTimerRef.current);

    if (!trimmedDrop) {
      setDropCoords(null);
      setGoogleDropSuggestions([]);
      setIsFetchingDropSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    const presetCoords = LOCATION_COORDS[trimmedDrop];
    if (presetCoords) {
      setDropCoords((current) =>
        Array.isArray(current) && current[0] === presetCoords[0] && current[1] === presetCoords[1] ? current : presetCoords,
      );
      setGoogleDropSuggestions([]);
      setIsFetchingDropSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (!isGoogleMapsLoaded || isCoordinateLabel(trimmedDrop)) {
      setGoogleDropSuggestions([]);
      setIsFetchingDropSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (trimmedDrop.length < 3 || !window.google?.maps?.places?.AutocompleteService) {
      setGoogleDropSuggestions([]);
      setIsFetchingDropSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    const cacheKey = `${trimmedDrop.toLowerCase()}|${Array.isArray(pickupCoords) ? pickupCoords.join(',') : ''}`;
    const cachedSuggestions = dropSuggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setGoogleDropSuggestions(cachedSuggestions);
      setIsFetchingDropSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    let active = true;
    dropSuggestionTimerRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (!autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }

      setIsFetchingDropSuggestions(true);
      const request = {
        input: trimmedDrop,
        componentRestrictions: { country: 'in' },
        sessionToken: autocompleteSessionTokenRef.current || undefined,
      };

      if (Array.isArray(pickupCoords) && window.google?.maps?.Circle) {
        request.locationBias = new window.google.maps.Circle({
          center: coordPairToLatLng(pickupCoords),
          radius: 12000,
        });
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (!active) {
          return;
        }

        const normalizedSuggestions =
          status === 'OK'
            ? predictions.slice(0, 4).map((prediction) => ({
                id: prediction.place_id || prediction.description,
                label: prediction.structured_formatting?.main_text || prediction.description,
                secondaryText: prediction.structured_formatting?.secondary_text || '',
                description: prediction.description || '',
                placeId: prediction.place_id || '',
                source: 'google',
              }))
            : [];

        dropSuggestionCacheRef.current.set(cacheKey, normalizedSuggestions);
        setGoogleDropSuggestions(normalizedSuggestions);
        setIsFetchingDropSuggestions(false);

        // Fetch distances asynchronously for map results
        if (normalizedSuggestions.length > 0 && Array.isArray(pickupCoords) && window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          normalizedSuggestions.forEach(async (suggestion) => {
             if (!suggestion.placeId) return;
             try {
                const results = await new Promise(r => geocoder.geocode({ placeId: suggestion.placeId }, (res, stat) => r(stat === 'OK' ? res : null)));
                if (results?.[0]?.geometry?.location && active) {
                   const loc = results[0].geometry.location;
                   const coords = [loc.lng(), loc.lat()];
                   const dist = calculateDistanceKm(pickupCoords, coords);
                   if (dist > 0) {
                      setGoogleDropSuggestions(prev => {
                          const next = [...prev];
                          const itemIdx = next.findIndex(item => item.placeId === suggestion.placeId);
                          if (itemIdx >= 0) {
                              next[itemIdx] = { ...next[itemIdx], distanceKm: dist.toFixed(1) };
                          }
                          return next;
                      });
                   }
                }
             } catch(e) {}
          });
        }
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(dropGeocodeTimerRef.current);
      clearTimeout(dropSuggestionTimerRef.current);
    };
  }, [drop, isGoogleMapsLoaded, pickupCoords]);

  useEffect(() => {
    const trimmedPickup = String(pickup || '').trim();

    clearTimeout(pickupGeocodeTimerRef.current);
    clearTimeout(pickupSuggestionTimerRef.current);

    if (!trimmedPickup) {
      setPickupCoords(null);
      setGooglePickupSuggestions([]);
      setIsFetchingPickupSuggestions(false);
      return () => clearTimeout(pickupGeocodeTimerRef.current);
    }

    const presetCoords = LOCATION_COORDS[trimmedPickup];
    if (presetCoords) {
      setPickupCoords((current) =>
        Array.isArray(current) && current[0] === presetCoords[0] && current[1] === presetCoords[1] ? current : presetCoords,
      );
      setGooglePickupSuggestions([]);
      setIsFetchingPickupSuggestions(false);
      return () => clearTimeout(pickupGeocodeTimerRef.current);
    }

    if (!isGoogleMapsLoaded || isCoordinateLabel(trimmedPickup)) {
      setGooglePickupSuggestions([]);
      setIsFetchingPickupSuggestions(false);
      return () => clearTimeout(pickupGeocodeTimerRef.current);
    }

    if (trimmedPickup.length < 3 || !window.google?.maps?.places?.AutocompleteService) {
      setGooglePickupSuggestions([]);
      setIsFetchingPickupSuggestions(false);
      return () => clearTimeout(pickupGeocodeTimerRef.current);
    }

    const cacheKey = `${trimmedPickup.toLowerCase()}`;
    const cachedSuggestions = pickupSuggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setGooglePickupSuggestions(cachedSuggestions);
      setIsFetchingPickupSuggestions(false);
      return () => clearTimeout(pickupGeocodeTimerRef.current);
    }

    let active = true;
    pickupSuggestionTimerRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (!autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }

      setIsFetchingPickupSuggestions(true);
      const request = {
        input: trimmedPickup,
        componentRestrictions: { country: 'in' },
        sessionToken: autocompleteSessionTokenRef.current || undefined,
      };

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (!active) {
          return;
        }

        const normalizedSuggestions =
          status === 'OK'
            ? predictions.slice(0, 4).map((prediction) => ({
                id: prediction.place_id || prediction.description,
                label: prediction.structured_formatting?.main_text || prediction.description,
                secondaryText: prediction.structured_formatting?.secondary_text || '',
                description: prediction.description || '',
                placeId: prediction.place_id || '',
                source: 'google',
              }))
            : [];

        pickupSuggestionCacheRef.current.set(cacheKey, normalizedSuggestions);
        setGooglePickupSuggestions(normalizedSuggestions);
        setIsFetchingPickupSuggestions(false);
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(pickupGeocodeTimerRef.current);
      clearTimeout(pickupSuggestionTimerRef.current);
    };
  }, [pickup, isGoogleMapsLoaded]);

  const applySuggestion = async (type, suggestion) => {
    const value = typeof suggestion === 'string' ? suggestion : suggestion?.description || suggestion?.label || suggestion?.name || '';

    if (type === 'pickup') {
      setPickup(value);
      if (typeof suggestion === 'string') {
        setPickupCoords(getCoords(value));
      } else if (suggestion?.coords) {
        setPickupCoords(suggestion.coords);
      } else if (suggestion?.placeId) {
        const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
        setPickupCoords(resolvedCoords);
        if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
          autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      }
      setGooglePickupSuggestions([]);
      clearError('pickup');
      return;
    }

    setDrop(value);
    if (typeof suggestion === 'string') {
      setDropCoords(getCoords(value));
    } else if (suggestion?.coords) {
      setDropCoords(suggestion.coords);
    } else if (suggestion?.placeId) {
      const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
      setDropCoords(resolvedCoords);
      if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
    }
    setGoogleDropSuggestions([]);
    clearError('drop');
  };

  const handleProceed = async ({ fromContactSheet = false } = {}) => {
    const { isValid, nextErrors } = validate();

    if (!isValid) {
      if (nextErrors.senderName || nextErrors.senderMobile || nextErrors.receiverName || nextErrors.receiverMobile) {
        setIsContactSheetOpen(true);
        return;
      }

      if (fromContactSheet) {
        setIsContactSheetOpen(false);
      }
      return;
    }

    let resolvedPickupCoords = pickupCoords;
    let resolvedDropCoords = dropCoords;

    if (!resolvedPickupCoords && pickup.trim()) {
      resolvedPickupCoords = LOCATION_COORDS[pickup.trim()] || (await resolveCoordsFromAddress(pickup));
      if (resolvedPickupCoords) {
        setPickupCoords(resolvedPickupCoords);
      }
    }

    if (!resolvedDropCoords && drop.trim()) {
      resolvedDropCoords = LOCATION_COORDS[drop.trim()] || (await resolveCoordsFromAddress(drop));
      if (resolvedDropCoords) {
        setDropCoords(resolvedDropCoords);
      }
    }

    setIsContactSheetOpen(false);
    const categoryId = String(parcelState.deliveryCategory || parcelState.category || parcelState.parcel?.deliveryCategory || parcelState.parcel?.category || '').toLowerCase();
    const resolvedGoodsTypeFor = parcelState.goodsTypeFor || parcelState.parcel?.goodsTypeFor || (categoryId.includes('mover') || categoryId.includes('packers') ? 'mover' : categoryId.includes('truck') ? 'truck' : '');

    navigate(`${routePrefix}/parcel/searching`, {
      state: {
        ...parcelState,
        vehicleIconUrl: parcelState.vehicleIconUrl || parcelState.selectedVehicle?.map_icon || parcelState.selectedVehicle?.icon || parcelState.selectedVehicle?.image || parcelState.selectedVehicle?.vehicleIconUrl || '',
        vehicleIconType: parcelState.vehicleIconType || parcelState.selectedVehicle?.icon_types || parcelState.selectedVehicle?.iconType || (categoryId.includes('mover') || categoryId.includes('truck') ? 'truck' : ''),
        pickup,
        drop,
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
        paymentMethod: 'Cash',
        fare: estimatedFare?.approx ?? estimatedFare?.min ?? null,
        estimatedFare,
        estimatedDistanceKm,
        deliveryCategory: parcelState.deliveryCategory || parcelState.category || categoryId || '',
        goodsTypeFor: resolvedGoodsTypeFor,
        deliveryScope: parcelState.deliveryScope || 'city',
        isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
        parcel: {
          category: parcelState.parcelType || parcelState.category || 'Parcel',
          weight: parcelState.weight || 'Under 5kg',
          description: parcelState.description || '',
          deliveryCategory: parcelState.deliveryCategory || parcelState.category || categoryId || '',
          goodsTypeFor: resolvedGoodsTypeFor,
          deliveryScope: parcelState.deliveryScope || 'city',
          isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
          senderName,
          senderMobile,
          receiverName,
          receiverMobile,
        },
        isParcel: true,
        searchNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
  };

  return (
    <div 
      onClick={(e) => {
        // Dismiss keyboard if user clicks outside inputs or buttons
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !e.target.closest('button') && !e.target.closest('input')) {
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
          setActiveSearchField(null);
        }
      }}
      className="relative mx-auto flex min-h-screen max-w-lg flex-col overflow-x-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f7f9fc_100%)] font-sans"
    >
      <MapPickerSheet
        open={activeMapPicker === 'pickup'}
        title="Set Pickup Location"
        value={pickup}
        initialCoords={pickupCoords}
        mapNearbyDrivers={mapNearbyDrivers}
        confirmLabel="Confirm Pickup"
        onClose={() => setActiveMapPicker(null)}
        onConfirm={(coords, address) => {
          setPickupCoords(coords);
          setPickup(address || formatCoordLabel(coords));
          clearError('pickup');
          setActiveMapPicker(null);
        }}
      />
      <MapPickerSheet
        open={activeMapPicker === 'drop'}
        title="Set Delivery Location"
        value={drop}
        initialCoords={dropCoords}
        mapNearbyDrivers={mapNearbyDrivers}
        confirmLabel="Confirm Drop"
        onClose={() => setActiveMapPicker(null)}
        onConfirm={(coords, address) => {
          setDropCoords(coords);
          setDrop(address || formatCoordLabel(coords));
          clearError('drop');
          setActiveMapPicker(null);
        }}
      />
      <ContactDetailsSheet
        open={isContactSheetOpen}
        onClose={() => setIsContactSheetOpen(false)}
        onSave={() => handleProceed({ fromContactSheet: true })}
        senderName={senderName}
        setSenderName={setSenderName}
        senderMobile={senderMobile}
        setSenderMobile={setSenderMobile}
        useSelfForReceiver={useSelfForReceiver}
        setUseSelfForReceiver={(checked) => {
          setUseSelfForReceiver(checked);
          if (!checked) {
            return;
          }
          syncReceiverWithSelf();
        }}
        receiverName={receiverName}
        setReceiverName={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverName(value);
        }}
        receiverMobile={receiverMobile}
        setReceiverMobile={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverMobile(value);
        }}
        errors={errors}
        clearError={(key, value) => {
          if (key === 'senderMobile' || key === 'receiverMobile') {
            clearPhoneError(key, value);
            return;
          }
          clearError(key);
        }}
      />

      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-slate-100 shadow-xs">
        <button 
          type="button"
          onClick={handleGoBack} 
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-800 hover:bg-slate-100/80 active:scale-95 transition-all bg-white border border-slate-200/80 shadow-xs cursor-pointer"
        >
          <ArrowLeft size={18} className="text-slate-800" />
          <span className="text-xs font-bold text-slate-800">Go Back</span>
        </button>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Select Locations</p>
      </header>

      <main className="flex-1 px-4 pt-2 pb-28 z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] bg-white p-3.5 sm:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-slate-100 relative"
        >
          {/* Route dots & line on the left */}
          <div className="absolute left-5 top-7 flex flex-col items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="w-0.5 h-16 border-l-2 border-dashed border-slate-100" />
            <div className="w-2 h-2 rounded-full bg-rose-500" />
          </div>

          <div className="pl-6 space-y-3">
            {/* Sender Card */}
            <div className="bg-slate-50/80 rounded-xl p-3 flex items-center justify-between gap-2.5 border border-slate-100/50">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500">Pickup</p>
                <div className="flex items-center gap-1.5">
                   <p className="text-[13px] font-black text-slate-900 truncate">{senderName || 'Sender Details'}</p>
                   {senderMobile && (
                     <>
                        <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <p className="text-[11px] font-bold text-slate-500 shrink-0">{senderMobile}</p>
                      </>
                   )}
                </div>
                <input 
                  ref={pickupInputRef}
                  type="text" 
                  placeholder="Enter Pickup Location"
                  value={pickup}
                  onChange={(e) => {
                    setPickup(e.target.value);
                    clearError('pickup');
                  }}
                  onFocus={() => setActiveSearchField('pickup')}
                  onBlur={async () => {
                    const trimmed = pickup.trim();
                    if (trimmed) {
                      const coords = await resolveCoordsFromAddress(trimmed);
                      if (coords) {
                        setPickupCoords(coords);
                      }
                    }
                  }}
                  className={`w-full mt-1.5 bg-transparent border-b pb-1 text-[13px] font-bold text-slate-800 placeholder:text-slate-350 outline-none transition-all ${
                    errors.pickup ? 'border-red-500 text-red-500' : 'border-slate-200 focus:border-emerald-500'
                  }`}
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={requestCurrentPickupLocation}
                  disabled={isLocatingPickup}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-white text-emerald-600 shadow-xs active:scale-95 transition-all"
                  aria-label="Use current location for pickup"
                  title="Detect current location"
                >
                  {isLocatingPickup ? (
                    <LoaderCircle size={16} className="animate-spin text-emerald-600" />
                  ) : (
                    <LocateFixed size={16} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsContactSheetOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 shadow-xs"
                  aria-label="Open sender details"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Drop Input Area */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                 <input 
                    ref={dropInputRef}
                    type="text" 
                    placeholder="Where is your Drop ?"
                    value={drop}
                    onChange={(e) => {
                      setDrop(e.target.value);
                      clearError('drop');
                    }}
                    onFocus={() => setActiveSearchField('drop')}
                    onBlur={async () => {
                      const trimmed = drop.trim();
                      if (trimmed) {
                        const coords = await resolveCoordsFromAddress(trimmed);
                        if (coords) {
                          setDropCoords(coords);
                        }
                      }
                    }}
                    className={`w-full h-14 bg-white border-2 rounded-2xl pl-5 pr-12 text-[15px] font-bold text-slate-900 placeholder:text-slate-300 outline-none transition-all ${
                      errors.drop ? 'border-red-500 bg-red-50' : 'border-blue-600 focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]'
                    }`}
                  />
                 <Mic size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
              </div>
              <button className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shrink-0">
                 <Plus size={24} />
              </button>
            </div>
          </div>
        </motion.div>

        <button 
          onClick={() => setActiveMapPicker('drop')} 
          className="mt-6 mx-auto flex items-center gap-2 text-blue-600 font-black text-[13px] uppercase tracking-widest hover:bg-blue-50/50 px-4 py-2 rounded-full transition-colors"
        >
           <MapPin size={18} fill="currentColor" className="text-blue-600/20" />
           Select on map
        </button>

        {/* Clean Suggestions List with Distance Badges */}
        <div className="mt-6 space-y-4 px-1">
          {/* Pickup Suggestions */}
          {activeSearchField === 'pickup' && (
            <>
              {googlePickupSuggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Pickup Search Results</p>
                  <div className="space-y-2">
                    {googlePickupSuggestions.map((item) => {
                      const distKm = item.distanceKm || getItemDistanceKm(item, pickupCoords);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            applySuggestion('pickup', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-emerald-200 transition-all"
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <Navigation size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-black text-slate-800">{item.label}</p>
                              {item.secondaryText ? (
                                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{item.secondaryText}</p>
                              ) : null}
                            </div>
                          </div>
                          {distKm ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-black shrink-0">
                              {distKm} km
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!pickup && pickupSuggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Popular Pickup Locations</p>
                  <div className="space-y-2">
                    {pickupSuggestions.map((item) => {
                      const coords = LOCATION_COORDS[item];
                      const distKm = coords && pickupCoords ? calculateDistanceKm(pickupCoords, coords).toFixed(1) : null;
                      return (
                        <button
                          key={item}
                          onClick={() => {
                            applySuggestion('pickup', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-emerald-200 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <MapPin size={15} className="shrink-0 text-emerald-500" />
                            <span className="truncate text-[13px] font-bold text-slate-700">{item}</span>
                          </div>
                          {distKm ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-black shrink-0">
                              {distKm} km
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {Boolean(pickup) && isFetchingPickupSuggestions && (
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-xs">
                  Finding nearby pickup suggestions...
                </div>
              )}
            </>
          )}

          {/* Drop Suggestions */}
          {(activeSearchField === 'drop' || !activeSearchField) && (
            <>
              {googleDropSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Search Results</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Distance from Pickup</p>
                  </div>
                  <div className="space-y-2">
                    {googleDropSuggestions.map((item) => {
                      const distKm = item.distanceKm || getItemDistanceKm(item, pickupCoords);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            applySuggestion('drop', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-blue-200 transition-all"
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <Navigation size={15} className="mt-0.5 shrink-0 text-blue-500" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-black text-slate-800">{item.label}</p>
                              {item.secondaryText ? (
                                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{item.secondaryText}</p>
                              ) : null}
                            </div>
                          </div>
                          {distKm ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-black shrink-0">
                              {distKm} km
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!drop && (dynamicNearbySuggestions.length > 0 || nearbyDropSuggestions.length > 0) ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Near Current Pickup</p>
                  <div className="space-y-2">
                    {(dynamicNearbySuggestions.length > 0 ? dynamicNearbySuggestions : nearbyDropSuggestions).map((item) => {
                      const distKm = getItemDistanceKm(item, pickupCoords);
                      const label = typeof item === 'string' ? item : item.name;
                      return (
                        <button
                          key={label}
                          onClick={() => {
                            applySuggestion('drop', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-emerald-200 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <MapPin size={15} className="shrink-0 text-emerald-500" />
                            <span className="truncate text-[13px] font-bold text-slate-700">{label}</span>
                          </div>
                          {distKm ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-xl text-xs font-black shrink-0">
                              {distKm} km
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!drop && (dynamicPopularSuggestions.length > 0 || dropSuggestions.length > 0) ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Popular Suggestions</p>
                  <div className="space-y-2">
                    {(dynamicPopularSuggestions.length > 0 ? dynamicPopularSuggestions : dropSuggestions).map((item) => {
                      const distKm = getItemDistanceKm(item, pickupCoords);
                      const label = typeof item === 'string' ? item : item.name;
                      return (
                        <button
                          key={label}
                          onClick={() => {
                            applySuggestion('drop', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-blue-200 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Navigation size={15} className="text-blue-500 shrink-0" />
                            <span className="text-[13px] font-bold text-slate-700 truncate">{label}</span>
                          </div>
                          {distKm ? (
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-black shrink-0">
                              {distKm} km
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {Boolean(drop) && isFetchingDropSuggestions ? (
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-xs">
                  Finding nearby drop suggestions...
                </div>
              ) : null}
            </>
          )}
        </div>

        <motion.section 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.12 }} 
          className="mt-8 rounded-[28px] bg-slate-900 px-6 py-5 text-white shadow-xl relative overflow-hidden"
        >
          <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Approx. Delivery Fare</p>
              <p className="mt-1 text-2xl font-black">
                {estimatedFare ? `Rs ${estimatedFare.approx ?? estimatedFare.min}` : '--'}
              </p>
              <p className="mt-1 text-[11px] font-bold text-white/55">
                {estimatedFare
                  ? `Based on admin pricing for about ${estimatedDistanceKm.toFixed(1)} km`
                  : 'Enter a drop address to see the live fare'}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md">
              <PackageCheck size={24} className="text-emerald-400" />
            </div>
          </div>
        </motion.section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 p-6">
        <div className="mx-auto max-w-lg relative">
          <div className="absolute inset-x-0 bottom-0 -mb-6 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleProceed}
            className="relative flex h-16 w-full items-center justify-center gap-3 rounded-[24px] bg-slate-900 text-[15px] font-black text-white shadow-[0_20px_40px_rgba(15,23,42,0.2)] group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10">
               {drop ? 'Confirm Receiver Details' : 'Select Drop Location'}
            </span>
            <ChevronRight size={20} className="relative z-10 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default SenderReceiverDetails;
