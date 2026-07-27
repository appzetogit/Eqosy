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
  || zone?._id
  || zone?.id
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
  const coordsRaw = zone?.geometry?.coordinates || zone?.coordinates;
  let source = coordsRaw;

  if (Array.isArray(source?.[0]) && Array.isArray(source?.[0]?.[0])) {
    source = source[0];
  }

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map(toZonePoint).filter(Boolean);
};

export const isPointInCircleZone = (point, zone) => {
  if (zone?.boundary_mode === 'circle' && zone?.circle_center?.lat != null && zone?.circle_center?.lng != null) {
    const centerLat = Number(zone.circle_center.lat);
    const centerLng = Number(zone.circle_center.lng);
    const radiusMeters = Number(zone.circle_radius_meters || 5000);

    const R = 6371000;
    const dLat = ((point.lat - centerLat) * Math.PI) / 180;
    const dLng = ((point.lng - centerLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((centerLat * Math.PI) / 180) *
        Math.cos((point.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    return dist <= radiusMeters;
  }
  return false;
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

  if (!zones.length) {
    return true;
  }

  const [lng, lat] = coords;
  const point = { lat: Number(lat), lng: Number(lng) };

  return zones.some((zone) => {
    if (zone?.boundary_mode === 'circle') {
      return isPointInCircleZone(point, zone);
    }

    const path = normalizeZonePath(zone);
    if (path.length >= 3 && isPointInPolygon(point, path)) {
      return true;
    }

    return isPointInCircleZone(point, zone);
  });
};

export const resolveServiceLocationIdFromCoords = (coords, zones = []) => {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return '';
  }

  const [lng, lat] = coords;
  const point = { lat: Number(lat), lng: Number(lng) };

  for (const zone of zones) {
    if (zone?.boundary_mode === 'circle' && isPointInCircleZone(point, zone)) {
      const serviceLocationId = getZoneServiceLocationId(zone);
      if (serviceLocationId) {
        return String(serviceLocationId);
      }
    }

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
