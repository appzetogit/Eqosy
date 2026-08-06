import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Clock,
  Navigation,
  X,
  History,
  TrendingUp,
  ShieldCheck,
  Star,
  Info,
  MapPinned,
  Check,
  AlertTriangle
} from 'lucide-react';
import { userService } from '../../services/userService';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { useAppGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER } from '../../../admin/utils/googleMaps';
import toast from 'react-hot-toast';

const normalizeSearchValue = (value) => String(value || '').trim().toLowerCase();

const serializePackageForFlow = (pkg = {}) => ({
  id: pkg.id || '',
  serviceLocationId: pkg.serviceLocationId || '',
  serviceLocationName: pkg.serviceLocationName || '',
  packageTypeId: pkg.packageTypeId || '',
  packageTypeName: pkg.packageTypeName || '',
  destination: pkg.destination || '',
  availability: pkg.availability || 'available',
  vehicles: Array.isArray(pkg.vehicles)
    ? pkg.vehicles.map((vehicle, index) => ({
        id: vehicle.id || `${pkg.id || 'pkg'}:${vehicle.vehicleTypeId || index}`,
        vehicleTypeId: vehicle.vehicleTypeId || '',
        vehicleName: vehicle.vehicleName || 'Vehicle',
        capacity: Number(vehicle.capacity || 0),
        icon: vehicle.icon || '',
        iconType: vehicle.iconType || vehicle.vehicleName || 'car',
        dispatchType: String(vehicle.dispatchType || 'normal').trim().toLowerCase(),
        supportsBidding: ['bidding', 'both'].includes(String(vehicle.dispatchType || 'normal').trim().toLowerCase()),
        basePrice: Number(vehicle.basePrice || 0),
        freeDistance: Number(vehicle.freeDistance || 0),
        distancePrice: Number(vehicle.distancePrice || 0),
        freeTime: Number(vehicle.freeTime || 0),
        timePrice: Number(vehicle.timePrice || 0),
        serviceTax: Number(vehicle.serviceTax || 0),
        cancellationFee: Number(vehicle.cancellationFee || 0),
      }))
    : [],
});

const IntercityHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromCity, setFromCity] = useState('');
  const [rideMode, setRideMode] = useState('now');
  const [travelDate, setTravelDate] = useState(new Date().toISOString().split('T')[0]);
  const [tripType, setTripType] = useState('One Way');
  
  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);

  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);

  useEffect(() => {
    const loadPackages = async () => {
      try {
        setLoading(true);
        const response = await userService.getIntercityPackages();
        const results = Array.isArray(response?.results) ? response.results : [];
        setPackages(results);
        
        // Initial setup for fromCity if results exist
        if (results.length > 0 && !fromCity && results[0]?.serviceLocationName) {
          setFromCity(results[0].serviceLocationName);
        }
      } catch (err) {
        setError('Could not load intercity packages');
      } finally {
        setLoading(false);
      }
    };
    loadPackages();
  }, []);

  // Set current location on mount if allowed
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMapCenter(coords);
          setPickupCoords([coords.lng, coords.lat]);
          // We'll geocode this later if map is opened or automatically
          reverseGeocode(coords);
        },
        null,
        { enableHighAccuracy: true }
      );
    }
  }, [isLoaded]);

  const reverseGeocode = (coords) => {
    if (!window.google?.maps?.Geocoder) return;
    setIsGeocoding(true);
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: coords }, (results, status) => {
      setIsGeocoding(false);
      if (status === 'OK' && results?.[0]) {
        const address = results[0].formatted_address;
        setPickupAddress(address);
        
        // Find city name to filter packages
        const cityObj = results[0].address_components.find(c => 
          c.types.includes('locality') || c.types.includes('administrative_area_level_2')
        );
        if (cityObj) {
          const cityName = cityObj.long_name;
          // Check if this city exists in our packages
          const matched = packages.find(p => p.serviceLocationName.toLowerCase() === cityName.toLowerCase());
          if (matched) {
            setFromCity(matched.serviceLocationName);
          } else {
            setFromCity(cityName);
          }
        }
      }
    });
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
    reverseGeocode({ lat, lng });
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

  const filteredPackages = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);

    if (query) {
      return packages.filter((pkg) =>
        normalizeSearchValue(pkg.destination).includes(query) ||
        normalizeSearchValue(pkg.packageTypeName).includes(query) ||
        normalizeSearchValue(pkg.serviceLocationName).includes(query)
      );
    }

    return packages;
  }, [packages, searchQuery]);

  useEffect(() => {
    const trimmedQuery = String(searchQuery || '').trim();

    if (!trimmedQuery || trimmedQuery.length < 3 || !isLoaded) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return;
    }

    if (!window.google?.maps?.places?.AutocompleteService) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (!autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }

      setIsFetchingSuggestions(true);
      const request = {
        input: trimmedQuery,
        componentRestrictions: { country: 'in' },
        sessionToken: autocompleteSessionTokenRef.current || undefined,
      };

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (!active) return;
        setIsFetchingSuggestions(false);
        if (status === 'OK' && Array.isArray(predictions)) {
          setGoogleSuggestions(
            predictions.map((p) => ({
              id: p.place_id || p.description,
              label: p.structured_formatting?.main_text || p.description,
              secondaryText: p.structured_formatting?.secondary_text || '',
              description: p.description || '',
              placeId: p.place_id || '',
            }))
          );
        } else {
          setGoogleSuggestions([]);
        }
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, isLoaded]);

  const handleGoogleSuggestionSelect = (item) => {
    const destinationName = item.label;
    setSearchQuery(destinationName);

    // Look for a package that matches this destination city
    const matched = packages.find(p => 
      normalizeSearchValue(p.destination).includes(normalizeSearchValue(destinationName)) ||
      normalizeSearchValue(destinationName).includes(normalizeSearchValue(p.destination))
    );

    if (matched) {
      setFromCity(matched.serviceLocationName);
      handlePackageSelect(matched);
    } else {
      toast.error(`No intercity package is configured for the route to ${destinationName}. Please contact admin or configure it in the admin panel.`);
    }
  };

  const handlePackageSelect = (pkg) => {
    const flowPackage = serializePackageForFlow(pkg);
    const effectiveFromCity =
      flowPackage.serviceLocationName ||
      fromCity ||
      'Pickup City';

    navigate(`${routePrefix}/intercity/vehicle`, {
      state: {
        fromCity: effectiveFromCity,
        toCity: flowPackage.destination,
        tripType,
        rideMode,
        date: rideMode === 'now' ? 'Ride Now' : travelDate,
        selectedPackages: [flowPackage],
        pickupAddress,
        pickupCoords
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFBFF] max-w-lg mx-auto font-sans relative overflow-x-hidden">
      {/* Map Picker Modal */}
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
                  className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100"
                >
                  <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
                </motion.button>
                <div className="flex-1 bg-white rounded-[24px] shadow-lg border border-blue-50 px-5 py-4 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-1">Pinpoint Pickup</p>
                  <p className="text-[14px] font-bold text-slate-900 truncate leading-tight">
                    {isGeocoding ? 'Finding exact address...' : (pickupAddress || 'Set location on map')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 relative bg-slate-100">
              {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={mapCenter}
                  zoom={15}
                  onLoad={(map) => (mapInstanceRef.current = map)}
                  onIdle={handleMapIdle}
                  onDragStart={() => setIsDragging(true)}
                  onClick={(e) => {
                    if (e?.latLng) {
                      const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                      setMapCenter(next);
                      reverseGeocode(next);
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
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50 p-10 text-center">
                   <AlertTriangle size={40} className="text-amber-400" />
                   <p className="text-[14px] font-bold text-slate-500">
                     Map service unavailable. Please check your connection or API key.
                   </p>
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

              {/* Map Controls: Zoom In, Zoom Out, Use Current Location */}
              <div className="absolute bottom-10 right-6 flex flex-col gap-2.5 z-20">
                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() || 15) + 1);
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
                      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() || 15) - 1);
                    }
                  }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 text-lg font-black text-slate-900 active:scale-90 transition-all"
                  aria-label="Zoom out map"
                >
                  -
                </button>
                <button
                  onClick={handleUseCurrentLocation}
                  className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all"
                  aria-label="My location"
                >
                  {isLocating ? <LoaderCircle size={20} className="animate-spin text-blue-500" /> : <Navigation size={20} className="text-slate-900" />}
                </button>
              </div>
            </div>

            <div className="px-6 pt-6 pb-12 bg-white border-t border-slate-50">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const center = mapInstanceRef.current.getCenter();
                  setPickupCoords([center.lng(), center.lat()]);
                  setShowMapPicker(false);
                }}
                disabled={isGeocoding}
                className="w-full h-16 bg-blue-600 rounded-[22px] text-white font-black text-[16px] uppercase tracking-widest shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-40"
              >
                <Check size={20} strokeWidth={3} />
                Confirm Pickup
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 bg-[#FAFBFF]/80 backdrop-blur-md z-30">
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(routePrefix || '/')} 
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-gray-100"
        >
          <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
        </motion.button>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-100 shadow-sm">
          <ShieldCheck size={14} className="text-blue-600" />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Intercity Safe</span>
        </div>
      </header>

      <div className="px-6 pt-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1"
        >
          <h1 className="text-[32px] font-black text-slate-900 leading-tight tracking-tight">
            Intercity <span className="text-blue-600">Rides</span>
          </h1>
          <p className="text-[14px] font-bold text-slate-500 max-w-[280px]">
            City-to-city travel with live destination choices, just like taxi booking.
          </p>
        </motion.div>

        {/* Search & Mode Selection Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-8 bg-white rounded-[32px] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-gray-50"
        >
          {/* Trip Type Toggle */}
          <div className="flex bg-slate-50 p-1.5 rounded-2xl mb-6">
            {['One Way', 'Round Trip'].map(type => (
              <button
                key={type}
                onClick={() => setTripType(type)}
                className={`flex-1 py-3 rounded-xl text-[13px] font-black transition-all ${
                  tripType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {/* Pickup Location Selection */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 ml-1">Pickup from</p>
              <div className="flex flex-col gap-3">
                {/* Visual Address Bar */}
                <button
                  onClick={() => setShowMapPicker(true)}
                  className="w-full min-h-[64px] bg-slate-50 border-2 border-transparent hover:border-blue-100 hover:bg-white px-5 py-3 rounded-2xl flex items-center gap-4 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Navigation size={18} className="text-blue-500" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black text-slate-900 truncate">
                      {pickupAddress || 'Set Pickup on Map'}
                    </p>
                    <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">
                      {fromCity || 'Detecting City...'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Destination Search (To) */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 ml-1">Traveling to</p>
              <div className="relative group">
                <div className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors ${searchQuery ? 'text-blue-600' : 'text-slate-400'}`}>
                  <Search size={18} strokeWidth={2.5} />
                </div>
                
                <input
                  type="text"
                  placeholder="Search available destinations..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                  }}
                  className="w-full h-16 pl-14 pr-12 bg-slate-50 border-2 border-transparent focus:border-blue-100 focus:bg-white rounded-2xl text-[16px] font-bold text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
                
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 z-10"
                  >
                    <X size={14} />
                  </button>
                )}

                {/* Local & Google Suggestions Dropdown */}
                <AnimatePresence>
                  {searchQuery && (filteredPackages.length > 0 || googleSuggestions.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 max-h-80 overflow-y-auto"
                    >
                      {/* Active Packages */}
                      {filteredPackages.map((pkg) => (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => {
                            setFromCity(pkg.serviceLocationName);
                            setSearchQuery(pkg.destination);
                            handlePackageSelect(pkg);
                          }}
                          className="w-full px-5 py-4 text-left hover:bg-slate-50 flex items-center justify-between group border-b border-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                              <Navigation size={18} className="text-blue-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black uppercase tracking-wider">
                                  Package
                                </span>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                                  From {pkg.serviceLocationName}
                                </p>
                              </div>
                              <p className="text-[15px] font-black text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                <span className="text-slate-400">To</span> {pkg.destination}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">From</p>
                            <p className="text-[14px] font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                              ₹{pkg.vehicles?.[0]?.basePrice || '---'}
                            </p>
                          </div>
                        </button>
                      ))}

                      {/* Google Places Autocomplete */}
                      {googleSuggestions
                        .filter(g => !filteredPackages.some(pkg => normalizeSearchValue(pkg.destination).includes(normalizeSearchValue(g.label))))
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleGoogleSuggestionSelect(item)}
                            className="w-full px-5 py-4 text-left hover:bg-slate-50 flex items-center justify-between group border-b border-slate-50 last:border-0 transition-colors"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">
                                <MapPin size={18} className="text-slate-400 group-hover:text-blue-500" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[15px] font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                                  {item.label}
                                </p>
                                {item.secondaryText ? (
                                  <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{item.secondaryText}</p>
                                ) : null}
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
                          </button>
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Ride Mode & Date */}
            <div className="flex gap-3">
              <button
                onClick={() => setRideMode(rideMode === 'now' ? 'schedule' : 'now')}
                className={`flex-1 h-14 rounded-2xl border-2 flex items-center justify-center gap-2 transition-all ${
                  rideMode === 'schedule' ? 'border-blue-100 bg-blue-50/30 text-blue-600' : 'border-slate-50 bg-slate-50 text-slate-500'
                }`}
              >
                {rideMode === 'now' ? <Clock size={18} /> : <Calendar size={18} />}
                <span className="text-[14px] font-black uppercase tracking-wider">
                  {rideMode === 'now' ? 'Ride Now' : 'Scheduled'}
                </span>
              </button>
              
            </div>

            <AnimatePresence>
              {rideMode === 'schedule' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 ml-1">Travel Date</p>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={travelDate}
                      onChange={(e) => setTravelDate(e.target.value)}
                      className="w-full h-14 px-5 bg-slate-50 border-2 border-transparent rounded-2xl text-[15px] font-black text-slate-900 outline-none focus:border-blue-100 focus:bg-white transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Results Section (Same as before) */}
        <div className="mt-10 pb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
              {searchQuery ? 'Matching Destinations' : 'Available Destinations'}
              {searchQuery && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded-full">
                  {filteredPackages.length} Found
                </span>
              )}
            </h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-300">
                <LoaderCircle size={40} className="animate-spin text-blue-500" />
                <p className="text-[14px] font-bold">Syncing best routes...</p>
              </div>
            ) : filteredPackages.length > 0 ? (
              filteredPackages.map((pkg, idx) => (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handlePackageSelect(pkg)}
                  className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">From {pkg.serviceLocationName}</p>
                      </div>
                      <h4 className="text-[20px] font-black text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                        {pkg.destination}
                      </h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Starts at</p>
                      <p className="text-[20px] font-black text-slate-900">
                        ₹{pkg.vehicles?.[0]?.basePrice ? pkg.vehicles[0].basePrice.toLocaleString() : '---'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {pkg.vehicles?.slice(0, 3).map((v, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden">
                          <img src={v.icon || '/4_Taxi.png'} alt="" className="w-5 h-5 object-contain" />
                        </div>
                      ))}
                      {pkg.vehicles?.length > 3 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-900 text-white text-[9px] font-black flex items-center justify-center">
                          +{pkg.vehicles.length - 3}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] font-black text-slate-400 group-hover:text-blue-500 transition-colors uppercase tracking-widest">
                      Choose <ChevronRight size={14} strokeWidth={3} />
                    </div>
                  </div>
                </motion.div>
              ))
            ) : searchQuery ? (
              <div className="py-20 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <Search size={32} />
                </div>
                <h4 className="text-[18px] font-black text-slate-900">No Routes Found</h4>
                <p className="text-[14px] font-bold text-slate-400 mt-1">Try searching for a different city</p>
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <MapPin size={32} />
                </div>
                <h4 className="text-[18px] font-black text-slate-900">No Routes Available</h4>
                <p className="text-[14px] font-bold text-slate-400 mt-1">
                  Admin hasn't created any intercity packages for your location yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Info */}
      {!searchQuery && (
        <div className="px-6">
          <div className="bg-indigo-600 rounded-[32px] p-6 text-white overflow-hidden relative">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Star size={16} fill="white" className="text-white" />
                <span className="text-[11px] font-black uppercase tracking-widest opacity-80">Special Offer</span>
              </div>
              <h4 className="text-[22px] font-black leading-tight">First Intercity Trip? Get 20% Off!</h4>
              <button className="mt-4 px-5 py-2.5 bg-white text-indigo-600 rounded-xl text-[13px] font-black uppercase tracking-wider shadow-lg">
                View Promo
              </button>
            </div>
            <Sparkles className="absolute top-4 right-4 text-white/20 w-24 h-24 rotate-12" />
          </div>
        </div>
      )}

      {/* Bottom Nav Spacer */}
      <div className="h-20" />
    </div>
  );
};

export default IntercityHome;
