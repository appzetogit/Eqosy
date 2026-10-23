import { config } from '../../../../config/env.js';
import { logger } from '../../../../utils/logger.js';

// Cache recent route calculations in memory (15 min TTL) to save costs and provide instant responses
const roadDistanceCache = new Map();

/**
 * Fetches actual driving road distance from Google Directions API.
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<{ distanceKm: number, distanceMeters: number, durationMins: number, polyline: string } | null>}
 */
export async function getGoogleRoadDistance(origin, destination) {
  const oLat = Number(origin?.lat ?? origin?.latitude);
  const oLng = Number(origin?.lng ?? origin?.longitude);
  const dLat = Number(destination?.lat ?? destination?.latitude);
  const dLng = Number(destination?.lng ?? destination?.longitude);

  if (!Number.isFinite(oLat) || !Number.isFinite(oLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
    return null;
  }

  // Cache key rounded to ~100m precision (3 decimal places)
  const cacheKey = `${oLat.toFixed(3)},${oLng.toFixed(3)}->${dLat.toFixed(3)},${dLng.toFixed(3)}`;
  const cached = roadDistanceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    return cached.data;
  }

  const apiKey = config.googleMapsApiKey;
  if (!apiKey) {
    logger.warn('Google Maps API key missing. Road distance fetch skipped.');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const originStr = `${oLat},${oLng}`;
    const destStr = `${dLat},${dLng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&mode=driving&key=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
      const leg = data.routes[0].legs[0];
      const distanceMeters = Number(leg.distance?.value || 0);
      const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
      const durationMins = Math.max(1, Math.round(Number(leg.duration?.value || 0) / 60));
      const polyline = data.routes[0].overview_polyline?.points || '';

      const result = { distanceKm, distanceMeters, durationMins, polyline };
      roadDistanceCache.set(cacheKey, { data: result, ts: Date.now() });

      if (roadDistanceCache.size > 2000) {
        const oldestKey = roadDistanceCache.keys().next().value;
        roadDistanceCache.delete(oldestKey);
      }

      return result;
    } else {
      logger.warn(`Google Directions API status: ${data.status}. Message: ${data.error_message || 'No route found'}`);
    }
  } catch (err) {
    logger.warn(`[getGoogleRoadDistance] Error fetching from Google: ${err.message}`);
  }

  return null;
}

/**
 * Fetches an encoded polyline from Google Directions API.
 * This should be called ONLY ONCE per order assignment to save costs.
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<string>} - Encoded polyline points
 */
export async function fetchPolyline(origin, destination) {
  // Check if we already have it in roadDistanceCache
  const oLat = Number(origin?.lat ?? origin?.latitude);
  const oLng = Number(origin?.lng ?? origin?.longitude);
  const dLat = Number(destination?.lat ?? destination?.latitude);
  const dLng = Number(destination?.lng ?? destination?.longitude);
  if (Number.isFinite(oLat) && Number.isFinite(oLng) && Number.isFinite(dLat) && Number.isFinite(dLng)) {
    const cacheKey = `${oLat.toFixed(3)},${oLng.toFixed(3)}->${dLat.toFixed(3)},${dLng.toFixed(3)}`;
    const cached = roadDistanceCache.get(cacheKey);
    if (cached?.data?.polyline) {
      return cached.data.polyline;
    }
  }

  const roadData = await getGoogleRoadDistance(origin, destination);
  if (roadData?.polyline) {
    return roadData.polyline;
  }

  return '';
}
