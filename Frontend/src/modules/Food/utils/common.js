/**
 * Common utility functions for the Food module
 */

/**
 * Normalizes an image URL to handle relative paths and backend origins
 */
export const normalizeImageUrl = (imageUrl, backendOrigin = "") => {
  if (typeof imageUrl !== "string") return "";
  const trimmed = imageUrl.trim();
  if (!trimmed || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed;

  const appProtocol = typeof window !== "undefined" ? window.location?.protocol : "";
  const appHost = typeof window !== "undefined" ? window.location?.hostname : "";

  let normalized = trimmed
    .replace(/\\/g, "/")
    .replace(/^(https?):\/(?!\/)/i, "$1://")
    .replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");

  if (/^\/\//.test(normalized)) normalized = `${appProtocol || "https:"}${normalized}`;

  if (/^(https?:)?\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized, window.location.origin);
      if (appHost && !/^(localhost|127\.0\.0\.1)$/i.test(appHost) && /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) {
        const originToUse = (backendOrigin && String(backendOrigin).startsWith('http'))
          ? backendOrigin
          : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');
        const backendUrl = new URL(originToUse);
        parsed.protocol = backendUrl.protocol;
        parsed.hostname = backendUrl.hostname;
        parsed.port = backendUrl.port;
      }
      if (appProtocol === "https:" && parsed.protocol === "http:") parsed.protocol = "https:";
      const finalUrl = parsed.toString();
      const hasSigned = /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(finalUrl);
      return hasSigned ? finalUrl : encodeURI(finalUrl);
    } catch {
      return normalized;
    }
  }

  const absolutePath = normalized.startsWith("/")
    ? `${backendOrigin}${normalized}`
    : `${backendOrigin}/${normalized.replace(/^\.?\/*/, "")}`;
  return absolutePath;
};

/**
 * Extracts a list of image URLs from a source (string, array of strings, or object with image properties)
 */
export const extractImages = (source, backendOrigin = "") => {
  if (!source) return [];
  const normalize = (val) => {
    if (!val) return "";
    if (typeof val === "string") return normalizeImageUrl(val, backendOrigin);
    if (typeof val === "object") {
      const src = val.url || val.secure_url || val.imageUrl || val.image || val.src || "";
      return typeof src === "string" ? normalizeImageUrl(src, backendOrigin) : "";
    }
    return "";
  };

  const candidates = Array.isArray(source) ? source.map(normalize) : [normalize(source)];
  return candidates.filter(Boolean);
};

/**
 * Calculates distance between two coordinates in kilometers using Haversine formula
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Formats distance for display
 */
export const formatDistance = (distanceInKm) => {
  if (distanceInKm === null || distanceInKm === undefined) return "1.2 km";
  if (distanceInKm >= 1) {
    return `${distanceInKm.toFixed(1)} km`;
  } else {
    return `${Math.round(distanceInKm * 1000)} m`;
  }
};

/**
 * Slugifies a string for use in URLs or as identifiers
 */
export const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Resolves accurate order distance in km for display across all order screens
 */
export const getOrderDisplayDistance = (orderLike) => {
  if (!orderLike) return "1.2";
  const pricing = orderLike?.pricing || orderLike?.rawOrderData?.pricing || {};
  const breakdownDistance = parseFloat(pricing?.deliveryFeeBreakdown?.distanceKm);
  const pricingDistance = parseFloat(pricing?.distanceKm);
  const orderDistance = parseFloat(orderLike?.distanceKm ?? orderLike?.rawOrderData?.distanceKm);
  const directDistance = parseFloat(orderLike?.distance ?? orderLike?.rawOrderData?.distance);

  const rawDist = (!isNaN(breakdownDistance) && breakdownDistance >= 0)
    ? breakdownDistance
    : (!isNaN(pricingDistance) && pricingDistance >= 0)
    ? pricingDistance
    : (!isNaN(orderDistance) && orderDistance >= 0)
    ? orderDistance
    : (!isNaN(directDistance) && directDistance >= 0)
    ? directDistance
    : null;

  if (rawDist !== null && rawDist > 0 && rawDist < 100) {
    return rawDist % 1 === 0 ? rawDist.toFixed(0) : rawDist.toFixed(1);
  }

  // Calculate distance dynamically from coordinates if distance is missing or 0
  const restLoc =
    orderLike?.rawRestaurantLocation ||
    (typeof orderLike?.restaurantLocation === 'object' ? orderLike?.restaurantLocation : null) ||
    orderLike?.restaurantId?.location ||
    orderLike?.restaurantId ||
    {};
  const restCoords = Array.isArray(restLoc.coordinates) ? restLoc.coordinates : [];
  const restLat = parseFloat(orderLike?.restaurant_lat ?? orderLike?.restaurantLat ?? restLoc.latitude ?? restLoc.lat ?? (restCoords.length >= 2 ? restCoords[1] : NaN));
  const restLng = parseFloat(orderLike?.restaurant_lng ?? orderLike?.restaurantLng ?? restLoc.longitude ?? restLoc.lng ?? (restCoords.length >= 2 ? restCoords[0] : NaN));

  const custLoc = orderLike?.deliveryAddress?.location || orderLike?.address?.location || orderLike?.deliveryAddress || orderLike?.address || {};
  const custCoords = Array.isArray(custLoc.coordinates) ? custLoc.coordinates : [];
  const custLat = parseFloat(custLoc.latitude ?? custLoc.lat ?? (custCoords.length >= 2 ? custCoords[1] : NaN));
  const custLng = parseFloat(custLoc.longitude ?? custLoc.lng ?? (custCoords.length >= 2 ? custCoords[0] : NaN));

  if (!isNaN(restLat) && !isNaN(restLng) && !isNaN(custLat) && !isNaN(custLng)) {
    const calcDist = calculateDistance(restLat, restLng, custLat, custLng);
    if (calcDist && calcDist > 0 && calcDist < 100) {
      return calcDist % 1 === 0 ? calcDist.toFixed(0) : calcDist.toFixed(1);
    }
  }

  if (rawDist !== null) {
    return rawDist % 1 === 0 ? rawDist.toFixed(0) : rawDist.toFixed(1);
  }

  return "1.2";
};

