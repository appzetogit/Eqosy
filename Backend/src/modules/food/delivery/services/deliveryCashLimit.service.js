import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';
import { ValidationError } from '../../../../core/auth/errors.js';

/**
 * COD cash-holding limit for delivery partners.
 *
 *  - Cash in hand = COD cash of delivered orders - admin-verified (Completed) deposits.
 *  - A partner may always accept/complete an order, even one that pushes cash in hand past the limit.
 *  - Right after the delivery that pushes cash in hand ABOVE the limit the partner is forced offline and
 *    cannot go online / accept / be dispatched orders until a deposit is verified by admin.
 *  - Only COD ('cash') orders add to cash in hand; prepaid orders never do.
 */
export const DEFAULT_COD_CASH_LIMIT = 300;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const isCodOrder = (order) => String(order?.payment?.method || '').trim().toLowerCase() === 'cash';

/** Limit set by admin; falls back to the platform default (₹300) when none is configured. */
export async function getCodCashLimit() {
  try {
    const settings = await getDeliveryCashLimitSettings();
    const configured = Number(settings?.deliveryCashLimit) || 0;
    return configured > 0 ? configured : DEFAULT_COD_CASH_LIMIT;
  } catch (err) {
    logger.warn(`[CashLimit] Could not read cash limit settings, using default: ${err?.message || err}`);
    return DEFAULT_COD_CASH_LIMIT;
  }
}

/** Cash in hand for many partners at once. Returns Map<partnerId, cashInHand>. */
export async function getCashInHandMap(partnerIds = []) {
  const ids = partnerIds
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const result = new Map();
  if (!ids.length) return result;

  const [collected, deposited] = await Promise.all([
    FoodOrder.aggregate([
      { $match: { 'dispatch.deliveryPartnerId': { $in: ids }, orderStatus: 'delivered', 'payment.method': 'cash' } },
      { $group: { _id: '$dispatch.deliveryPartnerId', total: { $sum: { $ifNull: ['$pricing.total', 0] } } } },
    ]),
    FoodDeliveryCashDeposit.aggregate([
      { $match: { deliveryPartnerId: { $in: ids }, status: 'Completed' } },
      { $group: { _id: '$deliveryPartnerId', total: { $sum: { $ifNull: ['$amount', 0] } } } },
    ]),
  ]);
  const collectedMap = new Map(collected.map((e) => [String(e._id), Number(e.total) || 0]));
  const depositedMap = new Map(deposited.map((e) => [String(e._id), Number(e.total) || 0]));
  ids.forEach((id) => {
    const key = String(id);
    result.set(key, r2(Math.max(0, (collectedMap.get(key) || 0) - (depositedMap.get(key) || 0))));
  });
  return result;
}

/** Partners that must not receive orders: cash in hand is above the limit. */
export async function getCashBlockedSet(partnerIds = [], limit = null) {
  const totalLimit = limit ?? (await getCodCashLimit());
  const cashMap = await getCashInHandMap(partnerIds);
  const blocked = new Set();
  cashMap.forEach((cash, id) => {
    if (cash > totalLimit) blocked.add(id);
  });
  return blocked;
}

export async function getCashInHand(partnerId) {
  const map = await getCashInHandMap([partnerId]);
  return map.get(String(partnerId)) || 0;
}

/**
 * Cash status of one partner, optionally projected for an incoming order.
 *  - blocked: already ABOVE the limit (must deposit before receiving orders)
 *  - willExceed: this COD order will take cash in hand above the limit (partner goes offline after it)
 */
export async function getCashStatus(partnerId, order = null, limit = null) {
  const [cashInHand, totalLimit] = await Promise.all([getCashInHand(partnerId), limit ?? getCodCashLimit()]);
  const orderCash = isCodOrder(order) ? Math.max(0, Number(order?.pricing?.total) || 0) : 0;
  const projected = r2(cashInHand + orderCash);
  return {
    cashInHand,
    limit: totalLimit,
    remaining: r2(Math.max(0, totalLimit - cashInHand)),
    // Blocked only while cash in hand is above the limit; as soon as it is back at/below the limit orders resume.
    blocked: cashInHand > totalLimit,
    orderCash,
    projectedCashInHand: projected,
    willExceed: orderCash > 0 && projected > totalLimit,
  };
}

export const CASH_LIMIT_WARNING = {
  title: 'Going Offline After This Order',
  message: 'Cash limit will be exceeded after completing this order.',
  detail: 'To receive new orders, please deposit your collected COD cash into the company account.',
};

/** Fields merged into the new-order payload sent to one partner (popup is shown only when willExceed). */
export async function buildCashWarningForOffer(partnerId, order, limit = null) {
  try {
    const status = await getCashStatus(partnerId, order, limit);
    return {
      cashLimit: status.limit,
      cashInHand: status.cashInHand,
      remainingCashLimit: status.remaining,
      willExceedCashLimit: status.willExceed,
      cashLimitWarning: status.willExceed ? { ...CASH_LIMIT_WARNING } : null,
    };
  } catch (err) {
    logger.warn(`[CashLimit] Could not build cash warning for ${partnerId}: ${err?.message || err}`);
    return {};
  }
}

/** Throws-friendly check used by go-online and accept. */
export async function assertCashLimitNotBreached(partnerId) {
  const status = await getCashStatus(partnerId);
  if (status.blocked) {
    const err = new ValidationError(
      `Your COD cash in hand (₹${status.cashInHand}) is above the ₹${status.limit} limit. Deposit your COD cash and wait for admin verification to receive orders.`,
    );
    err.code = 'CASH_LIMIT_EXCEEDED';
    err.details = { cashInHand: status.cashInHand, limit: status.limit };
    throw err;
  }
  return status;
}

/**
 * Called right after a delivery is completed. If the partner is now above the limit, force them offline
 * immediately and tell the app. Never throws (delivery completion must not fail because of this).
 */
export async function enforceCashLimitAfterDelivery(order, partnerId) {
  try {
    if (!partnerId || !isCodOrder(order)) return null;
    const status = await getCashStatus(partnerId);
    if (!status.blocked) return status;

    await FoodDeliveryPartner.updateOne({ _id: partnerId }, { $set: { availabilityStatus: 'offline' } });
    logger.info(`[CashLimit] Partner ${partnerId} went offline: cash in hand ₹${status.cashInHand} > limit ₹${status.limit}.`);

    try {
      const io = getIO();
      if (io) {
        io.to(rooms.delivery(partnerId)).emit('cash_limit_exceeded', {
          cashInHand: status.cashInHand,
          cashLimit: status.limit,
          availabilityStatus: 'offline',
          message: 'Cash limit exceeded. You are now offline. Deposit your COD cash to receive new orders.',
        });
      }
    } catch (socketErr) {
      logger.warn(`[CashLimit] Socket notify failed for ${partnerId}: ${socketErr?.message || socketErr}`);
    }
    return status;
  } catch (err) {
    logger.error(`[CashLimit] Enforcement failed for partner ${partnerId}: ${err?.message || err}`);
    return null;
  }
}
