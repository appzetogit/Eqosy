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
    // 1. Priority: Read Taxi key eqosy:lastLocation FIRST for real user pickup location
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    let lat = Number(saved?.lat);
    let lon = Number(saved?.lon);
    let address = String(saved?.address || '').trim();
    let updatedAt = Number(saved?.updatedAt);

    if (address && Number.isFinite(lat) && Number.isFinite(lon)) {
      return {
        address,
        lat,
        lon,
        area: String(saved?.area || '').trim(),
        city: String(saved?.city || '').trim(),
        state: String(saved?.state || '').trim(),
        formattedAddress: address,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
      };
    }

    // 2. Fallback to Food/Grocery location key userLocation
    const foodSaved = JSON.parse(window.localStorage.getItem(USER_LOCATION_KEY) || '{}');
    if (foodSaved?.latitude && foodSaved?.longitude) {
      const foodLat = Number(foodSaved.latitude);
      const foodLon = Number(foodSaved.longitude);
      const foodAddress = String(foodSaved.formattedAddress || foodSaved.address || foodSaved.city || '').trim();
      const area = String(foodSaved.area || '').trim();
      const city = String(foodSaved.city || '').trim();
      const state = String(foodSaved.state || '').trim();
      if (foodAddress && Number.isFinite(foodLat) && Number.isFinite(foodLon)) {
        return {
          address: foodAddress,
          lat: foodLat,
          lon: foodLon,
          area,
          city,
          state,
          formattedAddress: foodAddress,
          updatedAt: null,
        };
      }
    }

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

const SEARCH_HISTORY_KEY = 'eqosy:taxiSearchHistory';
const SEARCH_HISTORY_LIMIT = 8;

export const getSearchHistory = () => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.title && Array.isArray(item?.coords)) : [];
  } catch {
    return [];
  }
};

export const addSearchHistory = ({ title, address, coords }) => {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || !Array.isArray(coords) || coords.length !== 2) return;
  const entry = { title: cleanTitle, address: String(address || cleanTitle).trim(), coords };
  const next = [
    entry,
    ...getSearchHistory().filter((item) => item.title.toLowerCase() !== cleanTitle.toLowerCase()),
  ].slice(0, SEARCH_HISTORY_LIMIT);
  try {
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
};

export const clearSearchHistory = () => {
  try {
    window.localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch {
    // ignore storage failures
  }
};
