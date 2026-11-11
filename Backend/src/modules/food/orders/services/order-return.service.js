/**
 * Customer unreachable -> return food to restaurant.
 *
 * 1. Rider is at the drop point, the customer does not answer. After a minimum wait the rider asks admin for help.
 * 2. Admin approves (optionally with a penalty for the customer) or rejects.
 * 3. On approval the rider takes the food back. The restaurant panel shows a 4-digit OTP; the rider enters it
 *    once the restaurant has received the food. That closes the order and the rider keeps the delivery earning.
 * 4. The customer's penalty (if any) is charged on their next order (see order-pricing.service.js).
 */
import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodUserPenalty } from '../models/userPenalty.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';
import { isSuperAdminLike, normalizeObjectIdList } from '../../../../core/admin/adminHierarchy.service.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import {
  buildOrderIdentityFilter,
  generateFourDigitDeliveryOtp,
  normalizeOrderForClient,
  notifyAdminsSafely,
  adminBell,
  notifyOwnersSafely,
  pushStatusHistory,
  sanitizeOrderForExternal,
} from './order.helpers.js';

/** Rider must have waited at the drop point at least this long before asking admin to return the order. */
export const RETURN_MIN_WAIT_MINUTES = Math.max(0, Number(process.env.FOOD_UNREACHABLE_MIN_WAIT_MINUTES ?? 5));

const MAX_PENALTY_AMOUNT = 10000;

const CLOSED_STATUSES = new Set([
  'delivered',
  'returned_to_restaurant',
  'cancelled_by_user',
  'cancelled_by_restaurant',
  'cancelled_by_admin',
]);

const orderLabel = (order) => order.order_id || String(order._id);

async function assertAdminZoneAccess(order, adminContext) {
  if (!adminContext || isSuperAdminLike(adminContext)) return;
  const allowed = normalizeObjectIdList(adminContext.food_zone_ids || adminContext.zone_ids || []).map(String);
  if (allowed.length === 0) {
    throw new ForbiddenError('You do not have permission to perform this action in this zone');
  }

  let zoneId = order.zoneId ? String(order.zoneId) : null;
  if (!zoneId && order.restaurantId) {
    const restaurantId = typeof order.restaurantId === 'object' ? order.restaurantId._id : order.restaurantId;
    const restaurant = restaurantId ? await FoodRestaurant.findById(restaurantId).select('zoneId').lean() : null;
    if (restaurant?.zoneId) zoneId = String(restaurant.zoneId);
  }

  if (zoneId && !allowed.includes(zoneId)) {
    throw new ForbiddenError('You do not have permission to perform this action in this zone');
  }
}

function isAssignedTo(order, partnerId) {
  return String(order.dispatch?.deliveryPartnerId || '') === String(partnerId);
}

function hasReachedDrop(order) {
  return order.deliveryState?.status === 'reached_drop' || order.deliveryState?.currentPhase === 'at_drop';
}

function emitSafe(fn) {
  try {
    const io = getIO();
    if (io) fn(io);
  } catch (err) {
    logger.warn(`[OrderReturn] socket emit failed: ${err?.message || err}`);
  }
}

// ----- Rider: ask admin to approve returning the order -----
export async function requestUndeliveredReturn(orderId, partnerId, payload = {}) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  if (!isAssignedTo(order, partnerId)) throw new ForbiddenError('Not your order');

  if (CLOSED_STATUSES.has(order.orderStatus)) {
    throw new ValidationError(`Order is already ${order.orderStatus.replace(/_/g, ' ')}.`);
  }
  if (!hasReachedDrop(order)) {
    throw new ValidationError('Reach the customer location first.');
  }

  const current = order.undeliveredReturn?.status || 'none';
  if (current === 'requested') throw new ValidationError('Your request is already waiting for admin approval.');
  if (current === 'approved') throw new ValidationError('Return to restaurant is already approved for this order.');

  const reachedAt = order.deliveryState?.reachedDropAt ? new Date(order.deliveryState.reachedDropAt).getTime() : 0;
  const waitedMs = reachedAt ? Date.now() - reachedAt : 0;
  const minWaitMs = RETURN_MIN_WAIT_MINUTES * 60 * 1000;
  if (waitedMs < minWaitMs) {
    const minsLeft = Math.ceil((minWaitMs - waitedMs) / 60000);
    throw new ValidationError(`Please wait ${minsLeft} more minute(s) and keep trying to reach the customer.`);
  }

  const reason = String(payload.reason || 'Customer not answering calls').trim();
  const note = String(payload.note || '').trim();
  const callAttempts = Math.max(0, Math.floor(Number(payload.callAttempts) || 0));
  const from = order.orderStatus;

  order.undeliveredReturn = {
    status: 'requested',
    reason,
    note,
    callAttempts,
    requestedBy: new mongoose.Types.ObjectId(String(partnerId)),
    requestedAt: new Date(),
    penaltyAmount: 0,
  };
  pushStatusHistory(order, {
    byRole: 'DELIVERY_PARTNER',
    byId: partnerId,
    from,
    to: from,
    note: `Customer unreachable - return to restaurant requested: ${reason}${note ? ` (${note})` : ''}`,
  });
  await order.save();

  try {
    const [partner, restaurant, user] = await Promise.all([
      FoodDeliveryPartner.findById(partnerId).select('name fullName phone').lean(),
      FoodRestaurant.findById(order.restaurantId).select('restaurantName name').lean(),
      order.userId ? FoodUser.findById(order.userId).select('name fullName phone').lean() : null,
    ]);
    const partnerName = partner?.name || partner?.fullName || 'Delivery Partner';
    const prepaid = ['razorpay', 'razorpay_qr', 'wallet'].includes(String(order.payment?.method || '').toLowerCase())
      && String(order.payment?.status || '').toLowerCase() === 'paid';
    const adminPayload = {
      orderMongoId: String(order._id),
      orderId: orderLabel(order),
      requestedByPartnerId: String(partnerId),
      partnerName,
      partnerPhone: partner?.phone || '',
      restaurantName: restaurant?.restaurantName || restaurant?.name || 'Restaurant',
      customerName: user?.name || user?.fullName || order.customerName || 'Customer',
      customerPhone: user?.phone || order.customerPhone || '',
      reason,
      note,
      callAttempts,
      message: `${partnerName} waited ${RETURN_MIN_WAIT_MINUTES} min but the customer is not receiving Order #${orderLabel(order)}${prepaid ? ' (PREPAID - can go to Food Rescue)' : ''}. Reason: ${reason}.`,
      isPrepaid: prepaid,
      zoneId: order.zoneId ? String(order.zoneId) : undefined,
      title: prepaid ? '📵 Prepaid order not received' : '📵 Customer Unreachable',
      path: '/admin/food/orders/unreachable-requests',
    };
    emitSafe((io) => {
      io.to('admin_room').emit('admin_undelivered_request', adminPayload);
      io.to(rooms.delivery(partnerId)).emit('order_return_requested', adminPayload);
    });
    await notifyAdminsSafely({
      title: prepaid ? '📵 Prepaid order not received - Approval Needed' : '📵 Customer Unreachable - Approval Needed',
      body: prepaid
        ? `Order #${orderLabel(order)} (prepaid): customer is not picking up the food after ${RETURN_MIN_WAIT_MINUTES} min. Send it to Food Rescue or return it?`
        : `Order #${orderLabel(order)}: ${partnerName} cannot reach the customer. Approve return to restaurant?`,
      data: {
        type: 'undelivered_return_request',
        orderId: String(order._id),
        orderMongoId: String(order._id),
        // Without ring=true the push is classified as a silent status update ("undelivered" contains "delivered").
        ring: 'true',
        link: '/admin/food/orders/unreachable-requests',
        targetUrl: '/admin/food/orders/unreachable-requests',
      },
    });
  } catch (err) {
    logger.warn(`[OrderReturn] admin notification failed: ${err?.message || err}`);
  }

  return { pendingApproval: true, order: sanitizeOrderForExternal(order) };
}

// ----- Admin -----
export async function listPendingReturnRequestsAdmin(adminContext = null) {
  const filter = { 'undeliveredReturn.status': 'requested' };

  if (adminContext && !isSuperAdminLike(adminContext)) {
    const zoneIds = normalizeObjectIdList(adminContext.food_zone_ids || adminContext.zone_ids || [])
      .map((id) => new mongoose.Types.ObjectId(id));
    if (zoneIds.length === 0) return [];
    const restaurants = await FoodRestaurant.find({ zoneId: { $in: zoneIds } }).select('_id').lean();
    filter.$or = [{ zoneId: { $in: zoneIds } }, { restaurantId: { $in: restaurants.map((r) => r._id) } }];
  }

  const orders = await FoodOrder.find(filter)
    .populate({ path: 'restaurantId', select: 'restaurantName name phone area city zoneId' })
    .populate('userId', 'name fullName phone')
    .populate('undeliveredReturn.requestedBy', 'name fullName phone vehicleType vehicleNumber')
    .sort({ 'undeliveredReturn.requestedAt': -1 })
    .lean();

  // Tell the admin screen which requests can go to Food Rescue (prepaid + switch on) and the suggested price.
  const { noShowRescueEligibility, getConfig } = await import('../../cancellation/services/cancellation.service.js');
  const cfg = await getConfig();
  return Promise.all(orders.map(async (o) => ({
    ...normalizeOrderForClient(o),
    rescueOption: await noShowRescueEligibility(o, cfg).catch(() => ({ eligible: false })),
  })));
}

/**
 * Admin: the customer of a PREPAID order is not collecting it. Instead of returning the food, put it on Food Rescue
 * at a price the admin sets. Same stage-3 charge for the customer; nearby customers are notified.
 */
export async function approveNoShowRescueAdmin(orderId, adminId, body = {}, adminContext = null) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  await assertAdminZoneAccess(order, adminContext);

  if (order.undeliveredReturn?.status !== 'requested') {
    throw new ValidationError('There is no pending request for this order.');
  }
  const partnerId = order.undeliveredReturn.requestedBy || order.dispatch?.deliveryPartnerId;
  const { rescueNoShowOrder } = await import('../../cancellation/services/cancellation.service.js');
  const result = await rescueNoShowOrder(order, adminId, { rescuePrice: body.rescuePrice, penaltyPercent: body.penaltyPercent, note: body.note });

  if (partnerId) {
    emitSafe((io) => {
      io.to(rooms.delivery(partnerId)).emit('order_return_rescued', {
        orderMongoId: String(order._id),
        orderId: orderLabel(order),
        message: 'Admin approved Food Rescue. Keep the food safe at this location. You will get the new delivery as soon as someone buys it.',
      });
    });
  }
  return result;
}

export async function approveUndeliveredReturnAdmin(orderId, adminId, body = {}, adminContext = null) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  await assertAdminZoneAccess(order, adminContext);

  if (order.undeliveredReturn?.status !== 'requested') {
    throw new ValidationError('There is no pending return request for this order.');
  }
  const partnerId = order.undeliveredReturn.requestedBy || order.dispatch?.deliveryPartnerId;
  if (!partnerId) throw new ValidationError('No delivery partner is linked to this request.');

  const rawPenalty = Number(body.penaltyAmount ?? 0);
  if (!Number.isFinite(rawPenalty) || rawPenalty < 0 || rawPenalty > MAX_PENALTY_AMOUNT) {
    throw new ValidationError(`Penalty must be between 0 and ${MAX_PENALTY_AMOUNT}.`);
  }
  const penaltyAmount = Math.round(rawPenalty * 100) / 100;
  const adminNote = String(body.note || '').trim();
  const now = new Date();
  const from = order.orderStatus;

  order.undeliveredReturn.status = 'approved';
  order.undeliveredReturn.decidedBy = adminId || null;
  order.undeliveredReturn.decidedAt = now;
  order.undeliveredReturn.adminNote = adminNote;
  order.undeliveredReturn.penaltyAmount = penaltyAmount;
  order.undeliveredReturn.rejectionReason = '';
  order.returnOtp = generateFourDigitDeliveryOtp();

  pushStatusHistory(order, {
    byRole: 'ADMIN',
    byId: adminId,
    from,
    to: from,
    note: `Return to restaurant approved${penaltyAmount > 0 ? ` with customer penalty Rs ${penaltyAmount}` : ''}${adminNote ? `: ${adminNote}` : ''}`,
  });
  await order.save();

  // COD: booked as one policy case + one ledger penalty (shown in the admin Cancellation centre, blocks COD until paid,
  // restaurant/rider payouts follow when the restaurant OTP confirms the return). Prepaid keeps the older flow below.
  const cancellation = await import('../../cancellation/services/cancellation.service.js');
  let handledByPolicy = false;
  if (!cancellation.isPaidOnline(order)) {
    try {
      await cancellation.recordReturnPenalty(order, adminId, { amount: penaltyAmount, percent: body.penaltyPercent, note: adminNote });
      handledByPolicy = true;
    } catch (err) {
      logger.error(`[OrderReturn] could not book the return case for ${order._id}: ${err?.message || err}`);
    }
  }

  // One penalty per order: charged on the customer's next order.
  if (!handledByPolicy && penaltyAmount > 0 && order.userId) {
    const existing = await FoodUserPenalty.findOne({ orderId: order._id });
    if (existing) {
      if (existing.status === 'pending') {
        existing.amount = penaltyAmount;
        await existing.save();
      }
    } else {
      await FoodUserPenalty.create({
        userId: order.userId,
        orderId: order._id,
        amount: penaltyAmount,
        reason: `Order #${orderLabel(order)} could not be delivered - customer unreachable`,
        createdByAdminId: adminId || null,
      });
    }
  }

  const label = orderLabel(order);
  const base = { orderMongoId: String(order._id), orderId: label };
  emitSafe((io) => {
    io.to(rooms.delivery(partnerId)).emit('order_return_approved', {
      ...base,
      message: 'Admin approved. Take the food back to the restaurant and enter the OTP shown in the restaurant panel.',
    });
    // The OTP goes to the restaurant panel only; the rider enters it after handing the food back.
    io.to(rooms.restaurant(order.restaurantId)).emit('order_return_incoming', {
      ...base,
      returnOtp: order.returnOtp,
      message: `Order #${label} is coming back to you (customer unreachable). Use the OTP to confirm.`,
    });
    io.to(rooms.user(order.userId)).emit('order_status_update', {
      ...base,
      orderStatus: order.orderStatus,
      undeliveredReturn: { status: 'approved', penaltyAmount },
      statusLabel: 'CANCELLED - COULD NOT REACH YOU',
      message: 'Your order has been cancelled because we could not reach you.',
    });
  });

  await notifyOwnersSafely([{ ownerType: 'DELIVERY_PARTNER', ownerId: partnerId }], {
    title: 'Return Approved ✓',
    body: `Order #${label}: take the food back to the restaurant. You will still receive your earning.`,
    data: { type: 'undelivered_return_approved', orderId: String(order._id), orderMongoId: String(order._id) },
  });
  await notifyOwnersSafely([{ ownerType: 'RESTAURANT', ownerId: order.restaurantId }], {
    title: 'Order Returning to You',
    body: `Order #${label} is coming back. Open the order to see the return OTP.`,
    data: { type: 'undelivered_return_incoming', orderId: String(order._id), orderMongoId: String(order._id) },
  });
  await notifyOwnersSafely([{ ownerType: 'USER', ownerId: order.userId }], {
    title: 'Order cancelled - could not reach you',
    body: penaltyAmount > 0
      ? `Order #${label} was cancelled because we could not reach you. A penalty of Rs ${penaltyAmount} will be added to your next order.`
      : `Order #${label} was cancelled because we could not reach you, so it is being returned to the restaurant.`,
    data: { type: 'order_undelivered', orderId: String(order._id), orderMongoId: String(order._id) },
  });

  const result = normalizeOrderForClient(order);
  delete result.returnOtp; // only the restaurant panel gets to see it
  return result;
}

export async function rejectUndeliveredReturnAdmin(orderId, adminId, reason = '', adminContext = null) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  await assertAdminZoneAccess(order, adminContext);

  if (order.undeliveredReturn?.status !== 'requested') {
    throw new ValidationError('There is no pending return request for this order.');
  }
  const partnerId = order.undeliveredReturn.requestedBy || order.dispatch?.deliveryPartnerId;
  const rejectionReason = String(reason || 'Please keep trying to reach the customer').trim();

  order.undeliveredReturn.status = 'rejected';
  order.undeliveredReturn.decidedBy = adminId || null;
  order.undeliveredReturn.decidedAt = new Date();
  order.undeliveredReturn.rejectionReason = rejectionReason;

  pushStatusHistory(order, {
    byRole: 'ADMIN',
    byId: adminId,
    from: order.orderStatus,
    to: order.orderStatus,
    note: `Return to restaurant rejected: ${rejectionReason}`,
  });
  await order.save();

  if (partnerId) {
    emitSafe((io) => {
      io.to(rooms.delivery(partnerId)).emit('order_return_rejected', {
        orderMongoId: String(order._id),
        orderId: orderLabel(order),
        message: `Admin rejected the return request: ${rejectionReason}`,
      });
    });
    await notifyOwnersSafely([{ ownerType: 'DELIVERY_PARTNER', ownerId: partnerId }], {
      title: 'Return Request Rejected',
      body: `Order #${orderLabel(order)}: ${rejectionReason}`,
      data: { type: 'undelivered_return_rejected', orderId: String(order._id), orderMongoId: String(order._id) },
    });
  }

  return normalizeOrderForClient(order);
}

// ----- Rider: food handed back, restaurant OTP confirms it -----
export async function verifyReturnOtpDelivery(orderId, partnerId, otp) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  const order = await FoodOrder.findOne(identity).select('+returnOtp');
  if (!order) throw new NotFoundError('Order not found');
  if (!isAssignedTo(order, partnerId)) throw new ForbiddenError('Not your order');

  if (order.orderStatus === 'returned_to_restaurant') {
    return { order: sanitizeOrderForExternal(order), alreadyReturned: true };
  }
  if (order.undeliveredReturn?.status !== 'approved') {
    throw new ValidationError('Admin has not approved returning this order yet.');
  }

  const otpStr = String(otp || '').trim();
  if (!otpStr) throw new ValidationError('OTP is required');
  if (!order.returnOtp || order.returnOtp !== otpStr) {
    throw new ValidationError('Invalid OTP. Ask the restaurant for the return OTP shown in their panel.');
  }

  const from = order.orderStatus;
  const payout = Number(order.riderEarning || order.riderTotalPayout || 0) || 0;

  order.orderStatus = 'returned_to_restaurant';
  order.returnOtp = '';
  order.undeliveredReturn.status = 'returned';
  order.undeliveredReturn.returnedAt = new Date();
  // The rider did the work, so the delivery earning is credited (wallet reads it from the order).
  order.undeliveredReturn.riderPayoutAmount = payout;
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    status: 'returned_to_restaurant',
    // Earnings screens group a rider's payouts by this date.
    deliveredAt: order.undeliveredReturn.returnedAt,
  };
  pushStatusHistory(order, {
    byRole: 'DELIVERY_PARTNER',
    byId: partnerId,
    from,
    to: 'returned_to_restaurant',
    note: `Food returned to restaurant. Rider earning Rs ${payout} credited.`,
  });
  await order.save();

  // Restaurant's share of the food and the rider's return pay (idempotent; no-op when no policy case exists, e.g. prepaid).
  try {
    const { settleReturnPayouts } = await import('../../cancellation/services/cancellation.service.js');
    await settleReturnPayouts(order._id);
  } catch (err) {
    logger.error(`[OrderReturn] return payouts failed for ${order._id}: ${err?.message || err}`);
  }

  const label = orderLabel(order);
  const payload = {
    orderMongoId: String(order._id),
    orderId: label,
    orderStatus: 'returned_to_restaurant',
    status: 'returned_to_restaurant',
    deliveryPartnerId: String(partnerId),
    message: `Order #${label} was returned to the restaurant.`,
  };
  emitSafe((io) => {
    io.to(rooms.delivery(partnerId)).emit('order_status_update', payload);
    io.to(rooms.restaurant(order.restaurantId)).emit('order_status_update', payload);
    io.to(rooms.user(order.userId)).emit('order_status_update', payload);
  });
  adminBell({
    title: '✅ Food returned to restaurant',
    message: `Order #${label} was returned to the restaurant by the delivery partner. Rider earning Rs ${payout} credited.`,
    path: '/admin/food/orders/unreachable-requests', category: 'undelivered_return', zoneId: order.zoneId, orderMongoId: order._id,
  });
  await notifyOwnersSafely([{ ownerType: 'DELIVERY_PARTNER', ownerId: partnerId }], {
    title: 'Earning credited ✓',
    body: `Rs ${payout} for Order #${label} was added to your wallet.`,
    data: { type: 'undelivered_return_completed', orderId: String(order._id), orderMongoId: String(order._id) },
  });

  return { order: sanitizeOrderForExternal(order), riderPayoutAmount: payout };
}

/**
 * A cancelled order never reached the customer, so a penalty that was charged on it goes back to "pending"
 * and will be charged on their next order instead.
 */
export async function releasePenaltiesForCancelledOrder(orderId) {
  try {
    await FoodUserPenalty.updateMany(
      { appliedOrderId: orderId, status: 'applied' },
      { $set: { status: 'pending', appliedOrderId: null, appliedAt: null } },
    );
  } catch (err) {
    logger.warn(`[OrderReturn] could not release penalties for order ${orderId}: ${err?.message || err}`);
  }
}

/** Restaurant panel: attach the return OTP only while the return is approved and not yet confirmed. */
export function withReturnOtpForRestaurant(order) {
  if (!order) return order;
  const status = order.undeliveredReturn?.status;
  const out = { ...order };
  if (status === 'approved' && order.returnOtp) {
    out.returnOtp = String(order.returnOtp);
  } else {
    delete out.returnOtp;
  }
  return out;
}
