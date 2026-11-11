import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodUserPenalty } from '../../orders/models/userPenalty.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import {
    FoodCancellationConfig,
    FoodCancellationCase,
    FoodRescueListing,
    FoodPenaltyPayment,
    FoodCancellationAudit,
    DEFAULT_MESSAGES,
} from '../models/cancellation.models.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { recordTransaction } from '../../../../core/payments/transaction.service.js';
import {
    notifyOwnersSafely,
    notifyAdminsSafely,
    haversineKm,
    pushStatusHistory,
    generateFourDigitDeliveryOtp,
    adminBell,
} from '../../orders/services/order.helpers.js';
import {
    createRazorpayCheckoutOrder,
    verifyPaymentSignature,
    isRazorpayConfigured,
    initiateRazorpayRefund,
    getRazorpayInstance,
    getRazorpayKeyId,
} from '../../orders/helpers/razorpay.helper.js';
import * as foodTransactionService from '../../orders/services/foodTransaction.service.js';
import * as userWalletService from '../../user/services/userWallet.service.js';

const MIN = 60 * 1000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CANCEL_POLICY_SOURCE = 'cancellation_policy';
const OUTSTANDING_STATUSES = ['pending', 'applied'];
const TERMINAL = ['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin', 'returned_to_restaurant', 'pending_payment'];

/* ------------------------------ Config ------------------------------ */
let cfgCache = { at: 0, doc: null };

export async function getConfig({ fresh = false } = {}) {
    if (!fresh && cfgCache.doc && Date.now() - cfgCache.at < 15 * 1000) return cfgCache.doc;
    let doc = await FoodCancellationConfig.findOne({ key: 'default' }).lean();
    if (!doc) {
        try {
            doc = (await FoodCancellationConfig.create({ key: 'default' })).toObject();
        } catch {
            doc = await FoodCancellationConfig.findOne({ key: 'default' }).lean();
        }
    }
    // Fill any template the admin never touched so a missing key never produces an empty notification.
    doc.messages = { ...DEFAULT_MESSAGES, ...(doc.messages || {}) };
    doc = withConfigDefaults(doc);
    cfgCache = { at: Date.now(), doc };
    return doc;
}

/** Config documents saved before a setting existed lack it: fall back to the policy defaults instead of undefined/NaN. */
export function withConfigDefaults(doc) {
    const d = doc || {};
    const pick = (v, def) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? def : Number(v));
    return {
        ...d,
        stage2: { ...(d.stage2 || {}), restaurantSharePercent: pick(d.stage2?.restaurantSharePercent, 15) },
        stage3: { ...(d.stage3 || {}), restaurantSharePercent: pick(d.stage3?.restaurantSharePercent, 30), riderReturnPay: pick(d.stage3?.riderReturnPay, 20) },
        rescue: { ...(d.rescue || {}), successPenaltyPercent: pick(d.rescue?.successPenaltyPercent, 60) },
    };
}

async function audit(actorId, action, targetType, targetId, before, after, note = '') {
    try {
        await FoodCancellationAudit.create({ actorId: actorId || null, action, targetType, targetId: String(targetId || ''), before, after, note });
    } catch (e) {
        logger.warn(`[Cancellation] audit failed: ${e?.message}`);
    }
}

const num = (v, name, { min = 0, max = Infinity } = {}) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max === Infinity ? 'no limit' : max}`);
    return n;
};

export async function updateConfig(body = {}, adminId = null) {
    const before = await getConfig({ fresh: true });
    const patch = {};
    const bool = (k) => { if (body[k] !== undefined) patch[k] = !!body[k]; };
    bool('enabled');
    if (body.appliesToPaymentMethods !== undefined) {
        const list = [...new Set((body.appliesToPaymentMethods || []).map(String))];
        if (list.some((m) => !['cash', 'razorpay', 'razorpay_qr', 'wallet'].includes(m))) throw new ValidationError('Unknown payment method');
        patch.appliesToPaymentMethods = list;
    }
    for (const k of ['stage2Statuses', 'stage3Statuses']) {
        if (body[k] !== undefined) patch[k] = [...new Set((body[k] || []).map(String).filter(Boolean))];
    }
    if ((patch.stage2Statuses || before.stage2Statuses).some((s) => (patch.stage3Statuses || before.stage3Statuses).includes(s))) {
        throw new ValidationError('A status cannot belong to both Stage 2 and Stage 3');
    }
    if (body.gstPercent !== undefined) patch.gstPercent = num(body.gstPercent, 'gstPercent', { max: 100 });
    bool('gstOnFoodPenalty');
    if (body.restaurantLateGraceMinutes !== undefined) patch.restaurantLateGraceMinutes = num(body.restaurantLateGraceMinutes, 'restaurantLateGraceMinutes');

    const group = (name, spec) => {
        if (body[name] === undefined) return;
        const cur = before[name] || {};
        const out = { ...cur };
        for (const [k, rule] of Object.entries(spec)) {
            if (body[name][k] === undefined) continue;
            out[k] = rule === 'bool' ? !!body[name][k] : num(body[name][k], `${name}.${k}`, rule);
        }
        patch[name] = out;
    };
    group('stage2', { foodPenaltyPercent: { max: 100 }, includeRiderCompensation: 'bool', includePlatformFee: 'bool', cancellationFee: {}, restaurantSharePercent: { max: 100 } });
    group('stage3', { foodPenaltyPercent: { max: 100 }, includeDeliveryFee: 'bool', includePlatformFee: 'bool', cancellationFee: {}, restaurantSharePercent: { max: 100 }, riderReturnPay: {} });
    group('riderCompensation', { baseAmount: {}, perKm: {}, minAmount: {}, maxAmount: {}, minTrackedKm: {}, paidInStage3: 'bool', payWhenWaived: 'bool' });
    if ((patch.riderCompensation || before.riderCompensation).minAmount > (patch.riderCompensation || before.riderCompensation).maxAmount) {
        throw new ValidationError('Rider compensation minimum cannot exceed the maximum');
    }
    group('rescue', {
        enabled: 'bool', noShowEnabled: 'bool', noShowPenaltyPercent: { max: 100 }, noShowReturnPenaltyPercent: { max: 100 }, successPenaltyPercent: { max: 100 }, radiusKm: { min: 0.1, max: 50 }, windowMinutes: { min: 1, max: 240 }, discountPercent: { max: 100 },
        restaurantSharePercent: { max: 100 }, failedRestaurantCompPercent: { max: 100 }, riderKeepsFoodOnExpiry: 'bool',
        claimHoldMinutes: { min: 1, max: 30 }, deliveryFee: {}, platformFee: {}, gstPercentOnFood: { max: 100 }, maxNotifyUsers: { max: 2000 },
    });
    group('cod', { blockWhileOutstanding: 'bool', reminderIntervalHours: { min: 1 } });

    if (body.cancelReasons !== undefined) {
        const list = Array.isArray(body.cancelReasons) ? body.cancelReasons : [];
        if (!list.length) throw new ValidationError('At least one cancellation reason is required');
        const codes = new Set();
        patch.cancelReasons = list.map((r) => {
            const code = String(r.code || '').trim();
            const label = String(r.label || '').trim();
            if (!code || !label || codes.has(code)) throw new ValidationError('Every reason needs a unique code and a label');
            if (!['customer', 'restaurant', 'rider', 'platform'].includes(r.faultParty)) throw new ValidationError('Invalid fault party');
            codes.add(code);
            return { code, label, faultParty: r.faultParty };
        });
    }
    if (body.messages !== undefined) {
        const msgs = { ...(before.messages || {}) };
        for (const [k, v] of Object.entries(body.messages || {})) {
            if (!(k in DEFAULT_MESSAGES)) continue;
            const text = String(v ?? '').trim();
            if (!text) throw new ValidationError(`Message "${k}" cannot be empty`);
            msgs[k] = text.slice(0, 600);
        }
        patch.messages = msgs;
    }
    patch.updatedBy = adminId;
    const saved = await FoodCancellationConfig.findOneAndUpdate({ key: 'default' }, { $set: patch }, { new: true, upsert: true }).lean();
    saved.messages = { ...DEFAULT_MESSAGES, ...(saved.messages || {}) };
    const after = withConfigDefaults(saved);
    cfgCache = { at: Date.now(), doc: after };
    await audit(adminId, 'CONFIG_UPDATE', 'config', 'default', before, after);
    return after;
}

/** What the customer app needs to render the cancel dialog and rescue screens. */
export async function getPublicConfig() {
    const c = await getConfig();
    return {
        enabled: c.enabled,
        cancelReasons: c.cancelReasons,
        rescue: { enabled: c.rescue.enabled, radiusKm: c.rescue.radiusKm, windowMinutes: c.rescue.windowMinutes, discountPercent: c.rescue.discountPercent },
        stage2FoodPercent: c.stage2.foodPenaltyPercent,
        stage3FoodPercent: c.stage3.foodPenaltyPercent,
    };
}

/* ------------------------------ Helpers ------------------------------ */
const render = (tpl, vars = {}) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
const orderLabel = (o) => String(o?.order_id || o?._id || '');
const inr = (v) => `Rs ${r2(v)}`;

function emit(room, events, payload) {
    try {
        const io = getIO();
        if (!io) return;
        for (const ev of events) io.to(room).emit(ev, payload);
    } catch (e) {
        logger.warn(`[Cancellation] socket emit failed: ${e?.message}`);
    }
}

/**
 * Notify one party exactly once per (case, key). A marker is written only after sending, and the send is
 * retried, so a transient FCM/socket failure does not lose the message and a replay does not duplicate it.
 */
async function sendOnce(caseId, key, { ownerType, ownerId, title, body, type, data = {}, orderId, statusLabel = '' }) {
    if (!ownerId) return false;
    const marker = `${key}:${ownerType}:${ownerId}`;
    if (caseId) {
        const claimed = await FoodCancellationCase.updateOne({ _id: caseId, notified: { $ne: marker } }, { $addToSet: { notified: marker } }).catch(() => ({ modifiedCount: 0 }));
        if (!claimed.modifiedCount) return false; // already sent
    }
    // Restaurant and delivery partner alerts ring like a new order; customers get a normal notification.
    const ring = ownerType !== 'USER';
    const payload = { title, body, data: { type, orderId: String(orderId || ''), orderMongoId: String(orderId || ''), ...(ring ? { ring: 'true' } : {}), ...data } };
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
        try {
            await notifyOwnersSafely([{ ownerType, ownerId }], payload);
            ok = true;
        } catch (e) {
            await new Promise((r) => setTimeout(r, 200 * attempt));
        }
    }
    const room = ownerType === 'USER' ? rooms.user(ownerId) : ownerType === 'RESTAURANT' ? rooms.restaurant(ownerId) : rooms.delivery(ownerId);
    emit(room, ['cancellation_update'], { type, title, message: body, orderId: String(orderId || ''), statusLabel, ring, ...data });
    return ok;
}

/** Paid up front by card/UPI/wallet: the charge is cut from the refund instead of being added to dues. */
export const isPaidOnline = (order) =>
    ['razorpay', 'razorpay_qr', 'wallet'].includes(String(order?.payment?.method || '').toLowerCase()) &&
    String(order?.payment?.status || '').toLowerCase() === 'paid';

function settlementFor(order, total) {
    const online = isPaidOnline(order);
    const paid = online ? r2(order.pricing?.total) : 0;
    const deducted = online ? Math.min(r2(total), paid) : 0;
    return { online, paid, deducted, refundAmount: online ? r2(paid - deducted) : 0, shortfall: online ? r2(total - deducted) : r2(total) };
}

const withTotals = (b) => {
    const total = r2(b.foodPenalty + b.riderCompensation + b.deliveryFee + b.platformFee + b.cancellationFee + b.gst);
    return { ...b, total };
};

/** Which stage a cancel request falls in right now, or null when the stage policy does not apply. */
export async function evaluateForOrder(order, cfgIn = null) {
    const cfg = cfgIn || (await getConfig());
    if (!cfg.enabled || !order) return { applies: false, stage: 0, cfg };
    const method = String(order.payment?.method || 'cash').toLowerCase();
    if (!(cfg.appliesToPaymentMethods || []).includes(method)) return { applies: false, stage: 0, cfg };
    const status = String(order.orderStatus || '');
    if (TERMINAL.includes(status)) return { applies: false, stage: 0, cfg };
    if ((cfg.stage3Statuses || []).includes(status)) return { applies: true, stage: 3, cfg };
    if ((cfg.stage2Statuses || []).includes(status)) return { applies: true, stage: 2, cfg };
    return { applies: true, stage: 1, cfg };
}

function resolveFault(order, cfg, reasonCode) {
    const reason = (cfg.cancelReasons || []).find((r) => r.code === reasonCode) || null;
    if (reason && reason.faultParty !== 'customer') {
        return { waived: true, party: reason.faultParty, note: `Cancellation reason attributed to ${reason.faultParty}`, reason };
    }
    const approved = order.prep?.approvedEta;
    if (approved && Date.now() - new Date(approved).getTime() > (cfg.restaurantLateGraceMinutes || 0) * MIN && !order.prep?.penaltyEvaluated) {
        return { waived: true, party: 'restaurant', note: 'Restaurant exceeded its approved preparation time', reason };
    }
    return { waived: false, party: 'customer', note: '', reason };
}

/**
 * Prepaid order cancelled after pickup while Food Rescue is on: the customer's final charge depends on the rescue outcome
 * (sold -> successPenaltyPercent of food, rest refunded; unsold -> the whole payment is kept), so the refund is held until then.
 */
export const usesRescueHold = (order, stage, cfg) => stage === 3 && Boolean(cfg?.rescue?.enabled) && isPaidOnline(order);

export function computeBreakdown(order, stage, cfg, waived = false) {
    const foodValue = r2(order.pricing?.subtotal);
    const base = {
        foodValue, foodPenaltyPercent: 0, foodPenalty: 0, riderCompensation: 0, riderTrackedKm: r2(order.cancelTracking?.trackedKm),
        deliveryFee: 0, platformFee: 0, cancellationFee: 0, gst: 0,
    };
    // Rider compensation is always computed (Eqosy pays the rider even when the customer is not charged).
    const rc = cfg.riderCompensation || {};
    const hasRider = Boolean(order.dispatch?.deliveryPartnerId || order.deliveryPartnerId);
    let riderComp = 0;
    if (hasRider && base.riderTrackedKm >= (rc.minTrackedKm || 0) && base.riderTrackedKm > 0) {
        riderComp = Math.min(rc.maxAmount ?? Infinity, Math.max(rc.minAmount || 0, (rc.baseAmount || 0) + (rc.perKm || 0) * base.riderTrackedKm));
        riderComp = r2(riderComp);
    }
    const cfgStage = stage === 3 ? cfg.stage3 : cfg.stage2;
    const platformFee = cfgStage.includePlatformFee ? r2(order.pricing?.platformFee) : 0;
    // Prepaid + Food Rescue: the charge shown/booked up front is the "rescue sold" one (60% by default).
    const foodPct = usesRescueHold(order, stage, cfg) ? (cfg.rescue.successPenaltyPercent ?? cfgStage.foodPenaltyPercent ?? 0) : (cfgStage.foodPenaltyPercent || 0);
    const foodPenalty = r2((foodValue * foodPct) / 100);
    const gst = r2(((platformFee + (cfgStage.cancellationFee || 0) + (cfg.gstOnFoodPenalty ? foodPenalty : 0)) * (cfg.gstPercent || 0)) / 100);
    const charge = {
        ...base,
        foodPenaltyPercent: foodPct,
        foodPenalty,
        riderCompensation: stage === 2 && cfgStage.includeRiderCompensation ? riderComp : 0,
        deliveryFee: stage === 3 && cfgStage.includeDeliveryFee ? r2(order.pricing?.deliveryFee) : 0,
        platformFee,
        cancellationFee: r2(cfgStage.cancellationFee),
        gst,
    };
    const result = waived ? { ...base, foodPenaltyPercent: charge.foodPenaltyPercent } : charge;
    const out = withTotals(result);
    // What the rider is owed regardless of who pays: stage 2 = distance covered (GPS), stage 3 = the order's delivery charge.
    out.riderPayable = stage === 3 ? (hasRider ? r2(order.pricing?.deliveryFee) : 0) : riderComp;
    // Restaurant compensation as a % of the food value (stage 2 = prepared, stage 3 = food returned). Nothing when the restaurant was at fault.
    out.restaurantSharePercent = r2(cfgStage.restaurantSharePercent ?? (stage === 3 ? 30 : 15));
    out.restaurantPayable = waived ? 0 : r2((foodValue * out.restaurantSharePercent) / 100);
    out.riderReturnPay = stage === 3 ? r2(cfg.stage3?.riderReturnPay ?? 20) : 0; // only paid when the food is physically returned
    return out;
}

/* ------------------------------ Preview + cancel ------------------------------ */
export async function previewCancellation(orderId, userId, reasonCode = '') {
    const order = await FoodOrder.findOne({ _id: oid(orderId), userId: oid(userId) });
    if (!order) throw new NotFoundError('Order not found');
    const { applies, stage, cfg } = await evaluateForOrder(order);
    if (!applies) return { applies: false, stage: 0, message: 'Standard cancellation rules apply to this order.' };
    if (stage === 1) {
        return { applies: true, stage: 1, charge: 0, message: render(cfg.messages.s1_customer), breakdown: computeBreakdown(order, 1, cfg, true) };
    }
    const fault = resolveFault(order, cfg, reasonCode);
    const breakdown = computeBreakdown(order, stage, cfg, fault.waived);
    const st = settlementFor(order, breakdown.total);
    const hold = usesRescueHold(order, stage, cfg) && !fault.waived;
    const where = hold
        ? `If another customer buys your food within ${cfg.rescue.windowMinutes} minutes, Rs ${st.deducted} is kept and Rs ${st.refundAmount} is refunded to your original payment method. If nobody buys it, your full payment of Rs ${st.paid} is kept and nothing is refunded.`
        : st.online
            ? `Cancelling now deducts the charges below from your payment of Rs ${st.paid}. You get Rs ${st.refundAmount} back to your original payment method.`
            : 'Cancelling now adds the charges below to your outstanding balance and disables Cash on Delivery until they are paid.';
    return {
        applies: true,
        stage,
        charge: breakdown.total,
        waived: fault.waived,
        waivedReason: fault.note,
        breakdown,
        settlement: st.online ? 'refund_deduction' : 'outstanding',
        paid: st.paid,
        deducted: st.deducted,
        refundAmount: st.refundAmount,
        shortfall: st.online ? st.shortfall : 0,
        refundHeldForRescue: hold,
        refundIfNotRescued: hold ? 0 : undefined,
        rescueWillStart: stage === 3 && cfg.rescue.enabled,
        message: stage === 2
            ? `The restaurant has already started preparing your food. ${where}`
            : `Your food is packed and with the delivery partner. ${where} The food will be offered to nearby customers at a discount.`,
    };
}

async function creditParty({ caseDoc, key, party, partyId, amount, kind, description, category }) {
    const settleKey = `${caseDoc._id}:${key}`;
    const existing = (caseDoc.settlements || []).find((s) => s.key === settleKey && s.status === 'done');
    if (existing) return existing;
    const entityType = party === 'RESTAURANT' ? 'restaurant' : 'deliveryBoy';
    let entry = { key: settleKey, party, partyId, kind, amount, status: 'pending', at: new Date() };
    if (!(amount > 0) || !partyId) {
        entry = { ...entry, status: 'skipped', note: !partyId ? 'No party to pay' : 'Nothing to pay' };
    } else {
        try {
            // The idempotency key makes a retry safe, so a transient database error is retried before giving up.
            let res;
            for (let attempt = 1; ; attempt += 1) {
                try {
                    res = await recordTransaction({
                        entityType, entityId: String(partyId), type: 'credit', amount, description, category,
                        orderId: String(caseDoc.orderId), idempotencyKey: `cancel:${settleKey}`,
                    });
                    break;
                } catch (err) {
                    if (attempt >= 3) throw err;
                    await new Promise((r) => setTimeout(r, 150 * attempt));
                }
            }
            entry = { ...entry, status: 'done', transactionId: String(res?.transaction?._id || '') };
            // Mirror on the Eqosy wallet so the books balance and admin can audit what Eqosy paid out.
            await recordTransaction({
                entityType: 'admin', entityId: 'admin', type: 'debit', amount, description: `${description} (paid by Eqosy)`,
                category: 'adjustment', orderId: String(caseDoc.orderId), idempotencyKey: `cancel:${settleKey}:eqosy`,
            }).catch((e) => logger.warn(`[Cancellation] eqosy mirror failed ${settleKey}: ${e?.message}`));
        } catch (e) {
            entry = { ...entry, status: 'failed', note: String(e?.message || e).slice(0, 200) };
            logger.error(`[Cancellation] settlement ${settleKey} failed: ${e?.message}`);
        }
    }
    await FoodCancellationCase.updateOne(
        { _id: caseDoc._id },
        { $pull: { settlements: { key: settleKey } } }
    );
    await FoodCancellationCase.updateOne({ _id: caseDoc._id }, { $push: { settlements: entry } });
    return entry;
}

/** Stage 1 helper: record the free cancellation and send the templated messages (no charge, nothing owed). */
export async function recordFreeCancellation(order, userId, { reasonCode = '', reasonLabel = '' } = {}) {
    const cfg = await getConfig();
    const { applies } = await evaluateForOrder({ ...order.toObject?.() ?? order, orderStatus: 'created' }, cfg);
    if (!applies) return false;
    let caseDoc;
    try {
        caseDoc = await FoodCancellationCase.create({
            orderId: order._id, orderLabel: orderLabel(order), userId: oid(userId), restaurantId: order.restaurantId,
            riderId: order.dispatch?.deliveryPartnerId || null, stage: 1, status: 'cancelled', reasonCode, reasonLabel,
            cancelledFromStatus: order.orderStatus, configSnapshot: { stage: 1 },
            timeline: [{ at: new Date(), event: 'cancelled', note: 'Cancelled before restaurant acceptance. No charge.' }],
        });
    } catch (e) {
        if (e?.code === 11000) return true;
        throw e;
    }
    const label = orderLabel(order);
    const meta = { orderId: order._id, statusLabel: 'CANCELLED' };
    await sendOnce(caseDoc._id, 's1', { ownerType: 'USER', ownerId: userId, title: 'Order cancelled', body: render(cfg.messages.s1_customer), type: 'order_cancelled', ...meta });
    await sendOnce(caseDoc._id, 's1', { ownerType: 'RESTAURANT', ownerId: order.restaurantId, title: 'Order cancelled by customer', body: render(cfg.messages.s1_restaurant, { orderId: label }), type: 'order_cancelled', ...meta });
    if (order.dispatch?.deliveryPartnerId) {
        await sendOnce(caseDoc._id, 's1', { ownerType: 'DELIVERY_PARTNER', ownerId: order.dispatch.deliveryPartnerId, title: 'Order cancelled', body: render(cfg.messages.s1_rider, { orderId: label }), type: 'order_cancelled', ...meta });
    }
    return true;
}

/**
 * Stage 2 / 3 cancellation requested by the customer. Charges are only applied when the customer has seen
 * and accepted them. The whole case is created once (unique orderId), so a double tap can never double charge.
 */
export async function cancelWithPolicy(orderId, userId, { reasonCode = '', comment = '', acknowledgePenalty = false } = {}) {
    const order = await FoodOrder.findOne({ _id: oid(orderId), userId: oid(userId) });
    if (!order) throw new NotFoundError('Order not found');
    const { applies, stage, cfg } = await evaluateForOrder(order);
    if (!applies || stage < 2) throw new ValidationError('This order cannot be cancelled with the stage policy.');

    const fault = resolveFault(order, cfg, reasonCode);
    const breakdown = computeBreakdown(order, stage, cfg, fault.waived);
    if (breakdown.total > 0 && !acknowledgePenalty) {
        throw new ValidationError(`Cancelling now will add Rs ${breakdown.total} to your outstanding balance. Please review and accept the charges to continue.`);
    }

    return runPolicyCancellation(order, cfg, stage, fault, breakdown, { reasonCode, comment, actor: { role: 'USER', id: userId }, cancelledBy: 'USER' });
}

/**
 * Shared by the customer's own cancel and by the admin-approved "customer not receiving a prepaid order" rescue.
 * Applies the stage charge, settles it (refund deduction / outstanding), starts Food Rescue for stage 3 and notifies everyone.
 */
async function runPolicyCancellation(order, cfg, stage, fault, breakdown, { reasonCode = '', comment = '', actor, cancelledBy = 'USER', reasonLabel: labelIn = '', rescueFoodPrice = null, mutateOrder = null } = {}) {
    const userId = actor?.id || order.userId;
    const reasonLabel = labelIn || fault.reason?.label || reasonCode || comment || 'Cancelled by customer';
    const from = order.orderStatus;
    // Atomic gate: only the request that still sees the original status may cancel.
    const gate = await FoodOrder.updateOne({ _id: order._id, orderStatus: from }, { $set: { orderStatus: 'cancelled_by_user' } });
    if (!gate.modifiedCount) throw new ValidationError('This order has just changed. Please refresh and try again.');

    let caseDoc;
    try {
        caseDoc = await FoodCancellationCase.create({
            orderId: order._id, orderLabel: orderLabel(order), userId: order.userId, restaurantId: order.restaurantId,
            riderId: order.dispatch?.deliveryPartnerId || null, stage, cancelledFromStatus: from,
            status: stage === 3 && cfg.rescue.enabled ? 'rescue_active' : 'cancelled',
            reasonCode, reasonLabel, faultParty: fault.party, chargeWaived: fault.waived, chargeWaivedReason: fault.note,
            breakdown, payMode: settlementFor(order, breakdown.total).online ? 'refund_deduction' : 'outstanding',
            paidAmount: settlementFor(order, breakdown.total).paid,
            refund: (() => {
                const x = settlementFor(order, breakdown.total);
                if (!x.online) return { status: 'none' };
                // Prepaid + Food Rescue: the refund waits for the rescue outcome (sold -> refunded, unsold -> payment kept).
                const status = fault.waived || !usesRescueHold(order, stage, cfg) ? (x.refundAmount > 0 ? 'pending' : 'none') : (x.refundAmount > 0 ? 'held' : 'none');
                return { status, amount: x.refundAmount, deducted: x.deducted, shortfall: x.shortfall };
            })(),
            configSnapshot: { stage, rates: { stage2: cfg.stage2, stage3: cfg.stage3, gstPercent: cfg.gstPercent, riderCompensation: cfg.riderCompensation, rescue: cfg.rescue } },
            timeline: [{ at: new Date(), event: 'cancelled', note: `Stage ${stage}: cancelled from "${from}". Charge Rs ${breakdown.total}${fault.waived ? ` (waived: ${fault.note})` : ''}` }],
        });
    } catch (e) {
        if (e?.code === 11000) {
            caseDoc = await FoodCancellationCase.findOne({ orderId: order._id });
        } else {
            await FoodOrder.updateOne({ _id: order._id, orderStatus: 'cancelled_by_user' }, { $set: { orderStatus: from } });
            throw e;
        }
    }

    // Customer ledger. COD: one unpaid row (outstanding). Online: the deducted part is recorded as already paid
    // (cut from the refund), and only a rare shortfall (charge > amount paid) stays outstanding.
    const st = settlementFor(order, breakdown.total);
    if (st.online && st.deducted > 0 && caseDoc.payMode === 'refund_deduction') {
        const ded = await FoodUserPenalty.findOneAndUpdate(
            { orderId: order._id, source: CANCEL_POLICY_SOURCE, paidVia: 'refund_deduction' },
            {
                $setOnInsert: {
                    userId: order.userId, orderId: order._id, amount: st.deducted, source: CANCEL_POLICY_SOURCE, caseId: caseDoc._id,
                    breakdown, status: 'paid', paidAt: new Date(), paidVia: 'refund_deduction', paidRef: String(order._id),
                    reason: `Order #${orderLabel(order)} cancelled after ${stage === 2 ? 'food preparation started' : 'pickup (Food Rescue)'}: ${reasonLabel}. Deducted from your payment.`,
                },
            },
            { upsert: true, new: true }
        );
        await recordTransaction({
            entityType: 'admin', entityId: 'admin', type: 'credit', amount: st.deducted, description: `Cancellation charge deducted from refund, order ${order._id}`,
            category: 'platform_fee', orderId: String(order._id), idempotencyKey: `penalty_paid:${ded._id}`,
        }).catch((e) => logger.warn(`[Cancellation] deduction revenue entry failed: ${e?.message}`));
        await FoodCancellationCase.updateOne({ _id: caseDoc._id }, { $set: { penaltyId: ded._id } });
        caseDoc.penaltyId = ded._id;
    }
    if (st.shortfall > 0 && (!caseDoc.penaltyId || st.online)) {
        const pen = await FoodUserPenalty.findOneAndUpdate(
            st.online ? { orderId: order._id, source: CANCEL_POLICY_SOURCE, paidVia: '' } : { orderId: order._id, source: CANCEL_POLICY_SOURCE },
            {
                $setOnInsert: {
                    userId: order.userId, orderId: order._id, amount: st.shortfall, source: CANCEL_POLICY_SOURCE, caseId: caseDoc._id,
                    breakdown, status: 'pending',
                    reason: `Order #${orderLabel(order)} cancelled after ${stage === 2 ? 'food preparation started' : 'pickup (Food Rescue)'}: ${reasonLabel}`,
                },
            },
            { upsert: true, new: true }
        );
        await FoodCancellationCase.updateOne({ _id: caseDoc._id }, { $set: { penaltyId: pen._id } });
        caseDoc.penaltyId = pen._id;
    }

    // Order document: status history + synced policy fields.
    order.orderStatus = 'cancelled_by_user';
    order.cancellationReason = reasonCode;
    order.cancellationComment = comment;
    order.cancelledAt = new Date();
    order.cancelledBy = cancelledBy;
    order.cancellationPolicy = {
        caseId: caseDoc._id, stage, penaltyTotal: breakdown.total, payMode: caseDoc.payMode, deducted: st.deducted, refundAmount: st.refundAmount, rescueStatus: stage === 3 && cfg.rescue.enabled ? 'active' : '',
        statusLabel: stage === 3 && cfg.rescue.enabled ? 'CANCELLED – FOOD RESCUE ACTIVATED' : 'CANCELLED',
    };
    pushStatusHistory(order, { byRole: actor?.role || 'USER', byId: userId, from, to: 'cancelled_by_user', note: `Stage ${stage} cancellation. ${reasonLabel}` });
    if (typeof mutateOrder === 'function') mutateOrder(order);
    await order.save();

    // Rescue first (it needs the rider's live position), settlements next, then messages.
    let listing = null;
    if (stage === 3 && cfg.rescue.enabled) listing = await activateRescue(order, caseDoc, cfg, { rescueFoodPrice });

    if (caseDoc.riderId && breakdown.riderPayable > 0 && (breakdown.riderCompensation > 0 || breakdown.deliveryFee > 0 || cfg.riderCompensation.payWhenWaived !== false) && (stage === 2 || cfg.riderCompensation.paidInStage3)) {
        await creditParty({
            caseDoc: await FoodCancellationCase.findById(caseDoc._id), key: 'rider', party: 'DELIVERY_PARTNER', partyId: caseDoc.riderId,
            amount: breakdown.riderPayable, kind: stage === 3 ? 'rider_delivery_charge' : 'rider_travel_compensation', category: 'delivery_payout',
            description: stage === 3
                ? `Delivery charge for cancelled order ${orderLabel(order)}`
                : `Travel compensation for cancelled order ${orderLabel(order)} (${breakdown.riderTrackedKm} km GPS)`,
        });
    }
    if (stage === 2 && !fault.waived && breakdown.restaurantPayable > 0) {
        await creditParty({
            caseDoc: await FoodCancellationCase.findById(caseDoc._id), key: 'restaurant', party: 'RESTAURANT', partyId: order.restaurantId,
            amount: breakdown.restaurantPayable, kind: 'restaurant_preparation_compensation', category: 'order_payout',
            description: `Food preparation compensation for cancelled order ${orderLabel(order)}`,
        });
    }

    // A refund held for the Food Rescue outcome is released (or dropped) when the rescue is sold / expires.
    if (caseDoc.payMode === 'refund_deduction' && caseDoc.refund?.status !== 'held') await processRefund(caseDoc._id).catch((e) => logger.error(`[Cancellation] refund failed ${caseDoc._id}: ${e?.message}`));

    await syncOrderSocket(order, caseDoc, listing);
    await notifyCancellation(caseDoc, order, cfg, { stage, breakdown, fault, listing });
    await audit(userId, 'CASE_CREATED', 'case', caseDoc._id, null, { stage, total: breakdown.total });
    return { caseId: caseDoc._id, stage, breakdown, payMode: caseDoc.payMode, refundAmount: st.refundAmount, statusLabel: order.cancellationPolicy.statusLabel, rescueExpiresAt: listing?.expiresAt || null };
}

/* ------------------------------ Prepaid no-show -> Food Rescue (admin approved) ------------------------------ */
export const isNoShowRescueEnabled = (cfg) => Boolean(cfg?.enabled && cfg?.rescue?.enabled && cfg?.rescue?.noShowEnabled !== false);

/** Can this order (rider waiting at the door, customer not receiving) be sent to Food Rescue? Used by the admin list. */
export async function noShowRescueEligibility(order, cfgIn = null) {
    const cfg = cfgIn || (await getConfig());
    const foodValue = r2(order?.pricing?.subtotal);
    const base = { eligible: false, foodValue, defaultPrice: r2((foodValue * (100 - (cfg.rescue?.discountPercent || 0))) / 100), discountPercent: cfg.rescue?.discountPercent || 0, penaltyPercent: cfg.rescue?.successPenaltyPercent ?? cfg.stage3?.foodPenaltyPercent ?? 0, returnPenaltyPercent: cfg.stage3?.foodPenaltyPercent ?? 0 };
    if (!isNoShowRescueEnabled(cfg) || !isPaidOnline(order)) return base;
    const { applies, stage } = await evaluateForOrder(order, cfg);
    return { ...base, eligible: Boolean(applies && stage === 3) };
}

/**
 * Admin approved: the customer of a PREPAID order is not collecting it, so the food goes to Food Rescue instead of
 * back to the restaurant. The customer gets the normal stage-3 charge (cut from the payment, rest refunded) and the
 * same rider, who is still holding the food, delivers it to whoever buys it.
 */
export async function rescueNoShowOrder(order, adminId, { rescuePrice, penaltyPercent, note = '' } = {}) {
    const baseCfg = await getConfig({ fresh: true });
    const hasPct = penaltyPercent !== undefined && penaltyPercent !== null && String(penaltyPercent).trim() !== '';
    const pct = hasPct ? num(penaltyPercent, 'Penalty percent', { max: 100 }) : (baseCfg.rescue?.successPenaltyPercent ?? baseCfg.stage3.foodPenaltyPercent);
    // The admin's percentage replaces the "rescue sold" food penalty for this case only (frozen in the case snapshot).
    const cfg = { ...baseCfg, stage3: { ...baseCfg.stage3, foodPenaltyPercent: pct }, rescue: { ...baseCfg.rescue, successPenaltyPercent: pct } };
    if (!isNoShowRescueEnabled(cfg)) throw new ValidationError('Food Rescue for undelivered prepaid orders is switched off.');
    if (!isPaidOnline(order)) throw new ValidationError('Only prepaid orders can be sent to Food Rescue.');
    const { applies, stage } = await evaluateForOrder(order, cfg);
    if (!applies || stage !== 3) throw new ValidationError('This order is not in a state where Food Rescue can start.');

    const foodValue = r2(order.pricing?.subtotal);
    const hasPrice = rescuePrice !== undefined && rescuePrice !== null && String(rescuePrice).trim() !== '';
    const price = hasPrice ? num(rescuePrice, 'Rescue price', { min: 0.01, max: foodValue }) : r2((foodValue * (100 - cfg.rescue.discountPercent)) / 100);

    const fault = { waived: false, party: 'customer', note: '', reason: null };
    const breakdown = computeBreakdown(order, 3, cfg, false);
    const adminNote = String(note || '').trim();
    return runPolicyCancellation(order, cfg, 3, fault, breakdown, {
        reasonCode: 'customer_not_receiving',
        reasonLabel: 'Customer did not collect the order at the door',
        comment: adminNote,
        actor: { role: 'ADMIN', id: adminId },
        cancelledBy: 'ADMIN',
        rescueFoodPrice: price,
        mutateOrder: (o) => {
            o.undeliveredReturn.status = 'rescued';
            o.undeliveredReturn.decidedBy = adminId || null;
            o.undeliveredReturn.decidedAt = new Date();
            o.undeliveredReturn.adminNote = adminNote;
            o.undeliveredReturn.rescueFoodPrice = price;
        },
    });
}

async function notifyCancellation(caseDoc, order, cfg, { stage, breakdown, fault }) {
    const label = orderLabel(order);
    const meta = { orderId: order._id, statusLabel: order.cancellationPolicy?.statusLabel || 'CANCELLED' };
    const amountStr = String(breakdown.total);
    if (fault.waived || breakdown.total === 0) {
        await sendOnce(caseDoc._id, 'cancel', { ownerType: 'USER', ownerId: order.userId, title: 'Order cancelled', body: render(cfg.messages.nofee_customer, { reason: fault.note || 'no charge' }), type: 'order_cancelled', ...meta });
    } else if (caseDoc.payMode === 'refund_deduction') {
        const refund = r2(caseDoc.refund?.amount);
        const held = caseDoc.refund?.status === 'held' || (stage === 3 && usesRescueHold(order, stage, cfg));
        const tplKey = stage === 2 ? 's2_customer_online' : held ? 's3_customer_online_hold' : 's3_customer_online';
        await sendOnce(caseDoc._id, 'cancel', { ownerType: 'USER', ownerId: order.userId, title: 'Cancellation processed', body: render(cfg.messages[tplKey], { orderId: label, amount: amountStr, refund, minutes: cfg.rescue.windowMinutes }), type: 'cancellation_penalty', data: { amount: amountStr, refund: String(refund) }, ...meta });
    } else {
        await sendOnce(caseDoc._id, 'cancel', { ownerType: 'USER', ownerId: order.userId, title: 'Cancellation processed', body: render(cfg.messages[stage === 2 ? 's2_customer' : 's3_customer'], { orderId: label, amount: amountStr }), type: 'cancellation_penalty', data: { amount: amountStr }, ...meta });
        if (cfg.cod.blockWhileOutstanding) {
            await sendOnce(caseDoc._id, 'cod', { ownerType: 'USER', ownerId: order.userId, title: 'Cash on Delivery disabled', body: render(cfg.messages.cod_disabled_customer, { amount: amountStr }), type: 'cod_disabled', ...meta });
        }
    }
    const restaurantAmount = stage === 2 && !fault.waived ? caseDoc.breakdown?.restaurantPayable ?? breakdown.restaurantPayable ?? 0 : 0;
    await sendOnce(caseDoc._id, 'cancel', { ownerType: 'RESTAURANT', ownerId: order.restaurantId, title: 'Order cancelled', body: render(cfg.messages[stage === 2 ? 's2_restaurant' : 's3_restaurant'], { orderId: label, amount: restaurantAmount }), type: stage === 3 ? 'food_rescue_activated' : 'order_cancelled_after_prep', ...meta });
    if (caseDoc.riderId) {
        await sendOnce(caseDoc._id, 'cancel', { ownerType: 'DELIVERY_PARTNER', ownerId: caseDoc.riderId, title: stage === 3 ? 'Food Rescue activated' : 'Order cancelled', body: render(cfg.messages[stage === 2 ? 's2_rider' : 's3_rider'], { orderId: label, amount: breakdown.riderPayable }), type: stage === 3 ? 'food_rescue_activated' : 'order_cancelled', ...meta });
    }
}

async function syncOrderSocket(order, caseDoc, listing) {
    const payload = {
        orderMongoId: String(order._id), orderId: orderLabel(order), displayId: orderLabel(order), orderStatus: 'cancelled_by_user', status: 'cancelled_by_user',
        statusLabel: order.cancellationPolicy?.statusLabel || 'CANCELLED', cancellationStage: caseDoc.stage, penaltyTotal: caseDoc.breakdown?.total || 0,
        rescueStatus: listing ? 'active' : '', rescueExpiresAt: listing?.expiresAt || null, cancelledBy: 'user',
    };
    emit(rooms.user(order.userId), ['order_status_update', 'order_cancelled'], payload);
    emit(rooms.restaurant(order.restaurantId), ['order_status_update', 'order_cancelled'], payload);
    if (caseDoc.riderId) emit(rooms.delivery(caseDoc.riderId), ['order_status_update', 'order_cancelled'], payload);
    emit('delivery_partners', ['order_cancelled'], payload);
}

/* ------------------------------ Online refund (charge cut from the payment) ------------------------------ */
async function sendRefundTo(order, amount, method, extra = {}) {
    if (method === 'wallet') {
        await userWalletService.refundWalletBalance(
            order.userId, amount, `Refund for order #${orderLabel(order)} (after cancellation charges)`,
            extra.guardOrder ? { orderId: order._id } : { caseId: String(extra.caseId || ''), kind: extra.kind || 'cancellation_refund' }
        );
        return { ok: true, refundId: '' };
    }
    const paymentId = order.payment?.razorpay?.paymentId;
    if (!paymentId) return { ok: false, error: 'No Razorpay payment id on this order' };
    const r = await initiateRazorpayRefund(paymentId, amount);
    return { ok: Boolean(r?.success), refundId: r?.refundId || '', error: r?.error || '' };
}

/** Refund paid amount minus the cancellation charge. Atomic claim + retry-safe; failures are retried by the sweeper. */
export async function processRefund(caseId) {
    const claim = await FoodCancellationCase.findOneAndUpdate(
        { _id: caseId, 'refund.status': { $in: ['pending', 'failed'] }, 'refund.amount': { $gt: 0 } },
        { $set: { 'refund.status': 'processing', 'refund.at': new Date() }, $inc: { 'refund.attempts': 1 } },
        { new: true }
    );
    if (!claim) return null;
    const order = await FoodOrder.findById(claim.orderId);
    if (!order) return null;
    const amount = r2(claim.refund.amount);
    let res;
    try {
        res = await sendRefundTo(order, amount, String(order.payment?.method || '').toLowerCase(), { guardOrder: true });
    } catch (e) {
        res = { ok: false, error: String(e?.message || e).slice(0, 200) };
    }
    await FoodCancellationCase.updateOne(
        { _id: caseId },
        { $set: { 'refund.status': res.ok ? 'processed' : 'failed', 'refund.refundId': res.refundId || '', 'refund.error': res.ok ? '' : res.error || 'Refund failed', 'refund.at': new Date() },
          $push: { timeline: { at: new Date(), event: res.ok ? 'refund_processed' : 'refund_failed', note: res.ok ? `Refunded Rs ${amount} (Rs ${claim.refund.deducted} kept as cancellation charges)` : res.error || 'Refund failed' } } }
    );
    await FoodOrder.updateOne({ _id: order._id }, { $set: {
        'payment.status': res.ok ? 'refunded' : order.payment.status,
        'payment.refund': { status: res.ok ? 'processed' : 'failed', amount, refundId: res.refundId || undefined, processedAt: res.ok ? new Date() : undefined },
    } });
    try {
        await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_user', {
            status: res.ok ? 'refunded' : 'captured', note: `Cancelled by user (policy). Charges Rs ${claim.refund.deducted}, refund Rs ${amount}`,
            recordedByRole: 'USER', recordedById: order.userId,
        });
    } catch (e) {
        logger.warn(`[Cancellation] transaction sync failed: ${e?.message}`);
    }
    if (res.ok) {
        const cfg = await getConfig();
        await sendOnce(caseId, 'refund', { ownerType: 'USER', ownerId: order.userId, title: 'Refund initiated', body: render(cfg.messages.refund_customer, { refund: amount, orderId: orderLabel(order) }), type: 'refund_initiated', orderId: order._id, statusLabel: 'REFUND INITIATED' });
    } else {
        await notifyAdminsSafely({ title: 'Cancellation refund failed', body: `Order ${orderLabel(order)}: refund of Rs ${amount} failed (${res.error}). It will be retried automatically.`, data: { type: 'cancellation_refund_failed', ring: 'true' } }).catch(() => {});
    }
    return res;
}

/* ------------------------------ Food Rescue ------------------------------ */
async function activateRescue(order, caseDoc, cfg, { rescueFoodPrice = null } = {}) {
    const existing = await FoodRescueListing.findOne({ caseId: caseDoc._id });
    if (existing) return existing;
    let lat = null;
    let lng = null;
    if (caseDoc.riderId) {
        const { FoodDeliveryPartner } = await import('../../delivery/models/deliveryPartner.model.js');
        const rider = await FoodDeliveryPartner.findById(caseDoc.riderId).select('lastLat lastLng').lean();
        if (Number.isFinite(rider?.lastLat) && Number.isFinite(rider?.lastLng)) { lat = rider.lastLat; lng = rider.lastLng; }
    }
    const restaurant = await FoodRestaurant.findById(order.restaurantId).select('restaurantName name location').lean();
    if (lat == null) {
        const c = order.deliveryAddress?.location?.coordinates || restaurant?.location?.coordinates;
        if (Array.isArray(c) && c.length === 2) { lng = c[0]; lat = c[1]; }
    }
    if (lat == null || lng == null) {
        logger.warn(`[Rescue] no location for order ${order._id}; rescue not started`);
        await FoodCancellationCase.updateOne({ _id: caseDoc._id }, { $set: { status: 'rescue_expired' }, $push: { timeline: { at: new Date(), event: 'rescue_skipped', note: 'No rider/restaurant location available' } } });
        await expireListingEffects(caseDoc._id, { noListing: true });
        return null;
    }
    const foodValue = r2(order.pricing?.subtotal);
    // Admin may fix the selling price for a no-show order; otherwise the configured discount applies.
    const customPrice = rescueFoodPrice != null && foodValue > 0 ? r2(rescueFoodPrice) : null;
    const factor = customPrice != null ? customPrice / foodValue : (100 - cfg.rescue.discountPercent) / 100;
    const discountPercent = customPrice != null ? Math.max(0, Math.round((1 - factor) * 100)) : cfg.rescue.discountPercent;
    const items = (order.items || []).map((i) => {
        const it = i.toObject ? i.toObject() : { ...i };
        return { ...it, originalPrice: it.price, price: r2(it.price * factor) };
    });
    const expiresAt = new Date(Date.now() + cfg.rescue.windowMinutes * MIN);
    const listing = await FoodRescueListing.create({
        caseId: caseDoc._id, originalOrderId: order._id, restaurantId: order.restaurantId,
        restaurantName: restaurant?.restaurantName || restaurant?.name || '', riderId: caseDoc.riderId, items,
        originalFoodValue: foodValue, rescueFoodPrice: customPrice != null ? customPrice : r2(foodValue * factor), discountPercent,
        location: { type: 'Point', coordinates: [lng, lat] }, expiresAt,
    });
    await FoodCancellationCase.updateOne({ _id: caseDoc._id }, { $set: { listingId: listing._id }, $push: { timeline: { at: new Date(), event: 'rescue_started', note: `Window until ${expiresAt.toISOString()} within ${cfg.rescue.radiusKm} km` } } });
    await FoodOrder.updateOne({ _id: order._id }, { $set: { 'cancellationPolicy.rescueExpiresAt': expiresAt } });
    order.cancellationPolicy.rescueExpiresAt = expiresAt;
    adminBell({
        title: '🌿 Food Rescue started',
        message: `Order #${orderLabel(order)}: ${listing.restaurantName || 'restaurant'} food listed at ${inr(listing.rescueFoodPrice)} (was ${inr(listing.originalFoodValue)}, ${listing.discountPercent}% off) for ${cfg.rescue.windowMinutes} min.`,
        category: 'food_rescue', zoneId: order.zoneId, orderMongoId: order._id,
    });
    void notifyNearbyCustomers(listing, order.userId, cfg).catch((e) => logger.warn(`[Rescue] nearby notify failed: ${e?.message}`));
    return listing;
}

async function notifyNearbyCustomers(listing, excludeUserId, cfg) {
    if (!cfg.rescue.maxNotifyUsers) return;
    const users = await FoodUser.find({
        _id: { $ne: excludeUserId },
        'addresses.location': { $near: { $geometry: { type: 'Point', coordinates: listing.location.coordinates }, $maxDistance: cfg.rescue.radiusKm * 1000 } },
    }).select('_id').limit(cfg.rescue.maxNotifyUsers).lean();
    const body = render(cfg.messages.rescue_nearby_customer, {
        restaurant: listing.restaurantName || 'A restaurant', discount: listing.discountPercent, price: listing.rescueFoodPrice,
        original: listing.originalFoodValue, minutes: cfg.rescue.windowMinutes,
    });
    const targets = users.map((u) => ({ ownerType: 'USER', ownerId: u._id }));
    for (let i = 0; i < targets.length; i += 50) {
        await notifyOwnersSafely(targets.slice(i, i + 50), { title: 'Food Rescue nearby', body, data: { type: 'food_rescue_nearby', listingId: String(listing._id) } });
    }
    for (const u of users) emit(rooms.user(u._id), ['food_rescue_available'], { listingId: String(listing._id), expiresAt: listing.expiresAt });
    await FoodRescueListing.updateOne({ _id: listing._id }, { $set: { notifiedCount: users.length } });
}

const publicListing = (l, distanceKm) => ({
    id: String(l._id), restaurantName: l.restaurantName, items: l.items, originalPrice: l.originalFoodValue, rescuePrice: l.rescueFoodPrice,
    discountPercent: l.discountPercent, expiresAt: l.expiresAt, status: l.status, distanceKm: distanceKm != null ? r2(distanceKm) : undefined,
});

export async function listNearbyRescues(userId, { lat, lng }) {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.rescue.enabled) return [];
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) throw new ValidationError('Your location is required to see nearby rescue food');
    const rows = await FoodRescueListing.find({
        status: { $in: ['active', 'held'] }, expiresAt: { $gt: new Date() },
        location: { $near: { $geometry: { type: 'Point', coordinates: [ln, la] }, $maxDistance: cfg.rescue.radiusKm * 1000 } },
    }).limit(30).lean();
    const orders = await FoodOrder.find({ _id: { $in: rows.map((r) => r.originalOrderId) } }).select('userId').lean();
    const own = new Set(orders.filter((o) => String(o.userId) === String(userId)).map((o) => String(o._id)));
    return rows
        .filter((r) => !own.has(String(r.originalOrderId)))
        .map((r) => publicListing(r, haversineKm(la, ln, r.location.coordinates[1], r.location.coordinates[0])));
}

/**
 * Atomic exclusive hold: exactly one concurrent caller can move active -> held (or take over an expired hold).
 * Returns the held listing, or null when someone else already has it / it is gone.
 */
export async function acquireHold(listingId, userId, holdMinutes) {
    const now = new Date();
    return FoodRescueListing.findOneAndUpdate(
        {
            _id: oid(listingId), expiresAt: { $gt: now },
            $or: [{ status: 'active' }, { status: 'held', holdUntil: { $lt: now } }, { status: 'held', heldBy: oid(userId) }],
        },
        { $set: { status: 'held', heldBy: oid(userId), holdUntil: new Date(now.getTime() + holdMinutes * MIN) } },
        { new: true }
    );
}

/** Step 1 of buying rescued food: take an exclusive hold, price the order and open a Razorpay payment. */
export async function claimRescue(listingId, userId, { address, paymentMethod = 'razorpay' } = {}) {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.rescue.enabled) throw new ValidationError('Food Rescue is not available right now');
    if (paymentMethod !== 'razorpay') throw new ValidationError('Rescued food must be paid online');
    if (!isRazorpayConfigured()) throw new ValidationError('Online payment is not available right now');
    const coords = address?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2 || !address?.street || !address?.city || !address?.state) {
        throw new ValidationError('A delivery address with location is required');
    }
    const listing = await acquireHold(listingId, userId, cfg.rescue.claimHoldMinutes);
    if (!listing) throw new ValidationError('Sorry, this food was just claimed or is no longer available.');

    const release = async () => FoodRescueListing.updateOne({ _id: listing._id, status: 'held', heldBy: oid(userId) }, { $set: { status: 'active', heldBy: null, holdUntil: null, holdOrderId: null } });
    try {
        const original = await FoodOrder.findById(listing.originalOrderId).lean();
        if (!original) throw new NotFoundError('Original order not found');
        if (String(original.userId) === String(userId)) throw new ForbiddenError('You cannot buy back your own cancelled order');
        const dist = haversineKm(coords[1], coords[0], listing.location.coordinates[1], listing.location.coordinates[0]);
        if (dist > cfg.rescue.radiusKm) throw new ValidationError(`This food is only available within ${cfg.rescue.radiusKm} km`);

        const foodPrice = listing.rescueFoodPrice;
        const tax = r2((foodPrice * (cfg.rescue.gstPercentOnFood || 0)) / 100);
        const deliveryFee = r2(cfg.rescue.deliveryFee);
        const platformFee = r2(cfg.rescue.platformFee);
        const total = r2(foodPrice + tax + deliveryFee + platformFee);
        const commission = r2((foodPrice * (100 - cfg.rescue.restaurantSharePercent)) / 100);

        // A previous unpaid attempt by the same user is reused so retries never pile up duplicate orders.
        let order = listing.holdOrderId ? await FoodOrder.findOne({ _id: listing.holdOrderId, userId: oid(userId), orderStatus: 'pending_payment' }) : null;
        if (!order) {
            order = new FoodOrder({
                userId: oid(userId), restaurantId: listing.restaurantId,
                items: listing.items.map(({ originalPrice, ...it }) => it),
                deliveryAddress: { ...address, location: { type: 'Point', coordinates: coords } },
                customerName: address.fullName || address.name || '', customerPhone: address.phone || '',
                orderStatus: 'pending_payment',
                pricing: {
                    subtotal: foodPrice, tax, gstRate: cfg.rescue.gstPercentOnFood || 0, packagingFee: 0, deliveryFee, platformFee, discount: 0, total,
                    restaurantCommission: commission, restaurantCommissionRate: 100 - cfg.rescue.restaurantSharePercent,
                    restaurantCommissionType: 'percentage', restaurantCommissionSource: 'custom_admin',
                },
                payment: { method: 'razorpay', status: 'created', amountDue: total },
                riderTotalPayout: deliveryFee, riderEarning: deliveryFee,
                rescueInfo: { listingId: listing._id, originalOrderId: listing.originalOrderId, originalFoodValue: listing.originalFoodValue, discountPercent: listing.discountPercent },
                shareTrackingId: `rescue-${listing._id}-${Date.now()}`,
            });
            const rz = await createRazorpayCheckoutOrder(Math.round(total * 100), 'INR', String(order._id));
            order.payment.razorpay = { orderId: rz.orderId, paymentId: '', signature: '' };
            await order.save();
            await FoodRescueListing.updateOne({ _id: listing._id }, { $set: { holdOrderId: order._id } });
            return { orderId: String(order._id), holdUntil: listing.holdUntil, razorpay: rz, pricing: { foodPrice, tax, deliveryFee, platformFee, total } };
        }
        const rz = { key: getRazorpayKeyId(), orderId: order.payment.razorpay.orderId, amount: Math.round(total * 100), currency: 'INR' };
        return { orderId: String(order._id), holdUntil: listing.holdUntil, razorpay: rz, pricing: { foodPrice, tax, deliveryFee, platformFee, total } };
    } catch (e) {
        await release();
        throw e;
    }
}

/** Step 2: payment verified -> mark CLAIMED, hand the food to the original rider for the new customer. */
export async function verifyRescuePayment(userId, { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    const order = await FoodOrder.findOne({ _id: oid(orderId), userId: oid(userId), 'rescueInfo.listingId': { $ne: null } });
    if (!order) throw new NotFoundError('Rescue order not found');
    if (order.payment?.status === 'paid') return { orderId: String(order._id), status: 'claimed' };
    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) throw new ValidationError('Payment verification failed');
    if (razorpayOrderId !== order.payment?.razorpay?.orderId) throw new ValidationError('Payment does not match this order');

    const listingId = order.rescueInfo.listingId;
    const win = await FoodRescueListing.findOneAndUpdate(
        { _id: listingId, status: 'held', heldBy: oid(userId) },
        { $set: { status: 'claimed', claimedBy: oid(userId), claimOrderId: order._id, claimedAt: new Date() } },
        { new: true }
    );
    if (!win) {
        // The hold lapsed and someone else won, or the window ended: give the money back, never keep it.
        try {
            const refund = await initiateRazorpayRefund(razorpayPaymentId, order.pricing.total);
            order.payment.status = refund?.success ? 'refunded' : 'paid';
        } catch (e) {
            logger.error(`[Rescue] refund failed for lost claim ${order._id}: ${e?.message}`);
        }
        order.orderStatus = 'cancelled_by_user';
        order.payment.razorpay.paymentId = razorpayPaymentId;
        await order.save();
        await audit(userId, 'RESCUE_PAID_BUT_LOST', 'order', order._id, null, { razorpayPaymentId });
        throw new ValidationError('Sorry, someone else claimed this food first. Your payment is being refunded.');
    }

    const original = await FoodOrder.findById(win.originalOrderId).lean();
    const riderId = win.riderId;
    order.payment.status = 'paid';
    order.payment.razorpay.paymentId = razorpayPaymentId;
    order.payment.razorpay.signature = razorpaySignature;
    order.orderStatus = 'picked_up';
    order.dispatch = { ...(order.dispatch?.toObject?.() || {}), status: 'accepted', deliveryPartnerId: riderId, assignedAt: new Date(), acceptedAt: new Date() };
    order.deliveryState = {
        ...(order.deliveryState?.toObject?.() || {}), currentPhase: 'en_route_to_delivery', status: 'picked_up', isFoodReady: true,
        pickedUpAt: original?.deliveryState?.pickedUpAt || new Date(), foodReadyAt: original?.deliveryState?.foodReadyAt || new Date(),
    };
    order.isFoodReady = true;
    order.deliveryOtp = generateFourDigitDeliveryOtp();
    order.deliveryVerification = { dropOtp: { required: true, verified: false } };
    pushStatusHistory(order, { byRole: 'SYSTEM', from: 'pending_payment', to: 'picked_up', note: 'Food Rescue claimed; assigned to the original delivery partner' });
    await order.save();

    try {
        const tx = await foodTransactionService.createInitialTransaction(order);
        if (tx) {
            await foodTransactionService.updateTransactionStatus(order._id, 'captured', { status: 'captured', razorpayPaymentId, razorpaySignature, recordedByRole: 'USER', recordedById: oid(userId) });
            if (riderId) await foodTransactionService.updateTransactionRider(order._id, riderId);
        }
    } catch (e) {
        logger.error(`[Rescue] transaction setup failed for ${order._id}: ${e?.message}`);
        await audit(null, 'RESCUE_TXN_SETUP_FAILED', 'order', order._id, null, { error: String(e?.message) });
    }

    const cfg = await getConfig();
    const caseDoc = await FoodCancellationCase.findOneAndUpdate(
        { _id: win.caseId },
        { $set: { status: 'rescue_claimed' }, $push: { timeline: { at: new Date(), event: 'rescue_claimed', note: `Claimed by a new customer for Rs ${win.rescueFoodPrice}; new order ${order._id}` } } },
        { new: true }
    );
    await FoodOrder.updateOne({ _id: win.originalOrderId }, { $set: { 'cancellationPolicy.rescueStatus': 'claimed' } });
    // Prepaid original customer: the food was sold, so the held refund (payment minus the "rescue sold" charge) is released now.
    await finalizeHeldRefund(win.caseId, 'rescued').catch((e) => logger.error(`[Rescue] refund release failed ${win.caseId}: ${e?.message}`));
    const restaurantAmount = r2((win.rescueFoodPrice * cfg.rescue.restaurantSharePercent) / 100);
    const label = orderLabel(original || order);
    const vars = { orderId: label, price: win.rescueFoodPrice, share: cfg.rescue.restaurantSharePercent, amount: restaurantAmount, discount: win.discountPercent };
    const meta = { orderId: order._id, statusLabel: 'FOOD RESCUE CLAIMED' };
    await sendOnce(caseDoc._id, 'claimed', { ownerType: 'RESTAURANT', ownerId: win.restaurantId, title: 'Food Rescue successful', body: render(cfg.messages.rescue_claimed_restaurant, vars), type: 'food_rescue_claimed', ...meta });
    if (riderId) await sendOnce(caseDoc._id, 'claimed', { ownerType: 'DELIVERY_PARTNER', ownerId: riderId, title: 'Food Rescue successful', body: render(cfg.messages.rescue_claimed_rider, vars), type: 'food_rescue_claimed', data: { newOrderId: String(order._id) }, ...meta });
    await sendOnce(caseDoc._id, 'claimed', { ownerType: 'USER', ownerId: caseDoc.userId, title: 'Your food was rescued', body: render(cfg.messages.rescue_claimed_original_customer, vars), type: 'food_rescue_claimed', ...meta });
    await sendOnce(caseDoc._id, 'claimed', { ownerType: 'USER', ownerId: userId, title: 'Rescue order confirmed', body: render(cfg.messages.rescue_new_customer, vars), type: 'food_rescue_confirmed', ...meta });
    if (riderId) emit(rooms.delivery(riderId), ['order_assigned', 'order_status_update'], { orderMongoId: String(order._id), orderId: String(order._id), orderStatus: 'picked_up', status: 'picked_up', statusLabel: 'FOOD RESCUE – DELIVER TO NEW CUSTOMER' });
    emit(rooms.user(caseDoc.userId), ['order_status_update'], { orderMongoId: String(win.originalOrderId), orderStatus: 'cancelled_by_user', statusLabel: 'CANCELLED – FOOD RESCUE CLAIMED', rescueStatus: 'claimed' });
    adminBell({
        title: '✅ Food Rescue claimed',
        message: `Order #${label}: a new customer bought the rescued food for ${inr(win.rescueFoodPrice)}. Restaurant gets ${inr(restaurantAmount)}.`,
        category: 'food_rescue', zoneId: order.zoneId || original?.zoneId, orderMongoId: order._id,
    });
    await audit(userId, 'RESCUE_CLAIMED', 'listing', win._id, null, { newOrderId: String(order._id), restaurantAmount });
    return { orderId: String(order._id), status: 'claimed', restaurantWillReceive: restaurantAmount };
}

/**
 * Settle the refund that was held for the Food Rescue outcome (prepaid orders cancelled after pickup).
 *  - 'rescued' / 'released': refund = amount paid minus the "rescue sold" charge (released also covers "no rescue was possible" and admin-closed rescues, which favour the customer).
 *  - 'expired': nobody bought the food, so the whole payment is kept as the cancellation charge and nothing is refunded.
 * Atomic on refund.status === 'held', so it can run from the claim, the sweeper and an admin action without double effects.
 */
export async function finalizeHeldRefund(caseId, outcome) {
    const c = await FoodCancellationCase.findById(caseId);
    if (!c || c.refund?.status !== 'held') return null;
    const adminTouched = Boolean(c.override?.by);
    if (outcome !== 'expired' || adminTouched) {
        const claimed = await FoodCancellationCase.updateOne(
            { _id: caseId, 'refund.status': 'held' },
            { $set: { 'refund.status': 'pending' }, $push: { timeline: { at: new Date(), event: 'refund_released', note: `Food Rescue ${outcome}: refund of Rs ${r2(c.refund.amount)} released` } } }
        );
        return claimed.modifiedCount ? processRefund(caseId) : null;
    }
    const paid = r2(c.paidAmount);
    const claimed = await FoodCancellationCase.findOneAndUpdate(
        { _id: caseId, 'refund.status': 'held' },
        { $set: { 'refund.status': 'none', 'refund.amount': 0, 'refund.deducted': paid, 'refund.shortfall': 0 }, $push: { timeline: { at: new Date(), event: 'rescue_unsold_full_charge', note: `Nobody bought the food: full payment of Rs ${paid} kept, no refund` } } },
        { new: true }
    );
    if (!claimed) return null;
    const pen = c.penaltyId ? await FoodUserPenalty.findById(c.penaltyId) : null;
    if (pen && pen.status === 'paid' && pen.paidVia === 'refund_deduction') {
        const extra = r2(paid - pen.amount);
        if (extra > 0) {
            await FoodUserPenalty.updateOne({ _id: pen._id }, { $set: { amount: paid, reason: `${pen.reason} Food Rescue unsuccessful: the full payment is kept.` } });
            await recordTransaction({
                entityType: 'admin', entityId: 'admin', type: 'credit', amount: extra, description: `Cancellation charge raised to full payment (rescue unsold), order ${c.orderId}`,
                category: 'platform_fee', orderId: String(c.orderId), idempotencyKey: `penalty_paid:${pen._id}:rescue_unsold`,
            }).catch((e) => logger.warn(`[Cancellation] unsold revenue entry failed: ${e?.message}`));
        }
    }
    await FoodOrder.updateOne({ _id: c.orderId }, { $set: { 'cancellationPolicy.penaltyTotal': paid, 'cancellationPolicy.deducted': paid, 'cancellationPolicy.refundAmount': 0 } });
    const order = await FoodOrder.findById(c.orderId).select('order_id userId').lean();
    try {
        await foodTransactionService.updateTransactionStatus(c.orderId, 'cancelled_by_user', { status: 'captured', note: `Cancelled by user (policy). Food Rescue unsold: Rs ${paid} kept, no refund`, recordedByRole: 'USER', recordedById: c.userId });
    } catch (e) {
        logger.warn(`[Cancellation] transaction sync failed: ${e?.message}`);
    }
    const cfg = await getConfig();
    await sendOnce(caseId, 'rescue_unsold_customer', { ownerType: 'USER', ownerId: c.userId, title: 'Cancellation charge applied', body: render(cfg.messages.rescue_expired_original_customer, { orderId: orderLabel(order), amount: paid }), type: 'cancellation_penalty', orderId: c.orderId, statusLabel: 'CANCELLED – FOOD RESCUE EXPIRED' });
    return { kept: paid };
}

async function expireListingEffects(caseId, { noListing = false } = {}) {
    const caseDoc = await FoodCancellationCase.findById(caseId);
    if (!caseDoc) return;
    const cfg = await getConfig();
    const order = await FoodOrder.findById(caseDoc.orderId).select('order_id restaurantId userId zoneId').lean();
    const foodValue = caseDoc.breakdown?.foodValue || 0;
    const comp = caseDoc.faultParty === 'restaurant' ? 0 : r2((foodValue * cfg.rescue.failedRestaurantCompPercent) / 100);
    await FoodCancellationCase.updateOne({ _id: caseId }, { $set: { status: 'rescue_expired' }, $push: { timeline: { at: new Date(), event: 'rescue_expired', note: `Restaurant compensation Rs ${comp}; rider may keep the food` } } });
    await FoodOrder.updateOne({ _id: caseDoc.orderId }, { $set: { 'cancellationPolicy.rescueStatus': 'expired', 'cancellationPolicy.statusLabel': 'CANCELLED – FOOD RESCUE EXPIRED' } });
    const fresh = await FoodCancellationCase.findById(caseId);
    if (comp > 0) {
        await creditParty({
            caseDoc: fresh, key: 'restaurant_rescue_failed', party: 'RESTAURANT', partyId: caseDoc.restaurantId, amount: comp,
            kind: 'restaurant_unsuccessful_rescue_compensation', category: 'order_payout',
            description: `Compensation for cancelled order ${orderLabel(order)} (food rescue unsuccessful)`,
        });
    }
    const label = orderLabel(order);
    const meta = { orderId: caseDoc.orderId, statusLabel: 'CANCELLED – FOOD RESCUE EXPIRED' };
    const vars = { orderId: label, amount: comp, percent: cfg.rescue.failedRestaurantCompPercent, minutes: cfg.rescue.windowMinutes };
    await sendOnce(caseId, 'expired', { ownerType: 'RESTAURANT', ownerId: caseDoc.restaurantId, title: 'Food Rescue unsuccessful', body: render(cfg.messages.rescue_expired_restaurant, vars), type: 'food_rescue_expired', ...meta });
    if (caseDoc.riderId && cfg.rescue.riderKeepsFoodOnExpiry) {
        await sendOnce(caseId, 'expired', { ownerType: 'DELIVERY_PARTNER', ownerId: caseDoc.riderId, title: 'Food Rescue ended', body: render(cfg.messages.rescue_expired_rider, vars), type: 'food_rescue_expired', ...meta });
    }
    adminBell({
        title: '⌛ Food Rescue expired',
        message: `Order #${label}: nobody bought the rescued food. Restaurant compensation Rs ${comp}; the delivery partner keeps the food.`,
        category: 'food_rescue', zoneId: order?.zoneId, orderMongoId: caseDoc.orderId,
    });
    // Prepaid original customer: unsold food keeps the whole payment; if no rescue was ever possible the refund is simply released.
    await finalizeHeldRefund(caseId, noListing ? 'released' : 'expired').catch((e) => logger.error(`[Rescue] held refund settle failed ${caseId}: ${e?.message}`));
    emit(rooms.user(caseDoc.userId), ['order_status_update'], { orderMongoId: String(caseDoc.orderId), orderStatus: 'cancelled_by_user', statusLabel: meta.statusLabel, rescueStatus: 'expired' });
}

/* ------------------------------ Outstanding penalty & COD ------------------------------ */
const outstandingFilter = (userId) => ({ userId: oid(userId), source: CANCEL_POLICY_SOURCE, paidAt: null, status: { $in: OUTSTANDING_STATUSES } });

export async function getOutstanding(userId) {
    const rows = await FoodUserPenalty.find(outstandingFilter(userId)).sort({ createdAt: 1 }).lean();
    const cfg = await getConfig();
    const total = r2(rows.reduce((s, r) => s + (r.amount || 0), 0));
    return {
        total,
        codBlocked: Boolean(cfg.enabled && cfg.cod.blockWhileOutstanding && total > 0),
        items: rows.map((r) => ({ id: String(r._id), orderId: String(r.orderId || ''), amount: r.amount, reason: r.reason, breakdown: r.breakdown, createdAt: r.createdAt, status: r.status })),
    };
}

export async function isCodBlocked(userId) {
    if (!userId || !mongoose.isValidObjectId(String(userId))) return { blocked: false, amount: 0 };
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.cod.blockWhileOutstanding) return { blocked: false, amount: 0 };
    const agg = await FoodUserPenalty.aggregate([{ $match: outstandingFilter(userId) }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const amount = r2(agg[0]?.total || 0);
    return { blocked: amount > 0, amount };
}

export async function listPenaltyHistory(userId) {
    const rows = await FoodUserPenalty.find({ userId: oid(userId), source: CANCEL_POLICY_SOURCE }).sort({ createdAt: -1 }).limit(50).lean();
    return rows.map((r) => ({ id: String(r._id), orderId: String(r.orderId || ''), amount: r.amount, status: r.paidAt ? 'paid' : r.status, reason: r.reason, breakdown: r.breakdown, createdAt: r.createdAt, paidAt: r.paidAt }));
}

/** Only called after the money is really received. */
async function settlePenaltiesPaid(filter, { via, ref }) {
    const rows = await FoodUserPenalty.find({ ...filter, source: CANCEL_POLICY_SOURCE, paidAt: null, status: { $in: [...OUTSTANDING_STATUSES] } }).lean();
    if (!rows.length) return { count: 0, amount: 0, userId: null };
    let amount = 0;
    for (const p of rows) {
        const done = await FoodUserPenalty.updateOne({ _id: p._id, paidAt: null }, { $set: { status: 'paid', paidAt: new Date(), paidVia: via, paidRef: String(ref || '') } });
        if (!done.modifiedCount) continue;
        amount += p.amount;
        await recordTransaction({
            entityType: 'admin', entityId: 'admin', type: 'credit', amount: p.amount, description: `Cancellation charge received for order ${p.orderId}`,
            category: 'platform_fee', orderId: String(p.orderId || ''), idempotencyKey: `penalty_paid:${p._id}`,
        }).catch((e) => logger.warn(`[Cancellation] penalty revenue entry failed: ${e?.message}`));
        if (p.caseId) await FoodCancellationCase.updateOne({ _id: p.caseId }, { $push: { timeline: { at: new Date(), event: 'penalty_paid', note: `Rs ${p.amount} paid via ${via}` } } });
    }
    return { count: rows.length, amount: r2(amount), userId: rows[0].userId };
}

/** Hook: the order that carried the penalty has been paid (online verified, or wallet). */
export async function markPenaltiesPaidForOrder(orderId, via = 'order_payment') {
    try {
        const res = await settlePenaltiesPaid({ appliedOrderId: oid(orderId) }, { via, ref: orderId });
        if (res.count) await afterPenaltyPaid(res);
    } catch (e) {
        logger.error(`[Cancellation] markPenaltiesPaidForOrder failed: ${e?.message}`);
    }
}

async function afterPenaltyPaid(res) {
    const cfg = await getConfig();
    await notifyOwnersSafely([{ ownerType: 'USER', ownerId: res.userId }], {
        title: 'Penalty paid', body: render(cfg.messages.penalty_paid_customer, { amount: res.amount }), data: { type: 'penalty_paid' },
    });
    emit(rooms.user(res.userId), ['cancellation_update'], { type: 'penalty_paid', codBlocked: (await isCodBlocked(res.userId)).blocked });
}

/** Option 2: pay only the outstanding penalty. */
export async function createPenaltyPayment(userId) {
    if (!isRazorpayConfigured()) throw new ValidationError('Online payment is not available right now');
    const rows = await FoodUserPenalty.find(outstandingFilter(userId)).select('_id amount').lean();
    const amount = r2(rows.reduce((s, r) => s + r.amount, 0));
    if (!(amount > 0)) throw new ValidationError('You have no outstanding penalty');
    const rz = await createRazorpayCheckoutOrder(Math.round(amount * 100), 'INR', `penalty-${userId}-${Date.now()}`);
    await FoodPenaltyPayment.create({ userId: oid(userId), penaltyIds: rows.map((r) => r._id), amount, razorpayOrderId: rz.orderId });
    return { amount, razorpay: rz, penaltyCount: rows.length };
}

async function applyPenaltyPayment(payment, razorpayPaymentId) {
    const claim = await FoodPenaltyPayment.findOneAndUpdate(
        { _id: payment._id, status: 'created' },
        { $set: { status: 'paid', razorpayPaymentId, paidAt: new Date() } }, { new: true }
    );
    if (!claim) return { already: true };
    const res = await settlePenaltiesPaid({ _id: { $in: payment.penaltyIds }, userId: payment.userId }, { via: 'penalty_payment', ref: razorpayPaymentId });
    if (res.amount + 0.01 < payment.amount) {
        await audit(null, 'PENALTY_PAYMENT_MISMATCH', 'payment', payment._id, { paid: payment.amount }, { applied: res.amount }, 'Some penalties were already settled by another payment');
    }
    if (res.count) await afterPenaltyPaid({ ...res, userId: payment.userId });
    return { paid: true, amount: res.amount };
}

export async function verifyPenaltyPayment(userId, { razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    const payment = await FoodPenaltyPayment.findOne({ userId: oid(userId), razorpayOrderId });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status === 'paid') return { paid: true };
    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
        throw new ValidationError('Payment verification failed. Cash on Delivery stays disabled until the payment is confirmed.');
    }
    const out = await applyPenaltyPayment(payment, razorpayPaymentId);
    return { paid: true, ...(out.amount ? { amount: out.amount } : {}), codBlocked: (await isCodBlocked(userId)).blocked };
}

/** Recover payments whose app closed before verify: ask Razorpay if the payment really succeeded. */
async function reconcilePenaltyPayments() {
    const rz = getRazorpayInstance();
    if (!rz) return;
    const rows = await FoodPenaltyPayment.find({ status: 'created', createdAt: { $lt: new Date(Date.now() - 2 * MIN), $gt: new Date(Date.now() - 24 * 60 * MIN) } }).limit(50);
    for (const p of rows) {
        try {
            const list = await rz.orders.fetchPayments(p.razorpayOrderId);
            const ok = (list?.items || []).find((x) => x.status === 'captured' || x.status === 'authorized' && x.captured);
            if (ok) await applyPenaltyPayment(p, ok.id);
        } catch (e) {
            logger.warn(`[Cancellation] reconcile ${p._id} failed: ${e?.message}`);
        }
    }
}

/* ------------------------------ GPS odometer ------------------------------ */
const odo = new Map(); // orderId -> { lat, lng, pendingKm, flushedAt }

/** Called for every rider location ping on an active order. Counts only realistic movement before pickup. */
export async function trackRiderDistance(orderId, lat, lng, accuracy = null) {
    try {
        if (!orderId || !mongoose.isValidObjectId(String(orderId))) return;
        if (accuracy != null && accuracy > 100) return; // too noisy to trust
        const key = String(orderId);
        const st = odo.get(key) || { lat: null, lng: null, pendingKm: 0, flushedAt: Date.now(), status: null, checkedAt: 0 };
        if (Date.now() - st.checkedAt > 30 * 1000) {
            const o = await FoodOrder.findById(key).select('orderStatus').lean();
            st.status = o?.orderStatus || null;
            st.checkedAt = Date.now();
        }
        const cfg = await getConfig();
        const counting = ['confirmed', 'preparing', 'ready_for_pickup'].includes(st.status) || (cfg.stage2Statuses || []).includes(st.status) && st.status !== 'reached_pickup';
        if (st.lat != null && counting) {
            const d = haversineKm(st.lat, st.lng, lat, lng);
            if (d >= 0.01 && d <= 1) st.pendingKm += d; // ignore GPS jitter (<10 m) and teleports (>1 km between pings)
        }
        st.lat = lat;
        st.lng = lng;
        odo.set(key, st);
        if (st.pendingKm >= 0.1 || (st.pendingKm > 0 && Date.now() - st.flushedAt > 30 * 1000)) {
            const inc = st.pendingKm;
            st.pendingKm = 0;
            st.flushedAt = Date.now();
            await FoodOrder.updateOne({ _id: key }, { $inc: { 'cancelTracking.trackedKm': r2(inc) }, $set: { 'cancelTracking.lastLat': lat, 'cancelTracking.lastLng': lng, 'cancelTracking.lastAt': new Date() } });
        }
        if (odo.size > 500) for (const k of odo.keys()) { odo.delete(k); break; }
    } catch (e) {
        logger.warn(`[Cancellation] odometer failed: ${e?.message}`);
    }
}

/* ------------------------------ Sweeper (server-side timers) ------------------------------ */
export async function runCancellationSweep() {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    const now = new Date();

    // 1. Rescue windows that ended with nobody paying.
    const due = await FoodRescueListing.find({
        expiresAt: { $lte: now },
        $or: [{ status: 'active' }, { status: 'held', holdUntil: { $lt: now } }],
    }).limit(100);
    for (const l of due) {
        const gone = await FoodRescueListing.updateOne(
            { _id: l._id, expiresAt: { $lte: now }, $or: [{ status: 'active' }, { status: 'held', holdUntil: { $lt: now } }] },
            { $set: { status: 'expired' } }
        );
        if (!gone.modifiedCount) continue; // someone claimed it in the meantime
        await expireListingEffects(l.caseId).catch((e) => logger.error(`[Rescue] expire effects failed ${l.caseId}: ${e?.message}`));
    }

    // 2. Holds that lapsed while the window is still open go back on sale; abandoned unpaid hold orders are closed.
    await FoodRescueListing.updateMany({ status: 'held', holdUntil: { $lt: now }, expiresAt: { $gt: now } }, { $set: { status: 'active', heldBy: null, holdUntil: null } });
    await FoodOrder.updateMany(
        { 'rescueInfo.listingId': { $ne: null }, orderStatus: 'pending_payment', createdAt: { $lt: new Date(now.getTime() - (cfg.rescue.claimHoldMinutes + 5) * MIN) } },
        { $set: { orderStatus: 'cancelled_by_user', cancelledBy: 'SYSTEM', cancellationReason: 'Rescue payment not completed' } }
    );

    // 3. Penalty payments whose confirmation never reached us.
    await reconcilePenaltyPayments();

    // 3b. Refunds: free ones stuck in "processing", then retry failed ones (up to 5 attempts, then admin must act).
    await FoodCancellationCase.updateMany({ 'refund.status': 'processing', 'refund.at': { $lt: new Date(now.getTime() - 10 * MIN) } }, { $set: { 'refund.status': 'failed' } });
    const refundRetry = await FoodCancellationCase.find({ 'refund.status': 'failed', 'refund.attempts': { $lt: 5 } }).limit(20).select('_id').lean();
    for (const c of refundRetry) await processRefund(c._id).catch(() => {});

    // 3c. Safety net: a refund still held although its rescue already ended (crash between the two steps).
    const stuckHeld = await FoodCancellationCase.find({ 'refund.status': 'held', status: { $in: ['rescue_expired', 'rescue_claimed', 'cancelled', 'closed'] } }).limit(20).select('_id status').lean();
    for (const c of stuckHeld) await finalizeHeldRefund(c._id, c.status === 'rescue_expired' ? 'expired' : 'released').catch(() => {});

    // 4. Retry settlements that failed earlier (idempotent keys make this safe).
    const failed = await FoodCancellationCase.find({ 'settlements.status': 'failed' }).limit(20);
    for (const c of failed) await retrySettlements(c._id).catch(() => {});

    // 5. Outstanding-penalty reminders.
    const cutoff = new Date(now.getTime() - cfg.cod.reminderIntervalHours * 60 * MIN);
    const due2 = await FoodUserPenalty.find({ source: CANCEL_POLICY_SOURCE, paidAt: null, status: { $in: OUTSTANDING_STATUSES }, $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: cutoff } }], createdAt: { $lt: cutoff } }).limit(100);
    const byUser = new Map();
    for (const p of due2) byUser.set(String(p.userId), (byUser.get(String(p.userId)) || 0) + p.amount);
    for (const [uid, amount] of byUser) {
        await notifyOwnersSafely([{ ownerType: 'USER', ownerId: uid }], { title: 'Outstanding cancellation charge', body: render(cfg.messages.cod_disabled_customer, { amount: r2(amount) }), data: { type: 'penalty_reminder' } });
        await FoodUserPenalty.updateMany({ _id: { $in: due2.filter((p) => String(p.userId) === uid).map((p) => p._id) } }, { $set: { lastReminderAt: now } });
    }
}

export async function retrySettlements(caseId) {
    const c = await FoodCancellationCase.findById(caseId);
    if (!c) throw new NotFoundError('Case not found');
    let retried = 0;
    for (const s of c.settlements.filter((x) => x.status === 'failed')) {
        const key = s.key.replace(`${c._id}:`, '');
        const category = s.party === 'RESTAURANT' ? 'order_payout' : 'delivery_payout';
        const res = await creditParty({ caseDoc: await FoodCancellationCase.findById(caseId), key, party: s.party, partyId: s.partyId, amount: s.amount, kind: s.kind, category, description: `Retry: ${s.kind} for order ${c.orderLabel}` });
        if (res.status === 'done') retried += 1;
    }
    return { retried };
}

/* ------------------------------ Admin ------------------------------ */
export async function listCases({ stage, status, userId, restaurantId, page = 1, limit = 30 } = {}) {
    const q = {};
    if (stage) q.stage = Number(stage);
    if (status) q.status = status;
    if (userId) q.userId = oid(userId);
    if (restaurantId) q.restaurantId = oid(restaurantId);
    const lim = Math.min(Number(limit) || 30, 100);
    const [rows, total] = await Promise.all([
        FoodCancellationCase.find(q).sort({ createdAt: -1 }).skip((Math.max(Number(page), 1) - 1) * lim).limit(lim).lean(),
        FoodCancellationCase.countDocuments(q),
    ]);
    const pens = await FoodUserPenalty.find({ _id: { $in: rows.map((c) => c.penaltyId).filter(Boolean) } }).lean();
    const byId = new Map(pens.map((p) => [String(p._id), p]));
    const items = rows.map((c) => ({ ...c, actual: actualOutcome(c, c.penaltyId ? byId.get(String(c.penaltyId)) : null) }));
    return { items, total, page: Number(page) || 1, limit: lim };
}

/**
 * What REALLY happened to the customer's money for a case, read from the penalty ledger and the refund, never from the
 * frozen calculation (which stays as "calculated"). This is what the admin screens show as "charged".
 */
export function actualOutcome(c, pen) {
    const calculated = r2(c.breakdown?.total);
    const refund = { status: c.refund?.status || 'none', amount: r2(c.refund?.amount) };
    if (c.stage === 1) return { state: 'not_charged', label: 'No charge', amount: 0, calculated, refund };
    if (c.chargeWaived) return { state: 'waived', label: 'Waived (not charged)', amount: 0, calculated, refund };
    if (c.refund?.status === 'held') {
        return { state: 'pending_rescue', label: 'Provisional: final charge depends on Food Rescue', amount: r2(pen?.amount ?? c.refund.deducted), calculated, refund };
    }
    if (!pen) return { state: calculated > 0 ? 'not_recorded' : 'not_charged', label: calculated > 0 ? 'Not charged yet' : 'No charge', amount: 0, calculated, refund };
    if (pen.status === 'waived') return { state: 'waived', label: 'Waived by admin (not charged)', amount: 0, calculated, refund };
    if (pen.paidAt) {
        const cut = pen.paidVia === 'refund_deduction';
        return { state: cut ? 'deducted' : 'collected', label: cut ? 'Cut from customer payment' : 'Collected from customer', amount: r2(pen.amount), calculated, refund };
    }
    return { state: 'unpaid', label: 'Unpaid - COD blocked until paid', amount: r2(pen.amount), calculated, refund };
}

export async function getCase(caseId) {
    const c = await FoodCancellationCase.findById(caseId).lean();
    if (!c) throw new NotFoundError('Case not found');
    const [listing, penalty] = await Promise.all([
        c.listingId ? FoodRescueListing.findById(c.listingId).lean() : null,
        c.penaltyId ? FoodUserPenalty.findById(c.penaltyId).lean() : null,
    ]);
    return { ...c, listing, penalty, actual: actualOutcome(c, penalty) };
}

export async function listRescues({ status, page = 1, limit = 30 } = {}) {
    const q = status ? { status } : {};
    const lim = Math.min(Number(limit) || 30, 100);
    const [items, total] = await Promise.all([
        FoodRescueListing.find(q).sort({ createdAt: -1 }).skip((Math.max(Number(page), 1) - 1) * lim).limit(lim).lean(),
        FoodRescueListing.countDocuments(q),
    ]);
    return { items, total };
}

export async function listPenaltiesAdmin({ userId, status, page = 1, limit = 30 } = {}) {
    const q = { source: CANCEL_POLICY_SOURCE };
    if (userId) q.userId = oid(userId);
    if (status === 'outstanding') { q.paidAt = null; q.status = { $in: OUTSTANDING_STATUSES }; } else if (status) q.status = status;
    const lim = Math.min(Number(limit) || 30, 100);
    const [items, total] = await Promise.all([
        FoodUserPenalty.find(q).sort({ createdAt: -1 }).skip((Math.max(Number(page), 1) - 1) * lim).limit(lim).lean(),
        FoodUserPenalty.countDocuments(q),
    ]);
    return { items, total };
}

/** Admin: put a manual penalty on a customer. It shows in the same ledger and is charged on their next order / blocks COD until paid. */
export async function adminCreateUserPenalty(adminId, { userId, amount, reason, orderId = null }) {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) throw new ValidationError('A valid customer ID is required');
    const amt = r2(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) throw new ValidationError('Penalty amount must be greater than 0');
    if (!String(reason || '').trim()) throw new ValidationError('A reason is required');
    if (orderId && !mongoose.Types.ObjectId.isValid(String(orderId))) throw new ValidationError('Invalid order id');
    if (!(await FoodUser.exists({ _id: oid(userId) }))) throw new NotFoundError('Customer not found');
    const p = await FoodUserPenalty.create({
        userId: oid(userId), orderId: orderId ? oid(orderId) : null, amount: amt, reason: String(reason).trim(),
        status: 'pending', source: CANCEL_POLICY_SOURCE, createdByAdminId: adminId,
    });
    await audit(adminId, 'PENALTY_CREATE', 'penalty', p._id, null, p.toObject(), reason);
    await notifyOwnersSafely([{ ownerType: 'USER', ownerId: p.userId }], { title: 'Penalty added', body: `A penalty of Rs ${amt} was added to your account: ${String(reason).trim()}`, data: { type: 'penalty_added' } });
    return p.toObject();
}

/** Admin override: waive, change the amount, or mark paid (e.g. cash collected offline). Always with a reason. */
export async function adminDecidePenalty(penaltyId, adminId, { action, amount, note }) {
    if (!String(note || '').trim()) throw new ValidationError('A reason is required');
    const p = await FoodUserPenalty.findOne({ _id: oid(penaltyId), source: CANCEL_POLICY_SOURCE });
    if (!p) throw new NotFoundError('Penalty not found');
    const before = p.toObject();
    if (p.paidAt && p.paidVia === 'refund_deduction' && ['waive', 'adjust'].includes(action)) {
        // Charge was already cut from the online payment: lowering it sends the difference back to the customer.
        const newAmount = action === 'waive' ? 0 : r2(Number(amount));
        if (!Number.isFinite(newAmount) || newAmount < 0 || newAmount >= p.amount) throw new ValidationError('The new amount must be lower than what was deducted');
        const extra = r2(p.amount - newAmount);
        const upd = await FoodUserPenalty.findOneAndUpdate({ _id: p._id, paidVia: 'refund_deduction', amount: p.amount }, { $set: { amount: newAmount, status: newAmount === 0 ? 'waived' : 'paid', waivedReason: String(note).trim() } }, { new: true });
        if (!upd) throw new ValidationError('This penalty was just changed. Refresh and try again.');
        const order = await FoodOrder.findById(p.orderId);
        let res;
        try {
            res = await sendRefundTo(order, extra, String(order.payment?.method || '').toLowerCase(), { caseId: p.caseId, kind: `admin_adjust_${newAmount}` });
        } catch (e) {
            res = { ok: false, error: String(e?.message || e) };
        }
        if (!res.ok) {
            await FoodUserPenalty.updateOne({ _id: p._id }, { $set: { amount: p.amount, status: 'paid', waivedReason: '' } });
            throw new ValidationError(`Refund of Rs ${extra} failed (${res.error || 'gateway error'}). Nothing was changed.`);
        }
        await recordTransaction({ entityType: 'admin', entityId: 'admin', type: 'debit', amount: extra, description: `Cancellation charge reduced by admin, order ${p.orderId}`, category: 'adjustment', orderId: String(p.orderId || ''), idempotencyKey: `penalty_refund:${p._id}:${newAmount}` }).catch(() => {});
        if (p.caseId) await FoodCancellationCase.updateOne({ _id: p.caseId }, { $set: { override: { by: adminId, at: new Date(), note: String(note).trim(), previousTotal: before.amount } }, $push: { timeline: { at: new Date(), event: `admin_${action}`, note: `Refunded Rs ${extra}: ${String(note).trim()}` } } });
        await audit(adminId, `PENALTY_${String(action).toUpperCase()}_REFUND`, 'penalty', p._id, before, upd.toObject(), note);
        await notifyOwnersSafely([{ ownerType: 'USER', ownerId: p.userId }], { title: 'Refund initiated', body: `Rs ${extra} of your cancellation charge has been refunded.`, data: { type: 'refund_initiated' } });
        return upd.toObject();
    }
    if (p.paidAt && action !== 'refund_note') throw new ValidationError('This penalty is already paid');
    if (action === 'waive') {
        p.status = 'waived';
        p.waivedReason = String(note).trim();
    } else if (action === 'adjust') {
        const a = Number(amount);
        if (!Number.isFinite(a) || a < 0) throw new ValidationError('Amount must be zero or more');
        p.amount = r2(a);
        if (a === 0) { p.status = 'waived'; p.waivedReason = String(note).trim(); }
    } else if (action === 'mark_paid') {
        p.status = 'paid';
        p.paidAt = new Date();
        p.paidVia = 'admin';
        p.paidRef = String(adminId || '');
    } else {
        throw new ValidationError('Unknown action');
    }
    await p.save();
    if (p.caseId) {
        await FoodCancellationCase.updateOne({ _id: p.caseId }, {
            $set: { override: { by: adminId, at: new Date(), note: String(note).trim(), previousTotal: before.amount } },
            $push: { timeline: { at: new Date(), event: `admin_${action}`, note: String(note).trim() } },
        });
    }
    await audit(adminId, `PENALTY_${String(action).toUpperCase()}`, 'penalty', p._id, before, p.toObject(), note);
    if (['waive', 'mark_paid'].includes(action) || p.amount === 0) {
        await afterPenaltyPaid({ userId: p.userId, amount: p.amount }).catch(() => {});
    }
    return p.toObject();
}

export async function adminCloseRescue(listingId, adminId, note) {
    if (!String(note || '').trim()) throw new ValidationError('A reason is required');
    const l = await FoodRescueListing.findOneAndUpdate({ _id: oid(listingId), status: { $in: ['active', 'held'] } }, { $set: { status: 'cancelled' } }, { new: true });
    if (!l) throw new ValidationError('Only an open rescue can be closed');
    await audit(adminId, 'RESCUE_CLOSED', 'listing', listingId, null, { status: 'cancelled' }, note);
    // An admin closing the rescue early must not leave a prepaid customer's refund held forever.
    await finalizeHeldRefund(l.caseId, 'released').catch((e) => logger.error(`[Rescue] refund release failed ${l.caseId}: ${e?.message}`));
    return l.toObject();
}

/* ------------------------------ Return to restaurant (customer unreachable, COD) ------------------------------ */
const RETURN_REASON = 'customer_unreachable_return';

/**
 * Admin approved sending an unreachable COD order back to the restaurant. Books ONE policy case + one customer penalty
 * (so it shows in the same ledger, blocks COD until paid and is charged on the next order). The restaurant/rider payouts
 * are released later, when the restaurant OTP confirms the food is back (settleReturnPayouts).
 */
export async function recordReturnPenalty(order, adminId, { amount = null, percent = null, note = '' } = {}) {
    const baseCfg = await getConfig({ fresh: true });
    const hasPct = percent !== undefined && percent !== null && String(percent).trim() !== '';
    const cfg = hasPct ? { ...baseCfg, stage3: { ...baseCfg.stage3, foodPenaltyPercent: num(percent, 'Penalty percent', { max: 100 }) } } : baseCfg;
    const breakdown = computeBreakdown(order, 3, cfg, false);
    const finalAmount = amount === null || amount === undefined ? breakdown.total : r2(num(amount, 'Penalty amount'));
    const overridden = Math.abs(finalAmount - breakdown.total) > 0.009;
    let caseDoc;
    try {
        caseDoc = await FoodCancellationCase.create({
            orderId: order._id, orderLabel: orderLabel(order), userId: order.userId, restaurantId: order.restaurantId,
            riderId: order.dispatch?.deliveryPartnerId || order.undeliveredReturn?.requestedBy || null, stage: 3, cancelledFromStatus: order.orderStatus,
            status: 'cancelled', reasonCode: RETURN_REASON, reasonLabel: 'Customer unreachable - food returned to the restaurant', faultParty: 'customer',
            breakdown, payMode: 'outstanding', paidAmount: 0, refund: { status: 'none' },
            configSnapshot: { stage: 3, mode: 'return', rates: { stage3: cfg.stage3, gstPercent: cfg.gstPercent, riderCompensation: cfg.riderCompensation } },
            ...(overridden ? { override: { by: adminId || null, at: new Date(), note: `Admin set the penalty to Rs ${finalAmount}`, previousTotal: breakdown.total } } : {}),
            timeline: [{ at: new Date(), event: 'return_approved', note: `Return to restaurant approved. Penalty Rs ${finalAmount}${overridden ? ` (calculated Rs ${breakdown.total})` : ''}${note ? `: ${note}` : ''}` }],
        });
    } catch (e) {
        if (e?.code !== 11000) throw e;
        caseDoc = await FoodCancellationCase.findOne({ orderId: order._id });
    }
    if (finalAmount > 0 && order.userId) {
        const existing = await FoodUserPenalty.findOne({ orderId: order._id });
        let pen = existing;
        if (!existing) {
            pen = await FoodUserPenalty.create({
                userId: order.userId, orderId: order._id, amount: finalAmount, source: CANCEL_POLICY_SOURCE, caseId: caseDoc._id, breakdown,
                reason: `Order #${orderLabel(order)} could not be delivered - customer unreachable (food returned to the restaurant)`, createdByAdminId: adminId || null,
            });
        } else if (existing.status === 'pending') {
            existing.amount = finalAmount; existing.source = CANCEL_POLICY_SOURCE; existing.caseId = caseDoc._id; existing.breakdown = breakdown;
            await existing.save();
        }
        await FoodCancellationCase.updateOne({ _id: caseDoc._id }, { $set: { penaltyId: pen._id } });
    }
    await audit(adminId, 'RETURN_PENALTY', 'case', caseDoc._id, null, { amount: finalAmount, calculated: breakdown.total });
    return { caseId: caseDoc._id, amount: finalAmount, breakdown };
}

/** Restaurant OTP confirmed the food is back: pay the restaurant its share of the food and the rider the extra return pay (once each). */
export async function settleReturnPayouts(orderId) {
    const c = await FoodCancellationCase.findOne({ orderId: oid(orderId), reasonCode: RETURN_REASON });
    if (!c) return null;
    const b = c.breakdown || {};
    const restaurant = await creditParty({
        caseDoc: c, key: 'return_restaurant', party: 'RESTAURANT', partyId: c.restaurantId, amount: r2(b.restaurantPayable), kind: 'restaurant_return_compensation', category: 'order_payout',
        description: `Compensation (${b.restaurantSharePercent}% of food) for returned order ${c.orderLabel}`,
    });
    const rider = await creditParty({
        caseDoc: await FoodCancellationCase.findById(c._id), key: 'return_rider', party: 'DELIVERY_PARTNER', partyId: c.riderId, amount: r2(b.riderReturnPay), kind: 'rider_return_pay', category: 'delivery_payout',
        description: `Return pay for bringing back order ${c.orderLabel}`,
    });
    await FoodCancellationCase.updateOne({ _id: c._id }, { $set: { status: 'closed' }, $push: { timeline: { at: new Date(), event: 'returned_to_restaurant', note: `Restaurant Rs ${r2(b.restaurantPayable)}, rider return pay Rs ${r2(b.riderReturnPay)}` } } });
    return { restaurant, rider };
}

/* ------------------------------ Live calculator (admin) ------------------------------ */
const DRAFT_GROUPS = ['stage2', 'stage3', 'riderCompensation', 'rescue', 'cod'];

/** Overlay unsaved admin edits on the saved config. Only known numeric/boolean settings are taken; blanks keep the saved value. */
function mergeDraft(saved, draft) {
    if (!draft || typeof draft !== 'object') return saved;
    const out = { ...saved };
    for (const k of ['gstPercent', 'gstOnFoodPenalty']) {
        if (typeof draft[k] === 'boolean' || (draft[k] !== '' && draft[k] != null && Number.isFinite(Number(draft[k])))) out[k] = typeof draft[k] === 'boolean' ? draft[k] : Number(draft[k]);
    }
    for (const g of DRAFT_GROUPS) {
        if (!draft[g] || typeof draft[g] !== 'object') continue;
        const merged = { ...(saved[g] || {}) };
        for (const [k, v] of Object.entries(draft[g])) {
            if (typeof v === 'boolean') merged[k] = v;
            else if (v !== '' && v != null && Number.isFinite(Number(v))) merged[k] = Number(v);
        }
        out[g] = merged;
    }
    return out;
}

/**
 * Admin calculator: runs the SAME functions the real cancellation uses (computeBreakdown / settlementFor) on an example order,
 * with the admin's unsaved edits overlaid, so what they see is exactly what a customer would be charged.
 */
export async function simulateCancellation(input = {}, draft = null) {
    const saved = await getConfig({ fresh: true });
    const cfg = withConfigDefaults(mergeDraft(saved, draft));
    const stage = Number(input.stage) === 3 ? 3 : 2;
    const online = String(input.paymentMethod || 'cash') === 'online';
    const n = (v, d = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Math.max(0, Number(v)));
    const foodValue = r2(n(input.foodValue, 500));
    const deliveryFee = r2(n(input.deliveryFee, 30));
    const platformFee = r2(n(input.platformFee, 5));
    const trackedKm = r2(n(input.trackedKm, 2));
    const orderTotal = r2(input.orderTotal === '' || input.orderTotal == null ? foodValue + deliveryFee + platformFee : n(input.orderTotal));
    const customerAtFault = !input.faultParty || input.faultParty === 'customer';
    const order = {
        pricing: { subtotal: foodValue, deliveryFee, platformFee, total: orderTotal },
        payment: { method: online ? 'razorpay' : 'cash', status: online ? 'paid' : 'pending' },
        cancelTracking: { trackedKm }, dispatch: { deliveryPartnerId: 'rider' }, orderStatus: stage === 3 ? 'picked_up' : 'preparing',
    };
    const b = computeBreakdown(order, stage, cfg, !customerAtFault);
    const hold = usesRescueHold(order, stage, cfg) && customerAtFault;
    const rescuePrice = r2((foodValue * (100 - (cfg.rescue.discountPercent || 0))) / 100);
    const rescueRestaurant = r2((rescuePrice * (cfg.rescue.restaurantSharePercent || 0)) / 100);
    const failedComp = r2((foodValue * (cfg.rescue.failedRestaurantCompPercent || 0)) / 100);

    const customerSide = (total) => {
        const st = settlementFor(order, total);
        return online
            ? { mode: 'cut_from_payment', paid: st.paid, charge: r2(Math.min(total, st.paid)), refund: st.refundAmount, outstanding: st.shortfall, codBlocked: false }
            : { mode: 'outstanding', paid: 0, charge: r2(total), refund: 0, outstanding: r2(total), codBlocked: Boolean(cfg.cod?.blockWhileOutstanding && total > 0) };
    };
    const scenario = (key, title, when, customer, restaurant, restaurantNote, rider, riderNote) => ({ key, title, when, customer, restaurant: { amount: r2(restaurant), note: restaurantNote }, rider: { amount: r2(rider), note: riderNote } });

    const scenarios = [];
    if (stage === 2) {
        scenarios.push(scenario('cancelled', 'Cancelled while food is being prepared', 'Customer cancels after the restaurant accepted, before pickup', customerSide(b.total),
            b.restaurantPayable, `${b.restaurantSharePercent}% of food`, b.riderPayable, `Distance covered (${trackedKm} km GPS)`));
    } else if (!online) {
        scenarios.push(scenario('returned', 'Food returned to the restaurant (OTP)', 'Customer unreachable / cancels after pickup and the rider brings the food back', customerSide(b.total),
            b.restaurantPayable, `${b.restaurantSharePercent}% of food`, b.riderPayable + b.riderReturnPay, `Delivery charge Rs ${b.riderPayable} + return pay Rs ${b.riderReturnPay}`));
        if (cfg.rescue.enabled) {
            scenarios.push(scenario('rescue_sold', 'Customer cancels in the app: Food Rescue sold', 'COD cancel in the app starts Food Rescue and someone buys it', customerSide(b.total),
                rescueRestaurant, `${cfg.rescue.restaurantSharePercent}% of rescue price Rs ${rescuePrice}`, b.riderPayable, 'Delivery charge (new buyer\'s delivery is paid on that order)'));
            scenarios.push(scenario('rescue_unsold', 'Customer cancels in the app: Food Rescue unsold', 'Nobody buys the food within the rescue window', customerSide(b.total),
                failedComp, `${cfg.rescue.failedRestaurantCompPercent}% of food`, b.riderPayable, 'Delivery charge'));
        }
    } else if (hold) {
        scenarios.push(scenario('rescue_sold', 'Food Rescue sold', 'Another customer buys the food in the rescue window', customerSide(b.total),
            rescueRestaurant, `${cfg.rescue.restaurantSharePercent}% of rescue price Rs ${rescuePrice}`, b.riderPayable, 'Delivery charge (new buyer\'s delivery is paid on that order)'));
        scenarios.push(scenario('rescue_unsold', 'Food Rescue unsold', 'Nobody buys the food: the full payment is kept, no refund', { mode: 'cut_from_payment', paid: orderTotal, charge: orderTotal, refund: 0, outstanding: 0, codBlocked: false },
            failedComp, `${cfg.rescue.failedRestaurantCompPercent}% of food`, b.riderPayable, 'Delivery charge'));
    } else {
        scenarios.push(scenario('cancelled', 'Cancelled after pickup', 'Customer cancels after the rider picked up the food', customerSide(b.total),
            b.restaurantPayable, `${b.restaurantSharePercent}% of food`, b.riderPayable, 'Delivery charge'));
    }
    return {
        stage, paymentMethod: online ? 'online' : 'cash', foodValue, deliveryFee, platformFee, trackedKm, orderTotal,
        waived: !customerAtFault, breakdown: b, refundHeldForRescue: hold, scenarios,
        warnings: [
            ...(online && orderTotal < b.total ? ['The charge is higher than the amount paid: the extra stays outstanding.'] : []),
            ...(b.restaurantPayable + b.riderPayable > b.total && customerAtFault && !hold ? ['Eqosy pays out more than it charges the customer for this case.'] : []),
        ],
    };
}

export async function customerSummaryAdmin(userId) {
    const out = await getOutstanding(userId);
    return { ...out, history: await listPenaltyHistory(userId) };
}

export async function listAudit({ limit = 100 } = {}) {
    return FoodCancellationAudit.find({}).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
}

export async function summary() {
    const policy = { source: CANCEL_POLICY_SOURCE };
    const [cases, chargedByStage, money, outstanding, rescue] = await Promise.all([
        FoodCancellationCase.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 }, calculated: { $sum: '$breakdown.total' } } }]),
        // "Charged" = what the ledger really holds for the case (waived penalties count as 0).
        FoodUserPenalty.aggregate([
            { $match: { ...policy, caseId: { $ne: null }, status: { $ne: 'waived' } } },
            { $lookup: { from: FoodCancellationCase.collection.name, localField: 'caseId', foreignField: '_id', as: 'c' } },
            { $unwind: '$c' },
            { $group: { _id: '$c.stage', charged: { $sum: '$amount' } } },
        ]),
        FoodUserPenalty.aggregate([
            { $match: { ...policy, status: { $ne: 'waived' } } },
            { $group: { _id: { $cond: [{ $ne: ['$paidAt', null] }, { $cond: [{ $eq: ['$paidVia', 'refund_deduction'] }, 'deducted', 'collected'] }, 'outstanding'] }, total: { $sum: '$amount' } } },
        ]),
        FoodUserPenalty.aggregate([{ $match: { ...policy, paidAt: null, status: { $in: OUTSTANDING_STATUSES } } }, { $group: { _id: null, total: { $sum: '$amount' }, users: { $addToSet: '$userId' } } }]),
        FoodRescueListing.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const chargedMap = new Map(chargedByStage.map((x) => [x._id, r2(x.charged)]));
    const moneyMap = Object.fromEntries(money.map((m) => [m._id, r2(m.total)]));
    return {
        byStage: cases.map((c) => ({ ...c, charged: chargedMap.get(c._id) || 0 })),
        money: { deducted: moneyMap.deducted || 0, collected: moneyMap.collected || 0, outstanding: moneyMap.outstanding || 0 },
        outstandingTotal: r2(outstanding[0]?.total || 0), usersWithOutstanding: outstanding[0]?.users?.length || 0, rescue,
    };
}
