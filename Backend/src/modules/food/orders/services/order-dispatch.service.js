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
    .select("_id status lastLat lastLng lastLocationAt name")
    .lean();

  const allowedStatuses = process.env.NODE_ENV === 'production' ? ['approved'] : ['approved', 'pending'];
  allOnline = allOnline.filter(p => allowedStatuses.includes(p.status));

  if (!restaurant?.location?.coordinates?.length) {
    let partners = allOnline;
    if (hasActiveZones) {
      const inZone = partners.filter((p) => isPartnerInActiveZoneSync(p.lastLat, p.lastLng, targetZoneId, activeZones));
      if (inZone.length > 0) partners = inZone;
    }

    return {
      restaurant: null,
      partners: partners.slice(0, limit).map((p) => ({ partnerId: p._id, distanceKm: null, status: p.status })),
    };
  }

  const [rLng, rLat] = restaurant.location.coordinates;
  const scored = [];

  for (const p of allOnline) {
    let isInZone = true;
    if (hasActiveZones && p.lastLat != null && p.lastLng != null) {
      isInZone = isPartnerInActiveZoneSync(p.lastLat, p.lastLng, targetZoneId, activeZones);
    }

    let d = 999;
    if (p.lastLat != null && p.lastLng != null) {
      const calcD = haversineKm(rLat, rLng, p.lastLat, p.lastLng);
      if (Number.isFinite(calcD)) d = calcD;
    }

    // Include if within distance or inside active zone
    if (d <= maxKm || isInZone) {
      scored.push({ partnerId: p._id, distanceKm: d, status: p.status, isInZone });
    }
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));

  if (picked.length === 0) {
    let fallback = allOnline;
    if (hasActiveZones) {
      const inZoneFallback = fallback.filter((p) => isPartnerInActiveZoneSync(p.lastLat, p.lastLng, targetZoneId, activeZones));
      if (inZoneFallback.length > 0) fallback = inZoneFallback;
    }

    return {
      partners: fallback.slice(0, limit).map((p) => ({
        partnerId: p._id,
        distanceKm: null,
        status: p.status,
      })),
    };
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
    // Decoupling: Ensure order is marked ready by restaurant before dispatching to delivery boys
    const DISPATCHABLE_STATUSES = ['ready_for_pickup', 'ready', 'reached_pickup', 'picked_up', 'reached_drop'];
    if (!DISPATCHABLE_STATUSES.includes(order.orderStatus)) {
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

    const forceRebroadcast = Boolean(options.forceRebroadcast);

    // If no eligible partners left
    if (eligible.length === 0) {
      const targets = codEligibleOnlinePartners.filter(p => !excludedPartnerIds.has(p.partnerId.toString()));
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
      // Pick closest available non-excluded partner
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

  await tryAutoAssign(order._id);
  const finalOrder = await FoodOrder.findById(order._id).select('dispatch.offeredTo').lean();
  const notifiedCount = finalOrder?.dispatch?.offeredTo?.length || 0;
  return { success: true, notifiedCount };
}
