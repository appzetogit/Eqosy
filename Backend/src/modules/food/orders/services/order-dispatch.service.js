import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodDeliveryCashDeposit } from '../../delivery/models/foodDeliveryCashDeposit.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { config } from '../../../../config/env.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import {
  buildDeliverySocketPayload,
  buildOrderIdentityFilter,
  haversineKm,
  notifyOwnerSafely,
  notifyOwnersSafely,
  notifyAdminsSafely,
} from './order.helpers.js';

import { FoodZone } from '../../admin/models/zone.model.js';

function isPointInPolygon(lat, lng, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.longitude ?? polygon[i]?.lng ?? polygon[i]?.[0]);
    const yi = Number(polygon[i]?.latitude ?? polygon[i]?.lat ?? polygon[i]?.[1]);
    const xj = Number(polygon[j]?.longitude ?? polygon[j]?.lng ?? polygon[j]?.[0]);
    const yj = Number(polygon[j]?.latitude ?? polygon[j]?.lat ?? polygon[j]?.[1]);
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPartnerInActiveZoneSync(lat, lng, targetZoneId, activeZones = []) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return false;
  }

  if (!activeZones || activeZones.length === 0) {
    return true;
  }

  if (targetZoneId && mongoose.Types.ObjectId.isValid(targetZoneId)) {
    const targetZone = activeZones.find(z => z._id.toString() === targetZoneId.toString());
    if (targetZone && Array.isArray(targetZone.coordinates) && targetZone.coordinates.length >= 3) {
      return isPointInPolygon(Number(lat), Number(lng), targetZone.coordinates);
    }
  }

  return activeZones.some(z => isPointInPolygon(Number(lat), Number(lng), z.coordinates || []));
}

async function listNearbyOnlineDeliveryPartners(
  restaurantId,
  { maxKm = 15, limit = 25 } = {},
) {
  const rId = (restaurantId?._id || restaurantId).toString();
  const restaurant = await FoodRestaurant.findById(rId)
    .select("location zoneId zone")
    .lean();

  const targetZoneId = restaurant?.zoneId || restaurant?.zone;
  const activeZones = await FoodZone.find({ isActive: true }).select("_id coordinates").lean();
  const hasActiveZones = Array.isArray(activeZones) && activeZones.length > 0;

  let allOnline = await FoodDeliveryPartner.find({
    availabilityStatus: "online",
  })
    .select("_id status lastLat lastLng lastLocationAt name zoneId")
    .lean();

  allOnline = allOnline.filter(p => !p.status || p.status === 'approved' || p.status === 'pending');

  // Filter out partners with no GPS or stale GPS (no location update in 10+ minutes)
  const GPS_STALE_MS = 10 * 60 * 1000;
  const nowMs = Date.now();
  allOnline = allOnline.filter(p => {
    if (p.lastLat == null || p.lastLng == null) return false; // No GPS data at all
    if (p.lastLocationAt) {
      const lastLocMs = new Date(p.lastLocationAt).getTime();
      if (nowMs - lastLocMs > GPS_STALE_MS) return false; // GPS stale > 10 minutes
    }
    return true;
  });

  // Filter: Only dispatch to partners with a valid active gig booking for TODAY's time window.
  // This prevents partners who only have GPS active (but no gig) from receiving orders.
  if (allOnline.length > 0) {
    try {
      const { FoodGigBooking } = await import('../../delivery/models/foodGigBooking.model.js');
      const { FoodGig } = await import('../../delivery/models/foodGig.model.js');
      const THIRTY_MIN_MS = 30 * 60 * 1000;
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const partnerObjectIds = allOnline
        .map(p => mongoose.Types.ObjectId.isValid(p._id) ? new mongoose.Types.ObjectId(p._id) : null)
        .filter(Boolean);

      // Find all bookings for today where gig time window is active (±30 min grace)
      const activeGigBookings = await FoodGigBooking.find({
        deliveryPartnerId: { $in: partnerObjectIds },
        status: { $in: ['booked', 'completed'] }
      }).populate({
        path: 'gigId',
        select: 'startDateTime endDateTime status date'
      }).lean();

      // Build set of partnerIds who have an active gig right now
      const partnersWithActiveGig = new Set();
      for (const booking of activeGigBookings) {
        if (!booking.gigId || booking.gigId.status !== 'active') continue;
        // Only consider gigs for today
        if (booking.gigId.date && booking.gigId.date !== todayStr) continue;
        const startMs = new Date(booking.gigId.startDateTime).getTime();
        const endMs = new Date(booking.gigId.endDateTime).getTime();
        const isInWindow = (nowMs >= startMs - THIRTY_MIN_MS) && (nowMs <= endMs + THIRTY_MIN_MS);
        if (isInWindow) {
          partnersWithActiveGig.add(String(booking.deliveryPartnerId));
        }
      }

      // Also allow partners who have an active order in progress (even if gig expired)
      const { FoodOrder } = await import('../models/order.model.js');
      const partnerIdsArray = allOnline.map(p => String(p._id));
      const activeOrderDocs = await FoodOrder.find({
        'dispatch.deliveryPartnerId': { $in: partnerObjectIds },
        orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop'] }
      }).select('dispatch.deliveryPartnerId').lean();
      for (const od of activeOrderDocs) {
        partnersWithActiveGig.add(String(od.dispatch?.deliveryPartnerId));
      }

      allOnline = allOnline.filter(p => partnersWithActiveGig.has(String(p._id)));
      logger.info(`[DeliveryDispatch] Gig filter: ${allOnline.length} partner(s) have active gig today.`);
    } catch (gigErr) {
      logger.warn(`[DeliveryDispatch] Gig validity check failed (skipping filter): ${gigErr.message}`);
    }
  }

  // Helper: check if partner belongs to the restaurant's zone (via GPS polygon OR matching zoneId)
  const isPartnerInTargetZone = (p) => {
    // Match by zoneId field on delivery partner profile
    if (targetZoneId && p.zoneId) {
      if (String(p.zoneId) === String(targetZoneId)) return true;
    }
    // Match by GPS polygon check
    if (hasActiveZones && p.lastLat != null && p.lastLng != null) {
      return isPartnerInActiveZoneSync(p.lastLat, p.lastLng, targetZoneId, activeZones);
    }
    return false;
  };

  if (!restaurant?.location?.coordinates?.length) {
    let partners = allOnline;
    if (hasActiveZones || targetZoneId) {
      const inZone = partners.filter((p) => isPartnerInTargetZone(p));
      if (inZone.length > 0) partners = inZone;
    }

    return {
      restaurant: null,
      partners: partners.slice(0, limit).map((p) => ({ partnerId: p._id, distanceKm: null, status: p.status })),
    };
  }

  const [rLng, rLat] = restaurant.location.coordinates;

  // Score all online partners with distance and zone membership
  const scored = [];
  for (const p of allOnline) {
    const inZone = isPartnerInTargetZone(p);

    let d = 999;
    if (p.lastLat != null && p.lastLng != null) {
      const calcD = haversineKm(rLat, rLng, p.lastLat, p.lastLng);
      if (Number.isFinite(calcD)) d = calcD;
    }

    scored.push({ partnerId: p._id, distanceKm: Number.isFinite(d) ? d : 999, status: p.status, isInZone: inZone });
  }

  // STRICT ZONE FILTERING: Only pick partners who are in the restaurant's zone
  const zonePartners = scored.filter(p => p.isInZone);

  let picked;
  if (zonePartners.length > 0) {
    // Sort zone partners by distance (closest first)
    zonePartners.sort((a, b) => a.distanceKm - b.distanceKm);
    picked = zonePartners.slice(0, Math.max(1, limit));
    logger.info(`[DeliveryDispatch] Found ${zonePartners.length} delivery partner(s) in restaurant zone ${targetZoneId || 'unknown'}.`);
  } else {
    // FALLBACK: No zone partners found — fall back to distance-based search
    logger.info(`[DeliveryDispatch] No partners in restaurant zone ${targetZoneId || 'unknown'}. Falling back to distance-based search (maxKm=${maxKm}).`);
    const distancePartners = scored.filter(p => p.distanceKm <= maxKm);
    distancePartners.sort((a, b) => a.distanceKm - b.distanceKm);
    picked = distancePartners.slice(0, Math.max(1, limit));

    // Last resort: grab any online partner
    if (picked.length === 0 && allOnline.length > 0) {
      picked = allOnline.slice(0, limit).map((p) => ({
        partnerId: p._id,
        distanceKm: null,
        status: p.status,
      }));
    }
  }

  return { partners: picked };
}

async function filterPartnersByCodCashLimit(partners = [], order = null) {
  if (!Array.isArray(partners) || partners.length === 0) return [];

  const paymentMethod = String(order?.payment?.method || '').trim().toLowerCase();
  if (paymentMethod !== 'cash') {
    return partners;
  }

  const cashLimitSettings = await getDeliveryCashLimitSettings();
  const totalCashLimit = Number(cashLimitSettings?.deliveryCashLimit) || 0;
  if (totalCashLimit <= 0) {
    return partners;
  }

  const orderCashImpact = Math.max(0, Number(order?.pricing?.total) || 0);

  const partnerIds = partners
    .map((partner) => partner?.partnerId)
    .filter((partnerId) => mongoose.Types.ObjectId.isValid(partnerId))
    .map((partnerId) => new mongoose.Types.ObjectId(partnerId));

  if (partnerIds.length === 0) {
    return partners;
  }

  const [cashCollectedAgg, cashDepositsAgg] = await Promise.all([
    FoodOrder.aggregate([
      {
        $match: {
          'dispatch.deliveryPartnerId': { $in: partnerIds },
          orderStatus: 'delivered',
          'payment.method': 'cash',
        },
      },
      {
        $group: {
          _id: '$dispatch.deliveryPartnerId',
          cashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } },
        },
      },
    ]),
    FoodDeliveryCashDeposit.aggregate([
      {
        $match: {
          deliveryPartnerId: { $in: partnerIds },
          status: 'Completed',
        },
      },
      {
        $group: {
          _id: '$deliveryPartnerId',
          depositedCash: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]),
  ]);

  const cashCollectedMap = new Map(
    (cashCollectedAgg || []).map((entry) => [
      String(entry?._id || ''),
      Number(entry?.cashCollected) || 0,
    ]),
  );
  const cashDepositsMap = new Map(
    (cashDepositsAgg || []).map((entry) => [
      String(entry?._id || ''),
      Number(entry?.depositedCash) || 0,
    ]),
  );

  const eligiblePartners = partners.filter((partner) => {
    const partnerId = String(partner?.partnerId || '');
    const cashCollected = cashCollectedMap.get(partnerId) || 0;
    const depositedCash = cashDepositsMap.get(partnerId) || 0;
    const cashInHand = Math.max(0, cashCollected - depositedCash);
    const projectedCashInHand = cashInHand + orderCashImpact;
    return projectedCashInHand <= totalCashLimit;
  });

  const skippedCount = partners.length - eligiblePartners.length;
  if (skippedCount > 0) {
    logger.info(
      `COD cash-limit filter skipped ${skippedCount} delivery partner(s) for order ${order?._id || ''}.`,
    );
  }

  return eligiblePartners;
}

export async function getDispatchSettings() {
  return { dispatchMode: "auto" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  // Always set to auto
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode: "auto",
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

export async function tryAutoAssign(orderId, options = {}) {
  const attempt = options.attempt || 1;
  const lockTimeout = 55000; // 55 seconds lock interval

  const order = await FoodOrder.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(orderId),
      $or: [
        { 'dispatch.status': 'unassigned' },
        {
          'dispatch.status': 'assigned',
          'dispatch.acceptedAt': { $exists: false },
          'dispatch.assignedAt': { $lt: new Date(Date.now() - lockTimeout) }
        }
      ],
      $and: [
        {
          $or: [
            { 'dispatch.dispatchingAt': { $exists: false } },
            { 'dispatch.dispatchingAt': null },
            { 'dispatch.dispatchingAt': { $lt: new Date(Date.now() - lockTimeout) } }
          ]
        }
      ]
    },
    {
      $set: { 'dispatch.dispatchingAt': new Date() }
    },
    { new: true }
  ).populate(['restaurantId', 'userId']);

  if (!order) {
    logger.info(`tryAutoAssign: Skip for ${orderId} (already dispatching, accepted, or multi-attempt lock active).`);
    return null;
  }

  try {
    const forceRebroadcast = Boolean(options.forceRebroadcast);

    // Decoupling: Ensure order is marked ready by restaurant before dispatching to delivery boys (unless manual forceRebroadcast)
    const DISPATCHABLE_STATUSES = ['ready_for_pickup', 'ready', 'reached_pickup', 'picked_up', 'reached_drop'];
    if (!forceRebroadcast && !DISPATCHABLE_STATUSES.includes(order.orderStatus)) {
      logger.info(`tryAutoAssign: Skip for ${orderId} (status ${order.orderStatus} not dispatchable yet).`);
      return order;
    }
    const offeredIds = (order.dispatch?.offeredTo || []).map(o => o.partnerId.toString());

    // RADIUS EXPANSION LOGIC
    // Attempt 1: 15km, Attempt 2: 25km, Attempt 3: 40km, Attempt 4+: 60km
    let maxKm = 15;
    if (attempt === 2) maxKm = 25;
    if (attempt === 3) maxKm = 40;
    if (attempt >= 4) maxKm = 60;

    const searchOptions = { maxKm, limit: 15 };
    const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, searchOptions);

    // TIERED ALERT LOGIC
    // Phase 2: Broadcast to all (Attempt 3+)
    // Phase 3: Admin Alert (Attempt 5+ or roughly 5 mins)
    const isPhase3 = attempt >= 6; // ~6 minutes (60s * 6)

    if (isPhase3) {
      logger.error(`[CRITICAL] Order ${order._id} unassigned for ${attempt} mins. Triggering Admin Alert (Phase 3).`);
      // Notify Admin via Push (Web/Mobile)
      try {
        await notifyAdminsSafely({
          title: 'Unassigned Order Crisis!',
          body: `Order #${order.order_id || order._id} has not been picked up for 5+ minutes. Manual intervention required!`,
          data: { type: 'admin_alert_unassigned', orderId: order._id.toString() }
        });
      } catch (err) {
        logger.warn(`Admin notification failed: ${err.message}`);
      }
    }

    const codEligiblePartners = await filterPartnersByCodCashLimit(partners, order);

    // Filter to strictly ONLINE delivery partners right now
    const partnerIdsToVerify = codEligiblePartners.map(p => p.partnerId).filter(Boolean);
    const onlineDocs = partnerIdsToVerify.length > 0
      ? await FoodDeliveryPartner.find({
          _id: { $in: partnerIdsToVerify },
          availabilityStatus: 'online'
        }).select('_id').lean()
      : [];
    const onlineIdsSet = new Set(onlineDocs.map(d => d._id.toString()));

    const codEligibleOnlinePartners = codEligiblePartners.filter(p => onlineIdsSet.has(p.partnerId?.toString?.()));
    const excludedPartnerIds = new Set(
      (order.dispatch?.offeredTo || [])
        .filter(o => ['rejected', 'handover', 'timeout'].includes(o.action))
        .map(o => (o.partnerId?.toString?.() || String(o.partnerId)))
    );

    const eligible = codEligibleOnlinePartners.filter(p => !offeredIds.includes(p.partnerId.toString()));

    // If no eligible partners left
    if (eligible.length === 0) {
      let targets = codEligibleOnlinePartners.filter(p => !excludedPartnerIds.has(p.partnerId.toString()));
      if (targets.length === 0 && forceRebroadcast) {
        targets = codEligibleOnlinePartners.length > 0 ? codEligibleOnlinePartners : partners;
      }
      if (targets.length === 0) {
        logger.info(`tryAutoAssign: No available online partners for order ${order._id}. Retrying in 15s...`);
        await addOrderJob({
          action: 'DISPATCH_TIMEOUT_CHECK',
          orderMongoId: order._id.toString(),
          orderId: order._id.toString(),
          attempt: attempt + 1
        }, { delay: 15000 });
        return order;
      }
      // Pick closest available partner
      eligible.push(targets[0]);
    }

    // Pick the SINGLE CLOSEST delivery partner from eligible
    const targetPartner = eligible[0];
    logger.info(`tryAutoAssign: Offering order ${order._id} to CLOSEST partner ${targetPartner.partnerId} (${targetPartner.distanceKm} km).`);

    const io = getIO();
    const payload = buildDeliverySocketPayload(order, order.restaurantId);

    if (io) {
      const roomName = rooms.delivery(targetPartner.partnerId);
      io.to(roomName).emit('new_order', { ...payload, pickupDistanceKm: targetPartner.distanceKm, forceAlert: true });
      io.to(roomName).emit('play_notification_sound', { ...payload, pickupDistanceKm: targetPartner.distanceKm });
    }

    try {
      await notifyOwnersSafely(
        [{ ownerType: 'DELIVERY_PARTNER', ownerId: targetPartner.partnerId }],
        {
          title: 'New order request! 🛵',
          body: `Order #${order.order_id || order._id} is nearby (${targetPartner.distanceKm || 0} km). Accept now!`,
          data: {
            type: 'new_order',
            orderId: order._id.toString(),
            order_id: order.order_id || order.orderId || order._id.toString(),
            displayOrderId: order.order_id || order.orderId || order._id.toString()
          },
        }
      );
    } catch (err) {
      logger.warn(`Push notification failed for rider ${targetPartner.partnerId}: ${err.message}`);
    }

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    order.dispatch.offeredTo.push({
      partnerId: targetPartner.partnerId,
      at: new Date(),
      action: 'offered'
    });
    await order.save();

    // Schedule 30-second timeout check for this driver. If they don't accept in 30s, dispatch to the next closest driver!
    await addOrderJob({
      action: 'DISPATCH_TIMEOUT_CHECK',
      orderMongoId: order._id.toString(),
      orderId: order._id.toString(),
      partnerId: targetPartner.partnerId.toString(),
      attempt: attempt + 1
    }, { delay: 30000 });

    return order;
  } finally {
    await FoodOrder.findByIdAndUpdate(orderId, {
      $unset: { 'dispatch.dispatchingAt': '' },
    });
  }
}


export async function processDispatchTimeout(orderId, partnerId) {
  const order = await FoodOrder.findById(orderId);
  if (!order) return;

  const stillAssigned = order.dispatch?.status === 'assigned' &&
    String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
    !order.dispatch?.acceptedAt;

  if (stillAssigned) {
    logger.info(`Dispatch timeout for partner ${partnerId} on order ${orderId}. Re-trying hunt...`);
    const offer = order.dispatch.offeredTo.find(
      o => String(o.partnerId) === String(partnerId) && o.action === 'offered'
    );
    if (offer) offer.action = 'timeout';

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    await order.save();

    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  } else if (order.dispatch?.status === 'unassigned') {
    // If it's already unassigned (e.g. from a previous timeout), just keep hunting
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  }
}


export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne({
    ...identity,
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });

  if (!order) throw new NotFoundError('Order not found');

  const activeStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'ready'];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
  }

  if (order.dispatch?.status === 'accepted') {
    throw new ValidationError('A delivery partner has already accepted this order.');
  }

  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = null;
  order.dispatch.offeredTo = [];
  await order.save();

  await tryAutoAssign(order._id, { forceRebroadcast: true, attempt: 1 });
  const finalOrder = await FoodOrder.findById(order._id).select('dispatch.offeredTo').lean();
  const notifiedCount = finalOrder?.dispatch?.offeredTo?.length || 0;
  return { success: true, notifiedCount };
}
