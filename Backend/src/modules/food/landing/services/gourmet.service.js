import mongoose from 'mongoose';
import { FoodGourmetRestaurant } from '../models/gourmetRestaurant.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';

const isPointInPolygon = (lat, lng, polygon = []) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude;
        const yi = polygon[i].latitude;
        const xj = polygon[j].longitude;
        const yj = polygon[j].latitude;
        const intersect =
            yi > lat !== yj > lat &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

export const getPublicGourmetRestaurants = async (zoneId = null, lat = null, lng = null) => {
    const docs = await FoodGourmetRestaurant.find({ isActive: true })
        .sort({ priority: 1, createdAt: -1 })
        .lean();

    const restaurantIds = docs.map((d) => d.restaurantId);
    if (!restaurantIds.length) return [];

    let resolvedZoneId = zoneId && mongoose.Types.ObjectId.isValid(String(zoneId).trim())
        ? new mongoose.Types.ObjectId(String(zoneId).trim())
        : null;

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (!resolvedZoneId && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        try {
            const zones = await FoodZone.find({ isActive: true }).lean();
            for (const zone of zones) {
                const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
                if (coords.length >= 3 && isPointInPolygon(latNum, lngNum, coords)) {
                    resolvedZoneId = zone._id;
                    break;
                }
            }
        } catch (err) {
            console.error('[Gourmet-Service] Error detecting zone by lat/lng:', err);
        }
    }

    const restaurantQuery = {
        _id: { $in: restaurantIds },
        status: { $ne: 'rejected' }
    };

    if (resolvedZoneId) {
        restaurantQuery.$or = [
            { zoneId: resolvedZoneId },
            { zoneId: String(resolvedZoneId) }
        ];
    }

    const restaurants = await FoodRestaurant.find(restaurantQuery)
        .select('restaurantName area city profileImage coverImages menuImages rating cuisines slug pureVegRestaurant location estimatedDeliveryTime zoneId offer')
        .lean();

    const restaurantMap = new Map(restaurants.map((r) => [r._id.toString(), r]));

    return docs
        .filter((item) => restaurantMap.has(item.restaurantId.toString()))
        .map((item) => {
            const r = restaurantMap.get(item.restaurantId.toString());
            return {
                ...item,
                restaurant: r ? {
                    _id: r._id,
                    name: r.restaurantName,
                    restaurantName: r.restaurantName,
                    rating: r.rating || 0,
                    profileImage: r.profileImage ? { url: r.profileImage } : null,
                    coverImages: r.coverImages || [],
                    menuImages: r.menuImages || [],
                    area: r.area,
                    city: r.city,
                    cuisines: r.cuisines || [],
                    slug: r.slug,
                    pureVegRestaurant: r.pureVegRestaurant,
                    location: r.location,
                    estimatedDeliveryTime: r.estimatedDeliveryTime,
                    zoneId: r.zoneId,
                    offer: r.offer
                } : null
            };
        });
};


