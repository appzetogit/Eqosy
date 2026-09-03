export const LOCATION_STORAGE_KEY = 'eqosy:lastLocation';
export const USER_LOCATION_KEY = 'userLocation';
export const LOCATION_UPDATED_EVENT = 'eqosy:location-updated';

export const DEFAULT_LOCATION_LABEL = 'Choose your location';
export const DEFAULT_LOCATION_COORDS = [78.4867, 17.385];

export const getSavedLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 1. Priority: Read Food/Grocery location key userLocation FIRST for full accuracy
    const foodSaved = JSON.parse(window.localStorage.getItem(USER_LOCATION_KEY) || '{}');
    if (foodSaved?.latitude && foodSaved?.longitude) {
      const lat = Number(foodSaved.latitude);
      const lon = Number(foodSaved.longitude);
      const address = String(foodSaved.formattedAddress || foodSaved.address || foodSaved.city || '').trim();
      const area = String(foodSaved.area || '').trim();
      const city = String(foodSaved.city || '').trim();
      const state = String(foodSaved.state || '').trim();
      if (address) {
        return {
          address,
          lat,
          lon,
          area,
          city,
          state,
          formattedAddress: address,
        };
      }
    }

    // 2. Fallback to Taxi key eqosy:lastLocation
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    let lat = Number(saved?.lat);
    let lon = Number(saved?.lon);
    let address = String(saved?.address || '').trim();
    let updatedAt = Number(saved?.updatedAt);

    if (!address && !Number.isFinite(lat)) return null;

    return {
      address,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  } catch {
    return null;
  }
};

export const getSavedLocationLabel = () => (
  String(getSavedLocation()?.address || '').trim() || DEFAULT_LOCATION_LABEL
);

export const getSavedLocationCoords = () => {
  const saved = getSavedLocation();
  if (saved && Number.isFinite(saved.lon) && Number.isFinite(saved.lat)) {
    return [saved.lon, saved.lat];
  }

  return null;
};

export const saveLocation = (nextLocation = {}) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const previous = getSavedLocation() || {};
  const next = {
    ...previous,
    ...nextLocation,
    updatedAt: Date.now()
  };

  try {
    // Write to Taxi location key
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(next));

    // Also write to Food / Grocery location key so Food & Grocery sync instantly!
    if (next.lat && next.lon) {
      const foodLocObj = {
        latitude: Number(next.lat),
        longitude: Number(next.lon),
        address: next.address || '',
        formattedAddress: next.address || '',
        city: next.city || next.address || 'Current Location',
        area: next.area || next.address || ''
      };
      window.localStorage.setItem(USER_LOCATION_KEY, JSON.stringify(foodLocObj));
    }

    // Trigger all location change events for live UI reactivity across all modules
    window.dispatchEvent(new Event(LOCATION_UPDATED_EVENT));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('userLocationUpdated', { detail: next }));
  } catch {
    // ignore storage failures
  }

  return next;
};
