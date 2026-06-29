const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const normalizeLatLngPoint = (point = {}) => {
  const lat = toFiniteNumber(point.lat ?? point.latitude);
  const lng = toFiniteNumber(point.lng ?? point.longitude ?? point.lon);

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
};

export const computeCentroid = (points = []) => {
  const normalized = points.map(normalizeLatLngPoint).filter(Boolean);

  if (!normalized.length) {
    return { lat: 0, lng: 0 };
  }

  const totals = normalized.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat,
      lng: accumulator.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: totals.lat / normalized.length,
    lng: totals.lng / normalized.length,
  };
};

export const sortCoordinatesRadially = (points = []) => {
  const normalized = points.map(normalizeLatLngPoint).filter(Boolean);

  if (normalized.length < 3) {
    return normalized;
  }

  const centroid = computeCentroid(normalized);

  return [...normalized].sort((left, right) => {
    const leftAngle = Math.atan2(left.lat - centroid.lat, left.lng - centroid.lng);
    const rightAngle = Math.atan2(right.lat - centroid.lat, right.lng - centroid.lng);
    return leftAngle - rightAngle;
  });
};

export const latLngPathFromPoints = (google, points = []) =>
  sortCoordinatesRadially(points)
    .map(normalizeLatLngPoint)
    .filter(Boolean)
    .map((point) => new google.maps.LatLng(point.lat, point.lng));

export const pointsFromLatLngPath = (path) => {
  if (!path || typeof path.getLength !== 'function') {
    return [];
  }

  const points = [];

  for (let index = 0; index < path.getLength(); index += 1) {
    const latLng = path.getAt(index);
    points.push({
      lat: latLng.lat(),
      lng: latLng.lng(),
    });
  }

  return points;
};

export const formatCoordinates = (points = [], format = 'latlng') => {
  const normalized = points.map(normalizeLatLngPoint).filter(Boolean);

  if (format === 'latlngNamed') {
    return normalized.map((point) => ({
      latitude: parseFloat(point.lat.toFixed(6)),
      longitude: parseFloat(point.lng.toFixed(6)),
    }));
  }

  return normalized;
};

export const parseIncomingCoordinates = (points = []) => {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map(normalizeLatLngPoint).filter(Boolean);
};
