import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { FoodDeliverySurgeZone } from '../../admin/models/deliverySurgeZone.model.js';
import { FoodDeliveryCommissionRule } from '../../admin/models/deliveryCommissionRule.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { haversineKm } from './order.helpers.js';

function extractCoords(addressLike) {
  const coords = addressLike?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return [Number(lng), Number(lat)];
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

export async function calculateOrderPricing(userId, dto) {
  const restaurant = await FoodRestaurant.findById(dto.restaurantId)
    .select("status zoneId location")
    .lean();
  if (!restaurant) throw new ValidationError("Restaurant not found");
  if (restaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");

  const items = Array.isArray(dto.items) ? dto.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );

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
    const distanceKm = haversineKm(rLat, rLng, cLat, cLng);
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
      // Base slab (user): DB base pay + per-km × full distance
      const distanceLeg = Math.round(Math.max(0, perKmRate * Number(distanceKm || 0)) * 100) / 100;
      deliveryFee = Math.round(Math.max(0, fixedPayout + distanceLeg) * 100) / 100;
      baseSlabFlatFee = fixedPayout;
      baseSlabMaxKm = distanceRule.maxDistance == null ? null : Number(distanceRule.maxDistance);
      excessDistanceKm = Math.round(Number(distanceKm || 0) * 100) / 100;
    } else {
      // Non-base (Option A): base slab user per-km rate as flat + matched per-km × excess beyond base max
      const baseSlab = await resolveBaseDistanceSlab();
      baseSlabFlatFee = baseSlab
        ? Math.round((Number(baseSlab.commissionPerKm || 0) * 100)) / 100
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

    adminDeliveryCommissionEnabled = adminCommissionRow?.isEnabled === true;
    adminDeliveryCommissionPercent = adminDeliveryCommissionEnabled
      ? Math.round((Number(adminCommissionRow?.adminDeliveryCommissionPercent || 0) * 100)) / 100
      : 0;
    adminDeliveryCommissionAmount = Math.round((deliveryFee * (adminDeliveryCommissionPercent / 100)) * 100) / 100;
    riderDeliveryEarningAfterAdminCommission = Math.round(Math.max(0, deliveryFee - adminDeliveryCommissionAmount) * 100) / 100;
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

  const itemGst = Math.round(subtotal * 0.05);
  const platformGst = Math.round(platformFee * 0.18);
  const deliveryGst = Math.round(deliveryFee * 0.18);
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
  if (zoneIdForSurge) {
    const surgeConfig = await FoodDeliverySurgeZone.findOne({ zoneId: zoneIdForSurge }).lean();
    if (surgeConfig?.isEnabled) {
      surgeAmount = Math.round((Number(surgeConfig.surgeAmount || 0) * 100)) / 100;
    }
  }

  const total = Math.max(
    0,
    subtotal + packagingFee + deliveryFee + platformFee + tax + surgeAmount - discount,
  );

  return {
    pricing: {
      subtotal,
      tax,
      gstBreakdown,
      packagingFee,
      deliveryFee,
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
      discount,
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
      codLimit: feeSettings?.codLimit ?? null,
    },
  };
}
