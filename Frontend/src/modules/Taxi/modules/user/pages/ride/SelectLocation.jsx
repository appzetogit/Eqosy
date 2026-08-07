import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MapPin, X, Plus, Minus, Check, Map as MapIcon, LoaderCircle, Navigation, AlertTriangle, ChevronRight } from 'lucide-react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { useAppGoogleMapsLoader, INDIA_CENTER, HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';
import { getSavedLocation, getSavedLocationCoords, saveLocation } from '../../services/locationStore';
import {
  fetchActiveRideZones,
  getBoundsFromPaths,
  getZonePathsFromZones,
  isCoordsInZones,
  resolveServiceLocationIdFromCoords,
} from '../../services/rideZoneUtils';

const LOCATION_COORDS = {
  'Pipaliyahana, Indore': [75.9048, 22.7039],
  'Vijay Nagar': [75.8937, 22.7533],
  'Vijay Nagar Square': [75.8947, 22.7518],
  'Vijayawada': [80.6480, 16.5062],
  'Vijay Nagar Police Station': [75.8934, 22.7506],
  'Rajwada': [75.8553, 22.7187],
  'Bhawarkua': [75.8586, 22.6926],
  'MG Road': [75.8721, 22.7196],
  'Palasia Square': [75.8863, 22.7242],
  'LIG Colony': [75.8904, 22.7322],
  'Scheme No 54': [75.8978, 22.7567],
  'Bhangadh': [75.8438, 22.7552],
  'AB Road': [75.8878, 22.7423],
  'Geeta Bhawan': [75.8834, 22.7208],
  'Sapna Sangeeta': [75.8587, 22.6984],
  'Mahalaxmi Nagar': [75.9114, 22.7676],
};

const getCoords = (title, fallback = [75.8577, 22.7196]) => LOCATION_COORDS[title] || fallback;
const DEFAULT_COORDS = [75.8577, 22.7196];
const sanitizeLocationInput = (value) => String(value || '').replace(/^\s+/g, '').replace(/\s{2,}/g, ' ');

const calculateHaversineDistance = (coords1, coords2) => {
  if (!coords1 || !coords2) return null;
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const SelectLocation = () => {
  const location = useLocation();
  const routeState = location.state || {};
  const serviceLocationId = routeState.service_location_id || routeState.serviceLocationId || '';
  const savedLocation = getSavedLocation();
  const savedPickupLabel = String(savedLocation?.address || '').trim();
  const savedPickupCoords = getSavedLocationCoords();
  const [pickup, setPickup] = useState(() => routeState.pickup || savedPickupLabel || 'Pipaliyahana, Indore');
  const [drop, setDrop] = useState(() => routeState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => routeState.pickupCoords || savedPickupCoords || getCoords(routeState.pickup || savedPickupLabel || 'Pipaliyahana, Indore'));
  const [dropCoords, setDropCoords] = useState(() => routeState.dropCoords || null);
  const [stops, setStops] = useState(() => routeState.stops || []);          // array of stop strings
  const [activeInput, setActiveInput] = useState('drop'); // 'pickup' | 'drop' | stopIdx
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [pickedAddress, setPickedAddress] = useState('Loading address...');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [activeZones, setActiveZones] = useState([]);
  const [isLoadingZones, setIsLoadingZones] = useState(true);
  const zonePaths = useMemo(() => getZonePathsFromZones(activeZones), [activeZones]);
  const [remoteResults, setRemoteResults] = useState([]);
  const [popularLocations, setPopularLocations] = useState([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [isLoadingPopularLocations, setIsLoadingPopularLocations] = useState(false);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  const geocoderRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const searchCacheRef = useRef(new Map());
  const popularLocationsCacheRef = useRef(new Map());
  const latestSearchRef = useRef(0);
  const { isLoaded, loadError } = useAppGoogleMapsLoader();
  const navigate = useNavigate();
  // Must use React Router location (hash path in Flutter WebView), NOT window.location.pathname.
  // HashRouter keeps pathname as "/" and the real route in the hash — using window.location
  // made navigate go to "/ride/select-vehicle" which misses taxi routes and lands on /taxi/user.
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const popularAnchorCoords = useMemo(() => {
    if (Array.isArray(pickupCoords) && pickupCoords.length === 2) {
      return pickupCoords;
    }

    if (savedPickupCoords) {
      return savedPickupCoords;
    }

    return DEFAULT_COORDS;
  }, [pickupCoords, savedPickupCoords]);

  const zoneBounds = useMemo(() => getBoundsFromPaths(zonePaths), [zonePaths]);

  useEffect(() => {
    let active = true;

    const loadZones = async () => {
      setIsLoadingZones(true);

      try {
        const zones = await fetchActiveRideZones(api, serviceLocationId);
        if (!active) {
          return;
        }

        setActiveZones(zones);
      } catch {
        if (active) {
          setActiveZones([]);
        }
      } finally {
        if (active) {
          setIsLoadingZones(false);
        }
      }
    };

    loadZones();

    return () => {
      active = false;
    };
  }, [serviceLocationId]);

  // Automatically request GPS location permission on mount if default pickup is loaded
  useEffect(() => {
    if ((!routeState.pickup || pickup === 'Pipaliyahana, Indore') && typeof navigator !== 'undefined' && navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const coords = [lng, lat];
          setPickupCoords(coords);
          setMapCenter({ lat, lng });

          if (window.google?.maps?.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                const addr = results[0].formatted_address;
                setPickup(addr);
                saveLocation({ address: addr, lat, lon: lng });
              }
              setIsLocating(false);
            });
          } else {
            setIsLocating(false);
          }
        },
        (err) => {
          console.warn('[SelectLocation] GPS permission denied or error:', err);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places?.AutocompleteService) {
      return;
    }

    autocompleteServiceRef.current = autocompleteServiceRef.current || new window.google.maps.places.AutocompleteService();
    placesServiceRef.current = placesServiceRef.current || new window.google.maps.places.PlacesService(document.createElement('div'));
    autocompleteSessionTokenRef.current = autocompleteSessionTokenRef.current
      || new window.google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  const getAutocompleteSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) {
      return null;
    }

    if (!autocompleteSessionTokenRef.current) {
      autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }

    return autocompleteSessionTokenRef.current;
  };

  const resetAutocompleteSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) {
      autocompleteSessionTokenRef.current = null;
      return;
    }

    autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  };

  const getPlacesService = () => {
    if (!window.google?.maps?.places?.PlacesService) {
      return null;
    }

    if (!placesServiceRef.current) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
    }

    return placesServiceRef.current;
  };

  const getGeocoder = () => {
    if (!window.google?.maps?.Geocoder) {
      return null;
    }

    if (!geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }

    return geocoderRef.current;
  };

  const resolveCoords = async (label, fallback = DEFAULT_COORDS) => {
    if (!label || !String(label).trim()) {
      return fallback;
    }

    const knownCoords = LOCATION_COORDS[label];
    if (knownCoords) {
      return knownCoords;
    }

    if (!window.google?.maps?.Geocoder) {
      return fallback;
    }

    const geocoder = getGeocoder();
    if (!geocoder) {
      return fallback;
    }

    return new Promise((resolve) => {
      geocoder.geocode({ address: String(label).trim() }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const location = results[0].geometry.location;
          resolve([location.lng(), location.lat()]);
          return;
        }

        resolve(fallback);
      });
    });
  };

  const resolvePlaceSelection = async (result) => {
    if (Array.isArray(result?.coords) && result.coords.length === 2) {
      return {
        title: result.title,
        address: result.address || result.title,
        coords: result.coords,
      };
    }

    const geocoder = getGeocoder();
    const placesService = getPlacesService();

    if (result?.placeId && placesService) {
      return new Promise((resolve) => {
        placesService.getDetails(
          {
            placeId: result.placeId,
            sessionToken: getAutocompleteSessionToken(),
            fields: ['formatted_address', 'geometry.location', 'name'],
          },
          (place, status) => {
            const location = place?.geometry?.location;

            if (status === 'OK' && location) {
              resolve({
                title: result.title || place.name || place.formatted_address,
                address: place.formatted_address || result.address || result.title || '',
                coords: [location.lng(), location.lat()],
              });
              return;
            }

            if (geocoder) {
              geocoder.geocode({ placeId: result.placeId }, (results, geocodeStatus) => {
                const geocodedPlace = results?.[0];
                const geocodedLocation = geocodedPlace?.geometry?.location;

                if (geocodeStatus === 'OK' && geocodedLocation) {
                  resolve({
                    title: result.title || geocodedPlace.formatted_address,
                    address: geocodedPlace.formatted_address || result.address || result.title || '',
                    coords: [geocodedLocation.lng(), geocodedLocation.lat()],
                  });
                  return;
                }

                resolve({
                  title: result?.title || '',
                  address: result?.address || result?.title || '',
                  coords: DEFAULT_COORDS,
                });
              });
              return;
            }

            resolve({
              title: result?.title || '',
              address: result?.address || result?.title || '',
              coords: DEFAULT_COORDS,
            });
          },
        );
      });
    }

    if (!geocoder) {
      return {
        title: result?.title || '',
        address: result?.address || result?.title || '',
        coords: await resolveCoords(result?.address || result?.title || ''),
      };
    }

    const coords = await resolveCoords(result?.address || result?.title || '');
    return {
      title: result?.title || '',
      address: result?.address || result?.title || '',
      coords,
    };
  };

  const validateZoneSelection = (coords) => {
    if (!activeZones || !activeZones.length) {
      return true;
    }
    return true;
  };

  const getQuery = () => {
    if (activeInput === 'pickup') return pickup;
    if (activeInput === 'drop') return drop;
    if (typeof activeInput === 'number') return stops[activeInput] || '';
    return '';
  };

  const query = getQuery();
  const localSearchResults = useMemo(() => {
    if (query.trim().length >= 3) {
      return [];
    }

    if (query.trim().length >= 1) {
      return popularLocations.filter(
        (result) =>
          result.title.toLowerCase().includes(query.toLowerCase())
          || result.address.toLowerCase().includes(query.toLowerCase()),
      );
    }

    return popularLocations;
  }, [query, popularLocations]);

  useEffect(() => {
    if (!isLoaded || !HAS_VALID_GOOGLE_MAPS_KEY) {
      return undefined;
    }

    const [lng, lat] = popularAnchorCoords;
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = popularLocationsCacheRef.current.get(cacheKey);

    if (cached) {
      setPopularLocations(cached);
      setIsLoadingPopularLocations(false);
      return undefined;
    }

    const placesService = getPlacesService();
    if (!placesService) {
      return undefined;
    }

    setIsLoadingPopularLocations(true);
    const anchor = new window.google.maps.LatLng(lat, lng);

    placesService.nearbySearch(
      {
        location: anchor,
        radius: 8000,
      },
      (results, status) => {
        setIsLoadingPopularLocations(false);

        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !Array.isArray(results)) {
          setPopularLocations([]);
          return;
        }

        const nextResults = results
          .slice(0, 8)
          .map((place) => ({
            title: place.name || '',
            address: place.vicinity || place.formatted_address || '',
            placeId: place.place_id,
            coords: place.geometry?.location
              ? [place.geometry.location.lng(), place.geometry.location.lat()]
              : null,
          }))
          .filter((result) => result.title);

        popularLocationsCacheRef.current.set(cacheKey, nextResults);
        setPopularLocations(nextResults);
      },
    );

    return undefined;
  }, [isLoaded, popularAnchorCoords]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 3 || !HAS_VALID_GOOGLE_MAPS_KEY || !autocompleteServiceRef.current) {
      setRemoteResults([]);
      setIsSearchingLocations(false);
      return;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const [pickupLng, pickupLat] = pickupCoords || [0, 0];
    const cacheKey = `${normalizedQuery}|${pickupLat.toFixed(3)},${pickupLng.toFixed(3)}`;
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached) {
      setRemoteResults(cached);
      setIsSearchingLocations(false);
      return;
    }

    const requestId = latestSearchRef.current + 1;
    latestSearchRef.current = requestId;
    setIsSearchingLocations(true);

    const timeoutId = window.setTimeout(() => {
      const request = {
        input: query.trim(),
        componentRestrictions: { country: 'in' },
        sessionToken: getAutocompleteSessionToken(),
      };

      if (window.google?.maps?.LatLng && Array.isArray(pickupCoords) && pickupCoords.length === 2) {
        request.location = new window.google.maps.LatLng(pickupCoords[1], pickupCoords[0]);
        request.radius = 50000;
        request.origin = new window.google.maps.LatLng(pickupCoords[1], pickupCoords[0]);
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (latestSearchRef.current !== requestId) {
          return;
        }

        if (status === 'OK' && Array.isArray(predictions) && predictions.length > 0) {
          const nextResults = predictions.slice(0, 8).map((prediction) => ({
            title: prediction.structured_formatting?.main_text || prediction.description,
            address: prediction.description,
            placeId: prediction.place_id,
            distance: prediction.distance_meters ? prediction.distance_meters / 1000 : null,
          }));
          searchCacheRef.current.set(cacheKey, nextResults);
          setRemoteResults(nextResults);
          setIsSearchingLocations(false);
        } else {
          // OpenStreetMap Nominatim Fallback search so query never says "no nearby location"
          fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&countrycodes=in&limit=6`)
            .then((res) => res.json())
            .then((data) => {
              if (latestSearchRef.current !== requestId) return;
              const fallbackResults = (Array.isArray(data) ? data : []).map((item) => ({
                title: item.display_name?.split(',')[0] || item.name || 'Location',
                address: item.display_name,
                coords: [parseFloat(item.lon), parseFloat(item.lat)],
              }));
              searchCacheRef.current.set(cacheKey, fallbackResults);
              setRemoteResults(fallbackResults);
            })
            .catch(() => {
              if (latestSearchRef.current === requestId) setRemoteResults([]);
            })
            .finally(() => {
              if (latestSearchRef.current === requestId) setIsSearchingLocations(false);
            });
        }
      });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, pickupCoords]);

  const searchResults = useMemo(() => {
    const merged = [...remoteResults, ...localSearchResults];
    const seen = new Set();

    const unique = merged.filter((result) => {
      const key = `${String(result.title || '').trim().toLowerCase()}|${String(result.address || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    const getResultDistance = (res) => {
      if (res.distance !== undefined && res.distance !== null) {
        return res.distance;
      }
      if (res.coords && pickupCoords) {
        return calculateHaversineDistance(pickupCoords, res.coords);
      }
      return null;
    };

    const withDistance = unique.map((res) => {
      const dist = getResultDistance(res);
      return { ...res, computedDistance: dist };
    });

    withDistance.sort((a, b) => {
      if (a.computedDistance === null || a.computedDistance === undefined) return 1;
      if (b.computedDistance === null || b.computedDistance === undefined) return -1;
      return a.computedDistance - b.computedDistance;
    });

    return withDistance;
  }, [localSearchResults, remoteResults, pickupCoords]);

  const showMapToast = () => {
    // Reset map center to pickup or current location before opening
    const startCoord = Array.isArray(pickupCoords) && pickupCoords.length === 2
      ? { lat: pickupCoords[1], lng: pickupCoords[0] }
      : INDIA_CENTER;

    setMapCenter(startCoord);
    lastCenterRef.current = startCoord;
    setShowMapPicker(true);
  };

  const handleMapIdle = () => {
    if (!mapInstanceRef.current || !window.google) return;
    const center = mapInstanceRef.current.getCenter();
    const lat = center.lat();
    const lng = center.lng();

    // Only update and geocode if the center has actually changed significantly
    const dist = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);
    if (dist < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);

    // Reverse Geocode
    setIsGeocoding(true);
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      setIsGeocoding(false);
      if (status === 'OK' && results[0]) {
        setPickedAddress(results[0].formatted_address);
      } else {
        setPickedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    });
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);

    const onSuccess = (pos) => {
      setIsLocating(false);
      const { latitude, longitude } = pos.coords;
      const newCoords = { lat: latitude, lng: longitude };

      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(newCoords);
        mapInstanceRef.current.setZoom(17);
      }

      // Explicitly geocode and update pickedAddress
      setIsGeocoding(true);
      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: newCoords }, (results, status) => {
          setIsGeocoding(false);
          if (status === 'OK' && results[0]) {
            setPickedAddress(results[0].formatted_address);
          } else {
            setPickedAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
        });
      } else {
        setIsGeocoding(false);
        setPickedAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      }

      lastCenterRef.current = newCoords;
    };

    const onError = () => {
      setIsLocating(false);
    };

    const optionsHigh = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };
    const optionsLow = { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        console.warn("Map picker GPS high accuracy failed, trying low accuracy...", err);
        navigator.geolocation.getCurrentPosition(onSuccess, onError, optionsLow);
      },
      optionsHigh
    );
  };

  // Auto-detect and set pickup location on load if not set
  useEffect(() => {
    if (!isLoaded) return;
    if (!routeState.pickup && !savedPickupLabel) {
      setIsLocating(true);
      const onSuccess = (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const coords = [longitude, latitude];

        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            if (status === 'OK' && results[0]) {
              const addr = results[0].formatted_address;
              setPickup(addr);
              setPickupCoords(coords);
              saveLocation({
                address: addr,
                lat: latitude,
                lon: longitude,
              });
            } else {
              const raw = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
              setPickup(raw);
              setPickupCoords(coords);
            }
          });
        } else {
          const raw = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          setPickup(raw);
          setPickupCoords(coords);
        }
      };

      const onError = (err) => {
        console.warn("Auto-location failed:", err);
        setIsLocating(false);
      };

      const optionsHigh = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };
      const optionsLow = { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 };

      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          console.warn("Auto-location high accuracy failed, trying low accuracy...", err);
          navigator.geolocation.getCurrentPosition(onSuccess, onError, optionsLow);
        },
        optionsHigh
      );
    }
  }, [isLoaded]);

  const handleConfirmNavigate = async (optionalDrop, optionalDropCoords = null) => {
    const finalDrop = optionalDrop || drop;
    const finalPickup = pickup || savedPickupLabel || 'Current Location';

    if (!finalDrop || !String(finalDrop).trim()) return;

    let resolvedPickupCoords = pickupCoords;
    if (!resolvedPickupCoords || !Array.isArray(resolvedPickupCoords) || resolvedPickupCoords.length !== 2) {
      try {
        resolvedPickupCoords = await Promise.race([
          resolveCoords(finalPickup),
          new Promise(r => setTimeout(() => r(popularAnchorCoords || DEFAULT_COORDS), 2500))
        ]);
      } catch {
        resolvedPickupCoords = popularAnchorCoords || DEFAULT_COORDS;
      }
    }

    let resolvedDropCoords = optionalDropCoords || dropCoords;
    if (!resolvedDropCoords || !Array.isArray(resolvedDropCoords) || resolvedDropCoords.length !== 2) {
      try {
        resolvedDropCoords = await Promise.race([
          resolveCoords(finalDrop),
          new Promise(r => setTimeout(() => r(DEFAULT_COORDS), 2500))
        ]);
      } catch {
        resolvedDropCoords = DEFAULT_COORDS;
      }
    }

    const resolvedServiceLocationId = serviceLocationId
      || resolveServiceLocationIdFromCoords(resolvedPickupCoords, activeZones)
      || (activeZones.length > 0 ? (activeZones[0]?.service_location_id?._id || activeZones[0]?.service_location_id || activeZones[0]?._id) : '')
      || 'default';

    saveLocation({
      address: finalPickup,
      lat: resolvedPickupCoords[1],
      lon: resolvedPickupCoords[0],
    });

    const targetPath = `${routePrefix}/ride/select-vehicle`;
    if (typeof window !== 'undefined' && (window.flutter_inappwebview || window.ReactNativeWebView)) {
      console.info('[SelectLocation] navigate to vehicle', {
        targetPath,
        routerPathname: location.pathname,
        windowPathname: window.location.pathname,
        hash: window.location.hash,
        routePrefix,
      });
    }

    navigate(targetPath, {
      state: {
        pickup: finalPickup,
        drop: finalDrop,
        stops: stops.filter(s => String(s || '').trim().length > 0),
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        service_location_id: resolvedServiceLocationId,
      },
    });
  };

  const handleConfirmMapLocation = () => {
    const finalAddress = pickedAddress;
    const selectedCoords = [lastCenterRef.current.lng, lastCenterRef.current.lat];

    if (!validateZoneSelection(selectedCoords)) {
      toast.error('Please pin a location inside the active service zone.');
      return;
    }

    if (activeInput === 'pickup') {
      setPickup(finalAddress);
      setPickupCoords(selectedCoords);
      saveLocation({
        address: finalAddress,
        lat: selectedCoords[1],
        lon: selectedCoords[0],
      });
      setActiveInput('drop');
    } else if (activeInput === 'drop') {
      setDrop(finalAddress);
      setDropCoords(selectedCoords);
      // Auto-navigate if it's the destination
      handleConfirmNavigate(finalAddress, selectedCoords);
    } else if (typeof activeInput === 'number') {
      updateStop(activeInput, finalAddress);
    }
    setShowMapPicker(false);
  };

  const handleUseCurrentLocationResult = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);

    const onSuccess = (pos) => {
      setIsLocating(false);
      const { latitude, longitude } = pos.coords;
      const coords = [longitude, latitude];

      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const addr = results[0].formatted_address;
            if (activeInput === 'drop') {
              setDrop(addr);
              setDropCoords(coords);
              handleConfirmNavigate(addr, coords);
            } else {
              handleSelectResult(addr, coords);
            }
          } else {
            const raw = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            if (activeInput === 'drop') {
              setDrop(raw);
              setDropCoords(coords);
              handleConfirmNavigate(raw, coords);
            } else {
              handleSelectResult(raw, coords);
            }
          }
        });
      } else {
        const raw = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        if (activeInput === 'drop') {
          setDrop(raw);
          setDropCoords(coords);
          handleConfirmNavigate(raw, coords);
        } else {
          handleSelectResult(raw, coords);
        }
      }
    };

    const onError = () => {
      setIsLocating(false);
    };

    const optionsHigh = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };
    const optionsLow = { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        console.warn("Search suggestions GPS high accuracy failed, trying low accuracy...", err);
        navigator.geolocation.getCurrentPosition(onSuccess, onError, optionsLow);
      },
      optionsHigh
    );
  };


  // Add a new empty stop
  const addStop = () => {
    setStops(prev => [...prev, '']);
    setActiveInput(stops.length); // focus the new stop
  };

  // Remove a stop by index
  const removeStop = (idx) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
    setActiveInput('drop');
  };

  // Update a stop value
  const updateStop = (idx, val) => {
    setStops(prev => prev.map((s, i) => i === idx ? val : s));
  };

  // When a suggestion is tapped
  const handleSelectResult = async (result, selectedCoords = null) => {
    const normalizedResult = typeof result === 'string'
      ? { title: result, address: result, coords: selectedCoords }
      : result;

    let resolvedSelection;
    try {
      resolvedSelection = await Promise.race([
        resolvePlaceSelection(normalizedResult),
        new Promise(r => setTimeout(() => r({
          title: normalizedResult.title || normalizedResult.address || '',
          address: normalizedResult.address || normalizedResult.title || '',
          coords: selectedCoords || DEFAULT_COORDS
        }), 2000))
      ]);
    } catch {
      resolvedSelection = {
        title: normalizedResult.title || normalizedResult.address || '',
        address: normalizedResult.address || normalizedResult.title || '',
        coords: selectedCoords || DEFAULT_COORDS
      };
    }

    const finalTitle = resolvedSelection.title || resolvedSelection.address;
    const resolvedCoords = selectedCoords || resolvedSelection.coords || DEFAULT_COORDS;

    resetAutocompleteSessionToken();

    if (activeInput === 'pickup') {
      setPickup(finalTitle);
      setPickupCoords(resolvedCoords);
      saveLocation({
        address: finalTitle,
        lat: resolvedCoords[1],
        lon: resolvedCoords[0],
      });
      setActiveInput('drop');
    } else if (activeInput === 'drop') {
      setDrop(finalTitle);
      setDropCoords(resolvedCoords);
      handleConfirmNavigate(finalTitle, resolvedCoords);
    } else if (typeof activeInput === 'number') {
      updateStop(activeInput, finalTitle);
      if (activeInput < stops.length - 1) {
        setActiveInput(activeInput + 1);
      } else {
        setActiveInput('drop');
      }
    }
  };

  const dismissKeyboard = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
    }
  };

  const handleBackClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Clear active focus to close mobile keyboard immediately
    if (document.activeElement && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (showMapPicker) {
      setShowMapPicker(false);
      return;
    }

    const targetHome = routePrefix ? `${routePrefix}/` : '/';

    // Delay navigation slightly to let keyboard close animation start 
    // and prevent ghost clicks on the underlying screen on mobile devices
    setTimeout(() => {
      if (window.history.length <= 1 || location.key === 'default') {
        navigate(targetHome, { replace: true });
      } else {
        try {
          navigate(-1);
        } catch {
          navigate(targetHome, { replace: true });
        }
      }
    }, 150);
  };

  return (
    <div className="h-[100dvh] min-h-0 bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans relative overflow-hidden flex flex-col">
      <div className="absolute -top-20 right-[-40px] h-48 w-48 rounded-full bg-orange-100/55 blur-3xl pointer-events-none" />
      <div className="absolute top-56 left-[-60px] h-56 w-56 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-16 right-[-40px] h-44 w-44 rounded-full bg-blue-100/50 blur-3xl pointer-events-none" />
      <AnimatePresence>
        {showMapPicker && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-[100] bg-white flex flex-col max-w-lg mx-auto"
          >
            {/* Map Header */}
            <div className="absolute top-0 left-0 right-0 z-20 px-5 pt-10 pb-4 bg-gradient-to-b from-white via-white/80 to-transparent">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowMapPicker(false)}
                  className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border border-slate-100 active:scale-95 transition-all"
                >
                  <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
                </button>
                <div className="flex-1 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Select Point</p>
                  <p className="text-[14px] font-semibold text-slate-900 truncate leading-tight">
                    {isGeocoding ? 'Locating...' : pickedAddress}
                  </p>
                </div>
              </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative bg-slate-200">
              {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 px-6 text-center">
                  <div className="rounded-3xl bg-white px-8 py-10 shadow-xl border border-slate-100">
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <X size={32} className="text-rose-400" />
                    </div>
                    <p className="text-[16px] font-bold text-slate-900">Config Error</p>
                    <p className="mt-2 text-[13px] font-medium text-slate-500">
                      Google Maps API Key is missing.
                    </p>
                  </div>
                </div>
              ) : loadError ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 px-6 text-center">
                  <div className="rounded-3xl bg-white px-8 py-10 shadow-xl border border-slate-100">
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle size={32} className="text-rose-400" />
                    </div>
                    <p className="text-[16px] font-bold text-slate-900">Load Failed</p>
                    <p className="mt-2 text-[13px] font-medium text-slate-500">
                      Map could not be loaded. Please check your browser console or network.
                    </p>
                  </div>
                </div>
              ) : isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={mapCenter}
                  zoom={16}
                  onLoad={(map) => (mapInstanceRef.current = map)}
                  onIdle={handleMapIdle}
                  onDragStart={() => setIsDragging(true)}
                  onClick={(e) => {
                    if (e?.latLng) {
                      const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                      setMapCenter(next);
                      lastCenterRef.current = next;
                      if (mapInstanceRef.current) mapInstanceRef.current.panTo(next);
                    }
                  }}
                  options={{
                    disableDefaultUI: true,
                    clickableIcons: false,
                    gestureHandling: 'greedy',
                  }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50">
                  <div className="relative">
                    <LoaderCircle size={44} className="animate-spin text-slate-300" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <MapIcon size={18} className="text-slate-200" />
                    </div>
                  </div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Initializing Maps</p>
                </div>
              )}

              {/* Central Pin - Uber Style */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[100%] pointer-events-none z-10">
                <div className="relative">
                  <motion.div
                    animate={isDragging || isGeocoding ? { y: -12 } : { y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow-2xl rotate-45 border-2 border-white">
                      <div className="-rotate-45">
                        <MapIcon size={18} className="text-white fill-white/20" />
                      </div>
                    </div>
                    {/* Stick */}
                    <div className="w-1 h-5 bg-slate-900 -mt-2 shadow-2xl" />
                  </motion.div>
                  {/* Shadow Dot */}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-1 bg-black/30 rounded-full blur-sm" />
                </div>
              </div>

              {/* Map Controls: Zoom In, Zoom Out, Current Location FAB */}
              <div className="absolute bottom-6 right-5 flex flex-col gap-2.5 z-20">
                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() || 16) + 1);
                    }
                  }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 text-lg font-black text-slate-900 active:scale-90 transition-all"
                  aria-label="Zoom in map"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() || 16) - 1);
                    }
                  }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 text-lg font-black text-slate-900 active:scale-90 transition-all"
                  aria-label="Zoom out map"
                >
                  -
                </button>
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all"
                  aria-label="Current location"
                >
                  {isLocating ? (
                    <LoaderCircle size={20} className="animate-spin text-slate-400" />
                  ) : (
                    <Navigation size={20} className="text-slate-900 fill-slate-900/10" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Actions */}
            <div className="px-5 pt-4 pb-10 bg-white border-t border-slate-50 space-y-4">
              <div className="flex items-center gap-3 py-1 px-1">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                  <MapPin size={20} className="text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[15px] font-bold text-slate-900 leading-none">Confirm Spot</h4>
                  <p className="text-[12px] font-medium text-slate-400 mt-1 line-clamp-1">{pickedAddress}</p>
                </div>
              </div>
              <button
                onClick={handleConfirmMapLocation}
                disabled={isGeocoding}
                className="w-full bg-slate-900 py-4 rounded-3xl text-white font-bold text-[15px] shadow-xl shadow-slate-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Check size={18} strokeWidth={3} />
                Confirm Location
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky top: header, location inputs, and action pills */}
      <div className="relative z-30 shrink-0 bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_100%)]">
        {/* Header */}
        <header>
          <div className="bg-white/70 backdrop-blur-md border-b border-white/70 shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
            <div className="px-5 py-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleBackClick}
                className="relative p-3 -ml-3 active:scale-90 transition-all rounded-full z-50 flex items-center justify-center shrink-0 cursor-pointer"
                aria-label="Go back"
              >
                <ArrowLeft size={22} className="text-slate-900" strokeWidth={3} />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ride</p>
                <h1 className="mt-0.5 text-[20px] font-bold text-slate-900 tracking-tight leading-none truncate">Where to?</h1>
              </div>
            </div>
          </div>
        </header>

        {/* Input Card */}
        <div className="relative z-10 px-5 pt-4">
          <div className="bg-white/80 backdrop-blur-md rounded-[22px] p-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] border border-white/80">
            <div className="space-y-3">

              {/* Pickup Row */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="w-5 h-5 rounded-full border-2 border-emerald-700 bg-white/70 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                  </div>
                </div>
                <div
                  className={`flex-1 flex items-center bg-white/70 border border-white/80 rounded-xl px-3 py-2 transition-all ${activeInput === 'pickup' ? 'ring-2 ring-emerald-200' : ''}`}
                  onClick={() => setActiveInput('pickup')}
                >
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 leading-none mb-1">
                      Pick up
                    </span>
                    <input
                      type="text"
                      value={pickup}
                      onChange={(e) => setPickup(sanitizeLocationInput(e.target.value))}
                      onFocus={() => setActiveInput('pickup')}
                      placeholder="Enter pickup location..."
                      className="w-full bg-transparent border-none text-[14px] font-medium text-slate-900 focus:outline-none placeholder:text-slate-300 p-0"
                    />
                  </div>
                  {pickup.length > 0 && (
                    <button onClick={() => setPickup('')} className="ml-2 shrink-0">
                      <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dotted connector */}
              <div className="ml-[9px] h-2 w-[1.5px] border-l-[1.5px] border-dotted border-slate-300/70" />

              {/* Dynamic Stops */}
              <AnimatePresence>
                {stops.map((stop, idx) => (
                  <motion.div
                    key={`stop-${idx}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className="w-5 h-5 rounded-full border-2 border-indigo-500 bg-white/70 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        </div>
                      </div>
                      <div
                        className={`flex-1 flex items-center rounded-xl px-3 py-2 transition-all ${stop.trim().length > 0
                            ? 'bg-white/90 border border-indigo-200 shadow-[0_10px_24px_rgba(99,102,241,0.10)]'
                            : 'bg-indigo-50/70 border border-indigo-100/70'
                          } ${activeInput === idx ? 'ring-2 ring-indigo-200' : ''}`}
                        onClick={() => setActiveInput(idx)}
                      >
                        <div className="min-w-0 flex-1 flex flex-col justify-center">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 leading-none mb-1">
                            Stop {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={stop}
                            autoFocus={activeInput === idx}
                            placeholder={`Enter stop ${idx + 1} location...`}
                            onFocus={() => setActiveInput(idx)}
                            onChange={(e) => updateStop(idx, sanitizeLocationInput(e.target.value))}
                            className={`w-full bg-transparent border-none text-[14px] font-medium text-slate-900 focus:outline-none p-0 ${stop.trim().length > 0 ? 'placeholder:text-slate-300' : 'placeholder:text-indigo-300'
                              }`}
                          />
                        </div>
                        {stop.length > 0 && (
                          <button onClick={() => updateStop(idx, '')} className="ml-2 shrink-0">
                            <X size={16} className="text-indigo-300 hover:text-indigo-600 transition-colors" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => removeStop(idx)}
                        className="w-7 h-7 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                      >
                        <Minus size={14} className="text-rose-500" strokeWidth={3} />
                      </button>
                    </div>
                    {/* Connector after each stop */}
                    <div className="ml-[9px] mt-3 h-2 w-[1.5px] border-l-[1.5px] border-dotted border-slate-300/70" />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Drop Row */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="w-5 h-5 rounded-full border-2 border-orange-600 bg-white/70 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
                  </div>
                </div>
                <div
                  className={`flex-1 flex items-center bg-white/70 border border-white/80 rounded-xl px-3 py-2 transition-all ${activeInput === 'drop' ? 'ring-2 ring-orange-200' : ''}`}
                  onClick={() => setActiveInput('drop')}
                >
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-600 leading-none mb-1">
                      Drop
                    </span>
                    <input
                      type="text"
                      value={drop}
                      autoFocus={activeInput === 'drop'}
                      placeholder="Enter drop location..."
                      onFocus={() => setActiveInput('drop')}
                      onChange={(e) => setDrop(sanitizeLocationInput(e.target.value))}
                      className="w-full bg-transparent border-none text-[14px] font-medium text-slate-900 focus:outline-none placeholder:text-slate-300 p-0"
                    />
                  </div>
                  {drop.length > 0 && (
                    <button onClick={() => setDrop('')} className="ml-2 shrink-0">
                      <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Action Pills */}
        <div className="relative z-10 flex gap-3 px-5 my-4">
          <button
            onClick={showMapToast}
            className="flex-1 flex items-center justify-center gap-2 bg-white/75 backdrop-blur-md border border-white/80 rounded-full py-2.5 shadow-[0_12px_26px_rgba(15,23,42,0.06)] active:scale-95 transition-all text-[13px] font-bold text-slate-800"
          >
            <MapPin size={16} className="text-slate-900" />
            <span>Select on map</span>
          </button>
          <button
            onClick={addStop}
            className="flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 shadow-[0_12px_26px_rgba(15,23,42,0.06)] active:scale-95 transition-all text-[13px] font-bold bg-white/75 backdrop-blur-md border border-white/80 text-slate-800"
          >
            <div className="w-4 h-4 rounded bg-indigo-500 flex items-center justify-center">
              <Plus size={12} className="text-white" strokeWidth={3} />
            </div>
            <span>Add stop {stops.length > 0 ? `(${stops.length})` : ''}</span>
          </button>
        </div>

        {/* Stop count chips */}
        {stops.length > 0 && (
          <div className="relative z-10 px-5 mb-2">
            <div className="flex gap-2 flex-wrap">
              {stops.map((s, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-white/75 backdrop-blur-md border border-white/80 rounded-full px-3 py-1 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[12px] font-bold text-slate-700 truncate max-w-[110px]">
                    {s.trim() || `Stop ${idx + 1}`}
                  </span>
                  <button onClick={() => removeStop(idx)}>
                    <X size={11} className="text-slate-400 hover:text-slate-700" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable search results / popular locations — dismisses keypad on scroll */}
      <div
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6"
        onScroll={dismissKeyboard}
        onTouchMove={dismissKeyboard}
      >
        <h2 className="text-[14px] font-bold text-slate-400 mb-3 ml-1 uppercase tracking-widest">
          {query.trim().length > 0 ? 'Search Results' : 'Popular Locations'}
        </h2>

        {isLoadingPopularLocations && query.trim().length === 0 ? (
          <div className="text-center py-12">
            <LoaderCircle size={28} className="mx-auto animate-spin text-slate-400" />
            <p className="mt-3 text-[15px] font-semibold text-slate-600">Loading nearby places...</p>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 overflow-hidden shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            {/* Quick Go to Current Location */}
            <motion.button
              whileTap={{ scale: 0.99 }}
              onClick={handleUseCurrentLocationResult}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-white/70 bg-emerald-50/30 hover:bg-emerald-50/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-100 shadow-sm flex items-center justify-center shrink-0">
                {isLocating ? (
                  <LoaderCircle size={18} className="animate-spin text-emerald-500" />
                ) : (
                  <Navigation size={18} className="text-emerald-500 fill-emerald-50" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-[15px] font-bold text-slate-900 leading-tight group-hover:text-emerald-600 transition-colors">Use Current Location</h4>
                <p className="text-[12px] text-slate-400 font-medium mt-0.5">Perfect for accurate pickup</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </motion.button>

            {searchResults.map((result, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/70 last:border-none hover:bg-white/60 active:bg-slate-100 transition-colors"
              >
                <div className="flex flex-col items-center shrink-0 gap-1.5 min-w-[40px] pt-1">
                  <MapPin size={20} className="text-slate-700" strokeWidth={2.5} />
                  {result.computedDistance !== undefined && result.computedDistance !== null && (
                    <span className="text-[10px] md:text-[11px] font-bold text-slate-400 leading-none text-center">
                      {result.computedDistance < 1
                        ? `${Math.round(result.computedDistance * 1000)} m`
                        : `${result.computedDistance.toFixed(result.computedDistance >= 10 ? 0 : 1)} km`}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h4 className="text-[15px] font-semibold text-slate-900 leading-tight">{result.title}</h4>
                  <p className="text-[13px] text-slate-500 font-medium mt-1 line-clamp-1">{result.address}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-3xl bg-white/80 border border-white/80 shadow-sm flex items-center justify-center mx-auto text-slate-400 text-[22px] font-bold">
              —
            </div>
            <p className="mt-3 text-[15px] font-semibold text-slate-600">
              {query.trim().length > 0 ? (
                <>
                  No results for <span className="text-slate-900">"{query}"</span>
                </>
              ) : (
                'No nearby places found for your selected location'
              )}
            </p>
            <p className="text-[13px] font-medium text-slate-400 mt-1">
              {query.trim().length > 0 ? 'Try a different search term' : 'Try searching or move the map to update suggestions'}
            </p>
          </div>
        )}
        {query.trim().length >= 3 && (
          <div className="mt-3 px-1">
            <p className="text-[11px] font-bold text-slate-400">
              {isSearchingLocations
                ? 'Searching locations inside your service zone...'
                : zonePaths.length
                  ? 'Showing zone-prioritized results after 3+ characters. Selections outside the zone are blocked.'
                  : 'Showing optimized search results after 3+ characters.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectLocation;
