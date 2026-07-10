export const unwrapZoneResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || payload?.zones || (Array.isArray(payload) ? payload : []);
};

export const getZoneServiceLocationId = (zone) =>
  zone?.service_location_id?._id
  || zone?.service_location_id?.id
  || zone?.service_location_id
  || zone?.service_location?._id
  || zone?.service_location?.id
  || zone?.service_location
  || '';

export const isZoneActive = (zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0;

const toZonePoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    const [lng, lat] = point;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }
  }

  if (point && typeof point === 'object') {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude ?? point.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
};

export const normalizeZonePath = (zone) => {
  const source = Array.isArray(zone?.coordinates?.[0]) && Array.isArray(zone?.coordinates?.[0]?.[0])
    ? zone.coordinates[0]
    : zone?.coordinates;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map(toZonePoint).filter(Boolean);
};

export const isPointInPolygon = (point, polygon) => {
  if (!point || polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

export const getZonePathsFromZones = (zones = []) =>
  zones.map(normalizeZonePath).filter((path) => path.length >= 3);

export const isPointInAnyZone = (point, zonePaths = []) => {
  if (!zonePaths.length) {
    return false;
  }

  return zonePaths.some((path) => isPointInPolygon(point, path));
};

export const isCoordsInZones = (coords, zones = []) => {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return false;
  }

  const [lng, lat] = coords;
  const point = { lat: Number(lat), lng: Number(lng) };
  const zonePaths = getZonePathsFromZones(zones);

  return isPointInAnyZone(point, zonePaths);
};

export const resolveServiceLocationIdFromCoords = (coords, zones = []) => {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return '';
  }

  const [lng, lat] = coords;
  const point = { lat: Number(lat), lng: Number(lng) };

  for (const zone of zones) {
    const path = normalizeZonePath(zone);
    if (path.length >= 3 && isPointInPolygon(point, path)) {
      const serviceLocationId = getZoneServiceLocationId(zone);
      if (serviceLocationId) {
        return String(serviceLocationId);
      }
    }
  }

  return '';
};

export const fetchActiveRideZones = async (api, serviceLocationId = '') => {
  const response = await api.get('/admin/zones');
  const zones = unwrapZoneResults(response).filter(isZoneActive);

  if (!serviceLocationId) {
    return zones;
  }

  return zones.filter((zone) => String(getZoneServiceLocationId(zone)) === String(serviceLocationId));
};

export const getBoundsFromPaths = (paths) => {
  if (!paths.length) {
    return null;
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  paths.forEach((path) => {
    path.forEach((point) => {
      north = Math.max(north, point.lat);
      south = Math.min(south, point.lat);
      east = Math.max(east, point.lng);
      west = Math.min(west, point.lng);
    });
  });

  if (![north, south, east, west].every(Number.isFinite)) {
    return null;
  }

  return { north, south, east, west };
};
