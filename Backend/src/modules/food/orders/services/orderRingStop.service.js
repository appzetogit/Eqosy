import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { stopOrderRingSafely } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

/** New-order pushes are tagged with the order's Mongo _id, so resolve a route id / order label to it. */
const resolveOrder = async (orderRef, order) => {
    const fromDoc = order?._id || order?.orderMongoId || order?.id;
    if (fromDoc && mongoose.Types.ObjectId.isValid(String(fromDoc))) {
        return { id: String(fromDoc), label: order?.order_id || order?.orderId || String(fromDoc) };
    }
    const ref = String(orderRef || '').trim();
    if (!ref) return null;
    const filter = mongoose.Types.ObjectId.isValid(ref) ? { _id: ref } : { order_id: ref };
    const doc = await FoodOrder.findOne(filter).select('_id order_id').lean();
    return doc ? { id: String(doc._id), label: doc.order_id || String(doc._id) } : null;
};

/**
 * Fire-and-forget: silences the ringing new-order notification on that partner's phone.
 * Never throws and never delays the API response.
 */
export const stopOrderRing = (ownerType, ownerId, orderRef, { order, title, body } = {}) => {
    if (!ownerType || !ownerId) return;
    Promise.resolve()
        .then(async () => {
            const resolved = await resolveOrder(orderRef, order);
            if (!resolved) return;
            await stopOrderRingSafely({
                ownerType,
                ownerId: String(ownerId),
                orderId: resolved.id,
                title: title || `Order #${resolved.label}`,
                body: body || 'This order has been handled.',
            });
        })
        .catch((err) => logger.warn(`[RingStop] ${ownerType}:${ownerId} order ${orderRef}: ${err?.message || err}`));
};
