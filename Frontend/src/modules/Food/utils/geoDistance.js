/**
 * Utility functions for calculating distance between GPS location and selected addresses.
 */

/**
 * Calculate Haversine distance in kilometers between two lat/lng points.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers rounded to 1 decimal place (e.g. 13.7)
 */
export function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (
    !Number.isFinite(nLat1) ||
    !Number.isFinite(nLon1) ||
    !Number.isFinite(nLat2) ||
    !Number.isFinite(nLon2)
  ) {
    return 0;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = (nLat2 - nLat1) * (Math.PI / 180);
  const dLon = (nLon2 - nLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * (Math.PI / 180)) *
      Math.cos(nLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10;
}

/**
 * Safely extracts latitude and longitude from various location object formats
 * (including GeoJSON coordinates arrays [lng, lat], lat/lng, or latitude/longitude).
 * @param {object} loc 
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function extractCoords(loc) {
  if (!loc || typeof loc !== "object") return null;

  let lat = loc.latitude ?? loc.lat;
  let lng = loc.longitude ?? loc.lng;

  if ((!lat || !lng) && Array.isArray(loc.location?.coordinates)) {
    // GeoJSON Point format: [longitude, latitude]
    lng = loc.location.coordinates[0];
    lat = loc.location.coordinates[1];
  }

  const nLat = Number(lat);
  const nLng = Number(lng);

  if (Number.isFinite(nLat) && Number.isFinite(nLng) && (nLat !== 0 || nLng !== 0)) {
    return { latitude: nLat, longitude: nLng };
  }

  return null;
}
