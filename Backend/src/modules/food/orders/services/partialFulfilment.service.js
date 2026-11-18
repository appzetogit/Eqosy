/**
 * Smart Partial Order Fulfilment & Item Replacement.
 *
 * Flow: store reports unavailable lines -> customer picks (replace / continue without / cancel) -> bill is
 * recalculated server-side -> payment adjusted (refund / extra payment / COD amount) -> store confirms final order.
 *
 * Design rules (see the feature brief):
 *  - orderStatus is untouched until the store accepts, so dispatch, cancellation, commission and payout code is unchanged.
 *  - The customer must explicitly confirm every replacement AND the exact new total (`expectedTotal`).
 *  - Extra money is only ever collected after the customer pays for it; refunds/charges are keyed so they can never repeat.
 *  - The original order is frozen in `fulfilment.original`; every applied change is appended to `fulfilment.modifications`.
 */
import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { isSuperAdminLike, normalizeObjectIdList } from '../../../../core/admin/adminHierarchy.service.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import {
    notifyOwnersSafely,
    notifyAdminsSafely,
    adminBell,
    buildOrderIdentityFilter,
    normalizeOrderForClient,
    getFulfilmentStage,
} from './order.helpers.js';
import { evaluateAdditionalCharges, resolveServerPricedItems } from './order-pricing.service.js';
import {
    createRazorpayCheckoutOrder,
    initiateRazorpayRefund,
    verifyCapturedPaymentForReceipt,
    isRazorpayConfigured,
} from '../helpers/razorpay.helper.js';
import * as userWalletService from '../../user/services/userWallet.service.js';
import * as foodTransactionService from './foodTransaction.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n) => `₹${r2(n)}`;
const labelOf = (o) => o.order_id || String(o._id);
const IMAGE = 'https://i.ibb.co/5GzXz7r/Eqosy-Brand-Image.png';
const PENALTY_CHARGE_IDS = ['previous-order-penalty', 'cancellation-penalty'];
const MAX_REPLACEMENT_QTY = 20;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    replacementEnabled: true,
    responseWindowSec: 300,
    /** 'ask' = never act on a timeout (notify store/admin). 'remove' = continue without the items when no extra charge arises. */
    defaultPreference: 'ask',
});

let settingsCache = { at: 0, value: null };

export async function getSettings({ fresh = false } = {}) {
    if (!fresh && settingsCache.value && Date.now() - settingsCache.at < 10 * 1000) return settingsCache.value;
    const doc = await FoodSettings.findOne({ key: 'partial_fulfilment' }).select('partialFulfilment updatedAt updatedBy').lean();
    const raw = doc?.partialFulfilment || {};
    const value = {
        enabled: raw.enabled !== false,
        replacementEnabled: raw.replacementEnabled !== false,
        responseWindowSec: Number.isFinite(Number(raw.responseWindowSec)) && Number(raw.responseWindowSec) >= 30
            ? Math.round(Number(raw.responseWindowSec)) : DEFAULT_SETTINGS.responseWindowSec,
        defaultPreference: raw.defaultPreference === 'remove' ? 'remove' : 'ask',
        updatedAt: doc?.updatedAt || null,
    };
    settingsCache = { at: Date.now(), value };
    return value;
}

export async function updateSettings(body = {}, adminId = null) {
    const before = await getSettings({ fresh: true });
    const next = { ...before };
    if (body.enabled !== undefined) next.enabled = !!body.enabled;
    if (body.replacementEnabled !== undefined) next.replacementEnabled = !!body.replacementEnabled;
    if (body.responseWindowSec !== undefined) {
        const sec = Number(body.responseWindowSec);
        if (!Number.isFinite(sec) || sec < 30 || sec > 24 * 3600) {
            throw new ValidationError('Customer response time must be between 30 seconds and 24 hours');
        }
        next.responseWindowSec = Math.round(sec);
    }
    if (body.defaultPreference !== undefined) {
        if (!['ask', 'remove'].includes(String(body.defaultPreference))) throw new ValidationError('Unknown default preference');
        next.defaultPreference = String(body.defaultPreference);
    }
    const { updatedAt, ...stored } = next; // eslint-disable-line no-unused-vars
    await FoodSettings.findOneAndUpdate(
        { key: 'partial_fulfilment' },
        { $set: { partialFulfilment: stored, updatedBy: { role: 'ADMIN', adminId: adminId || undefined, at: new Date() } } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    settingsCache = { at: 0, value: null };
    return getSettings({ fresh: true });
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const plain = (v) => (v?.toObject ? v.toObject() : v);

function pushHistory(order, entry) {
    const f = order.fulfilment;
    f.history = [...(f.history || []), { at: new Date(), ...entry }];
}

function isPrepaid(order) {
    const method = String(order.payment?.method || '').toLowerCase();
    const status = String(order.payment?.status || '').toLowerCase();
    return ['razorpay', 'wallet'].includes(method) && status === 'paid';
}

function billOf(pricing = {}) {
    const p = plain(pricing) || {};
    return {
        subtotal: r2(p.subtotal),
        discount: r2(p.discount),
        deliveryFee: r2(p.deliveryFee),
        platformFee: r2(p.platformFee),
        packagingFee: r2(p.packagingFee),
        surgeAmount: r2(p.surgeAmount),
        additionalChargesTotal: r2(p.additionalChargesTotal),
        additionalCharges: Array.isArray(p.additionalCharges) ? p.additionalCharges : [],
        tax: r2(p.tax),
        deliveryPartnerTip: r2(p.deliveryPartnerTip),
        total: r2(p.total),
    };
}

function lineView(item, index) {
    return {
        lineKey: String(index),
        itemId: String(item.itemId),
        variantId: item.variantId || '',
        variantName: item.variantName || '',
        name: item.name,
        quantity: Number(item.quantity) || 1,
        price: r2(item.price),
        image: item.image || '',
        isVeg: item.isVeg !== false,
    };
}

function emitFulfilment(order, extra = {}) {
    try {
        const io = getIO();
        if (!io) return;
        const payload = {
            orderMongoId: String(order._id),
            orderId: labelOf(order),
            orderStatus: order.orderStatus,
            fulfilmentState: order.fulfilment?.state || 'none',
            stage: getFulfilmentStage(order),
            deadlineAt: order.fulfilment?.deadlineAt || null,
            ...extra,
        };
        io.to(rooms.user(order.userId)).emit('fulfilment_update', payload);
        io.to(rooms.user(order.userId)).emit('order_status_update', { ...payload, title: extra.title, message: extra.message });
        io.to(rooms.restaurant(order.restaurantId)).emit('fulfilment_update', payload);
        io.to(rooms.restaurant(order.restaurantId)).emit('order_status_update', { ...payload, title: extra.title, message: extra.message });
        io.to(rooms.tracking(order._id)).emit('fulfilment_update', payload);
    } catch (e) {
        logger.warn(`[Fulfilment] socket emit failed: ${e?.message || e}`);
    }
}

async function pushTo(ownerType, ownerId, { title, body, type, link = '' }, order) {
    await notifyOwnersSafely([{ ownerType, ownerId }], {
        title,
        body,
        image: IMAGE,
        data: { type, orderId: String(order._id), orderMongoId: String(order._id), link },
    });
}

const userLink = (order, suffix = '') => `/food/user/orders/${order._id}${suffix}`;

async function loadUserOrder(orderId, userId) {
    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne({ ...identity, userId: new mongoose.Types.ObjectId(String(userId)) });
    if (!order) throw new NotFoundError('Order not found');
    return order;
}

async function loadRestaurantOrder(orderId, restaurantId) {
    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne({ ...identity, restaurantId: new mongoose.Types.ObjectId(String(restaurantId)) });
    if (!order) throw new NotFoundError('Order not found');
    return order;
}

/* ------------------------------------------------------------------ */
/* Replacement candidates (same store only)                            */
/* ------------------------------------------------------------------ */
const toCandidate = (d) => {
    const tracked = typeof d.stockQuantity === 'number';
    return {
        itemId: String(d._id),
        name: d.name,
        price: r2(d.price),
        image: d.image || '',
        foodType: d.foodType || '',
        categoryId: d.categoryId ? String(d.categoryId) : '',
        categoryName: d.categoryName || '',
        variants: (d.variants || []).map((v) => ({ variantId: String(v._id), name: v.name, price: r2(v.price) })),
        stockQuantity: tracked ? d.stockQuantity : null,
        maxQuantity: tracked ? Math.max(0, Math.min(d.stockQuantity, MAX_REPLACEMENT_QTY)) : MAX_REPLACEMENT_QTY,
    };
};

const sellableFilter = (restaurantId) => ({
    restaurantId: new mongoose.Types.ObjectId(String(restaurantId)),
    isActive: { $ne: false },
    isAvailable: { $ne: false },
    approvalStatus: { $nin: ['pending', 'rejected'] },
    $or: [{ stockQuantity: null }, { stockQuantity: { $gt: 0 } }],
});

export async function listReplacementCandidates(restaurantId, { excludeItemIds = [], q = '', limit = 300 } = {}) {
    const filter = sellableFilter(restaurantId);
    const ids = excludeItemIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (ids.length) filter._id = { $nin: ids };
    const term = String(q || '').trim();
    if (term) filter.name = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const docs = await FoodItem.find(filter)
        .select('name price image foodType categoryId categoryName variants stockQuantity')
        .sort({ categoryName: 1, name: 1 })
        .limit(Math.min(Number(limit) || 300, 500))
        .lean();
    return docs.map(toCandidate);
}

/** Validates + server-prices one replacement choice. Throws if it is not sellable from this store right now. */
async function resolveReplacement(order, spec, unavailableLine) {
    if (!spec || !mongoose.Types.ObjectId.isValid(String(spec.itemId || ''))) {
        throw new ValidationError('Please select a valid replacement item');
    }
    const doc = await FoodItem.findOne({ _id: spec.itemId, restaurantId: order.restaurantId }).lean();
    if (!doc) throw new ValidationError('Replacement items must come from the same store');
    if (doc.isActive === false || doc.isAvailable === false || ['pending', 'rejected'].includes(doc.approvalStatus)) {
        throw new ValidationError(`"${doc.name}" is no longer available`);
    }
    const quantity = spec.quantity === undefined || spec.quantity === null ? Number(unavailableLine.quantity) || 1 : Number(spec.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_REPLACEMENT_QTY) {
        throw new ValidationError(`Invalid quantity for "${doc.name}"`);
    }
    const tracked = typeof doc.stockQuantity === 'number';
    if (tracked && doc.stockQuantity < quantity) {
        throw new ValidationError(doc.stockQuantity > 0 ? `Only ${doc.stockQuantity} of "${doc.name}" available` : `"${doc.name}" is out of stock`);
    }
    const variantId = spec.variantId ? String(spec.variantId) : '';
    if (String(unavailableLine.itemId) === String(doc._id) && String(unavailableLine.variantId || '') === variantId) {
        throw new ValidationError(`"${doc.name}" is the unavailable item and cannot replace itself`);
    }
    const [priced] = await resolveServerPricedItems(
        [{ itemId: String(doc._id), variantId, quantity, name: doc.name }],
        order.restaurantId,
    );
    return {
        itemId: String(doc._id),
        name: priced.name,
        variantId: priced.variantId || '',
        variantName: priced.variantName || '',
        variantPrice: priced.variantPrice || 0,
        price: priced.price,
        quantity,
        isVeg: doc.foodType === 'Veg',
        image: doc.image || '',
        notes: '',
        isAddon: false,
        addons: [],
        _stockTracked: tracked,
    };
}

/* ------------------------------------------------------------------ */
/* Bill recalculation                                                  */
/* ------------------------------------------------------------------ */
/**
 * Re-prices an order for a new item list using the order's own frozen snapshot (delivery fee, platform fee, surge, tip,
 * commission rate/type, GST rates) and the live additional-charge / incentive rules. Pure with respect to `order`.
 */
export async function recomputePricing(order, newItems) {
    const p = plain(order.pricing) || {};
    const feeDoc = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    const num = (v) => Number(v) || 0;

    const subtotal = r2(newItems.reduce((s, it) => s + num(it.price) * num(it.quantity), 0));
    const oldSubtotal = num(p.subtotal);
    const isGrocery = Boolean(p.gstBreakdown?.rates);
    const gstRate = num(p.gstRate);
    const gb = p.gstBreakdown || {};

    // Coupon: the code is not stored on the order, so a flat/percent split is unknown. The granted discount is kept
    // but can never exceed the new item total.
    const discount = Math.max(0, Math.min(num(p.discount), subtotal));

    // Admin additional charges (e.g. Small Cart) follow the new item total; customer penalties stay as billed.
    const oldCharges = Array.isArray(p.additionalCharges) ? p.additionalCharges : [];
    const penaltyCharges = oldCharges.filter((c) => PENALTY_CHARGE_IDS.includes(c?.chargeId));
    const penaltyTotal = r2(penaltyCharges.reduce((s, c) => s + num(c.chargedAmount ?? c.amount), 0));
    const configured = feeDoc
        ? evaluateAdditionalCharges(feeDoc.additionalCharges, subtotal)
        : { charges: oldCharges.filter((c) => !PENALTY_CHARGE_IDS.includes(c?.chargeId)), chargesTotal: r2(num(p.additionalChargesTotal) - penaltyTotal) };
    const additionalCharges = [...configured.charges, ...penaltyCharges];
    const additionalChargesTotal = r2(num(configured.chargesTotal) + penaltyTotal);

    // GST: item + charges GST follow the new amounts; platform / delivery / surge GST stay as originally billed.
    const itemGst = isGrocery ? 0 : Math.round(Math.max(0, subtotal - discount) * (gstRate / 100));
    const chargeRate = isGrocery ? num(gb.rates?.additionalCharges ?? 18) : gstRate;
    const additionalChargesGst = Math.round(num(configured.chargesTotal) * (chargeRate / 100));
    const tax = itemGst + num(gb.platform) + num(gb.delivery) + additionalChargesGst + num(gb.surge);
    const gstBreakdown = { ...gb, item: itemGst, additionalCharges: additionalChargesGst };

    // Store commission: same frozen rule, new item total.
    let restaurantCommission;
    if (p.restaurantCommissionType === 'amount') {
        restaurantCommission = Math.min(num(p.restaurantCommission), subtotal);
    } else {
        let rate = num(p.restaurantCommissionRate);
        if (!p.restaurantCommissionSource && oldSubtotal > 0) rate = (num(p.restaurantCommission) / oldSubtotal) * 100; // legacy order
        restaurantCommission = Math.max(0, Math.min(r2(subtotal * (rate / 100)), subtotal));
    }

    // Rider incentive depends on the item total; the delivery-fee share, surge and tip are unchanged.
    const incentiveRule = feeDoc?.deliveryPartnerIncentiveRule || {};
    const incentiveEnabled = p.deliveryPartnerIncentiveEnabled === true;
    const incentivePercent = num(p.deliveryPartnerIncentivePercent);
    const incentiveEligible = incentiveEnabled && incentivePercent > 0 && subtotal >= num(incentiveRule.minOrderAmount);
    const incentiveAmount = incentiveEligible ? r2(subtotal * (incentivePercent / 100)) : 0;
    const riderTotalPayout = r2(num(order.riderDeliveryFeeShare) + num(order.riderSurgePay) + incentiveAmount + num(p.deliveryPartnerTip));

    let total = Math.max(
        0,
        subtotal + tax + num(p.packagingFee) + num(p.deliveryFee) + num(p.platformFee) + num(p.surgeAmount)
            + additionalChargesTotal + num(p.deliveryPartnerTip) - discount,
    );
    // Whole-rupee bills stay whole-rupee (cash collection and gateway amounts remain exact).
    total = Number.isInteger(num(p.total)) ? Math.round(total) : r2(total);

    return {
        pricing: {
            subtotal, tax, gstBreakdown, additionalCharges, additionalChargesTotal, restaurantCommission, discount, total,
            deliveryPartnerIncentiveEligible: incentiveEligible,
            deliveryPartnerIncentiveAmount: incentiveAmount,
        },
        rider: { riderIncentivePay: incentiveAmount, riderTotalPayout, riderEarning: riderTotalPayout },
        platformProfit: Math.max(0, num(p.platformFee) + additionalChargesTotal + restaurantCommission),
        bill: billOf({ ...p, subtotal, tax, additionalCharges, additionalChargesTotal, discount, total }),
    };
}

/** How the money moves for a bill change. Never negative-charges and never auto-charges. */
function computeSettlement(order, newTotal) {
    const oldTotal = r2(order.pricing?.total);
    const delta = r2(newTotal - oldTotal);
    const method = String(order.payment?.method || 'cash').toLowerCase();
    const prepaid = isPrepaid(order);
    const base = { method, prepaid, oldTotal, newTotal: r2(newTotal), delta, refundAmount: 0, extraAmount: 0, requiresPayment: false };
    if (!prepaid) {
        // COD / QR: nothing is collected now; the final payable amount is simply the new total.
        return { ...base, type: delta === 0 ? 'none' : 'cod_update', codPayable: r2(newTotal) };
    }
    if (delta < 0) return { ...base, type: 'refund', refundAmount: r2(-delta) };
    if (delta > 0) return { ...base, type: 'charge', extraAmount: delta, requiresPayment: true };
    return { ...base, type: 'none' };
}

/* ------------------------------------------------------------------ */
/* Proposal (decision -> new items + bill), shared by preview/apply    */
/* ------------------------------------------------------------------ */
function assertDecidable(order) {
    if (order.orderStatus !== 'created') {
        throw new ValidationError('This order can no longer be changed because it has already moved ahead.');
    }
    const state = order.fulfilment?.state;
    if (!['awaiting_customer', 'awaiting_payment', 'applying'].includes(state)) {
        throw new ValidationError('There is nothing waiting for your decision on this order.');
    }
}

async function buildProposal(order, decision = {}) {
    const f = order.fulfilment;
    const settings = await getSettings();
    const unavailable = f.unavailableItems || [];
    const lines = Array.isArray(decision.lines) ? decision.lines : [];

    const byKey = new Map();
    for (const l of lines) {
        const key = String(l?.lineKey);
        if (byKey.has(key)) throw new ValidationError('Each unavailable item can only be handled once');
        byKey.set(key, l);
    }
    for (const u of unavailable) {
        if (!byKey.has(String(u.lineKey))) throw new ValidationError('Please choose what to do with every unavailable item');
    }
    if (byKey.size !== unavailable.length) throw new ValidationError('Unknown item in your selection');

    const items = (plain(order.items) || []).map((i) => ({ ...i }));
    const summary = [];
    const replacements = [];
    const removeIdx = new Set();
    const additions = [];

    for (const u of unavailable) {
        const idx = Number(u.lineKey);
        const current = items[idx];
        if (!current || String(current.itemId) !== String(u.itemId)) {
            throw new ValidationError('Your order changed. Please refresh and try again.');
        }
        const l = byKey.get(String(u.lineKey));
        const action = String(l.action || '');
        removeIdx.add(idx);
        if (action === 'remove') {
            summary.push({ lineKey: u.lineKey, name: u.name, quantity: u.quantity, action: 'remove', removedAmount: r2(u.price * u.quantity), replacement: null });
        } else if (action === 'replace') {
            if (!settings.replacementEnabled) throw new ValidationError('Item replacement is currently turned off');
            const rep = await resolveReplacement(order, l.replacement, u);
            additions.push(rep);
            replacements.push({ lineKey: u.lineKey, itemId: rep.itemId, variantId: rep.variantId, quantity: rep.quantity });
            summary.push({
                lineKey: u.lineKey, name: u.name, quantity: u.quantity, action: 'replace', removedAmount: r2(u.price * u.quantity),
                replacement: { itemId: rep.itemId, name: rep.name, variantName: rep.variantName, price: rep.price, quantity: rep.quantity, image: rep.image, addedAmount: r2(rep.price * rep.quantity) },
            });
        } else {
            throw new ValidationError('Choose "replace" or "continue without" for every unavailable item');
        }
    }

    // Same replacement picked for two lines (or already in the cart at the same price) is merged, never duplicated.
    const newItems = items.filter((_, i) => !removeIdx.has(i));
    for (const rep of additions) {
        const { _stockTracked, ...clean } = rep; // eslint-disable-line no-unused-vars
        const twin = newItems.find((it) => !it.isAddon && String(it.itemId) === clean.itemId && String(it.variantId || '') === clean.variantId && r2(it.price) === r2(clean.price));
        if (twin) twin.quantity = Number(twin.quantity) + clean.quantity;
        else newItems.push(clean);
    }
    if (!newItems.length) {
        throw new ValidationError('Nothing would be left in your order. Please cancel the order instead.');
    }

    // Stock must cover the total quantity picked per replacement item.
    const need = new Map();
    for (const rep of additions) if (rep._stockTracked) need.set(rep.itemId, (need.get(rep.itemId) || 0) + rep.quantity);
    for (const [itemId, qty] of need) {
        const d = await FoodItem.findById(itemId).select('name stockQuantity').lean();
        if (typeof d?.stockQuantity === 'number' && d.stockQuantity < qty) throw new ValidationError(`Only ${d.stockQuantity} of "${d.name}" available`);
    }

    const calc = await recomputePricing(order, newItems);
    const settlement = computeSettlement(order, calc.pricing.total);

    // Existing COD rule: cash orders at/over the admin COD limit are not allowed, so a replacement cannot push past it.
    if (String(order.payment?.method).toLowerCase() === 'cash' && settlement.delta > 0) {
        const feeDoc = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).select('codLimit').lean();
        if (feeDoc?.codLimit != null && calc.pricing.total >= Number(feeDoc.codLimit)) {
            throw new ValidationError(`Cash on delivery is not available for orders of ${inr(feeDoc.codLimit)} or more. Please choose a cheaper replacement or continue without the item.`);
        }
    }
    const kinds = new Set(summary.map((s) => s.action));
    const action = kinds.size === 2 ? 'mixed' : (kinds.has('replace') ? 'replace' : 'remove');

    return {
        action, newItems, calc, settlement, summary, replacements,
        stockNeeds: additions.filter((a) => a._stockTracked).map((a) => ({ itemId: a.itemId, quantity: a.quantity })),
        before: billOf(order.pricing),
        after: calc.bill,
    };
}

const publicProposal = (p) => ({
    action: p.action,
    lines: p.summary,
    before: p.before,
    after: p.after,
    settlement: p.settlement,
    requiresPayment: p.settlement.requiresPayment,
    items: p.newItems.map((it, i) => lineView(it, i)),
});

/* ------------------------------------------------------------------ */
/* Store: report unavailable items                                     */
/* ------------------------------------------------------------------ */
export async function reportUnavailableItems(orderId, restaurantId, body = {}) {
    const settings = await getSettings({ fresh: true });
    if (!settings.enabled) throw new ValidationError('Partial order fulfilment is turned off. Please reject the order instead.');

    const order = await loadRestaurantOrder(orderId, restaurantId);
    if (order.orderStatus !== 'created') throw new ValidationError('Item availability can only be reported before the order is accepted.');
    const state = order.fulfilment?.state || 'none';
    if (!['none', 'resolved'].includes(state)) {
        throw new ValidationError(state === 'awaiting_customer' ? 'The customer has already been asked to decide.' : 'The customer is still completing an earlier decision.');
    }

    const input = Array.isArray(body.items) ? body.items : [];
    if (!input.length) throw new ValidationError('Select at least one unavailable item');
    const items = plain(order.items) || [];
    const seen = new Set();
    const unavailable = [];
    const now = new Date();
    for (const row of input) {
        const key = String(row?.lineKey);
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) throw new ValidationError('Unknown order item');
        if (seen.has(key)) continue;
        seen.add(key);
        const it = items[idx];
        unavailable.push({
            lineKey: key, itemId: String(it.itemId), variantId: it.variantId || '', variantName: it.variantName || '',
            name: it.name, quantity: Number(it.quantity) || 1, price: r2(it.price), image: it.image || '',
            reason: String(row.reason || 'out_of_stock').slice(0, 80), reportedAt: now,
        });
    }

    // Optional store suggestions (customer still has to choose and confirm).
    const suggestions = [];
    for (const s of Array.isArray(body.suggestions) ? body.suggestions : []) {
        if (!seen.has(String(s?.lineKey))) continue;
        const u = unavailable.find((x) => x.lineKey === String(s.lineKey));
        try {
            const rep = await resolveReplacement(order, { itemId: s.itemId, variantId: s.variantId, quantity: u.quantity }, u);
            suggestions.push({ lineKey: u.lineKey, itemId: rep.itemId, variantId: rep.variantId, name: rep.name, price: rep.price, image: rep.image });
        } catch (e) {
            logger.info(`[Fulfilment] ignored invalid store suggestion: ${e?.message}`);
        }
    }

    const original = order.fulfilment?.original || {
        items: items.map((i) => ({ ...i })),
        pricing: plain(order.pricing),
        paymentTotal: r2(order.pricing?.total),
        paymentMethod: order.payment?.method,
        capturedAt: now,
    };
    const history = [
        ...(order.fulfilment?.history || []),
        { at: now, byRole: 'RESTAURANT', byId: String(restaurantId), action: 'items_reported_unavailable', note: unavailable.map((u) => u.name).join(', '), data: { lineKeys: unavailable.map((u) => u.lineKey), suggestions: suggestions.length } },
    ];

    const updated = await FoodOrder.findOneAndUpdate(
        {
            _id: order._id, restaurantId: order.restaurantId, orderStatus: 'created',
            $or: [{ 'fulfilment.state': { $exists: false } }, { 'fulfilment.state': { $in: ['none', 'resolved'] } }],
        },
        {
            $set: {
                'fulfilment.state': 'awaiting_customer',
                'fulfilment.reportedAt': now,
                'fulfilment.reportedBy': new mongoose.Types.ObjectId(String(restaurantId)),
                'fulfilment.deadlineAt': new Date(now.getTime() + settings.responseWindowSec * 1000),
                'fulfilment.responseWindowSec': settings.responseWindowSec,
                'fulfilment.timeoutNotifiedAt': null,
                'fulfilment.unavailableItems': unavailable,
                'fulfilment.suggestions': suggestions,
                'fulfilment.original': original,
                'fulfilment.pending': null,
                'fulfilment.history': history,
            },
        },
        { new: true },
    );
    if (!updated) throw new ValidationError('This order was just updated. Please refresh and try again.');

    // ONE notification for the whole set of unavailable items.
    const first = unavailable[0].name;
    const more = unavailable.length > 1 ? ` and ${unavailable.length - 1} more` : '';
    const mins = Math.max(1, Math.round(settings.responseWindowSec / 60));
    await pushTo('USER', updated.userId, {
        title: 'Some items are unavailable 🛒',
        body: `${first}${more} ${unavailable.length > 1 ? 'are' : 'is'} unavailable at the store. Choose a replacement, continue without, or cancel — please reply within ${mins} min.`,
        type: 'order_items_unavailable',
        link: userLink(updated, '/unavailable-items'),
    }, updated);
    emitFulfilment(updated, { title: 'Some items are unavailable', message: `${first}${more} unavailable. Tap to choose.`, event: 'items_unavailable' });
    adminBell({
        title: 'Item availability issue', message: `Order #${labelOf(updated)}: ${unavailable.length} item(s) unavailable (${first}${more}).`,
        path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'warning', zoneId: updated.zoneId, orderMongoId: updated._id,
    });
    return { order: normalizeOrderForClient(updated), unavailable, deadlineAt: updated.fulfilment.deadlineAt };
}

export async function getStoreAlternatives(orderId, restaurantId) {
    const order = await loadRestaurantOrder(orderId, restaurantId);
    const candidates = await listReplacementCandidates(order.restaurantId, { excludeItemIds: [] });
    return { candidates };
}

/** Guard used by the store's "accept order" action. Also re-validates replacements (they may have run out meanwhile). */
export async function assertStoreCanAccept(order) {
    const f = order?.fulfilment;
    if (!f || ['none', 'cancelled'].includes(f.state || 'none')) return;
    if (order.orderStatus !== 'created') return; // stale double-tap on an already accepted order: leave to the existing no-op
    if (f.state !== 'resolved') {
        throw new ValidationError(
            f.state === 'awaiting_payment'
                ? 'Waiting for the customer to complete the additional payment.'
                : 'Waiting for the customer to decide about the unavailable items.',
        );
    }
    const last = (f.modifications || [])[f.modifications.length - 1];
    const reps = last?.replacements || [];
    if (!reps.length) return;
    const items = plain(order.items) || [];
    const gone = [];
    for (const rep of reps) {
        const idx = items.findIndex((it) => String(it.itemId) === String(rep.itemId) && String(it.variantId || '') === String(rep.variantId || ''));
        if (idx < 0) continue;
        const d = await FoodItem.findOne({ _id: rep.itemId, restaurantId: order.restaurantId }).select('isActive isAvailable approvalStatus stockQuantity').lean();
        // Stock for this order was reserved when the customer's choice was applied, so a tracked item sitting at 0
        // (auto-flagged unavailable by that very reservation) is NOT "gone".
        const reservedOut = typeof d?.stockQuantity === 'number' && d.stockQuantity === 0;
        if (!d || d.isActive === false || ['pending', 'rejected'].includes(d.approvalStatus) || (d.isAvailable === false && !reservedOut)) gone.push(idx);
    }
    if (gone.length) {
        await reopenForCustomer(order, gone, 'Replacement became unavailable before final confirmation');
        throw new ValidationError('A replacement the customer chose is no longer available. The customer has been asked to choose again.');
    }
}

async function reopenForCustomer(order, lineIdxs, note) {
    const settings = await getSettings();
    const items = plain(order.items) || [];
    const now = new Date();
    const unavailable = lineIdxs.map((idx) => ({
        lineKey: String(idx), itemId: String(items[idx].itemId), variantId: items[idx].variantId || '', variantName: items[idx].variantName || '',
        name: items[idx].name, quantity: Number(items[idx].quantity) || 1, price: r2(items[idx].price), image: items[idx].image || '',
        reason: 'replacement_unavailable', reportedAt: now,
    }));
    const history = [...(order.fulfilment.history || []), { at: now, byRole: 'SYSTEM', action: 'replacement_unavailable_reopened', note, data: { lineKeys: unavailable.map((u) => u.lineKey) } }];
    const updated = await FoodOrder.findOneAndUpdate(
        { _id: order._id, orderStatus: 'created', 'fulfilment.state': 'resolved' },
        { $set: {
            'fulfilment.state': 'awaiting_customer', 'fulfilment.reportedAt': now,
            'fulfilment.deadlineAt': new Date(now.getTime() + settings.responseWindowSec * 1000),
            'fulfilment.responseWindowSec': settings.responseWindowSec, 'fulfilment.timeoutNotifiedAt': null,
            'fulfilment.unavailableItems': unavailable, 'fulfilment.suggestions': [], 'fulfilment.pending': null, 'fulfilment.history': history,
        } },
        { new: true },
    );
    if (!updated) return;
    await pushTo('USER', updated.userId, {
        title: 'A replacement is no longer available',
        body: `${unavailable.map((u) => u.name).join(', ')} just ran out. Please choose again.`,
        type: 'order_items_unavailable', link: userLink(updated, '/unavailable-items'),
    }, updated);
    emitFulfilment(updated, { title: 'Replacement unavailable', message: 'Please choose again.', event: 'items_unavailable' });
    adminBell({ title: 'Item availability issue', message: `Order #${labelOf(updated)}: a chosen replacement became unavailable.`, path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'warning', zoneId: updated.zoneId, orderMongoId: updated._id });
}

/** Called after the store confirmed the final order (existing accept flow). Records history; no new push (accept already notifies). */
export async function onStoreConfirmed(order, restaurantId) {
    try {
        if (order?.fulfilment?.state !== 'resolved') return;
        await FoodOrder.updateOne({ _id: order._id }, { $push: { 'fulfilment.history': { at: new Date(), byRole: 'RESTAURANT', byId: String(restaurantId), action: 'store_confirmed_final_order', note: 'Store confirmed the final order' } } });
        adminBell({ title: 'Modified order confirmed', message: `Order #${labelOf(order)} was confirmed by the store after the customer's changes.`, path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'info', zoneId: order.zoneId, orderMongoId: order._id });
    } catch (e) {
        logger.warn(`[Fulfilment] onStoreConfirmed failed: ${e?.message}`);
    }
}

/* ------------------------------------------------------------------ */
/* Customer: view / preview / decide                                   */
/* ------------------------------------------------------------------ */
export async function getDecisionView(orderId, userId) {
    const order = await loadUserOrder(orderId, userId);
    const f = order.fulfilment;
    if (!f || (f.state || 'none') === 'none') throw new ValidationError('No unavailable items on this order.');
    const settings = await getSettings();
    const unavailable = f.unavailableItems || [];
    const unavailKeys = new Set(unavailable.map((u) => String(u.lineKey)));
    const items = plain(order.items) || [];
    const open = order.orderStatus === 'created' && ['awaiting_customer', 'awaiting_payment'].includes(f.state);

    const candidates = open && settings.replacementEnabled
        ? await listReplacementCandidates(order.restaurantId, { excludeItemIds: unavailable.map((u) => u.itemId) })
        : [];
    const user = await FoodUser.findById(userId).select('unavailableItemPreference').lean();

    return {
        orderMongoId: String(order._id),
        orderId: labelOf(order),
        orderStatus: order.orderStatus,
        state: f.state,
        stage: getFulfilmentStage(order),
        open,
        deadlineAt: f.deadlineAt,
        serverNow: new Date().toISOString(),
        responseWindowSec: f.responseWindowSec,
        timedOut: Boolean(f.timeoutNotifiedAt),
        replacementEnabled: settings.replacementEnabled,
        paymentMethod: order.payment?.method,
        paymentStatus: order.payment?.status,
        prepaid: isPrepaid(order),
        preference: user?.unavailableItemPreference || 'ask',
        unavailableItems: unavailable.map((u) => ({
            ...u,
            suggestions: (f.suggestions || []).filter((s) => String(s.lineKey) === String(u.lineKey)),
        })),
        availableItems: items.map((it, i) => lineView(it, i)).filter((l) => !unavailKeys.has(l.lineKey)),
        candidates,
        bill: billOf(order.pricing),
        original: f.original ? { total: r2(f.original.paymentTotal), items: (f.original.items || []).map((it, i) => lineView(it, i)) } : null,
        pending: f.pending ? { delta: f.pending.delta, newTotal: f.pending.newTotal, razorpayOrderId: f.pending.razorpayOrderId } : null,
        lastModification: (f.modifications || []).slice(-1)[0] || null,
    };
}

export async function previewDecision(orderId, userId, decision) {
    const order = await loadUserOrder(orderId, userId);
    assertDecidable(order);
    const proposal = await buildProposal(order, decision);
    return publicProposal(proposal);
}

async function releaseLock(orderId, prevState) {
    await FoodOrder.updateOne({ _id: orderId, 'fulfilment.state': 'applying' }, { $set: { 'fulfilment.state': prevState } });
}

export async function submitDecision(orderId, userId, body = {}) {
    const pre = await loadUserOrder(orderId, userId);

    // Duplicate tap / retry after success: report the stored result instead of acting twice.
    if (pre.fulfilment?.state === 'resolved' && body.action !== 'cancel') {
        return { order: normalizeOrderForClient(pre), alreadyApplied: true, requiresPayment: false };
    }
    if (pre.fulfilment?.state === 'cancelled') return { order: normalizeOrderForClient(pre), alreadyApplied: true, requiresPayment: false };
    assertDecidable(pre);

    const prevState = pre.fulfilment.state === 'applying' ? 'awaiting_customer' : pre.fulfilment.state;
    const locked = await FoodOrder.findOneAndUpdate(
        { _id: pre._id, userId: pre.userId, orderStatus: 'created', 'fulfilment.state': { $in: ['awaiting_customer', 'awaiting_payment'] } },
        { $set: { 'fulfilment.state': 'applying' } },
        { new: true },
    );
    if (!locked) throw new ValidationError('Your decision is already being processed.');

    try {
        if (body.action === 'cancel') return await cancelByCustomer(locked, userId, body);

        const expected = Number(body.expectedTotal);
        if (!Number.isFinite(expected)) throw new ValidationError('Please confirm the updated bill before continuing.');
        const proposal = await buildProposal(locked, body);
        if (Math.abs(proposal.settlement.newTotal - expected) > 0.009) {
            const err = new ValidationError('The bill changed while you were deciding. Please review the updated amount.');
            err.code = 'BILL_CHANGED';
            err.statusCode = 409;
            err.details = publicProposal(proposal);
            throw err;
        }

        const s = proposal.settlement;
        if (s.type === 'charge' && s.method === 'razorpay') {
            return await startAdditionalPayment(locked, proposal, body);
        }
        let walletCharged = false;
        if (s.type === 'charge' && s.method === 'wallet') {
            await userWalletService.deductWalletBalance(
                locked.userId, s.extraAmount, `Additional amount for order #${labelOf(locked)} (item replacement)`,
                { fulfilmentOrderId: String(locked._id), fulfilmentVersion: (locked.fulfilment.version || 0) + 1 },
            );
            walletCharged = true;
        }
        try {
            const result = await applyProposal(locked._id, proposal, { actorRole: 'USER', actorId: userId, by: 'customer', walletCharged });
            return result;
        } catch (e) {
            if (walletCharged) {
                await userWalletService.refundWalletBalance(
                    locked.userId, s.extraAmount, `Reversal of additional charge for order #${labelOf(locked)}`,
                    { fulfilmentOrderId: String(locked._id), fulfilmentReversal: true },
                ).catch((re) => logger.error(`[Fulfilment] wallet reversal failed for ${locked._id}: ${re?.message}`));
            }
            throw e;
        }
    } catch (e) {
        await releaseLock(pre._id, prevState).catch(() => {});
        throw e;
    }
}

async function cancelByCustomer(locked, userId, body) {
    const orderService = await import('./order.service.js');
    const reason = String(body.reason || 'Item unavailable – cancelled by customer').slice(0, 200);
    // Existing cancellation + refund policy handles status, refund and notifications.
    const cancelled = await orderService.cancelOrder(String(locked._id), userId, { cancellationReason: reason, reasonCode: body.reasonCode || '' });
    const now = new Date();
    await FoodOrder.updateOne(
        { _id: locked._id },
        {
            $set: { 'fulfilment.state': 'cancelled', 'fulfilment.decision': { action: 'cancel', at: now, by: 'customer' }, 'fulfilment.pending': null },
            $push: { 'fulfilment.history': { at: now, byRole: 'USER', byId: String(userId), action: 'customer_cancelled_order', note: reason } },
        },
    );
    adminBell({ title: 'Order cancelled', message: `Order #${labelOf(locked)} was cancelled by the customer after items became unavailable.`, path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'warning', zoneId: locked.zoneId, orderMongoId: locked._id });
    await pushTo('RESTAURANT', locked.restaurantId, { title: 'Order cancelled by customer', body: `Order #${labelOf(locked)} was cancelled by the customer.`, type: 'order_cancelled' }, locked);
    return { order: cancelled, cancelled: true, requiresPayment: false };
}

/** Prepaid upsell: nothing is applied or charged until the customer pays the extra amount. */
async function startAdditionalPayment(locked, proposal, body) {
    if (!isRazorpayConfigured()) throw new ValidationError('Online payment is not available right now. Please choose "continue without" or cancel.');
    const s = proposal.settlement;
    const version = (locked.fulfilment.version || 0) + 1;
    let rp;
    try {
        rp = await createRazorpayCheckoutOrder(Math.round(s.extraAmount * 100), 'INR', `FULF-${locked._id}-v${version}`);
    } catch (e) {
        throw new ValidationError(e?.message || 'Could not start the additional payment');
    }
    const now = new Date();
    const settings = await getSettings();
    const updated = await FoodOrder.findOneAndUpdate(
        { _id: locked._id, 'fulfilment.state': 'applying' },
        {
            $set: {
                'fulfilment.state': 'awaiting_payment',
                'fulfilment.deadlineAt': new Date(now.getTime() + settings.responseWindowSec * 1000),
                'fulfilment.timeoutNotifiedAt': null,
                'fulfilment.pending': {
                    decision: { lines: body.lines }, newTotal: s.newTotal, delta: s.extraAmount, razorpayOrderId: rp.orderId, version, createdAt: now,
                },
            },
            $push: {
                'fulfilment.history': { at: now, byRole: 'USER', byId: String(locked.userId), action: 'customer_confirmed_bill_payment_pending', note: `Updated bill ${inr(s.newTotal)} (+${inr(s.extraAmount)}) confirmed; payment pending`, data: { lines: proposal.summary } },
            },
        },
        { new: true },
    );
    if (!updated) throw new ValidationError('Your decision is already being processed.');
    await pushTo('USER', updated.userId, {
        title: 'Additional payment required',
        body: `Pay ${inr(s.extraAmount)} to confirm your updated order #${labelOf(updated)} (new total ${inr(s.newTotal)}).`,
        type: 'order_additional_payment', link: userLink(updated, '/unavailable-items'),
    }, updated);
    emitFulfilment(updated, { event: 'payment_required', title: 'Additional payment required', message: `Pay ${inr(s.extraAmount)} to confirm.` });
    return {
        order: normalizeOrderForClient(updated), requiresPayment: true, settlement: s,
        razorpay: { key: rp.key, orderId: rp.orderId, amount: rp.amount, currency: rp.currency },
        proposal: publicProposal(proposal),
    };
}

export async function verifyAdditionalPayment(orderId, userId, payload = {}) {
    const order = await loadUserOrder(orderId, userId);
    const f = order.fulfilment;
    const paymentId = String(payload.razorpayPaymentId || '');
    const razorpayOrderId = String(payload.razorpayOrderId || '');
    if (!f || !paymentId || !razorpayOrderId) throw new ValidationError('No additional payment is pending for this order.');
    // Same payment verified twice (retry / double tap / already refunded): never act on it again.
    if ((f.additionalPayments || []).some((p) => p.paymentId === paymentId)) {
        return { order: normalizeOrderForClient(order), alreadyApplied: true };
    }
    let verified;
    try {
        verified = await verifyCapturedPaymentForReceipt({
            orderId: razorpayOrderId, paymentId, signature: String(payload.razorpaySignature || ''), receiptPrefix: `FULF-${order._id}`,
        });
    } catch (e) {
        throw new ValidationError(e?.message || 'Payment verification failed');
    }

    // The money is really captured now. If it can no longer be used (order cancelled/moved on, a newer request replaced
    // this one, or the amount differs) it is refunded automatically instead of being left with us.
    const pendingOk = order.orderStatus === 'created' && f.state === 'awaiting_payment' && f.pending
        && f.pending.razorpayOrderId === razorpayOrderId && Math.abs(verified.amountInr - Number(f.pending.delta)) <= 0.009;
    if (!pendingOk) {
        await refundOrphanPayment(order, { key: `pay:${paymentId}`, amount: verified.amountInr, method: 'razorpay', razorpayOrderId: verified.orderId, paymentId: verified.paymentId, at: new Date() },
            order.orderStatus !== 'created' ? 'The order is no longer open for changes' : 'This payment no longer matches your current request');
    }

    const locked = await FoodOrder.findOneAndUpdate(
        { _id: order._id, userId: order.userId, orderStatus: 'created', 'fulfilment.state': 'awaiting_payment', 'fulfilment.pending.razorpayOrderId': f.pending.razorpayOrderId },
        { $set: { 'fulfilment.state': 'applying' } },
        { new: true },
    );
    if (!locked) throw new ValidationError('This payment is already being processed.');

    const paymentEntry = { key: `pay:v${f.pending.version}`, amount: verified.amountInr, method: 'razorpay', status: 'paid', razorpayOrderId: verified.orderId, paymentId: verified.paymentId, at: new Date() };
    try {
        const proposal = await buildProposal(locked, f.pending.decision);
        if (Math.abs(proposal.settlement.newTotal - Number(f.pending.newTotal)) > 0.009) {
            throw new ValidationError('The bill changed after you confirmed it.');
        }
        return await applyProposal(locked._id, proposal, { actorRole: 'USER', actorId: userId, by: 'customer', paymentEntry });
    } catch (e) {
        // The customer already paid but the confirmed selection is no longer valid: give the money back and ask again.
        logger.warn(`[Fulfilment] verified payment could not be applied for ${locked._id}: ${e?.message}`);
        const refundEntry = await refundExtraPayment(locked, paymentEntry, `Selection no longer valid: ${e?.message || ''}`);
        const now = new Date();
        await FoodOrder.updateOne(
            { _id: locked._id },
            {
                $set: { 'fulfilment.state': 'awaiting_customer', 'fulfilment.pending': null },
                $push: {
                    'fulfilment.additionalPayments': { ...paymentEntry, status: refundEntry.status === 'processed' ? 'refunded' : 'paid_refund_pending' },
                    'fulfilment.refunds': refundEntry,
                    'fulfilment.history': { at: now, byRole: 'SYSTEM', action: 'additional_payment_refunded_reselect', note: e?.message || 'Selection invalid after payment', data: { amount: paymentEntry.amount } },
                },
            },
        );
        const fresh = await FoodOrder.findById(locked._id);
        await pushTo('USER', fresh.userId, {
            title: 'Please choose again',
            body: `Your selection changed before it could be confirmed. Your ${inr(paymentEntry.amount)} payment is being refunded.`,
            type: 'order_additional_payment_refund', link: userLink(fresh, '/unavailable-items'),
        }, fresh);
        emitFulfilment(fresh, { event: 'items_unavailable', title: 'Please choose again', message: 'Your selection changed.' });
        if (refundEntry.status !== 'processed') await alertRefundIssue(fresh, refundEntry);
        throw new ValidationError(`${e?.message || 'Selection no longer valid'}. Your payment is being refunded; please choose again.`);
    }
}

/* ------------------------------------------------------------------ */
/* Apply a validated proposal                                          */
/* ------------------------------------------------------------------ */
/** A verified extra payment that cannot be applied: record it once, refund it once, tell the customer and admin. */
async function refundOrphanPayment(order, paymentEntry, reason) {
    const claimed = await FoodOrder.findOneAndUpdate(
        { _id: order._id, 'fulfilment.additionalPayments.paymentId': { $ne: paymentEntry.paymentId } },
        { $push: { 'fulfilment.additionalPayments': { ...paymentEntry, status: 'paid_refund_pending' } } },
        { new: true },
    );
    if (!claimed) throw new ValidationError('This payment was already handled.');
    const refundEntry = await refundExtraPayment(claimed, paymentEntry, reason);
    const now = new Date();
    await FoodOrder.updateOne(
        { _id: order._id, 'fulfilment.additionalPayments.paymentId': paymentEntry.paymentId },
        {
            $set: { 'fulfilment.additionalPayments.$.status': refundEntry.status === 'processed' ? 'refunded' : 'paid_refund_pending' },
            $push: {
                'fulfilment.refunds': refundEntry,
                'fulfilment.history': { at: now, byRole: 'SYSTEM', action: 'orphan_additional_payment_refunded', note: `${reason}. ${inr(paymentEntry.amount)} ${refundEntry.status}` },
            },
        },
    );
    await pushTo('USER', order.userId, {
        title: 'Payment is being refunded',
        body: `${inr(paymentEntry.amount)} paid for order #${labelOf(order)} could not be used (${reason}). It is being refunded.`,
        type: 'order_additional_payment_refund', link: userLink(order),
    }, order);
    if (refundEntry.status !== 'processed') await alertRefundIssue(claimed, refundEntry);
    throw new ValidationError(`${reason}. Your ${inr(paymentEntry.amount)} payment is being refunded.`);
}

async function reserveStock(needs) {
    const done = [];
    try {
        for (const n of needs) {
            const doc = await FoodItem.findOneAndUpdate(
                { _id: n.itemId, stockQuantity: { $gte: n.quantity } },
                { $inc: { stockQuantity: -n.quantity } },
                { new: true },
            );
            if (!doc) throw new ValidationError('A replacement item just went out of stock. Please choose again.');
            done.push(n);
            if (doc.stockQuantity === 0) {
                await FoodItem.updateOne({ _id: doc._id }, { $set: { isAvailable: false } });
                try {
                    const { notifyInventoryControl } = await import('../../restaurant/services/restaurantFood.service.js');
                    void notifyInventoryControl({ foodItem: doc, previousIsAvailable: true, currentIsAvailable: false, stockQuantity: 0, restaurantId: doc.restaurantId });
                } catch { /* inventory alert is best-effort */ }
            }
        }
    } catch (e) {
        for (const n of done) await FoodItem.updateOne({ _id: n.itemId }, { $inc: { stockQuantity: n.quantity } }).catch(() => {});
        throw e;
    }
    return done;
}

async function refundExtraPayment(order, paymentEntry, reason) {
    const key = `refund:${paymentEntry.key}`;
    const entry = { key, amount: paymentEntry.amount, method: 'razorpay', reason, at: new Date(), status: 'failed', refundId: '', paymentId: paymentEntry.paymentId };
    try {
        const res = await initiateRazorpayRefund(paymentEntry.paymentId, paymentEntry.amount);
        if (res?.success) return { ...entry, status: 'processed', refundId: res.refundId, processedAt: new Date() };
        return { ...entry, error: res?.error || 'Razorpay refund failed' };
    } catch (e) {
        return { ...entry, error: e?.message || 'Refund failed' };
    }
}

async function alertRefundIssue(order, entry) {
    adminBell({
        title: 'Refund issue', message: `Order #${labelOf(order)}: refund of ${inr(entry.amount)} ${entry.status} (${entry.error || 'needs review'}).`,
        path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'error', zoneId: order.zoneId, orderMongoId: order._id,
    });
    await notifyAdminsSafely({
        title: 'Partial-fulfilment refund needs attention',
        body: `Order #${labelOf(order)}: refund of ${inr(entry.amount)} is ${entry.status}. ${entry.error || ''}`.trim(),
        data: { type: 'fulfilment_refund_failed', ring: 'true' },
    }).catch(() => {});
}

async function settleRefund(order, amount, key, reason) {
    const method = String(order.payment?.method || '').toLowerCase();
    const existing = (order.fulfilment.refunds || []).find((r) => r.key === key);
    if (existing && ['processed', 'pending'].includes(existing.status)) return existing; // never refund the same change twice
    const entry = { key, amount: r2(amount), method, reason, at: new Date(), status: 'pending', refundId: '' };
    try {
        if (method === 'wallet') {
            await userWalletService.refundWalletBalance(
                order.userId, amount, `Refund for order #${labelOf(order)} (${reason})`,
                { fulfilmentOrderId: String(order._id), fulfilmentKey: key },
            );
            return { ...entry, status: 'processed', processedAt: new Date() };
        }
        const paymentId = order.payment?.razorpay?.paymentId;
        if (!paymentId) return { ...entry, status: 'failed', error: 'Razorpay payment id missing' };
        const res = await initiateRazorpayRefund(paymentId, amount);
        if (!res?.success) return { ...entry, status: 'failed', error: res?.error || 'Razorpay refund failed' };
        return { ...entry, status: 'processed', refundId: res.refundId, processedAt: new Date() };
    } catch (e) {
        return { ...entry, status: 'failed', error: e?.message || 'Refund failed' };
    }
}

async function applyProposal(orderId, proposal, ctx) {
    const order = await FoodOrder.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.orderStatus !== 'created' || order.fulfilment?.state !== 'applying') {
        throw new ValidationError('This order can no longer be changed.');
    }
    const s = proposal.settlement;
    const now = new Date();
    const version = (order.fulfilment.version || 0) + 1;
    const beforeBill = billOf(order.pricing);
    const beforeItems = (plain(order.items) || []).map((i) => ({ ...i }));

    const refundKey = `refund:v${version}`;
    const reserved = await reserveStock(proposal.stockNeeds);
    try {

    // 1. Items + bill + earnings snapshot.
    order.items = proposal.newItems;
    const c = proposal.calc;
    order.set('pricing.subtotal', c.pricing.subtotal);
    order.set('pricing.tax', c.pricing.tax);
    order.set('pricing.gstBreakdown', c.pricing.gstBreakdown);
    order.set('pricing.additionalCharges', c.pricing.additionalCharges);
    order.set('pricing.additionalChargesTotal', c.pricing.additionalChargesTotal);
    order.set('pricing.restaurantCommission', c.pricing.restaurantCommission);
    order.set('pricing.discount', c.pricing.discount);
    order.set('pricing.total', c.pricing.total);
    order.set('pricing.deliveryPartnerIncentiveEligible', c.pricing.deliveryPartnerIncentiveEligible);
    order.set('pricing.deliveryPartnerIncentiveAmount', c.pricing.deliveryPartnerIncentiveAmount);
    order.markModified('pricing.gstBreakdown');
    order.riderIncentivePay = c.rider.riderIncentivePay;
    order.riderTotalPayout = c.rider.riderTotalPayout;
    order.riderEarning = c.rider.riderEarning;
    order.platformProfit = c.platformProfit;
    order.set('payment.amountDue', c.pricing.total);

    // 2. Audit trail.
    const f = order.fulfilment;
    f.version = version;
    f.state = 'resolved';
    f.pending = null;
    f.decision = { action: ctx.by === 'system' ? 'auto_remove' : proposal.action, at: now, by: ctx.by };
    f.deadlineAt = null;
    const mod = {
        version, at: now, by: ctx.by, action: proposal.action,
        lines: proposal.summary, replacements: proposal.replacements,
        itemsBefore: beforeItems, itemsAfter: proposal.newItems.map((i) => ({ ...i })),
        billBefore: beforeBill, billAfter: c.bill, previousTotal: s.oldTotal, newTotal: s.newTotal, delta: s.delta,
        settlement: { type: s.type, method: s.method, refundAmount: s.refundAmount, extraAmount: s.extraAmount },
    };
    f.modifications = [...(f.modifications || []), mod];
    if (ctx.paymentEntry) f.additionalPayments = [...(f.additionalPayments || []), { ...ctx.paymentEntry, status: 'paid', version }];
    if (ctx.walletCharged) f.additionalPayments = [...(f.additionalPayments || []), { key: `pay:v${version}`, amount: s.extraAmount, method: 'wallet', status: 'paid', at: now, version }];

    // Refund entry is persisted as pending BEFORE the gateway call, so a crash can never lead to a second refund.
    if (s.type === 'refund') f.refunds = [...(f.refunds || []), { key: refundKey, amount: s.refundAmount, method: s.method, reason: 'Order modified', at: now, status: 'pending', refundId: '' }];
    f.history = [...(f.history || []), {
        at: now, byRole: ctx.actorRole, byId: ctx.actorId ? String(ctx.actorId) : undefined,
        action: ctx.by === 'system' ? 'auto_continue_without_items' : `customer_${proposal.action}`,
        note: `${proposal.summary.map((x) => (x.action === 'replace' ? `${x.name} → ${x.replacement.name}` : `${x.name} removed`)).join('; ')}. Bill ${inr(s.oldTotal)} → ${inr(s.newTotal)}`,
        data: { delta: s.delta, settlement: s.type },
    }];
    await order.save();
    } catch (e) {
        for (const n of reserved) await FoodItem.updateOne({ _id: n.itemId }, { $inc: { stockQuantity: n.quantity } }).catch(() => {});
        throw e;
    }

    // 3. Money: refund the difference (prepaid) — COD simply pays the new total.
    let refundEntry = null;
    if (s.type === 'refund') {
        const settled = await settleRefund({ ...plain(order), _id: order._id, userId: order.userId, payment: plain(order.payment), fulfilment: { refunds: [] } }, s.refundAmount, refundKey, 'Order modified');
        refundEntry = settled;
        await FoodOrder.updateOne(
            { _id: order._id, 'fulfilment.refunds.key': refundKey },
            { $set: { 'fulfilment.refunds.$': { ...settled, key: refundKey } } },
        );
        if (settled.status !== 'processed') await alertRefundIssue(order, settled);
    }

    // 4. Transaction ledger (store share / commission / rider / platform revenue).
    const fresh = await FoodOrder.findById(order._id);
    try {
        await foodTransactionService.syncTransactionAfterOrderModification(fresh, {
            note: `Order modified: ${proposal.summary.map((x) => (x.action === 'replace' ? `${x.name}→${x.replacement.name}` : `${x.name} removed`)).join(', ')}`,
            recordedByRole: ctx.actorRole === 'USER' ? 'USER' : 'SYSTEM',
            recordedById: ctx.actorId ? new mongoose.Types.ObjectId(String(ctx.actorId)) : undefined,
            extraHistory: [
                ...(s.type === 'refund' ? [{ kind: 'partial_refund', amount: s.refundAmount, note: `Partial refund ${refundEntry?.status || ''}` }] : []),
                ...(ctx.paymentEntry || ctx.walletCharged ? [{ kind: 'additional_payment', amount: s.extraAmount, note: 'Additional amount paid for replacement' }] : []),
            ],
        });
    } catch (e) {
        logger.error(`[Fulfilment] transaction sync failed for ${order._id}: ${e?.message || e}`);
        adminBell({ title: 'Payment adjustment issue', message: `Order #${labelOf(order)}: could not update the finance record after modification.`, path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'error', zoneId: order.zoneId, orderMongoId: order._id });
    }

    await notifyAfterApply(fresh, proposal, s, refundEntry);
    return {
        order: normalizeOrderForClient(fresh), requiresPayment: false, settlement: s, refund: refundEntry,
        proposal: publicProposal(proposal),
    };
}

async function notifyAfterApply(order, proposal, s, refundEntry) {
    const label = labelOf(order);
    const removed = proposal.summary.filter((x) => x.action === 'remove').map((x) => x.name);
    const replaced = proposal.summary.filter((x) => x.action === 'replace');
    const parts = [];
    if (replaced.length) parts.push(`Replaced: ${replaced.map((x) => `${x.name} → ${x.replacement.name}`).join(', ')}`);
    if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);

    // Customer: updated bill (+ refund / extra payment info).
    const money = s.type === 'refund'
        ? ` ${inr(s.refundAmount)} ${refundEntry?.status === 'processed' ? 'is being refunded to your payment method' : 'will be refunded shortly'}.`
        : s.type === 'charge' ? ` Additional ${inr(s.extraAmount)} paid.`
            : s.type === 'cod_update' ? ` You will pay ${inr(s.newTotal)} on delivery.` : '';
    await pushTo('USER', order.userId, {
        title: 'Updated bill ✅', body: `Order #${label}: new total ${inr(s.newTotal)}.${money}`, type: 'order_bill_updated', link: userLink(order),
    }, order);
    if (s.type === 'refund') {
        await pushTo('USER', order.userId, {
            title: refundEntry?.status === 'processed' ? 'Refund initiated' : 'Refund pending',
            body: `${inr(s.refundAmount)} for order #${label} ${refundEntry?.status === 'processed' ? 'has been initiated. It reaches you in 5-7 working days.' : 'is being processed.'}`,
            type: 'order_partial_refund', link: userLink(order),
        }, order);
    }
    // Store: decision received, details of what changed, ask to confirm the final order.
    await pushTo('RESTAURANT', order.restaurantId, {
        title: 'Customer decision received',
        body: `Order #${label}: ${parts.join('. ')}. New total ${inr(s.newTotal)}. Please confirm the final order.`,
        type: 'order_modified', link: '/food/restaurant/orders',
    }, order);
    emitFulfilment(order, { event: 'decision_applied', title: 'Customer decision received', message: parts.join('. ') });
    // Re-present the (now final) order in the store's existing new-order popup so they can confirm it.
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(order.restaurantId)).emit('new_order', {
                ...order.toObject(),
                restaurantId: String(order.restaurantId),
                orderMongoId: String(order._id),
                orderId: labelOf(order),
                fulfilmentResolved: true,
            });
        }
    } catch (e) {
        logger.warn(`[Fulfilment] store popup emit failed: ${e?.message || e}`);
    }
    adminBell({
        title: 'Order modified', message: `Order #${label}: ${parts.join('. ')} (${inr(s.oldTotal)} → ${inr(s.newTotal)}).`,
        path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'info', zoneId: order.zoneId, orderMongoId: order._id,
    });
}

/* ------------------------------------------------------------------ */
/* Customer default preference                                         */
/* ------------------------------------------------------------------ */
export async function getUserPreference(userId) {
    const u = await FoodUser.findById(userId).select('unavailableItemPreference').lean();
    return { unavailableItemPreference: u?.unavailableItemPreference || 'ask' };
}

export async function setUserPreference(userId, value) {
    if (!['ask', 'remove'].includes(String(value))) throw new ValidationError('Unknown preference');
    await FoodUser.updateOne({ _id: userId }, { $set: { unavailableItemPreference: String(value) } });
    return getUserPreference(userId);
}

export async function getPublicConfig() {
    const s = await getSettings();
    return { enabled: s.enabled, replacementEnabled: s.replacementEnabled, responseWindowSec: s.responseWindowSec };
}

/* ------------------------------------------------------------------ */
/* Timeout sweep (server clock). NEVER cancels an order.               */
/* ------------------------------------------------------------------ */
export async function runFulfilmentSweep() {
    const now = new Date();
    const due = await FoodOrder.find({
        orderStatus: 'created',
        'fulfilment.state': { $in: ['awaiting_customer', 'awaiting_payment'] },
        'fulfilment.deadlineAt': { $lte: now },
        'fulfilment.timeoutNotifiedAt': null,
    }).limit(50);

    for (const candidate of due) {
        try {
            // Claim the timeout so a second server instance cannot handle it too.
            const claimed = await FoodOrder.findOneAndUpdate(
                { _id: candidate._id, 'fulfilment.timeoutNotifiedAt': null, 'fulfilment.state': { $in: ['awaiting_customer', 'awaiting_payment'] } },
                { $set: { 'fulfilment.timeoutNotifiedAt': now }, $push: { 'fulfilment.history': { at: now, byRole: 'SYSTEM', action: 'customer_response_timeout', note: 'Customer did not respond in time' } } },
                { new: true },
            );
            if (!claimed) continue;
            await handleTimeout(claimed);
        } catch (e) {
            logger.error(`[Fulfilment] timeout handling failed for ${candidate._id}: ${e?.message || e}`);
        }
    }
}

async function handleTimeout(order) {
    const settings = await getSettings();
    const label = labelOf(order);
    const user = await FoodUser.findById(order.userId).select('unavailableItemPreference').lean();
    const wantsRemove = user?.unavailableItemPreference === 'remove' || settings.defaultPreference === 'remove';

    if (wantsRemove && order.fulfilment.state === 'awaiting_customer') {
        const locked = await FoodOrder.findOneAndUpdate(
            { _id: order._id, orderStatus: 'created', 'fulfilment.state': 'awaiting_customer' },
            { $set: { 'fulfilment.state': 'applying' } }, { new: true },
        );
        if (locked) {
            try {
                const decision = { lines: (locked.fulfilment.unavailableItems || []).map((u) => ({ lineKey: u.lineKey, action: 'remove' })) };
                const proposal = await buildProposal(locked, decision);
                // Never auto-charge: only continue automatically when the bill does not go up.
                if (proposal.settlement.delta <= 0) {
                    await applyProposal(locked._id, proposal, { actorRole: 'SYSTEM', by: 'system' });
                    return;
                }
            } catch (e) {
                logger.warn(`[Fulfilment] auto-continue skipped for ${order._id}: ${e?.message}`);
            }
            await releaseLock(order._id, 'awaiting_customer');
        }
    }

    await pushTo('USER', order.userId, {
        title: 'Your order is waiting for you', body: `Order #${label} needs your decision about unavailable items.`,
        type: 'order_decision_pending', link: userLink(order, '/unavailable-items'),
    }, order);
    await pushTo('RESTAURANT', order.restaurantId, {
        title: 'Customer has not responded', body: `Order #${label}: the customer has not decided about the unavailable items yet. Please follow up.`,
        type: 'order_customer_timeout', link: '/food/restaurant/orders',
    }, order);
    emitFulfilment(order, { event: 'timeout', title: 'Customer has not responded', message: 'Awaiting customer decision' });
    adminBell({
        title: 'Customer response timeout', message: `Order #${label}: customer did not respond about unavailable items. Manual follow-up needed.`,
        path: '/admin/food/partial-fulfilment', category: 'partial_fulfilment', type: 'warning', zoneId: order.zoneId, orderMongoId: order._id,
    });
    await notifyAdminsSafely({
        title: 'Customer response timeout', body: `Order #${label} is waiting for the customer's decision. Please follow up.`,
        data: { type: 'fulfilment_customer_timeout', ring: 'true' },
    }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */
/** Zone-limited sub-admins only see orders of their zones. Returns a Mongo filter fragment or null (no restriction). */
async function zoneScope(adminContext) {
    if (!adminContext || isSuperAdminLike(adminContext)) return null;
    const ids = normalizeObjectIdList(adminContext.food_zone_ids || adminContext.zone_ids || []).map((id) => new mongoose.Types.ObjectId(id));
    if (!ids.length) return { _id: { $in: [] } };
    const rs = await FoodRestaurant.find({ zoneId: { $in: ids } }).select('_id').lean();
    return { $or: [{ zoneId: { $in: ids } }, { restaurantId: { $in: rs.map((r) => r._id) } }] };
}
const withScope = (filter, scope) => (scope ? { $and: [filter, scope] } : filter);

export async function listForAdmin(query = {}, adminContext = null) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filter = { 'fulfilment.state': { $exists: true, $ne: 'none' } };
    if (query.state && query.state !== 'all') filter['fulfilment.state'] = String(query.state);
    if (query.timedOut === 'true') filter['fulfilment.timeoutNotifiedAt'] = { $ne: null };
    const search = String(query.search || '').trim();
    if (search) filter.order_id = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const scoped = withScope(filter, await zoneScope(adminContext));
    const [docs, total] = await Promise.all([
        FoodOrder.find(scoped)
            .populate('userId', 'name phone')
            .populate('restaurantId', 'restaurantName')
            .select('order_id orderStatus userId restaurantId pricing.total pricing.subtotal payment.method payment.status fulfilment.state fulfilment.version fulfilment.deadlineAt fulfilment.timeoutNotifiedAt fulfilment.unavailableItems fulfilment.refunds fulfilment.additionalPayments fulfilment.decision fulfilment.original.paymentTotal createdAt updatedAt')
            .sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        FoodOrder.countDocuments(scoped),
    ]);
    return {
        items: docs.map((d) => ({ ...d, stage: getFulfilmentStage(d) })),
        total, page, limit,
    };
}

export async function getForAdmin(orderId, adminContext = null) {
    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne(withScope(identity, await zoneScope(adminContext)))
        .populate('userId', 'name phone email')
        .populate('restaurantId', 'restaurantName')
        .lean();
    if (!order || !order.fulfilment) throw new NotFoundError('No partial-fulfilment record for this order');
    return { ...order, stage: getFulfilmentStage(order), currentBill: billOf(order.pricing) };
}

export async function summaryAdmin(adminContext = null) {
    const scope = await zoneScope(adminContext);
    const base = withScope({ 'fulfilment.state': { $exists: true, $ne: 'none' } }, scope);
    const [byState, money, timedOut] = await Promise.all([
        FoodOrder.aggregate([{ $match: base }, { $group: { _id: '$fulfilment.state', count: { $sum: 1 } } }]),
        FoodOrder.aggregate([
            { $match: base },
            { $project: { refunds: '$fulfilment.refunds', pays: '$fulfilment.additionalPayments' } },
            { $facet: {
                refunds: [{ $unwind: '$refunds' }, { $group: { _id: '$refunds.status', amount: { $sum: '$refunds.amount' }, count: { $sum: 1 } } }],
                payments: [{ $unwind: '$pays' }, { $group: { _id: '$pays.status', amount: { $sum: '$pays.amount' }, count: { $sum: 1 } } }],
            } },
        ]),
        FoodOrder.countDocuments(withScope({ orderStatus: 'created', 'fulfilment.state': { $in: ['awaiting_customer', 'awaiting_payment'] }, 'fulfilment.timeoutNotifiedAt': { $ne: null } }, scope)),
    ]);
    return {
        byState: Object.fromEntries(byState.map((r) => [r._id, r.count])),
        refunds: money[0]?.refunds || [],
        additionalPayments: money[0]?.payments || [],
        awaitingTimedOut: timedOut,
    };
}

export async function extendDeadline(orderId, adminId, minutes = 5, adminContext = null) {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins < 1 || mins > 24 * 60) throw new ValidationError('Minutes must be between 1 and 1440');
    const identity = buildOrderIdentityFilter(orderId);
    const now = new Date();
    const updated = await FoodOrder.findOneAndUpdate(
        withScope({ ...identity, orderStatus: 'created', 'fulfilment.state': { $in: ['awaiting_customer', 'awaiting_payment'] } }, await zoneScope(adminContext)),
        { $set: { 'fulfilment.deadlineAt': new Date(now.getTime() + mins * 60 * 1000), 'fulfilment.timeoutNotifiedAt': null },
            $push: { 'fulfilment.history': { at: now, byRole: 'ADMIN', byId: adminId ? String(adminId) : undefined, action: 'admin_extended_response_time', note: `Extended by ${mins} min` } } },
        { new: true },
    );
    if (!updated) throw new ValidationError('This order is not waiting for the customer');
    emitFulfilment(updated, { event: 'extended', title: 'More time to decide', message: `You have ${mins} more minutes.` });
    return normalizeOrderForClient(updated);
}

export async function retryRefund(orderId, adminId, key, adminContext = null) {
    const identity = buildOrderIdentityFilter(orderId);
    const order = await FoodOrder.findOne(withScope(identity, await zoneScope(adminContext)));
    if (!order?.fulfilment) throw new NotFoundError('Order not found');
    const entry = (order.fulfilment.refunds || []).find((r) => r.key === key);
    if (!entry) throw new NotFoundError('Refund not found');
    if (entry.status === 'processed') throw new ValidationError('This refund was already processed');
    // Claim the retry atomically so two admins cannot refund twice.
    const claim = await FoodOrder.updateOne(
        { _id: order._id, 'fulfilment.refunds': { $elemMatch: { key, status: { $in: ['failed', 'pending'] } } } },
        { $set: { 'fulfilment.refunds.$.status': 'retrying' } },
    );
    if (!claim.modifiedCount) throw new ValidationError('This refund is already being retried');
    let result;
    if (entry.paymentId) {
        const r = await initiateRazorpayRefund(entry.paymentId, entry.amount);
        result = r?.success ? { ...entry, status: 'processed', refundId: r.refundId, processedAt: new Date(), error: undefined } : { ...entry, status: 'failed', error: r?.error || 'Refund failed' };
    } else {
        result = await settleRefund({ ...plain(order), _id: order._id, userId: order.userId, payment: plain(order.payment), fulfilment: { refunds: [] } }, entry.amount, key, entry.reason || 'Order modified');
    }
    await FoodOrder.updateOne(
        { _id: order._id, 'fulfilment.refunds.key': key },
        { $set: { 'fulfilment.refunds.$': { ...result, key, retriedBy: adminId ? String(adminId) : undefined, retriedAt: new Date() } },
            $push: { 'fulfilment.history': { at: new Date(), byRole: 'ADMIN', byId: adminId ? String(adminId) : undefined, action: 'admin_retried_refund', note: `${key}: ${result.status}` } } },
    );
    if (result.status !== 'processed') await alertRefundIssue(order, result);
    else await pushTo('USER', order.userId, { title: 'Refund initiated', body: `${inr(result.amount)} for order #${labelOf(order)} has been initiated.`, type: 'order_partial_refund', link: userLink(order) }, order);
    return result;
}
