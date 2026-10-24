import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { FoodDeliverySurgeZone } from '../../admin/models/deliverySurgeZone.model.js';
import { FoodDeliveryCommissionRule } from '../../admin/models/deliveryCommissionRule.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodAddon } from '../../restaurant/models/foodAddon.model.js';
import { isFoodItemAvailableNow } from '../../utils/foodAvailability.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { haversineKm } from './order.helpers.js';
import { getGoogleRoadDistance } from '../utils/googleMaps.js';
import { applyDemoLocationBypass } from '../../admin/services/demoMode.service.js';
import { isRazorpayConfigured } from '../helpers/razorpay.helper.js';
function extractCoords(addressLike) {
  if (!addressLike) return null;
  const coords = addressLike?.location?.coordinates || addressLike?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const [lng, lat] = coords.map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  }
  const lat = Number(addressLike?.latitude ?? addressLike?.lat ?? addressLike?.location?.latitude ?? addressLike?.location?.lat);
  const lng = Number(addressLike?.longitude ?? addressLike?.lng ?? addressLike?.location?.longitude ?? addressLike?.location?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return [lng, lat];
  }
  return null;
}

function isPointInPolygon(lat, lng, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.longitude);
    const yi = Number(polygon[i]?.latitude);
    const xj = Number(polygon[j]?.longitude);
    const yj = Number(polygon[j]?.latitude);
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

async function detectZoneIdFromAddress(addressLike) {
  const coords = extractCoords(addressLike);
  if (!coords) return null;
  const [lng, lat] = coords;
  const zones = await FoodZone.find({ isActive: true }).select('_id coordinates').lean();
  const matchedZone = (zones || []).find((zone) => isPointInPolygon(lat, lng, zone?.coordinates || []));
  return matchedZone?._id ? String(matchedZone._id) : null;
}

export async function resolveOrderZoneId(dto = {}, restaurant = null) {
  const detectedZoneId = await detectZoneIdFromAddress(dto?.address || dto?.deliveryAddress);
  if (detectedZoneId && mongoose.Types.ObjectId.isValid(detectedZoneId)) {
    return detectedZoneId;
  }
  if (dto?.zoneId && mongoose.Types.ObjectId.isValid(dto.zoneId)) {
    return String(dto.zoneId);
  }
  if (restaurant?.zoneId && mongoose.Types.ObjectId.isValid(restaurant.zoneId)) {
    return String(restaurant.zoneId);
  }
  return null;
}

async function resolveDistanceRule(distanceKm) {
  if (!Number.isFinite(Number(distanceKm)) || Number(distanceKm) < 0) return null;
  const rules = await FoodDeliveryCommissionRule.find({ status: { $ne: false } }).lean();
  if (!rules.length) return null;
  const d = Number(distanceKm);
  const sorted = [...rules].sort((a, b) => Number(a.minDistance || 0) - Number(b.minDistance || 0));
  const matched = sorted.find((r) => {
    const min = Number(r.minDistance || 0);
    const max = r.maxDistance == null ? null : Number(r.maxDistance);
    return d >= min && (max == null || d < max);
  });
  if (matched) return matched;

  const lowerRule = [...sorted]
    .reverse()
    .find((r) => d >= Number(r.minDistance || 0));

  return lowerRule || sorted[0] || null;
}

/** Active base slab (minDistance <= 0). Flat user fee source matches base-slab pricing. */
async function resolveBaseDistanceSlab() {
  const rules = await FoodDeliveryCommissionRule.find({ status: { $ne: false } }).lean();
  if (!rules.length) return null;
  return (
    [...rules]
      .filter((r) => Number(r.minDistance || 0) <= 0)
      .sort((a, b) => Number(a.minDistance || 0) - Number(b.minDistance || 0))[0] || null
  );
}

/**
 * Re-prices cart lines from the FoodItem collection.
 * - the item must exist and belong to this restaurant,
 * - a variant (if sent) must exist on the item; its price is used, otherwise the item price,
 * - quantity must be a positive integer.
 * Client-sent price/variantPrice are overwritten, so the totals can never be tampered with.
 */
export async function resolveServerPricedItems(rawItems, restaurantId) {
  const lines = Array.isArray(rawItems) ? rawItems : [];
  if (!lines.length) throw new ValidationError('Cart is empty');

  const ids = [...new Set(lines.map((l) => String(l?.itemId || '')))];
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new ValidationError('Invalid item in cart');
  }

  const [docs, addonDocs] = await Promise.all([
    FoodItem.find({ _id: { $in: ids } })
      .select('name price variants restaurantId isAvailable isActive')
      .lean(),
    FoodAddon.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .select('restaurantId draft published approvalStatus isAvailable')
      .lean(),
  ]);

  const byId = new Map(docs.map((d) => [String(d._id), { ...d, isAddon: false }]));
  for (const a of (addonDocs || [])) {
    const payload = a.published || (a.approvalStatus === 'approved' ? a.draft : null);
    if (payload) {
      byId.set(String(a._id), {
        _id: a._id,
        name: payload.name || a.draft?.name || 'Addon',
        price: Number(payload.price ?? a.draft?.price ?? 0),
        restaurantId: a.restaurantId,
        isAvailable: a.isAvailable !== false,
        isActive: true,
        variants: [],
        isAddon: true,
      });
    }
  }

  return lines.map((line) => {
    const doc = byId.get(String(line.itemId));
    if (!doc) throw new ValidationError(`"${line?.name || 'An item'}" is no longer available`);
    if (restaurantId && String(doc.restaurantId) !== String(restaurantId)) {
      throw new ValidationError(`"${doc.name}" does not belong to this restaurant`);
    }
    if (doc.isAvailable === false || doc.isActive === false) {
      throw new ValidationError(`"${doc.name}" is currently unavailable`);
    }

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new ValidationError(`Invalid quantity for "${doc.name}"`);
    }

    let unitPrice = Number(doc.price);
    let variantName = '';
    const variantId = line.variantId ? String(line.variantId) : '';
    let resolvedVariantId = variantId;
    if (variantId && !doc.isAddon) {
      // Variant ids change when the restaurant re-saves an item; fall back to the variant name so
      // carts created before the edit keep working.
      const lineVariantName = String(line.variantName || line.variant?.name || '').trim().toLowerCase();
      const variant =
        (doc.variants || []).find((v) => String(v._id) === variantId) ||
        (lineVariantName
          ? (doc.variants || []).find((v) => String(v.name || '').trim().toLowerCase() === lineVariantName)
          : null);
      if (!variant) throw new ValidationError(`Selected option of "${doc.name}" is no longer available`);
      resolvedVariantId = String(variant._id);
      unitPrice = Number(variant.price);
      variantName = variant.name || '';
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new ValidationError(`"${doc.name}" has no valid price`);
    }
    unitPrice = Math.round(unitPrice * 100) / 100;

    return {
      ...line,
      name: doc.name,
      variantId: doc.isAddon ? '' : (resolvedVariantId || line.variantId),
      price: unitPrice,
      variantPrice: (!doc.isAddon && variantId) ? unitPrice : (line.variantPrice || 0),
      variantName: (!doc.isAddon && variantId) ? variantName : (line.variantName || ''),
      quantity,
      isAddon: Boolean(doc.isAddon),
    };
  });
}

export async function calculateOrderPricing(userId, dto) {
  const restaurant = await FoodRestaurant.findById(dto.restaurantId)
    .select("status restaurantName zoneId location isAcceptingOrders isActive openingTime closingTime outletTimings deliveryTimings openDays")
    .lean();
  if (!restaurant) throw new ValidationError("Restaurant not found");

  // Dev Mode: move an out-of-zone delivery address next to the restaurant (no-op unless the bypass is on).
  await applyDemoLocationBypass(dto, restaurant);

  try {
    const { FoodRestaurantOutletTimings } = await import('../../restaurant/models/outletTimings.model.js');
    const timingsDoc = await FoodRestaurantOutletTimings.findOne({ restaurantId: dto.restaurantId }).lean();
    if (timingsDoc?.timings) {
      restaurant.outletTimings = timingsDoc.timings;
    }
  } catch {
    // ignore
  }

  const { getRestaurantAvailabilityStatusServer } = await import('../../utils/foodAvailability.js');
  const availabilityDate = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
  const availability = getRestaurantAvailabilityStatusServer(restaurant, availabilityDate);
  if (!availability.isOpen) {
    throw new ValidationError(availability.message || "Restaurant is currently closed and not accepting orders");
  }

  // Prices always come from the database; whatever price the client sent is ignored.
  const items = await resolveServerPricedItems(dto.items, dto.restaurantId);
  const subtotal = Math.round(
    items.reduce((sum, it) => sum + it.price * it.quantity, 0) * 100,
  ) / 100;

  const feeDoc = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  if (!feeDoc) {
    throw new ValidationError('Fee settings are not configured. Please configure Delivery & Platform Fee first.');
  }
  const feeSettings = feeDoc;

  const packagingFee = 0;
  const configuredPlatformFee = Number(feeSettings.platformFee);
  if (!Number.isFinite(configuredPlatformFee) || configuredPlatformFee < 0) {
    throw new ValidationError('Platform fee is not configured. Please save it in Delivery & Platform Fee settings.');
  }
  const platformFee = Math.round(configuredPlatformFee * 100) / 100;
  const incentiveRule = feeSettings.deliveryPartnerIncentiveRule || {
    isEnabled: false,
    minOrderAmount: 0,
    incentivePercent: 0,
  };

  const mode = String(feeSettings.deliveryFeeComputationMode || '');
  let deliveryFee = 0;
  let deliveryFeeBreakdown = null;
  let adminDeliveryCommissionPercent = 0;
  let adminDeliveryCommissionAmount = 0;
  let riderDeliveryEarningAfterAdminCommission = 0;
  let adminDeliveryCommissionEnabled = false;
  let deliveryPartnerIncentiveEnabled = Boolean(incentiveRule.isEnabled);
  let deliveryPartnerIncentivePercent = Math.round((Number(incentiveRule.incentivePercent || 0) * 100)) / 100;
  let deliveryPartnerIncentiveAmount = 0;
  let deliveryPartnerIncentiveEligible = false;
  if (mode !== 'distance_order_value') {
    throw new ValidationError('Distance-based delivery fee settings are not configured.');
  }

  if (mode === 'distance_order_value') {
    const restCoords = extractCoords(restaurant);
    const customerCoords = extractCoords(dto?.address || dto?.deliveryAddress);
    if (!restCoords && !customerCoords) {
      throw new ValidationError('Restaurant and customer locations are required for distance-based delivery fee calculation');
    }
    if (!restCoords) {
      throw new ValidationError('Restaurant location is required for distance-based delivery fee calculation');
    }
    if (!customerCoords) {
      throw new ValidationError('Customer location is required for distance-based delivery fee calculation');
    }
    const [rLng, rLat] = restCoords;
    const [cLng, cLat] = customerCoords;
    const straightDistKm = haversineKm(rLat, rLng, cLat, cLng);
    // Estimated road distance fallback (1.3x road factor) in case Google is unreachable
    let distanceKm = Math.round(straightDistKm * 1.3 * 10) / 10;

    // Prefer accurate Google Maps road driving distance (e.g. 5.9 km instead of straight-line 5.2 km)
    try {
      const roadData = await getGoogleRoadDistance(
        { lat: rLat, lng: rLng },
        { lat: cLat, lng: cLng }
      );
      if (roadData?.distanceKm && Number.isFinite(roadData.distanceKm) && roadData.distanceKm > 0) {
        distanceKm = roadData.distanceKm;
      }
    } catch {
      // Fallback safely to estimated road distance (haversineKm * 1.3)
    }

    // 1. Zone Validation: Ensure customer location is inside an active service zone
    const activeZones = await FoodZone.find({ isActive: true }).select('_id name coordinates').lean();
    if (activeZones && activeZones.length > 0) {
      const customerZoneId = await detectZoneIdFromAddress(dto?.address || dto?.deliveryAddress);
      if (!customerZoneId) {
        throw new ValidationError('Your selected delivery location is outside our service zone. Delivery is not available to this location.');
      }
      // Restaurant only delivers inside its own zone (e.g. an Indore restaurant cannot deliver to Dewas).
      const explicitRestZoneId = restaurant?.zoneId ? String(restaurant.zoneId) : '';
      const restaurantZoneId = activeZones.some((z) => String(z._id) === explicitRestZoneId)
        ? explicitRestZoneId
        : await detectZoneIdFromAddress(restaurant);
      if (restaurantZoneId && String(restaurantZoneId) !== String(customerZoneId)) {
        throw new ValidationError('This restaurant does not deliver to your selected location. Please choose a restaurant near you.');
      }
    }

    // 2. Maximum Delivery Distance Validation
    const rules = await FoodDeliveryCommissionRule.find({ status: { $ne: false } }).lean();
    if (rules && rules.length > 0) {
      // An "Unlimited" slab (maxDistance = null) means there is no upper service limit.
      const hasUnlimitedSlab = rules.some(r => r.maxDistance == null);
      const maxDistances = rules.map(r => r.maxDistance).filter(m => m != null && Number.isFinite(Number(m)));
      if (!hasUnlimitedSlab && maxDistances.length > 0) {
        const maxConfiguredKm = Math.max(...maxDistances.map(Number));
        if (distanceKm > maxConfiguredKm) {
          throw new ValidationError(`Delivery location is outside our maximum service distance (${distanceKm.toFixed(1)} km). Maximum delivery radius is ${maxConfiguredKm} km.`);
        }
      }
    }

    const distanceRule = await resolveDistanceRule(distanceKm);
    if (!distanceRule) {
      throw new ValidationError('No active distance slab found for this delivery distance');
    }
    const commissionRows = Array.isArray(feeSettings.distanceSlabAdminDeliveryCommission)
      ? feeSettings.distanceSlabAdminDeliveryCommission
      : [];
    const adminCommissionRow = commissionRows.find((r) => String(r.distanceRuleId) === String(distanceRule._id));
    const minDistance = Number(distanceRule.minDistance || 0);
    const isBaseSlab = minDistance <= 0;
    const userDeliveryFee = Math.round((Number(distanceRule.commissionPerKm || 0) * 100)) / 100;
    const perKmRate = Number(distanceRule.commissionPerKm || 0);
    const fixedPayout = Math.round((Number(distanceRule.basePayout || 0) * 100)) / 100;
    let baseSlabFlatFee = 0;
    let baseSlabMaxKm = null;
    let excessDistanceKm = 0;

    if (isBaseSlab) {
      // Base slab (user): DB base pay only (flat fee for base distance)
      deliveryFee = fixedPayout;
      baseSlabFlatFee = fixedPayout;
      baseSlabMaxKm = distanceRule.maxDistance == null ? null : Number(distanceRule.maxDistance);
      excessDistanceKm = 0;
    } else {
      // Non-base (Option A): base slab user per-km rate as flat + matched per-km × excess beyond base max
      const baseSlab = await resolveBaseDistanceSlab();
      baseSlabFlatFee = baseSlab
        ? Math.round((Number(baseSlab.basePayout || 0) * 100)) / 100
        : 0;
      baseSlabMaxKm =
        baseSlab && baseSlab.maxDistance != null && Number.isFinite(Number(baseSlab.maxDistance))
          ? Number(baseSlab.maxDistance)
          : null;
      // If base max is missing, fall back to full trip distance for the per-km leg
      excessDistanceKm =
        baseSlabMaxKm == null
          ? Math.max(0, Number(distanceKm || 0))
          : Math.max(0, Number(distanceKm || 0) - baseSlabMaxKm);
      const distanceLeg = Math.round(Math.max(0, perKmRate * excessDistanceKm) * 100) / 100;
      deliveryFee = Math.round(Math.max(0, baseSlabFlatFee + distanceLeg) * 100) / 100;
    }

    // 100% of delivery fee goes directly to delivery partner earning (admin takes 0% of delivery fee)
    adminDeliveryCommissionEnabled = false;
    adminDeliveryCommissionPercent = 0;
    adminDeliveryCommissionAmount = 0;
    riderDeliveryEarningAfterAdminCommission = deliveryFee;
    deliveryFeeBreakdown = {
      source: 'distance_slab',
      distanceKm: Math.round(Number(distanceKm || 0) * 100) / 100,
      distanceRuleId: String(distanceRule._id),
      distanceRange: {
        minDistance,
        maxDistance: distanceRule.maxDistance == null ? null : Number(distanceRule.maxDistance)
      },
      orderValue: subtotal,
      appliedDeliveryFee: Number(deliveryFee || 0),
      feeComputation: isBaseSlab
        ? 'base_payout_plus_commission_per_km_x_distance'
        : 'base_slab_flat_plus_commission_per_km_x_excess_distance',
      userDeliveryFee,
      baseSlabFlatFee: isBaseSlab ? fixedPayout : baseSlabFlatFee,
      baseSlabMaxKm: isBaseSlab
        ? (distanceRule.maxDistance == null ? null : Number(distanceRule.maxDistance))
        : baseSlabMaxKm,
      excessDistanceKm: isBaseSlab
        ? Math.round(Number(distanceKm || 0) * 100) / 100
        : Math.round(excessDistanceKm * 100) / 100,
      basePayout: fixedPayout,
      commissionPerKm: perKmRate,
      adminDeliveryCommissionPercent,
      adminDeliveryCommissionAmount,
      riderDeliveryEarningAfterAdminCommission,
      feeSource: isBaseSlab ? 'distance_base_slab' : 'distance_non_base_slab'
    };
  }

  const incentiveThreshold = Math.round((Number(incentiveRule.minOrderAmount || 0) * 100)) / 100;
  deliveryPartnerIncentiveEligible =
    deliveryPartnerIncentiveEnabled &&
    Number.isFinite(subtotal) &&
    subtotal >= incentiveThreshold &&
    deliveryPartnerIncentivePercent > 0;
  deliveryPartnerIncentiveAmount = deliveryPartnerIncentiveEligible
    ? Math.round((subtotal * (deliveryPartnerIncentivePercent / 100)) * 100) / 100
    : 0;

  const configuredGstRate = (feeSettings?.gstRate != null && Number.isFinite(Number(feeSettings.gstRate)))
    ? Math.max(0, Number(feeSettings.gstRate))
    : 0;

  const itemGst = Math.round(subtotal * (configuredGstRate / 100));
  const platformGst = Math.round(platformFee * (configuredGstRate / 100));
  const deliveryGst = Math.round(deliveryFee * (configuredGstRate / 100));
  const tax = itemGst + platformGst + deliveryGst;
  const gstBreakdown = { item: itemGst, platform: platformGst, delivery: deliveryGst };

  let discount = 0;
  let appliedCoupon = null;
  const codeRaw = dto.couponCode
    ? String(dto.couponCode).trim().toUpperCase()
    : "";

  if (codeRaw) {
    const now = new Date();
    const offer = await FoodOffer.findOne({ couponCode: codeRaw }).lean();
    if (offer) {
      const statusOk = offer.status === "active";
      const startOk = !offer.startDate || now >= new Date(offer.startDate);
      const endOk = !offer.endDate || now < new Date(offer.endDate);
      const scopeOk =
        offer.restaurantScope !== "selected" ||
        String(offer.restaurantId || "") === String(dto.restaurantId || "");
      const minOk = subtotal >= (Number(offer.minOrderValue) || 0);
      let usageOk = true;
      if (
        Number(offer.usageLimit) > 0 &&
        Number(offer.usedCount || 0) >= Number(offer.usageLimit)
      ) {
        usageOk = false;
      }

      let perUserOk = true;
      if (userId && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId,
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
          perUserOk = false;
        }
      }

      let firstOrderOk = true;
      if (userId && offer.customerScope === "first-time") {
        const c = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        firstOrderOk = c === 0;
      }
      if (userId && offer.isFirstOrderOnly === true) {
        const c2 = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        if (c2 > 0) firstOrderOk = false;
      }

      const allowed =
        statusOk &&
        startOk &&
        endOk &&
        scopeOk &&
        minOk &&
        usageOk &&
        perUserOk &&
        firstOrderOk;

      if (allowed) {
        if (offer.discountType === "percentage") {
          const raw = subtotal * (Number(offer.discountValue) / 100);
          const capped = Number(offer.maxDiscount)
            ? Math.min(raw, Number(offer.maxDiscount))
            : raw;
          discount = Math.max(0, Math.min(subtotal, Math.floor(capped)));
        } else {
          discount = Math.max(
            0,
            Math.min(subtotal, Math.floor(Number(offer.discountValue) || 0)),
          );
        }
        appliedCoupon = { code: codeRaw, discount };
      }
    }
  }

  const zoneIdForSurge = await resolveOrderZoneId(dto, restaurant);
  let surgeAmount = 0;
  let surgeTitle = (feeSettings.surgeTitle && String(feeSettings.surgeTitle).trim()) || "Surge Charge";
  if (zoneIdForSurge) {
    const surgeConfig = await FoodDeliverySurgeZone.findOne({ zoneId: zoneIdForSurge }).lean();
    if (surgeConfig?.isEnabled) {
      surgeAmount = Math.round((Number(surgeConfig.surgeAmount || 0) * 100)) / 100;
      if (surgeConfig.surgeTitle && String(surgeConfig.surgeTitle).trim()) {
        surgeTitle = String(surgeConfig.surgeTitle).trim();
      }
    }
  }

  const rawTotal = Math.max(
    0,
    subtotal + packagingFee + deliveryFee + platformFee + tax + surgeAmount - discount,
  );
  // Bill is rounded to a whole rupee so cash collection and online payment are exact amounts.
  const total = Math.round(rawTotal);
  const roundOff = Math.round((total - rawTotal) * 100) / 100;
  const savings = Math.max(0, Math.round(discount));

  return {
    // Server-priced cart lines; createOrder stores these instead of the client's items.
    items,
    pricing: {
      subtotal,
      tax,
      gstBreakdown,
      packagingFee,
      deliveryFee,
      distanceKm: Math.round(Number(distanceKm || 0) * 10) / 10,
      deliveryFeeBreakdown,
      adminDeliveryCommissionEnabled,
      adminDeliveryCommissionPercent,
      adminDeliveryCommissionAmount,
      riderDeliveryEarningAfterAdminCommission,
      deliveryPartnerIncentiveEnabled,
      deliveryPartnerIncentivePercent,
      deliveryPartnerIncentiveAmount,
      deliveryPartnerIncentiveEligible,
      platformFee,
      surgeAmount,
      surgeTitle,
      discount,
      savings,
      roundOff,
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
      codLimit: feeSettings?.codLimit ?? null,
      // Checkout options the admin has left open (online also needs working Razorpay keys).
      paymentMethods: {
        cash: feeSettings?.paymentMethods?.cash !== false,
        razorpay: feeSettings?.paymentMethods?.online !== false && isRazorpayConfigured(),
        wallet: feeSettings?.paymentMethods?.wallet !== false,
      },
    },
  };
}
