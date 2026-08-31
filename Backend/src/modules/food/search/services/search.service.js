import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import mongoose from 'mongoose';

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items, 
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const { 
        q, 
        lat, 
        lng, 
        radiusKm = 20, 
        categoryId, 
        minRating, 
        maxDeliveryTime, 
        isVeg,
        page = 1,
        limit = 20,
        zoneId,
        pricingAttributes,
        isRestaurant
    } = query;

    const skip = (page - 1) * limit;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // Base conditions
    const baseRestaurantConditions = { status: { $ne: 'rejected' } };
    const andConditions = [];

    // Resolve target zone: either explicitly passed or auto-detected from user's current lat/lng coordinates
    let resolvedZoneId = zoneId && mongoose.Types.ObjectId.isValid(String(zoneId).trim())
        ? new mongoose.Types.ObjectId(String(zoneId).trim())
        : null;

    if (!resolvedZoneId && lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
            try {
                const { findMatchingZone } = await import('../../restaurant/services/zone.service.js');
                const matchedZone = await findMatchingZone(latNum, lngNum);
                if (matchedZone?._id) {
                    resolvedZoneId = new mongoose.Types.ObjectId(String(matchedZone._id));
                }
            } catch (err) {
                console.error("[Search-Service] Failed to auto-detect zone from lat/lng:", err);
            }
        }
    }

    if (resolvedZoneId) {
        andConditions.push({
            $or: [
                { zoneId: resolvedZoneId },
                { zoneId: String(resolvedZoneId) }
            ]
        });
    }

    if (isRestaurant === 'false') {
        baseRestaurantConditions.isRestaurant = false;
    } else if (isRestaurant === 'true') {
        baseRestaurantConditions.isRestaurant = { $ne: false };
    }

    if (isVeg === 'true') {
        baseRestaurantConditions.pureVegRestaurant = true;
    }

    if (pricingAttributes) {
        let attrs = [];
        if (Array.isArray(pricingAttributes)) {
            attrs = pricingAttributes;
        } else if (typeof pricingAttributes === 'string') {
            attrs = pricingAttributes.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (attrs.length > 0) {
            baseRestaurantConditions.pricingAttributes = { $all: attrs };
        }
    }

    if (minRating) {
        baseRestaurantConditions.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        baseRestaurantConditions.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime) };
    }

    // Helper to construct full query without losing $and zone conditions
    const buildRestaurantQuery = (extraConditions = {}) => {
        const queryObj = { ...baseRestaurantConditions, ...extraConditions };
        if (andConditions.length > 0) {
            queryObj.$and = queryObj.$and ? [...queryObj.$and, ...andConditions] : [...andConditions];
        }
        return queryObj;
    };

    let restaurantIds = new Set();
    let restaurantDetailsMap = new Map();

    // Resolve category if passed (by ObjectId, slug, or name)
    let categoryObj = null;
    if (categoryId) {
        const rawCat = String(categoryId).trim();
        if (mongoose.Types.ObjectId.isValid(rawCat)) {
            categoryObj = await FoodCategory.findById(rawCat).lean();
        }
        if (!categoryObj) {
            const catRegex = new RegExp(`^${rawCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            categoryObj = await FoodCategory.findOne({
                $or: [
                    { slug: rawCat.toLowerCase() },
                    { name: catRegex }
                ]
            }).lean();
        }
    }

    let results = [];

    // 3. Search Matching (Text Query or Category Selected)
    if (regex || categoryObj) {
        // Scope food item search to restaurants matching zone/filters
        const eligibleRestaurantsForZone = await FoodRestaurant.find(buildRestaurantQuery()).lean();
        const restaurantMap = new Map(eligibleRestaurantsForZone.map(r => [r._id.toString(), r]));
        const eligibleRestIds = eligibleRestaurantsForZone.map(r => r._id);

        let matchedRestaurants = [];

        // A. Search by Restaurant Name / Cuisine / Area / City if regex present
        if (regex) {
            matchedRestaurants = await FoodRestaurant.find(
                buildRestaurantQuery({
                    $or: [
                        { restaurantName: { $regex: regex } },
                        { cuisines: { $regex: regex } },
                        { area: { $regex: regex } },
                        { city: { $regex: regex } }
                    ]
                })
            ).limit(limit * 2).lean();
        }

        const restaurantResultsMap = new Map();
        matchedRestaurants.forEach(r => {
            restaurantResultsMap.set(r._id.toString(), {
                ...r,
                matchType: 'restaurant',
                matchedDishes: []
            });
        });

        // B. Search Food Items by text query and/or category
        const foodFilters = {
            approvalStatus: { $ne: 'rejected' },
            isActive: { $ne: false },
            isAvailable: { $ne: false },
            restaurantId: { $in: eligibleRestIds }
        };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';

        const foodOrConditions = [];
        if (regex) {
            foodOrConditions.push(
                { name: { $regex: regex } },
                { description: { $regex: regex } },
                { categoryName: { $regex: regex } }
            );
        }
        if (categoryObj) {
            const catNameRx = new RegExp(categoryObj.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            foodOrConditions.push(
                { categoryId: categoryObj._id },
                { categoryName: catNameRx }
            );
        }

        if (foodOrConditions.length > 0) {
            foodFilters.$or = foodOrConditions;
        }

        const matchedFoods = await FoodItem.find(foodFilters).limit(limit * 15).lean();

        const restaurantDishesMap = new Map();
        const dishResults = [];

        matchedFoods.forEach(food => {
            const restId = food.restaurantId?.toString();
            const rest = restaurantMap.get(restId);
            if (rest) {
                const dishObj = {
                    itemId: food._id,
                    name: food.name,
                    image: food.image,
                    price: food.price,
                    foodType: food.foodType || (rest.pureVegRestaurant ? 'Veg' : 'Non-Veg'),
                    description: food.description
                };

                if (!restaurantDishesMap.has(restId)) {
                    restaurantDishesMap.set(restId, []);
                }
                restaurantDishesMap.get(restId).push(dishObj);

                if (!restaurantResultsMap.has(restId)) {
                    restaurantResultsMap.set(restId, {
                        ...rest,
                        matchType: 'restaurant',
                        matchedDishes: []
                    });
                }

                dishResults.push({
                    ...rest,
                    matchType: 'food',
                    matchedDish: food.name,
                    matchedDishImage: food.image,
                    matchedDishId: food._id,
                    matchedDishPrice: food.price,
                    matchedDishFoodType: food.foodType || (rest.pureVegRestaurant ? 'Veg' : 'Non-Veg'),
                    matchedDishDescription: food.description,
                });
            }
        });

        // Attach matchedDishes array to restaurant results
        const finalRestaurantResults = Array.from(restaurantResultsMap.values()).map(r => ({
            ...r,
            matchedDishes: restaurantDishesMap.get(r._id.toString()) || []
        }));

        results = [...finalRestaurantResults, ...dishResults];
    } else {
        // No search text -> List all restaurants matching zone/filters
        const allMatching = await FoodRestaurant.find(buildRestaurantQuery())
            .sort({ isSponsored: -1, rating: -1, createdAt: -1 })
            .limit(limit * 2)
            .lean();
            
        results = allMatching.map(r => ({ ...r, matchType: 'restaurant', matchedDishes: [] }));
    }

    // 4. Final Result Formatting & Distance / Delivery Time Calculation
    const userLat = lat !== undefined && lat !== null ? parseFloat(lat) : null;
    const userLng = lng !== undefined && lng !== null ? parseFloat(lng) : null;

    if (Number.isFinite(userLat) && Number.isFinite(userLng) && results.length > 0) {
        results.forEach(res => {
            let rLat = typeof res.location?.latitude === 'number' ? res.location.latitude : null;
            let rLng = typeof res.location?.longitude === 'number' ? res.location.longitude : null;
            if (rLat === null && Array.isArray(res.location?.coordinates) && res.location.coordinates.length === 2) {
                rLng = Number(res.location.coordinates[0]);
                rLat = Number(res.location.coordinates[1]);
            }
            if (rLat === null && typeof res.latitude === 'number') rLat = res.latitude;
            if (rLng === null && typeof res.longitude === 'number') rLng = res.longitude;

            if (Number.isFinite(rLat) && Number.isFinite(rLng)) {
                const dLat = (rLat - userLat) * Math.PI / 180;
                const dLon = (rLng - userLng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(userLat * Math.PI / 180) * Math.cos(rLat * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distKm = 6371 * c; // Km
                res.distanceScore = distKm;
                res.distanceKm = Math.round(distKm * 10) / 10;
                const mins = Math.max(15, Math.min(60, 15 + Math.round(distKm * 3)));
                res.estimatedDeliveryTime = `${mins} mins`;
                res.estimatedDeliveryTimeMinutes = mins;
            } else {
                res.distanceScore = 999;
            }
        });

        // Filter out restaurants outside deliverable radius (max 35 km)
        const maxDeliveryRadiusKm = Math.min(Math.max(parseFloat(radiusKm) || 30, 10), 40);
        results = results.filter(res => res.distanceScore === undefined || res.distanceScore <= maxDeliveryRadiusKm);
        results.sort((a, b) => {
            if (a.isSponsored && !b.isSponsored) return -1;
            if (!a.isSponsored && b.isSponsored) return 1;

            const aRating = Number(a.rating || 0);
            const bRating = Number(b.rating || 0);
            if (bRating !== aRating) return bRating - aRating;

            const aTotalRatings = Number(a.totalRatings || 0);
            const bTotalRatings = Number(b.totalRatings || 0);
            if (bTotalRatings !== aTotalRatings) return bTotalRatings - aTotalRatings;

            return (a.distanceScore || 999) - (b.distanceScore || 999);
        });
    } else if (results.length > 0) {
        results.sort((a, b) => {
            if (a.isSponsored && !b.isSponsored) return -1;
            if (!a.isSponsored && b.isSponsored) return 1;

            const aRating = Number(a.rating || 0);
            const bRating = Number(b.rating || 0);
            if (bRating !== aRating) return bRating - aRating;

            const aTotalRatings = Number(a.totalRatings || 0);
            const bTotalRatings = Number(b.totalRatings || 0);
            if (bTotalRatings !== aTotalRatings) return bTotalRatings - aTotalRatings;

            return 0;
        });
    }

    // 5. Attach recommended images and active running coupon offers for the auto slider & cards
    const { attachRecommendedImagesToRestaurants, attachActiveOffersToRestaurants } = await import('../../restaurant/services/restaurant.service.js');
    let paginatedRestaurants = results.slice(skip, skip + limit);
    paginatedRestaurants = await attachRecommendedImagesToRestaurants(paginatedRestaurants);
    if (attachActiveOffersToRestaurants) {
        paginatedRestaurants = await attachActiveOffersToRestaurants(paginatedRestaurants);
    }

    return {
        success: true,
        data: {
            restaurants: paginatedRestaurants,
            total: results.length,
            page: parseInt(page),
            limit: parseInt(limit),
            zoneFiltered: !!resolvedZoneId
        }
    };
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    try {
        const restaurantFilter = { status: 'approved' };
        if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
            restaurantFilter.zoneId = new mongoose.Types.ObjectId(query.zoneId);
        }
        if (query.isRestaurant === 'false') {
            restaurantFilter.isRestaurant = false;
        } else if (query.isRestaurant === 'true') {
            restaurantFilter.isRestaurant = { $ne: false };
        }

        const eligibleRestaurantIds = await FoodRestaurant.distinct('_id', restaurantFilter);

        const eligibleCategoryIds = eligibleRestaurantIds.length
            ? await FoodItem.distinct('categoryId', {
                approvalStatus: 'approved',
                isActive: { $ne: false },
                isAvailable: { $ne: false },
                categoryId: { $ne: null },
                restaurantId: { $in: eligibleRestaurantIds }
            })
            : [];

        const filter = { 
            isActive: true,
            $or: [
                { restaurantId: null },
                { restaurantId: { $exists: false } },
                ...(eligibleCategoryIds.length ? [{ _id: { $in: eligibleCategoryIds } }] : [])
            ]
        };

        if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
            filter.$and = [
                {
                    $or: [
                        { zoneId: new mongoose.Types.ObjectId(query.zoneId) },
                        { zoneId: { $exists: false } },
                        { zoneId: null }
                    ]
                }
            ];
        }

        let categories = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
        
        if (!categories || categories.length === 0) {
            categories = await FoodCategory.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
        }
        return categories;
    } catch (err) {
        console.error("Error in getAdminCategories:", err);
        return await FoodCategory.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
    }
};
