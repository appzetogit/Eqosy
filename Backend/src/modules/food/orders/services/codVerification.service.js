import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodTransaction } from '../models/foodTransaction.model.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { stopOrderRing } from './orderRingStop.service.js';
import { listNearbyOnlineDeliveryPartners, filterPartnersByCodCashLimit } from './order-dispatch.service.js';
import { buildCashWarningForOffer } from '../../delivery/services/deliveryCashLimit.service.js';
import { releasePenaltiesForCancelledOrder } from './order-return.service.js';
import * as foodTransactionService from './foodTransaction.service.js';
import {
  buildDeliverySocketPayload,
  buildOrderIdentityFilter,
  emitOrderStatusSocket,
  haversineKm,
  notifyOwnersSafely,
  notifyRestaurantNewOrder,
  sanitizeOrderForExternal,
} from './order.helpers.js';

/**
 * COD phone verification.
 *
 * A Cash on Delivery order does not go to the restaurant straight away. It is offered to one nearby delivery
 * partner at a time. The partner has 2 minutes to approve it. After approving, they call the customer and
 * have 2 more minutes to reach them:
 *   - customer confirms         -> order goes to the restaurant; this partner delivers it and earns the COD charge
 *   - 3+ calls, no answer       -> partner marks "not reachable" -> order cancelled
 *   - 2 minutes pass unconfirmed -> order cancelled automatically
 * If no partner approves within COD_RIDER_SEARCH_WINDOW_MS, the order is cancelled.
 *
 * Every deadline is stored on the order and enforced by runCodVerificationSweep (server.js), so a restart
 * never leaves an order stuck.
 */

export const PENDING_COD_STATUS = 'pending_cod_verification';
export const COD_OFFER_WINDOW_MS = 2 * 60 * 1000;
export const COD_CALL_WINDOW_MS = 2 * 60 * 1000;
export const COD_MIN_CALL_ATTEMPTS = 3;
export const COD_RIDER_SEARCH_WINDOW_MS = 10 * 60 * 1000;
const NO_RIDER_RETRY_MS = 20 * 1000;

/** Orders that keep a rider busy: such riders are not offered a COD verification. */
const RIDER_BUSY_STATUSES = [
  PENDING_COD_STATUS, 'created', 'confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop',
];

const oid = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));
const sameId = (a, b) => Boolean(a && b) && String(a?._id || a) === String(b?._id || b);
const displayId = (order) => order?.order_id || order?.orderId || String(order?._id || '');

export function isAwaitingCodVerification(orderLike) {
  return String(orderLike?.orderStatus || '') === PENDING_COD_STATUS;
}

function emitToPartner(partnerId, event, payload) {
  try {
    const io = getIO();
    if (io && partnerId) io.to(rooms.delivery(String(partnerId))).emit(event, payload);
  } catch (err) {
    logger.warn(`[CodVerify] socket ${event} failed: ${err?.message || err}`);
  }
}

/** Take the offer popup off a rider's screen (the offer moved on or the order ended). */
function withdrawOffer(partnerId, order, body = 'Order request expired') {
  if (!partnerId) return;
  emitToPartner(partnerId, 'order_reassigned_elsewhere', {
    orderId: String(order._id),
    orderMongoId: String(order._id),
    displayId: displayId(order),
  });
  stopOrderRing('DELIVERY_PARTNER', partnerId, String(order._id), { order, body });
}

function orderTripKm(order) {
  const rest = order?.restaurantId?.location?.coordinates;
  const cust = order?.deliveryAddress?.location?.coordinates;
  if (!Array.isArray(rest) || !Array.isArray(cust)) return 0;
  const km = haversineKm(rest[1], rest[0], cust[1], cust[0]);
  return Number.isFinite(km) ? km : 0;
}

async function busyPartnerIds(partnerIds, excludeOrderId) {
  if (!partnerIds.length) return new Set();
  const rows = await FoodOrder.find({
    _id: { $ne: excludeOrderId },
    'dispatch.deliveryPartnerId': { $in: partnerIds },
    'dispatch.status': 'accepted',
    orderStatus: { $in: RIDER_BUSY_STATUSES },
  }).select('dispatch.deliveryPartnerId').lean();
  return new Set(rows.map((r) => String(r.dispatch?.deliveryPartnerId)));
}

/** Initial codVerification block for a new cash order. */
export function buildInitialCodVerification({ scheduled = false } = {}) {
  return { state: scheduled ? 'scheduled' : 'awaiting_rider', startedAt: null, offers: [] };
}

/** Starts the rider search (new order, or a scheduled order reaching its 30-minute window). Idempotent. */
export async function startCodVerification(orderId) {
  const now = new Date();
  const started = await FoodOrder.findOneAndUpdate(
    {
      _id: oid(orderId),
      orderStatus: PENDING_COD_STATUS,
      'codVerification.state': { $in: ['scheduled', 'awaiting_rider'] },
      'codVerification.startedAt': null,
    },
    {
      $set: {
        'codVerification.state': 'awaiting_rider',
        'codVerification.startedAt': now,
        'codVerification.searchDeadlineAt': new Date(now.getTime() + COD_RIDER_SEARCH_WINDOW_MS),
        scheduledDispatched: true,
      },
    },
    { new: true },
  ).select('_id');
  if (!started) return null;
  logger.info(`[CodVerify] Started rider search for order ${orderId}`);
  return offerToNextRider(orderId);
}

/**
 * Offers the order to the closest free rider who has not seen it yet. If the current offer is still live
 * this is a no-op. Uses an optimistic version lock, so concurrent callers never double-offer.
 */
export async function offerToNextRider(orderId) {
  const order = await FoodOrder.findById(orderId).populate('restaurantId').populate('userId', 'name phone');
  if (!order || !isAwaitingCodVerification(order) || order.codVerification?.state !== 'awaiting_rider') return null;

  const cv = order.codVerification;
  const now = Date.now();
  if (cv.currentOfferPartnerId && cv.offerExpiresAt && new Date(cv.offerExpiresAt).getTime() > now) return order;

  const version = Number(cv.offerVersion || 0);
  const previousPartnerId = cv.currentOfferPartnerId || null;
  const offers = (cv.offers || []).map((o) => ({
    partnerId: o.partnerId,
    at: o.at,
    action: previousPartnerId && sameId(o.partnerId, previousPartnerId) && o.action === 'offered' ? 'timeout' : o.action,
  }));
  const tried = new Set(offers.map((o) => String(o.partnerId)));

  let next = null;
  try {
    const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, {
      maxKm: 15,
      limit: 25,
      orderDeliveryDistance: orderTripKm(order),
    });
    const eligible = (await filterPartnersByCodCashLimit(partners, order)).filter((p) => !tried.has(String(p.partnerId)));
    const busy = await busyPartnerIds(eligible.map((p) => p.partnerId), order._id);
    next = eligible.find((p) => !busy.has(String(p.partnerId))) || null;
  } catch (err) {
    logger.error(`[CodVerify] Rider search failed for order ${order._id}: ${err.message}`);
  }

  const lock = {
    _id: order._id,
    orderStatus: PENDING_COD_STATUS,
    'codVerification.state': 'awaiting_rider',
    'codVerification.offerVersion': version,
  };

  if (!next) {
    const deadline = cv.searchDeadlineAt ? new Date(cv.searchDeadlineAt).getTime() : 0;
    if (deadline && now >= deadline) {
      if (previousPartnerId) withdrawOffer(previousPartnerId, order);
      return cancelCodOrder(order._id, {
        reason: 'No delivery partner was available to confirm the order',
        customerMessage: `We could not confirm your Cash on Delivery order #${displayId(order)} right now, so it was cancelled. Please try again or pay online.`,
      });
    }
    const res = await FoodOrder.updateOne(lock, {
      $set: {
        'codVerification.offers': offers,
        'codVerification.currentOfferPartnerId': null,
        'codVerification.offerExpiresAt': null,
        'codVerification.nextRetryAt': new Date(now + NO_RIDER_RETRY_MS),
      },
      $inc: { 'codVerification.offerVersion': 1 },
    });
    if (res.modifiedCount && previousPartnerId) withdrawOffer(previousPartnerId, order);
    logger.info(`[CodVerify] No free rider for order ${order._id}; retrying in ${NO_RIDER_RETRY_MS / 1000}s.`);
    return order;
  }

  const offerExpiresAt = new Date(now + COD_OFFER_WINDOW_MS);
  offers.push({ partnerId: next.partnerId, at: new Date(now), action: 'offered' });
  const res = await FoodOrder.updateOne(lock, {
    $set: {
      'codVerification.offers': offers,
      'codVerification.currentOfferPartnerId': next.partnerId,
      'codVerification.offerExpiresAt': offerExpiresAt,
      'codVerification.nextRetryAt': null,
    },
    $inc: { 'codVerification.offerVersion': 1 },
  });
  if (!res.modifiedCount) return order; // someone else moved the offer on first

  if (previousPartnerId) withdrawOffer(previousPartnerId, order);

  const distanceKm = Number.isFinite(Number(next.distanceKm)) && Number(next.distanceKm) < 999
    ? Math.round(Number(next.distanceKm) * 10) / 10
    : 0;
  const codCharge = Number(order.pricing?.codCharge) || 0;
  const cashWarning = await buildCashWarningForOffer(next.partnerId, order).catch(() => ({}));
  const payload = {
    ...buildDeliverySocketPayload(order, order.restaurantId),
    ...cashWarning,
    pickupDistanceKm: distanceKm,
    codVerification: true,
    codCharge,
    offerExpiresAt: offerExpiresAt.toISOString(),
    offerWindowSec: Math.round(COD_OFFER_WINDOW_MS / 1000),
    forceAlert: true,
  };
  emitToPartner(next.partnerId, 'new_order', payload);
  emitToPartner(next.partnerId, 'play_notification_sound', payload);

  await notifyOwnersSafely([{ ownerType: 'DELIVERY_PARTNER', ownerId: next.partnerId }], {
    title: 'COD order to confirm! 📞',
    body: `Order #${displayId(order)} (${distanceKm.toFixed(1)} km). Accept within 2 minutes, call the customer and confirm the order${codCharge > 0 ? ` to earn ₹${codCharge} COD charge` : ''}.`,
    data: {
      type: 'new_order',
      orderId: String(order._id),
      order_id: displayId(order),
      displayOrderId: displayId(order),
      codVerification: 'true',
      targetUrl: '/food/delivery/feed',
      link: '/food/delivery/feed',
      click_action: '/food/delivery/feed',
      role: 'delivery',
      willExceedCashLimit: String(Boolean(cashWarning?.willExceedCashLimit)),
    },
  });

  logger.info(`[CodVerify] Offered order ${order._id} to rider ${next.partnerId} until ${offerExpiresAt.toISOString()}.`);
  return order;
}

/** Rider accepted the COD offer: they are assigned to the order and must now call the customer. */
export async function approveCodOrderByRider(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');
  const pid = oid(deliveryPartnerId);
  const now = new Date();

  const order = await FoodOrder.findOneAndUpdate(
    {
      $and: [identity, {
        orderStatus: PENDING_COD_STATUS,
        'codVerification.state': 'awaiting_rider',
        'codVerification.currentOfferPartnerId': pid,
        'codVerification.offerExpiresAt': { $gt: now },
      }],
    },
    {
      $set: {
        'dispatch.deliveryPartnerId': pid,
        'dispatch.status': 'accepted',
        'dispatch.assignedAt': now,
        'dispatch.acceptedAt': now,
        'codVerification.state': 'calling',
        'codVerification.approvedBy': pid,
        'codVerification.approvedAt': now,
        'codVerification.callDeadlineAt': new Date(now.getTime() + COD_CALL_WINDOW_MS),
        'codVerification.offerExpiresAt': null,
        'codVerification.offers.$[o].action': 'approved',
      },
      $inc: { 'codVerification.offerVersion': 1 },
      $push: {
        statusHistory: {
          at: now, byRole: 'DELIVERY_PARTNER', byId: pid, from: PENDING_COD_STATUS, to: PENDING_COD_STATUS,
          note: 'Delivery partner accepted the COD order and is calling the customer',
        },
      },
    },
    { new: true, arrayFilters: [{ 'o.partnerId': pid, 'o.action': 'offered' }] },
  ).populate('restaurantId').populate('userId', 'name phone');

  if (!order) {
    const existing = await FoodOrder.findOne(identity).populate('restaurantId').populate('userId', 'name phone');
    if (!existing) throw new NotFoundError('Order not found');
    if (existing.codVerification?.state === 'calling' && sameId(existing.codVerification?.approvedBy, pid)) {
      return sanitizeOrderForExternal(existing); // double tap
    }
    if (String(existing.orderStatus || '').startsWith('cancelled')) throw new ValidationError('Order was cancelled');
    throw new ValidationError('This COD order request has expired and moved to another delivery partner.');
  }

  void foodTransactionService.updateTransactionRider(order._id, deliveryPartnerId).catch((err) =>
    logger.warn(`[CodVerify] transaction rider update failed for ${order._id}: ${err.message}`),
  );

  const userMsg = `Your delivery partner will call you in a moment to confirm your Cash on Delivery order #${displayId(order)}. Please keep your phone nearby.`;
  void notifyOwnersSafely([{ ownerType: 'USER', ownerId: order.userId?._id || order.userId }], {
    title: 'Please answer our call 📞',
    body: userMsg,
    data: { type: 'cod_verification_calling', orderId: String(order._id), orderMongoId: String(order._id), link: `/food/user/orders/${order._id}` },
  });
  emitOrderStatusSocket({ userId: order.userId?._id || order.userId }, {
    orderMongoId: String(order._id),
    orderId: displayId(order),
    orderStatus: order.orderStatus,
    codVerification: { state: 'calling', callDeadlineAt: order.codVerification.callDeadlineAt },
    title: 'Please answer our call',
    message: userMsg,
  });

  logger.info(`[CodVerify] Rider ${deliveryPartnerId} approved order ${order._id}; calling customer.`);
  return sanitizeOrderForExternal(order);
}

/** Rider passed on the offer (or gave the order back while still calling): try the next rider. */
export async function rejectCodOrderByRider(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  if (!isAwaitingCodVerification(order)) return order.toObject();

  const cv = order.codVerification || {};
  const pid = oid(deliveryPartnerId);
  const version = Number(cv.offerVersion || 0);
  const lock = { _id: order._id, orderStatus: PENDING_COD_STATUS, 'codVerification.offerVersion': version };
  const markOffers = (action) => (cv.offers || []).map((o) => ({
    partnerId: o.partnerId,
    at: o.at,
    action: sameId(o.partnerId, pid) && ['offered', 'approved'].includes(o.action) ? action : o.action,
  }));

  let changed = false;
  if (cv.state === 'awaiting_rider' && sameId(cv.currentOfferPartnerId, pid)) {
    const res = await FoodOrder.updateOne({ ...lock, 'codVerification.state': 'awaiting_rider' }, {
      $set: {
        'codVerification.offers': markOffers('rejected'),
        'codVerification.currentOfferPartnerId': null,
        'codVerification.offerExpiresAt': null,
      },
      $inc: { 'codVerification.offerVersion': 1 },
    });
    changed = res.modifiedCount > 0;
  } else if (cv.state === 'calling' && sameId(cv.approvedBy, pid)) {
    // Gave the order back before confirming it: release the assignment and find someone else.
    const now = Date.now();
    const searchDeadline = Math.max(new Date(cv.searchDeadlineAt || 0).getTime(), now + COD_OFFER_WINDOW_MS);
    const res = await FoodOrder.updateOne({ ...lock, 'codVerification.state': 'calling' }, {
      $set: {
        'codVerification.state': 'awaiting_rider',
        'codVerification.offers': markOffers('released'),
        'codVerification.currentOfferPartnerId': null,
        'codVerification.offerExpiresAt': null,
        'codVerification.approvedBy': null,
        'codVerification.approvedAt': null,
        'codVerification.callDeadlineAt': null,
        'codVerification.callAttempts': 0,
        'codVerification.callLog': [],
        'codVerification.searchDeadlineAt': new Date(searchDeadline),
        'dispatch.status': 'unassigned',
        'dispatch.deliveryPartnerId': null,
      },
      $unset: { 'dispatch.assignedAt': 1, 'dispatch.acceptedAt': 1 },
      $inc: { 'codVerification.offerVersion': 1 },
    });
    changed = res.modifiedCount > 0;
  }

  if (changed) {
    logger.info(`[CodVerify] Rider ${deliveryPartnerId} passed on order ${order._id}; offering to next rider.`);
    void offerToNextRider(order._id).catch((err) => logger.error(`[CodVerify] re-offer failed: ${err.message}`));
  }
  return (await FoodOrder.findById(order._id).lean()) || order.toObject();
}

async function loadCallingOrder(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  if (!isAwaitingCodVerification(order) || order.codVerification?.state !== 'calling') {
    if (String(order.orderStatus || '').startsWith('cancelled')) throw new ValidationError('Order was cancelled');
    throw new ValidationError('This order is not waiting for customer confirmation.');
  }
  if (!sameId(order.codVerification.approvedBy, deliveryPartnerId)) throw new ForbiddenError('Not your order');
  return order;
}

function publicCodState(cv) {
  return {
    state: cv?.state,
    approvedAt: cv?.approvedAt || null,
    callDeadlineAt: cv?.callDeadlineAt || null,
    callAttempts: Number(cv?.callAttempts || 0),
    minCallAttempts: COD_MIN_CALL_ATTEMPTS,
  };
}

/** Rider tapped "Call customer": count the attempt (needed before "not reachable" is allowed). */
export async function logCodCallAttempt(orderId, deliveryPartnerId) {
  const order = await loadCallingOrder(orderId, deliveryPartnerId);
  const updated = await FoodOrder.findOneAndUpdate(
    { _id: order._id, orderStatus: PENDING_COD_STATUS, 'codVerification.state': 'calling' },
    { $inc: { 'codVerification.callAttempts': 1 }, $push: { 'codVerification.callLog': { at: new Date() } } },
    { new: true },
  ).select('codVerification').lean();
  if (!updated) throw new ValidationError('This order is not waiting for customer confirmation.');
  return { codVerification: publicCodState(updated.codVerification) };
}

/** Customer confirmed on the phone: send the order to the restaurant and give the rider the COD charge. */
export async function confirmCodOrderByRider(orderId, deliveryPartnerId) {
  const order = await loadCallingOrder(orderId, deliveryPartnerId);
  const now = new Date();
  const confirmed = await FoodOrder.findOneAndUpdate(
    { _id: order._id, orderStatus: PENDING_COD_STATUS, 'codVerification.state': 'calling', 'codVerification.approvedBy': oid(deliveryPartnerId) },
    {
      $set: {
        orderStatus: 'created',
        'codVerification.state': 'confirmed',
        'codVerification.confirmedAt': now,
        scheduledDispatched: true,
      },
      $push: {
        statusHistory: {
          at: now, byRole: 'DELIVERY_PARTNER', byId: oid(deliveryPartnerId), from: PENDING_COD_STATUS, to: 'created',
          note: 'Customer confirmed the COD order on call; sent to restaurant',
        },
      },
    },
    { new: true },
  );
  if (!confirmed) throw new ValidationError('This order is not waiting for customer confirmation.');

  // COD charge -> this rider. Added to the payout that is credited on delivery (riderCodChargePay guards re-runs).
  const codCharge = Math.round((Number(confirmed.pricing?.codCharge) || 0) * 100) / 100;
  if (codCharge > 0) {
    const credited = await FoodOrder.updateOne(
      { _id: confirmed._id, riderCodChargePay: { $in: [0, null] } },
      { $set: { riderCodChargePay: codCharge }, $inc: { riderTotalPayout: codCharge, riderEarning: codCharge } },
    );
    if (credited.modifiedCount) {
      await FoodTransaction.updateOne(
        { orderId: confirmed._id },
        {
          $inc: { 'amounts.riderShare': codCharge, 'amounts.riderTotalPayout': codCharge },
          $push: {
            history: {
              kind: 'cod_charge_assigned', amount: codCharge, at: now,
              note: `COD charge for verifying the order assigned to delivery partner`,
              recordedBy: { role: 'DELIVERY_PARTNER', id: oid(deliveryPartnerId) },
            },
          },
        },
      ).catch((err) => logger.error(`[CodVerify] transaction COD charge update failed for ${confirmed._id}: ${err.message}`));
    }
  }

  const fresh = await FoodOrder.findById(confirmed._id).populate('restaurantId').populate('userId', 'name phone');
  await notifyRestaurantNewOrder(fresh);

  const userId = fresh.userId?._id || fresh.userId;
  const msg = `Thanks for confirming! Order #${displayId(fresh)} has been sent to ${fresh.restaurantId?.restaurantName || 'the restaurant'}.`;
  void notifyOwnersSafely([{ ownerType: 'USER', ownerId: userId }], {
    title: 'Order Confirmed! 🎉',
    body: msg,
    data: { type: 'order_created', orderId: String(fresh._id), orderMongoId: String(fresh._id), link: `/food/user/orders/${fresh._id}` },
  });
  emitOrderStatusSocket({ userId }, {
    orderMongoId: String(fresh._id),
    orderId: displayId(fresh),
    orderStatus: fresh.orderStatus,
    title: 'Order Confirmed!',
    message: msg,
  });

  logger.info(`[CodVerify] Order ${fresh._id} confirmed by rider ${deliveryPartnerId}; sent to restaurant.`);
  return sanitizeOrderForExternal(fresh);
}

/** Rider called 3+ times without an answer: cancel the order. */
export async function markCodCustomerUnreachable(orderId, deliveryPartnerId) {
  const order = await loadCallingOrder(orderId, deliveryPartnerId);
  const attempts = Number(order.codVerification?.callAttempts || 0);
  if (attempts < COD_MIN_CALL_ATTEMPTS) {
    throw new ValidationError(`Please call the customer at least ${COD_MIN_CALL_ATTEMPTS} times first (${attempts}/${COD_MIN_CALL_ATTEMPTS} done).`);
  }
  const cancelled = await cancelCodOrder(order._id, {
    reason: `Customer did not answer ${attempts} confirmation calls`,
    byRole: 'DELIVERY_PARTNER',
    byId: deliveryPartnerId,
    customerMessage: `We called you ${attempts} times to confirm your Cash on Delivery order #${displayId(order)} but could not reach you, so it was cancelled.`,
  });
  return cancelled ? sanitizeOrderForExternal(cancelled) : null;
}

/** Cancels an order that is still awaiting COD verification. Returns null if it already moved on. */
export async function cancelCodOrder(orderId, { reason, byRole = 'SYSTEM', byId = null, customerMessage = '' } = {}) {
  const now = new Date();
  const before = await FoodOrder.findOne({ _id: oid(orderId), orderStatus: PENDING_COD_STATUS })
    .select('codVerification.currentOfferPartnerId codVerification.approvedBy').lean();
  if (!before) return null;

  const order = await FoodOrder.findOneAndUpdate(
    { _id: oid(orderId), orderStatus: PENDING_COD_STATUS },
    {
      $set: {
        orderStatus: 'cancelled_by_admin',
        cancelledBy: 'SYSTEM',
        cancelledAt: now,
        cancellationReason: reason,
        'codVerification.state': 'cancelled',
        'codVerification.cancelledAt': now,
        'codVerification.cancelReason': reason,
        'codVerification.offerExpiresAt': null,
        'dispatch.status': 'cancelled',
      },
      $push: {
        statusHistory: {
          at: now, byRole, ...(byId ? { byId: oid(byId) } : {}), from: PENDING_COD_STATUS, to: 'cancelled_by_admin',
          note: `COD verification failed: ${reason}`,
        },
      },
    },
    { new: true },
  );
  if (!order) return null;

  void releasePenaltiesForCancelledOrder(order._id);
  void foodTransactionService.updateTransactionStatus(order._id, 'cod_verification_cancelled', {
    status: 'failed',
    note: `COD verification failed: ${reason}`,
    recordedByRole: byRole,
    recordedById: byId || undefined,
  }).catch((err) => logger.warn(`[CodVerify] transaction cancel sync failed for ${order._id}: ${err.message}`));

  const userMessage = customerMessage || `Your Cash on Delivery order #${displayId(order)} was cancelled: ${reason}.`;
  const payload = {
    orderMongoId: String(order._id),
    orderId: displayId(order),
    displayId: displayId(order),
    orderStatus: order.orderStatus,
    status: order.orderStatus,
    cancelledBy: 'system',
    message: userMessage,
  };
  try {
    const io = getIO();
    if (io) {
      io.to(rooms.user(order.userId)).emit('order_status_update', payload);
      io.to(rooms.user(order.userId)).emit('order_cancelled', payload);
    }
  } catch (err) {
    logger.warn(`[CodVerify] cancel socket emit failed: ${err.message}`);
  }
  void notifyOwnersSafely([{ ownerType: 'USER', ownerId: order.userId }], {
    title: 'Order Cancelled ❌',
    body: userMessage,
    data: { type: 'order_cancelled', orderId: String(order._id), orderMongoId: String(order._id) },
  });

  const riderPayload = { ...payload, message: `Order #${displayId(order)} was cancelled: ${reason}.` };
  const riders = new Set([before.codVerification?.currentOfferPartnerId, before.codVerification?.approvedBy].filter(Boolean).map(String));
  for (const riderId of riders) {
    emitToPartner(riderId, 'order_cancelled', riderPayload);
    stopOrderRing('DELIVERY_PARTNER', riderId, String(order._id), { order, body: 'Order cancelled' });
  }

  logger.info(`[CodVerify] Order ${order._id} cancelled: ${reason}`);
  return order;
}

/**
 * Enforces every COD verification deadline. Runs every few seconds from server.js:
 *  - offer not accepted in 2 minutes / waiting for a free rider -> next rider (or cancel after the search window)
 *  - customer not confirmed 2 minutes after the rider accepted -> cancel
 */
export async function runCodVerificationSweep() {
  const now = new Date();

  const searching = await FoodOrder.find({
    orderStatus: PENDING_COD_STATUS,
    'codVerification.state': 'awaiting_rider',
    $or: [
      { 'codVerification.offerExpiresAt': { $lte: now } },
      {
        'codVerification.currentOfferPartnerId': null,
        $or: [{ 'codVerification.nextRetryAt': null }, { 'codVerification.nextRetryAt': { $lte: now } }],
      },
    ],
  }).select('_id codVerification.startedAt').limit(50).lean();

  for (const row of searching) {
    try {
      if (!row.codVerification?.startedAt) await startCodVerification(row._id);
      else await offerToNextRider(row._id);
    } catch (err) {
      logger.error(`[CodVerify] sweep offer failed for ${row._id}: ${err.message}`);
    }
  }

  const callsExpired = await FoodOrder.find({
    orderStatus: PENDING_COD_STATUS,
    'codVerification.state': 'calling',
    'codVerification.callDeadlineAt': { $lte: now },
  }).select('_id order_id').limit(50).lean();

  for (const row of callsExpired) {
    try {
      await cancelCodOrder(row._id, {
        reason: 'Customer did not confirm the order within 2 minutes',
        customerMessage: `We could not confirm your Cash on Delivery order #${row.order_id || row._id} with you on call within 2 minutes, so it was cancelled.`,
      });
    } catch (err) {
      logger.error(`[CodVerify] sweep cancel failed for ${row._id}: ${err.message}`);
    }
  }
}
