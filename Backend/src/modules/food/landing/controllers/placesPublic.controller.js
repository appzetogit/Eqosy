import { config } from '../../../../config/env.js';
import { logger } from '../../../../utils/logger.js';

const placesCache = new Map();
const detailsCache = new Map();

/**
 * GET /api/v1/food/location/places-autocomplete?input=...&lat=...&lng=...
 */
export async function placesAutocompleteController(req, res) {
  try {
    const input = String(req.query.input || '').trim();
    if (!input || input.length < 2) {
      return res.json({ success: true, predictions: [] });
    }

    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const cacheKey = `${input.toLowerCase()}_${lat ? lat.toFixed(2) : ''}_${lng ? lng.toFixed(2) : ''}`;

    const cached = placesCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return res.json({ success: true, predictions: cached.data });
    }

    const apiKey = config.googleMapsApiKey;
    if (!apiKey) {
      return res.json({ success: true, predictions: [] });
    }

    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:in&key=${apiKey}`;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      url += `&location=${lat},${lng}&radius=50000`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && Array.isArray(data.predictions)) {
      const predictions = data.predictions.map((p) => ({
        placeId: p.place_id,
        description: p.description,
        title: p.structured_formatting?.main_text || p.description.split(',')[0],
        subtitle: p.structured_formatting?.secondary_text || p.description.split(',').slice(1).join(',').trim(),
      }));

      placesCache.set(cacheKey, { data: predictions, ts: Date.now() });
      if (placesCache.size > 2000) {
        placesCache.delete(placesCache.keys().next().value);
      }

      return res.json({ success: true, predictions });
    }

    return res.json({ success: true, predictions: [] });
  } catch (err) {
    logger.warn(`[placesAutocompleteController] Error: ${err.message}`);
    return res.json({ success: true, predictions: [] });
  }
}

/**
 * GET /api/v1/food/location/place-details?placeId=...
 */
export async function placeDetailsController(req, res) {
  try {
    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) {
      return res.status(400).json({ success: false, message: 'placeId is required' });
    }

    const cached = detailsCache.get(placeId);
    if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
      return res.json({ success: true, result: cached.data });
    }

    const apiKey = config.googleMapsApiKey;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Google Maps key not configured' });
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address,name,address_components&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.result) {
      const r = data.result;
      const comps = r.address_components || [];
      const getComp = (types) => comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name || '';

      const details = {
        name: r.name || '',
        formattedAddress: r.formatted_address || '',
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
        city: getComp(['locality', 'administrative_area_level_2']),
        state: getComp(['administrative_area_level_1']),
        area: getComp(['sublocality', 'sublocality_level_1', 'neighborhood']),
        pincode: getComp(['postal_code']),
      };

      detailsCache.set(placeId, { data: details, ts: Date.now() });
      if (detailsCache.size > 2000) {
        detailsCache.delete(detailsCache.keys().next().value);
      }

      return res.json({ success: true, result: details });
    }

    return res.status(404).json({ success: false, message: data.error_message || 'Place not found' });
  } catch (err) {
    logger.warn(`[placeDetailsController] Error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
}
