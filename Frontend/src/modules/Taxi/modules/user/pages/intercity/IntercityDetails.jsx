import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MapPin, Navigation, ChevronRight, Map as MapIcon, LoaderCircle, AlertTriangle, X, Check, ShieldCheck, MapPinned } from 'lucide-react';
import { GoogleMap } from '@react-google-maps/api';
import { useAppGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER } from '../../../admin/utils/googleMaps';

const toRadians = (degree) => (degree * Math.PI) / 180;
const calculateDistanceKm = (from, to) => {
  if (!Array.isArray(from) || from.length < 2 || !Array.isArray(to) || to.length < 2) return 0;
  const fromCoords = { lat: Number(from[1]), lng: Number(from[0]) };
  const toCoords = { lat: Number(to[1]), lng: Number(to[0]) };
  
  if (!Number.isFinite(fromCoords.lat) || !Number.isFinite(fromCoords.lng) || !Number.isFinite(toCoords.lat) || !Number.isFinite(toCoords.lng)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(toCoords.lat - fromCoords.lat);
  const dLng = toRadians(toCoords.lng - fromCoords.lng);

  const lat1 = toRadians(fromCoords.lat);
  const lat2 = toRadians(toCoords.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const resolveCoordsFromAddress = (address, isGoogleMapsLoaded) =>
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
      resolve([locationPoint.lng(), locationPoint.lat()]);
    });
  });

const resolveCoordsFromPlaceId = (placeId, isGoogleMapsLoaded) =>
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
      resolve([locationPoint.lng(), locationPoint.lat()]);
    });
  });

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
          location: { lat: coords[1], lng: coords[0] },
          radius: 15000,
        },
        (results, status) => {
          if (status === 'OK' && Array.isArray(results)) {
            const places = results
              .filter((r) => r.name && r.geometry?.location)
              .map((r) => ({
                name: r.name,
                coords: [r.geometry.location.lng(), r.geometry.location.lat()],
              }))
              .filter((place, idx, self) => self.findIndex((p) => p.name === place.name) === idx)
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
          radius: 25000,
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
              .filter((place, idx, self) => self.findIndex((p) => p.name === place.name) === idx)
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

const getItemDistanceKm = (item, pickupCoords) => {
  if (!pickupCoords || !Array.isArray(pickupCoords) || pickupCoords.length < 2) return null;

  if (item?.distanceKm) {
    return String(item.distanceKm);
  }

  if (item?.coords) {
    const dist = calculateDistanceKm(pickupCoords, item.coords);
    return dist > 0 ? dist.toFixed(1) : null;
  }

  return null;
};

import api from '../../../../shared/api/axiosInstance';

const CITY_CENTERS = {
  Indore: { lat: 22.7196, lng: 75.8577 },
  Bhopal: { lat: 23.2599, lng: 77.4126 },
  Ujjain: { lat: 23.1765, lng: 75.7885 },
  Jabalpur: { lat: 23.1815, lng: 79.9864 },
  Ratlam: { lat: 23.3315, lng: 75.0367 },
  Dewas: { lat: 22.9676, lng: 76.0534 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.6139, lng: 77.209 },
  Pune: { lat: 18.5204, lng: 73.8567 },
};

const getCityCenter = (city) => CITY_CENTERS[city] || INDIA_CENTER;
const getCityCoords = (city) => {
  const center = getCityCenter(city);
  return [center.lng, center.lat];
};
const unwrapApiPayload = (response) => response?.data?.data || response?.data || response || {};

const generateIntercityBookingId = () =>
  'IC-' + Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');

const generateSearchNonce = () =>
  `intercity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const IntercityDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const state = location.state || {};
  const { fromCity, toCity, vehicle } = state;

  const [pickup, setPickup] = useState(state.pickupAddress || '');
  const [drop, setDrop] = useState('');
  const [pickupCoords, setPickupCoords] = useState(state.pickupCoords || null);
  const [dropCoords, setDropCoords] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [activeMapField, setActiveMapField] = useState('pickup');
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [pickedAddress, setPickedAddress] = useState('Move the map to choose a location');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  const [liveDriverCount, setLiveDriverCount] = useState(0);
  const [isFetchingDrivers, setIsFetchingDrivers] = useState(false);
  const [driverFetchError, setDriverFetchError] = useState('');
  const [isProceeding, setIsProceeding] = useState(false);

  const [googlePickupSuggestions, setGooglePickupSuggestions] = useState([]);
  const [googleDropSuggestions, setGoogleDropSuggestions] = useState([]);
  const [isFetchingPickupSuggestions, setIsFetchingPickupSuggestions] = useState(false);
  const [isFetchingDropSuggestions, setIsFetchingDropSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState(null);

  const pickupInputRef = useRef(null);
  const dropInputRef = useRef(null);
  const pickupGeocodeTimerRef = useRef(null);
  const dropGeocodeTimerRef = useRef(null);
  const pickupSuggestionTimerRef = useRef(null);
  const dropSuggestionTimerRef = useRef(null);
  const pickupSuggestionCacheRef = useRef(new Map());
  const dropSuggestionCacheRef = useRef(new Map());

  const [dynamicNearbySuggestions, setDynamicNearbySuggestions] = useState([]);
  const [dynamicPopularSuggestions, setDynamicPopularSuggestions] = useState([]);
  const [isFetchingNearbySuggestions, setIsFetchingNearbySuggestions] = useState(false);

  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const serviceLocationId = useMemo(
    () => state.serviceLocationId || state.selectedPackages?.[0]?.serviceLocationId || '',
    [state.serviceLocationId, state.selectedPackages]
  );

  const effectivePickupCoords = useMemo(
    () => pickupCoords || state.pickupCoords || getCityCoords(fromCity),
    [fromCity, pickupCoords, state.pickupCoords]
  );

  useEffect(() => {
    if (!fromCity || !vehicle) {
      navigate(`${routePrefix}/intercity`, { replace: true });
    }
  }, [fromCity, navigate, routePrefix, vehicle]);

  useEffect(() => {
    let active = true;

    const loadNearbyDrivers = async () => {
      if (!vehicle?.vehicleTypeId || !Array.isArray(effectivePickupCoords)) {
        if (active) {
          setLiveDriverCount(0);
          setDriverFetchError('');
          setIsFetchingDrivers(false);
        }
        return;
      }

      try {
        if (active) {
          setIsFetchingDrivers(true);
          setDriverFetchError('');
        }

        const response = await api.get('/rides/available-drivers', {
          params: {
            vehicleTypeId: vehicle.vehicleTypeId,
            vehicleIconType: vehicle.iconType || vehicle.name || 'car',
            lng: effectivePickupCoords[0],
            lat: effectivePickupCoords[1],
            service_location_id: serviceLocationId,
            transport_type: 'intercity',
          },
        });

        if (!active) {
          return;
        }

        const availability = unwrapApiPayload(response);
        setLiveDriverCount(Number(availability?.totalDrivers || 0));
      } catch (error) {
        if (!active) {
          return;
        }

        setLiveDriverCount(0);
        setDriverFetchError(error?.message || 'Could not fetch live driver availability.');
      } finally {
        if (active) {
          setIsFetchingDrivers(false);
        }
      }
    };

    loadNearbyDrivers();

    return () => {
      active = false;
    };
  }, [effectivePickupCoords, serviceLocationId, vehicle]);

  if (!fromCity || !vehicle) {
    return null;
  }

  const handleContinue = async () => {
    if (!pickup.trim() || !drop.trim()) {
      alert("Please enter both exact pickup and drop locations within the selected cities.");
      return;
    }

    const nextPickupCoords = pickupCoords || getCityCoords(fromCity);
    const nextDropCoords = dropCoords || getCityCoords(toCity);
    const bookingId = state.bookingId || generateIntercityBookingId();
    let availabilitySnapshot = {
      totalDrivers: liveDriverCount,
      fetchedAt: new Date().toISOString(),
    };

    if (vehicle?.vehicleTypeId && Array.isArray(nextPickupCoords)) {
      try {
        setIsProceeding(true);
        setDriverFetchError('');
        const response = await api.get('/rides/available-drivers', {
          params: {
            vehicleTypeId: vehicle.vehicleTypeId,
            vehicleIconType: vehicle.iconType || vehicle.name || 'car',
            lng: nextPickupCoords[0],
            lat: nextPickupCoords[1],
            service_location_id: serviceLocationId,
            transport_type: 'intercity',
          },
        });
        const availability = unwrapApiPayload(response);

        availabilitySnapshot = {
          ...availability,
          totalDrivers: Number(availability?.totalDrivers || 0),
          fetchedAt: new Date().toISOString(),
        };
        setLiveDriverCount(Number(availability?.totalDrivers || 0));
      } catch (error) {
        setDriverFetchError(error?.message || 'Could not fetch live driver availability.');
      } finally {
        setIsProceeding(false);
      }
    }

    const nextState = {
      ...state,
      bookingId,
      pickup,
      drop,
      pickupCoords: nextPickupCoords,
      dropCoords: nextDropCoords,
      searchNonce: generateSearchNonce(),
      vehicleTypeId: vehicle.vehicleTypeId || '',
      vehicleIconType: vehicle.iconType || vehicle.name || 'car',
      vehicleIconUrl: vehicle.vehicleIconUrl || vehicle.icon || '',
      paymentMethod: 'Cash',
      serviceType: 'intercity',
      transport_type: 'intercity',
      bookingMode: vehicle.supportsBidding ? 'bidding' : (state.bookingMode || 'normal'),
      bidStepAmount: Number(state.bidStepAmount || 10),
      userMaxBidFare: vehicle.supportsBidding
        ? Number(state.userMaxBidFare || state.fare || 0)
        : Number(state.fare || 0),
      intercity: {
        bookingId,
        fromCity,
        toCity,
        tripType: state.tripType || 'One Way',
        travelDate: state.date || 'Ride Now',
        passengers: state.passengers || 1,
        distance: Number(state.distance || 0),
        vehicleName: vehicle.name || vehicle.id || 'Intercity Cab',
        packageId: vehicle.packageId || '',
        packageTypeName: vehicle.packageTypeName || 'Intercity',
      },
      driverAvailability: availabilitySnapshot,
    };

    if (state.rideMode === 'schedule' && state.scheduledAt) {
      navigate(`${routePrefix}/intercity/confirm`, {
        state: nextState,
      });
      return;
    }

    navigate(`${routePrefix}/ride/searching`, {
      state: {
        ...nextState,
      }
    });
  };

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

    if (!isLoaded) {
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
  }, [pickup, isLoaded]);

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

    if (!isLoaded) {
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
          center: { lat: pickupCoords[1], lng: pickupCoords[0] },
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
  }, [drop, isLoaded, pickupCoords]);

  useEffect(() => {
    if (!pickupCoords || !isLoaded) {
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
  }, [pickupCoords, isLoaded]);

  const applySuggestion = async (type, suggestion) => {
    const value = typeof suggestion === 'string' ? suggestion : suggestion?.description || suggestion?.label || suggestion?.name || '';

    if (type === 'pickup') {
      setPickup(value);
      if (typeof suggestion === 'string') {
        const coords = await resolveCoordsFromAddress(value, isLoaded);
        if (coords) setPickupCoords(coords);
      } else if (suggestion?.coords) {
        setPickupCoords(suggestion.coords);
      } else if (suggestion?.placeId) {
        const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId, isLoaded);
        setPickupCoords(resolvedCoords);
        if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
          autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      }
      setGooglePickupSuggestions([]);
      return;
    }

    setDrop(value);
    if (typeof suggestion === 'string') {
      const coords = await resolveCoordsFromAddress(value, isLoaded);
      if (coords) setDropCoords(coords);
    } else if (suggestion?.coords) {
      setDropCoords(suggestion.coords);
    } else if (suggestion?.placeId) {
      const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId, isLoaded);
      setDropCoords(resolvedCoords);
      if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
    }
    setGoogleDropSuggestions([]);
  };

  const openMapPicker = (field) => {
    const savedCoords = field === 'pickup' ? pickupCoords : dropCoords;
    const savedAddress = field === 'pickup' ? pickup : drop;
    const cityCenter = getCityCenter(field === 'pickup' ? fromCity : toCity);
    const center = Array.isArray(savedCoords)
      ? { lat: savedCoords[1], lng: savedCoords[0] }
      : cityCenter;

    setActiveMapField(field);
    setMapCenter(center);
    lastCenterRef.current = center;
    setPickedAddress(savedAddress || (field === 'pickup' ? `${fromCity} location` : toCity));
    setShowMapPicker(true);
  };

  const handleMapIdle = () => {
    if (!mapInstanceRef.current || !window.google?.maps?.Geocoder) return;

    const center = mapInstanceRef.current.getCenter();
    const lat = center.lat();
    const lng = center.lng();
    const diff = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);

    if (diff < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);
    setIsGeocoding(true);

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      setIsGeocoding(false);
      if (status === 'OK' && results?.[0]) {
        setPickedAddress(results[0].formatted_address);
        return;
      }

      setPickedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    });
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const nextCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo(nextCenter);
          mapInstanceRef.current.setZoom(17);
        } else {
          setMapCenter(nextCenter);
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true }
    );
  };

  const handleConfirmMapLocation = () => {
    const selectedCoords = [lastCenterRef.current.lng, lastCenterRef.current.lat];

    if (activeMapField === 'pickup') {
      setPickup(pickedAddress);
      setPickupCoords(selectedCoords);
    } else {
      setDrop(pickedAddress);
      setDropCoords(selectedCoords);
    }

    setShowMapPicker(false);
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
      className="min-h-screen bg-[#FAFBFF] max-w-lg mx-auto font-sans pb-32 relative overflow-x-hidden"
    >
      <AnimatePresence>
        {showMapPicker && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-[100] bg-white flex flex-col max-w-lg mx-auto"
          >
            <div className="absolute top-0 left-0 right-0 z-20 px-6 pt-12 pb-6 bg-gradient-to-b from-white via-white/95 to-transparent">
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMapPicker(false)}
                  className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100 active:scale-95 transition-all"
                >
                  <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
                </motion.button>
                <div className="flex-1 bg-white rounded-[24px] shadow-lg border border-indigo-50 px-5 py-4 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-1">
                    {activeMapField === 'pickup' ? `Pickup in ${fromCity}` : `Drop in ${toCity}`}
                  </p>
                  <p className="text-[14px] font-bold text-slate-900 truncate leading-tight">
                    {isGeocoding ? 'Finding exact address...' : pickedAddress}
                  </p>
                </div>
              </div>
              {activeMapField === 'drop' && (
                <div className="mt-3 ml-[52px] rounded-2xl border border-indigo-100 bg-white/95 px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Initial Destination</p>
                  <p className="mt-1 text-[13px] font-bold text-slate-900 truncate">{toCity}</p>
                </div>
              )}
            </div>

            <div className="flex-1 relative bg-slate-100">
              {/* Map Logic (same as before) */}
              {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 px-6 text-center">
                  <div className="rounded-[32px] bg-white px-8 py-10 shadow-xl border border-slate-100 max-w-[300px]">
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <X size={32} className="text-rose-400" />
                    </div>
                    <p className="text-[16px] font-black text-slate-900">Map Key Missing</p>
                    <p className="mt-2 text-[13px] font-bold text-slate-500">
                      Add a valid maps key to select locations on the map.
                    </p>
                  </div>
                </div>
              ) : loadError ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 px-6 text-center">
                   <div className="rounded-[32px] bg-white px-8 py-10 shadow-xl border border-slate-100 max-w-[300px]">
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle size={32} className="text-rose-400" />
                    </div>
                    <p className="text-[16px] font-black text-slate-900">Map Load Failed</p>
                    <p className="mt-2 text-[13px] font-bold text-slate-500">
                      Please check the map API key and network connection.
                    </p>
                  </div>
                </div>
              ) : isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={mapCenter}
                  zoom={15}
                  onLoad={(map) => (mapInstanceRef.current = map)}
                  onIdle={handleMapIdle}
                  onDragStart={() => setIsDragging(true)}
                  options={{
                    disableDefaultUI: true,
                    clickableIcons: false,
                    gestureHandling: 'greedy',
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50">
                  <LoaderCircle size={44} className="animate-spin text-blue-300" />
                  <p className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">Syncing Map</p>
                </div>
              )}

              {/* Pin Overlay */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[100%] pointer-events-none z-10">
                <motion.div
                  animate={isDragging || isGeocoding ? { y: -15 } : { y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-12 h-12 bg-blue-600 rounded-[18px] flex items-center justify-center shadow-2xl border-4 border-white">
                    <MapPinned size={20} className="text-white" />
                  </div>
                  <div className="w-1 h-6 bg-blue-600 -mt-2 shadow-2xl" />
                </motion.div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-black/20 rounded-full blur-md" />
              </div>

              <button
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="absolute bottom-10 right-6 w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all z-20 disabled:opacity-70"
              >
                {isLocating ? (
                  <LoaderCircle size={24} className="animate-spin text-blue-500" />
                ) : (
                  <Navigation size={24} className="text-slate-900" />
                )}
              </button>
            </div>

            <div className="px-6 pt-6 pb-12 bg-white border-t border-indigo-50 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                  <MapPin size={24} className="text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[16px] font-black text-slate-900 leading-none">Confirm Spot</h4>
                  <p className="text-[13px] font-bold text-slate-400 mt-1.5 line-clamp-1">{pickedAddress}</p>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirmMapLocation}
                disabled={isGeocoding}
                className="w-full h-16 bg-blue-600 rounded-[22px] text-white font-black text-[16px] uppercase tracking-widest shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-40"
              >
                <Check size={20} strokeWidth={3} />
                Confirm Location
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main UI */}
      <header className="fixed top-0 left-1/2 z-30 flex w-full max-w-lg -translate-x-1/2 items-center gap-4 border-b border-indigo-50 bg-white/92 px-6 pb-6 pt-12 backdrop-blur-lg">
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)} 
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-gray-100"
        >
          <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
        </motion.button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-black text-slate-900 leading-none tracking-tight">Location Details</h1>
          <p className="text-[12px] font-bold text-slate-400 mt-1 uppercase tracking-widest truncate">{fromCity} → {toCity}</p>
        </div>
      </header>

      <div className="h-[108px]" />

      <div className="px-6 pt-6 space-y-6">
        {/* Address Entry Card */}
        <div className="bg-white rounded-[32px] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-indigo-50 relative">
          {/* Vertical dash line */}
          <div className="absolute left-[39px] top-[74px] bottom-[74px] w-[2px] bg-slate-100 border-l border-dashed border-slate-200" />
          
          {/* Pickup Section */}
          <div className="relative mb-10">
            <label className="text-[11px] font-black text-blue-600 uppercase tracking-[0.15em] ml-11 block mb-2">Pickup in {fromCity}</label>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 border-2 border-blue-100 flex items-center justify-center shrink-0 z-10">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
              </div>
              <input 
                ref={pickupInputRef}
                type="text" 
                placeholder="Building, street name, etc."
                value={pickup}
                onChange={e => {
                  setPickup(e.target.value);
                }}
                onFocus={() => setActiveSearchField('pickup')}
                onBlur={async () => {
                  const trimmed = pickup.trim();
                  if (trimmed) {
                    const coords = await resolveCoordsFromAddress(trimmed, isLoaded);
                    if (coords) {
                      setPickupCoords(coords);
                    }
                  }
                }}
                className="w-full h-14 bg-slate-50 border-2 border-transparent rounded-2xl px-5 text-[15px] font-bold text-slate-900 focus:outline-none focus:border-blue-100 focus:bg-white transition-all"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => openMapPicker('pickup')}
              className="ml-12 mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-[12px] font-black text-blue-700 border border-blue-100/50"
            >
              <MapPinned size={14} /> Map Selection
            </motion.button>
          </div>

          {/* Drop Section */}
          <div className="relative">
            <label className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.15em] ml-11 block mb-2">Drop in {toCity}</label>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center shrink-0 z-10">
                <MapPin size={14} className="text-indigo-600" strokeWidth={3} />
              </div>
              <input 
                ref={dropInputRef}
                type="text" 
                placeholder="Station, mall, hotel name..."
                value={drop}
                onChange={e => {
                  setDrop(e.target.value);
                }}
                onFocus={() => setActiveSearchField('drop')}
                onBlur={async () => {
                  const trimmed = drop.trim();
                  if (trimmed) {
                    const coords = await resolveCoordsFromAddress(trimmed, isLoaded);
                    if (coords) {
                      setDropCoords(coords);
                    }
                  }
                }}
                className="w-full h-14 bg-slate-50 border-2 border-transparent rounded-2xl px-5 text-[15px] font-bold text-slate-900 focus:outline-none focus:border-indigo-100 focus:bg-white transition-all"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => openMapPicker('drop')}
              className="ml-12 mt-3 flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-[12px] font-black text-indigo-700 border border-indigo-100/50"
            >
              <MapPinned size={14} /> Map Selection
            </motion.button>
          </div>
        </div>

        {/* Clean Suggestions List with Distance Badges */}
        <div className="space-y-4 px-1">
          {/* Pickup Suggestions */}
          {activeSearchField === 'pickup' && (
            <>
              {googlePickupSuggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Pickup Search Results</p>
                  <div className="space-y-2">
                    {googlePickupSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          applySuggestion('pickup', item);
                          setActiveSearchField(null);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-emerald-200 transition-all font-sans"
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
                      </button>
                    ))}
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
                          type="button"
                          onClick={() => {
                            applySuggestion('drop', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-blue-200 transition-all font-sans"
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

              {!drop && dynamicNearbySuggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Near Current Pickup</p>
                  <div className="space-y-2">
                    {dynamicNearbySuggestions.map((item) => {
                      const distKm = getItemDistanceKm(item, pickupCoords);
                      const label = typeof item === 'string' ? item : item.name;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            applySuggestion('drop', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-emerald-200 transition-all font-sans"
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

              {!drop && dynamicPopularSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Popular Suggestions</p>
                  <div className="space-y-2">
                    {dynamicPopularSuggestions.map((item) => {
                      const distKm = getItemDistanceKm(item, pickupCoords);
                      const label = typeof item === 'string' ? item : item.name;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            applySuggestion('drop', item);
                            setActiveSearchField(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-xs hover:border-blue-200 transition-all font-sans"
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

        {/* Feature Tip */}
        <div className="bg-slate-900 rounded-[32px] p-6 text-white flex items-center gap-5 shadow-xl shadow-slate-200">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center shrink-0 border border-white/5">
            <ShieldCheck size={28} className="text-blue-400" />
          </div>
          <div>
            <h4 className="text-[15px] font-black leading-tight">Doorstep Service</h4>
            <p className="text-[11px] font-bold text-white/50 mt-1 uppercase tracking-widest leading-relaxed">Exact locations help drivers navigate directly to you.</p>
          </div>
        </div>
      </div>

      {/* Book CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 pb-10 pt-4 bg-gradient-to-t from-[#FAFBFF] via-[#FAFBFF]/95 to-transparent z-40">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/60 border border-slate-100">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Live Fetching</p>
            <p className="mt-1 text-[15px] font-black text-slate-900">
              {isFetchingDrivers ? 'Checking nearby drivers...' : `${liveDriverCount} drivers nearby`}
            </p>
          </div>
          {isFetchingDrivers ? (
            <LoaderCircle size={20} className="animate-spin text-blue-500 shrink-0" />
          ) : (
            <div className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-700 shrink-0">
              Live
            </div>
          )}
        </div>
        {driverFetchError ? (
          <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[11px] font-bold text-rose-500">
            {driverFetchError}
          </div>
        ) : null}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleContinue}
          disabled={isProceeding}
          className="w-full h-16 bg-blue-600 text-white rounded-[22px] text-[16px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/20 active:scale-95 transition-all"
        >
          {isProceeding ? (
            <>
              <LoaderCircle size={20} className="animate-spin" strokeWidth={3} />
              Fetching Drivers...
            </>
          ) : (
            <>
              Proceed to Live Tracking <ChevronRight size={20} strokeWidth={3} />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};

export default IntercityDetails;
