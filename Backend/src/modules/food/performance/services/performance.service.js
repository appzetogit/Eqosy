import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import {
    FoodPerformanceConfig,
    FoodPenaltyLedger,
    FoodStrike,
    FoodPrepExtension,
    FoodPenaltyAppeal,
    FoodPerformanceAudit
} from '../models/performance.models.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { notifyOwnersSafely, notifyAdminsSafely, haversineKm, buildOrderIdentityFilter } from '../../orders/services/order.helpers.js';
import { FoodCancellationCase } from '../../cancellation/models/cancellation.models.js';

const MIN = 60 * 1000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const REJECTION_TYPES = ['ORDER_REJECTION', 'ASSIGNMENT_REJECTION', 'POST_ACCEPT_CANCELLATION'];
const COUNTED_STATUSES = ['applied', 'pending', 'disputed'];

/** Calendar month (YYYY-MM) in the admin-configured timezone, so the monthly reset happens at local midnight. */
export function monthKey(date = new Date(), offsetMin = 330) {
    const d = new Date(date.getTime() + offsetMin * MIN);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthRange(month, offsetMin = 330) {
    const [y, m] = month.split('-').map(Number);
    return [new Date(Date.UTC(y, m - 1, 1) - offsetMin * MIN), new Date(Date.UTC(y, m, 1) - offsetMin * MIN)];
}

/* ------------------------------ Config ------------------------------ */
let cfgCache = { at: 0, doc: null };

export async function getConfig({ fresh = false } = {}) {
    if (!fresh && cfgCache.doc && Date.now() - cfgCache.at < 15 * 1000) return cfgCache.doc;
    let doc = await FoodPerformanceConfig.findOne({ key: 'default' }).lean();
    if (!doc) {
        try {
            doc = (await FoodPerformanceConfig.create({ key: 'default' })).toObject();
        } catch {
            doc = await FoodPerformanceConfig.findOne({ key: 'default' }).lean();
        }
    }
    cfgCache = { at: Date.now(), doc };
    return doc;
}

/** Safe subset the restaurant / delivery / customer apps need to render forms and explain rules. */
export async function getPublicConfig() {
    const c = await getConfig();
    return {
        enabled: c.enabled,
        defaultPrepMinutes: c.defaultPrepMinutes,
        maxPrepMinutes: c.maxPrepMinutes,
        preWarnMinutes: c.preWarnMinutes,
        orderTiers: c.orderTiers,
        restaurantDelaySlabs: c.restaurantDelaySlabs,
        deliveryDelaySlabs: c.deliveryDelaySlabs,
        restaurantRejectionSlabs: c.restaurantRejectionSlabs,
        deliveryRejectionSlabs: c.deliveryRejectionSlabs,
        strikeLadder: c.strikeLadder,
        validRejectionReasons: c.validRejectionReasons,
        externalDelayReasons: c.externalDelayReasons,
        maxExternalDelayMinutes: c.maxExternalDelayMinutes,
        extensionResponseWindowMin: c.extensionResponseWindowMin,
        timezoneOffsetMin: c.timezoneOffsetMin
    };
}

const CONFIG_FIELDS = [
    'enabled', 'defaultPrepMinutes', 'maxPrepMinutes', 'preWarnMinutes', 'timezoneOffsetMin', 'graceSeconds', 'delayRounding',
    'extensionCutoffMin', 'deliveryBaseMinutes', 'deliveryMinutesPerKm', 'deliveryBufferMinutes',
    'externalDelayReasons', 'maxExternalDelayMinutes', 'restaurantDelaySlabs', 'deliveryDelaySlabs',
    'restaurantRejectionSlabs', 'deliveryRejectionSlabs', 'strikeLadder', 'orderTiers', 'extensionResponseWindowMin',
    'validRejectionReasons', 'autoWaiveValidReasons', 'requireAdminApproval', 'autoEnforceSuspension'
];

export async function audit(actorId, action, targetType, targetId, before, after, note = '') {
    try {
        await FoodPerformanceAudit.create({ actorId: actorId || null, action, targetType, targetId: String(targetId || ''), before, after, note });
    } catch (e) {
        logger.warn(`[Performance] audit failed: ${e?.message}`);
    }
}

function num(v, name, { min = 0, max = Infinity, int = false } = {}) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
        throw new ValidationError(`${name} must be ${int ? 'a whole number ' : 'a number '}between ${min} and ${max === Infinity ? '∞' : max}`);
    }
    return n;
}

function validateDelaySlabs(slabs, name) {
    if (!Array.isArray(slabs) || !slabs.length) throw new ValidationError(`${name} needs at least one slab`);
    const s = [...slabs].map((x) => ({ ...x, fromMin: num(x.fromMin, `${name}.fromMin`, { min: 1, int: true }), toMin: x.toMin == null || x.toMin === '' ? null : num(x.toMin, `${name}.toMin`, { min: 1, int: true }), amount: num(x.amount ?? 0, `${name}.amount`), strike: num(x.strike ?? 0, `${name}.strike`, { int: true }) }))
        .sort((a, b) => a.fromMin - b.fromMin);
    if (s[0].fromMin !== 1) throw new ValidationError(`${name}: first slab must start at 1 minute`);
    s.forEach((x, i) => {
        if (x.toMin != null && x.toMin < x.fromMin) throw new ValidationError(`${name}: slab ${i + 1} ends before it starts`);
        if (i < s.length - 1) {
            if (x.toMin == null) throw new ValidationError(`${name}: only the last slab can be open-ended`);
            if (s[i + 1].fromMin !== x.toMin + 1) throw new ValidationError(`${name}: slabs must be continuous (no gap or overlap after ${x.toMin} min)`);
        } else if (x.toMin != null) {
            throw new ValidationError(`${name}: the last slab must be open-ended so long delays are still covered`);
        }
        if (!['warning', 'penalty'].includes(x.action)) throw new ValidationError(`${name}: invalid action`);
    });
    return s;
}

function validateRejectionSlabs(slabs, name) {
    if (!Array.isArray(slabs) || !slabs.length) throw new ValidationError(`${name} needs at least one slab`);
    const s = [...slabs].map((x) => ({ ...x, occurrence: num(x.occurrence, `${name}.occurrence`, { min: 1, int: true }), amount: num(x.amount ?? 0, `${name}.amount`), strike: num(x.strike ?? 0, `${name}.strike`, { int: true }) }))
        .sort((a, b) => a.occurrence - b.occurrence);
    s.forEach((x, i) => {
        if (x.occurrence !== i + 1) throw new ValidationError(`${name}: occurrences must be 1, 2, 3 … without gaps or duplicates`);
        if (!['warning', 'penalty'].includes(x.action)) throw new ValidationError(`${name}: invalid action`);
    });
    return s;
}

function validateLadder(steps) {
    if (!Array.isArray(steps) || !steps.length) throw new ValidationError('strikeLadder needs at least one step');
    const s = [...steps].map((x) => ({ ...x, count: num(x.count, 'strike count', { min: 1, int: true }), suspendHours: num(x.suspendHours ?? 0, 'suspendHours') })).sort((a, b) => a.count - b.count);
    s.forEach((x, i) => {
        if (x.count !== i + 1) throw new ValidationError('strikeLadder: counts must be 1, 2, 3 … without gaps');
        if (!['warning', 'notice', 'suspend', 'review'].includes(x.action)) throw new ValidationError('strikeLadder: invalid action');
        if (x.action === 'suspend' && !(x.suspendHours > 0)) throw new ValidationError('strikeLadder: a suspension needs hours > 0');
    });
    return s;
}

function validateTiers(tiers) {
    if (!Array.isArray(tiers) || !tiers.length) throw new ValidationError('orderTiers needs at least one tier');
    const s = [...tiers].map((x) => ({ ...x, key: String(x.key || '').trim(), label: String(x.label || '').trim(), minItems: num(x.minItems, 'minItems', { min: 1, int: true }), maxItems: x.maxItems == null || x.maxItems === '' ? null : num(x.maxItems, 'maxItems', { min: 1, int: true }), extraMinutes: num(x.extraMinutes ?? 0, 'extraMinutes'), maxExtraMinutes: num(x.maxExtraMinutes ?? 0, 'maxExtraMinutes') }))
        .sort((a, b) => a.minItems - b.minItems);
    if (new Set(s.map((x) => x.key)).size !== s.length || s.some((x) => !x.key || !x.label)) throw new ValidationError('orderTiers: every tier needs a unique key and a label');
    if (s[0].minItems !== 1) throw new ValidationError('orderTiers: first tier must start at 1 item');
    s.forEach((x, i) => {
        if (i < s.length - 1) {
            if (x.maxItems == null || x.maxItems < x.minItems) throw new ValidationError(`orderTiers: "${x.label}" has an invalid item range`);
            if (s[i + 1].minItems !== x.maxItems + 1) throw new ValidationError(`orderTiers: ranges must be continuous (after ${x.maxItems} items)`);
        } else if (x.maxItems != null) {
            throw new ValidationError('orderTiers: the last tier must be open-ended');
        }
    });
    return s;
}

export async function updateConfig(body = {}, adminId = null) {
    const before = await getConfig({ fresh: true });
    const patch = {};
    for (const k of CONFIG_FIELDS) if (body[k] !== undefined) patch[k] = body[k];
    for (const k of ['defaultPrepMinutes', 'maxPrepMinutes', 'extensionResponseWindowMin']) {
        if (patch[k] !== undefined) patch[k] = num(patch[k], k, { min: 1 });
    }
    for (const k of ['preWarnMinutes', 'graceSeconds', 'extensionCutoffMin', 'deliveryBaseMinutes', 'deliveryMinutesPerKm', 'deliveryBufferMinutes', 'maxExternalDelayMinutes']) {
        if (patch[k] !== undefined) patch[k] = num(patch[k], k);
    }
    if (patch.timezoneOffsetMin !== undefined) patch.timezoneOffsetMin = num(patch.timezoneOffsetMin, 'timezoneOffsetMin', { min: -720, max: 840 });
    if (patch.delayRounding !== undefined && !['floor', 'ceil'].includes(patch.delayRounding)) throw new ValidationError('delayRounding must be floor or ceil');
    const maxPrep = patch.maxPrepMinutes ?? before.maxPrepMinutes;
    if ((patch.defaultPrepMinutes ?? before.defaultPrepMinutes) > maxPrep) throw new ValidationError('defaultPrepMinutes cannot exceed maxPrepMinutes');
    if (patch.restaurantDelaySlabs) patch.restaurantDelaySlabs = validateDelaySlabs(patch.restaurantDelaySlabs, 'restaurantDelaySlabs');
    if (patch.deliveryDelaySlabs) patch.deliveryDelaySlabs = validateDelaySlabs(patch.deliveryDelaySlabs, 'deliveryDelaySlabs');
    if (patch.restaurantRejectionSlabs) patch.restaurantRejectionSlabs = validateRejectionSlabs(patch.restaurantRejectionSlabs, 'restaurantRejectionSlabs');
    if (patch.deliveryRejectionSlabs) patch.deliveryRejectionSlabs = validateRejectionSlabs(patch.deliveryRejectionSlabs, 'deliveryRejectionSlabs');
    if (patch.strikeLadder) patch.strikeLadder = validateLadder(patch.strikeLadder);
    if (patch.orderTiers) patch.orderTiers = validateTiers(patch.orderTiers);
    for (const k of ['validRejectionReasons', 'externalDelayReasons']) {
        if (patch[k] !== undefined) {
            if (!Array.isArray(patch[k])) throw new ValidationError(`${k} must be a list`);
            patch[k] = [...new Set(patch[k].map((x) => String(x).trim()).filter(Boolean))];
        }
    }
    patch.updatedBy = adminId;
    const after = await FoodPerformanceConfig.findOneAndUpdate({ key: 'default' }, { $set: patch }, { new: true, upsert: true, runValidators: true }).lean();
    cfgCache = { at: Date.now(), doc: after };
    await audit(adminId, 'CONFIG_UPDATE', 'config', 'default', before, after);
    return after;
}

/* ------------------------------ Calculation helpers ------------------------------ */
/** Total quantity across order lines, mapped to the admin-defined tier. */
export function classifyOrder(items = [], cfg) {
    const count = (items || []).reduce((s, i) => s + (Math.max(1, Math.floor(Number(i?.quantity) || 1))), 0);
    const tiers = [...(cfg.orderTiers || [])].sort((a, b) => a.minItems - b.minItems);
    const tier = tiers.find((t) => count >= t.minItems && (t.maxItems == null || count <= t.maxItems)) || tiers[tiers.length - 1] || null;
    return { itemCount: count, tier };
}

/**
 * Whole minutes late. Grace seconds are forgiven first, then partial minutes are floored or ceiled per admin setting.
 * `expectedAt` and `actualAt` are server timestamps.
 */
export function computeDelayMinutes(expectedAt, actualAt, cfg) {
    if (!expectedAt || !actualAt) return 0;
    const lateSec = (new Date(actualAt).getTime() - new Date(expectedAt).getTime()) / 1000 - (cfg.graceSeconds || 0);
    if (lateSec <= 0) return 0;
    const mins = lateSec / 60;
    return cfg.delayRounding === 'ceil' ? Math.ceil(mins) : Math.floor(mins);
}

function pickSlab(slabs = [], delayMin) {
    return [...slabs].sort((a, b) => a.fromMin - b.fromMin)
        .find((s) => delayMin >= s.fromMin && (s.toMin == null || delayMin <= s.toMin));
}
function pickRejectionSlab(slabs = [], occurrence) {
    const sorted = [...slabs].sort((a, b) => a.occurrence - b.occurrence);
    return sorted.find((s) => s.occurrence === occurrence) || sorted[sorted.length - 1];
}

async function notify(party, partyId, title, body, type, extra = {}) {
    try {
        // Restaurant and delivery-partner penalty / delay alerts ring like a new order.
        const ring = party === 'RESTAURANT' || party === 'DELIVERY_PARTNER' || extra.ring === true;
        const data = { type, ...extra };
        delete data.ring;
        if (ring) data.ring = 'true';
        await notifyOwnersSafely([{ ownerType: party, ownerId: partyId }], { title, body, data });
        const io = getIO();
        if (io) {
            const room = party === 'RESTAURANT' ? rooms.restaurant(partyId) : party === 'USER' ? rooms.user(partyId) : rooms.delivery(partyId);
            io.to(room).emit('performance_update', { type, title, message: body, ...extra, ring });
        }
    } catch (e) {
        logger.warn(`[Performance] notify failed: ${e?.message}`);
    }
}
async function notifyAdmins(title, body, type, extra = {}) {
    try {
        await notifyAdminsSafely({ title, body, data: { type, ring: 'true', ...extra } });
    } catch (e) {
        logger.warn(`[Performance] admin notify failed: ${e?.message}`);
    }
}

/* ------------------------------ Suspension ------------------------------ */
export async function isSuspended(partyType, partyId) {
    const s = await FoodStrike.findOne({ partyType, partyId: oid(partyId), revoked: false, suspendedUntil: { $gt: new Date() } }).sort({ suspendedUntil: -1 }).lean();
    return s ? { suspended: true, until: s.suspendedUntil } : { suspended: false, until: null };
}

/** Throws only when admin turned enforcement on. Used at the two entry points (accept order / accept delivery). */
export async function assertNotSuspended(partyType, partyId) {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.autoEnforceSuspension) return;
    const st = await isSuspended(partyType, partyId);
    if (st.suspended) {
        throw new ForbiddenError(`Your account is suspended until ${st.until.toISOString()} due to repeated violations.`);
    }
}

/* ------------------------------ Core violation engine ------------------------------ */
/**
 * Records a violation exactly once (unique dedupeKey) and walks warning -> penalty -> strike -> suspension.
 * Strikes are created only once a penalty is confirmed (status "applied"). Never touches wallet / refund / payment code.
 */
export async function recordViolation({
    partyType, partyId, orderId, violationType, delayMinutes = 0, reason = '', reasonCode = '',
    originalEta = null, approvedEta = null, actualAt = new Date(), holdForReview = false
}) {
    const cfg = await getConfig();
    if (!cfg.enabled) return null;

    const dedupeKey = `${violationType}:${orderId}:${partyId}`;
    const existing = await FoodPenaltyLedger.findOne({ dedupeKey }).lean();
    if (existing) return existing;

    const month = monthKey(new Date(), cfg.timezoneOffsetMin);
    const isRejection = REJECTION_TYPES.includes(violationType);
    let stage = 'warning';
    let amount = 0;
    let strikeCount = 0;
    let occurrence = 0;
    let adminReview = false;
    let reviewHold = !!holdForReview;
    let statusReason = holdForReview ? 'Held for admin review (open adjustment request)' : '';

    const claimedValid = isRejection && !!reasonCode && (cfg.validRejectionReasons || []).includes(reasonCode);

    if (claimedValid && cfg.autoWaiveValidReasons) {
        stage = 'waived_auto';
        statusReason = 'Valid reason provided (auto-waived)';
    } else {
        if (claimedValid) {
            reviewHold = true;
            statusReason = 'Valid reason claimed; awaiting admin review';
        }
        if (isRejection) {
            // Occurrence counts confirmed + open items of the same type this month; items held for review don't count yet.
            occurrence = (await FoodPenaltyLedger.countDocuments({
                partyType, partyId: oid(partyId), month, violationType,
                stage: { $ne: 'waived_auto' }, status: { $nin: ['waived', 'reversed'] }, reviewHold: { $ne: true }
            })) + 1;
            const slab = pickRejectionSlab(partyType === 'RESTAURANT' ? cfg.restaurantRejectionSlabs : cfg.deliveryRejectionSlabs, occurrence);
            if (slab) {
                stage = slab.action === 'penalty' ? 'penalty' : 'warning';
                amount = stage === 'penalty' ? slab.amount : 0;
                strikeCount = slab.strike || 0;
                adminReview = !!slab.adminReview;
            }
        } else {
            const slab = pickSlab(partyType === 'RESTAURANT' ? cfg.restaurantDelaySlabs : cfg.deliveryDelaySlabs, delayMinutes);
            if (!slab) return null; // below the first slab: not a violation
            stage = slab.action === 'penalty' ? 'penalty' : 'warning';
            amount = stage === 'penalty' ? slab.amount : 0;
            strikeCount = slab.strike || 0;
        }
    }

    let status;
    if (stage === 'warning') status = 'warning';
    else if (stage === 'waived_auto') status = 'waived';
    else status = (cfg.requireAdminApproval || reviewHold) ? 'pending' : 'applied';
    if (stage === 'warning') reviewHold = false;

    let row;
    try {
        row = await FoodPenaltyLedger.create({
            orderId: oid(orderId), partyType, partyId: oid(partyId), violationType, reason, reasonCode,
            originalEta, approvedEta, actualAt, delayMinutes, occurrenceInMonth: occurrence,
            stage, amount, strikeCount, status, month, dedupeKey, statusReason, reviewHold, adminReview
        });
    } catch (e) {
        if (e?.code === 11000) return FoodPenaltyLedger.findOne({ dedupeKey }).lean();
        throw e;
    }

    const label = violationType.replace(/_/g, ' ').toLowerCase();
    const ids = { ledgerId: String(row._id), orderId: String(row.orderId) };
    if (stage === 'warning') {
        await notify(partyType, partyId, 'Performance warning', `Warning for ${label} on order ${row.orderId}${delayMinutes ? ` (${delayMinutes} min late)` : ''}.`, 'performance_warning', ids);
    } else if (stage === 'waived_auto') {
        await notify(partyType, partyId, 'No penalty applied', `Your ${label} on order ${row.orderId} was accepted as valid.`, 'performance_waived', ids);
    } else if (status === 'pending') {
        await notify(partyType, partyId, 'Penalty under review', `A Rs ${amount} penalty for ${label} is awaiting admin review.`, 'performance_penalty_pending', ids);
        await notifyAdmins('Penalty needs review', `${partyType} ${label} on order ${row.orderId}.`, 'performance_review_needed', ids);
    } else {
        await notify(partyType, partyId, 'Penalty applied', `Rs ${amount} penalty for ${label}${delayMinutes ? ` (${delayMinutes} min late)` : ''}. You can appeal it from the performance page.`, 'performance_penalty', ids);
    }
    if (status === 'applied' && stage === 'penalty' && strikeCount > 0) await addStrike(row, cfg);
    if (adminReview) {
        await audit(null, 'ADMIN_REVIEW_FLAG', 'ledger', row._id, null, { partyType, partyId, occurrence }, 'Repeated rejections');
        await notifyAdmins('Repeated rejections', `${partyType} ${partyId} reached ${occurrence} rejections this month. Admin review required.`, 'performance_admin_review', ids);
    }
    return row.toObject();
}

async function addStrike(ledger, cfg) {
    const count = (await FoodStrike.countDocuments({ partyType: ledger.partyType, partyId: ledger.partyId, month: ledger.month, revoked: false })) + 1;
    const ladder = [...(cfg.strikeLadder || [])].sort((a, b) => a.count - b.count);
    const step = ladder.find((s) => s.count === count) || ladder[ladder.length - 1] || { action: 'warning' };
    const suspendedUntil = step.action === 'suspend' && step.suspendHours > 0 ? new Date(Date.now() + step.suspendHours * 60 * MIN) : null;
    try {
        await FoodStrike.create({
            partyType: ledger.partyType, partyId: ledger.partyId, ledgerId: ledger._id, orderId: ledger.orderId,
            month: ledger.month, monthlyCount: count, action: step.action, suspendedUntil
        });
    } catch (e) {
        if (e?.code !== 11000) throw e;
        return;
    }
    const msg = {
        warning: `Strike ${count} added. This is a warning.`,
        notice: `Strike ${count} added. A performance notice has been issued.`,
        suspend: `Strike ${count} added. Your account is suspended for ${step.suspendHours} hours.`,
        review: `Strike ${count} added. Your account is under admin review.`
    }[step.action];
    const type = step.action === 'suspend' ? 'performance_suspension' : 'performance_strike';
    await notify(ledger.partyType, ledger.partyId, step.action === 'suspend' ? 'Account suspended' : 'Strike added', msg, type, { ledgerId: String(ledger._id) });
    if (step.action === 'suspend' || step.action === 'review') {
        await notifyAdmins(step.action === 'suspend' ? 'Account suspended' : 'Account needs review', `${ledger.partyType} ${ledger.partyId}: strike ${count} this month.`, 'performance_admin_review', { ledgerId: String(ledger._id) });
    }
}

/**
 * "What happens if I do this now?" Shown BEFORE a restaurant rejects / cancels or a rider passes / cancels,
 * so nobody is surprised by a penalty. Uses exactly the same rules as recordViolation.
 */
export async function previewViolation({ partyType, partyId, violationType, reasonCode = '' }) {
    const cfg = await getConfig();
    if (!cfg.enabled) return { applies: false };
    if (!REJECTION_TYPES.includes(violationType)) throw new ValidationError('Unknown violation type');
    const month = monthKey(new Date(), cfg.timezoneOffsetMin);
    const claimedValid = Boolean(reasonCode) && (cfg.validRejectionReasons || []).includes(reasonCode);
    const base = { partyType, partyId: oid(partyId), month, violationType, stage: { $ne: 'waived_auto' }, status: { $nin: ['waived', 'reversed'] }, reviewHold: { $ne: true } };
    const occurrence = (await FoodPenaltyLedger.countDocuments(base)) + 1;
    const slabs = partyType === 'RESTAURANT' ? cfg.restaurantRejectionSlabs : cfg.deliveryRejectionSlabs;
    const slab = pickRejectionSlab(slabs, occurrence);
    const next = pickRejectionSlab(slabs, occurrence + 1);
    const label = violationType === 'ORDER_REJECTION' ? 'rejection' : violationType === 'ASSIGNMENT_REJECTION' ? 'rejection' : 'cancellation after accepting';
    const money = (s) => (s.action === 'penalty' ? `Rs ${s.amount}${s.strike ? ` + ${s.strike} strike` : ''}` : 'a warning (no charge)');
    const strikesNow = await FoodStrike.countDocuments({ partyType, partyId: oid(partyId), month, revoked: false });
    let strikeNote = '';
    if (slab?.action === 'penalty' && slab.strike > 0) {
        const ladder = [...(cfg.strikeLadder || [])].sort((a, b) => a.count - b.count);
        const step = ladder.find((x) => x.count === strikesNow + 1) || ladder[ladder.length - 1];
        if (step) strikeNote = step.action === 'suspend' ? ` This will be strike ${strikesNow + 1}: your account will be suspended for ${step.suspendHours} hours.` : step.action === 'review' ? ` This will be strike ${strikesNow + 1}: your account goes for admin review.` : ` This will be strike ${strikesNow + 1}.`;
    }
    let message;
    if (claimedValid && cfg.autoWaiveValidReasons) message = 'This reason is accepted as valid. No penalty will apply.';
    else if (claimedValid) message = `This reason will be checked by admin. If it is not accepted, this ${label} (#${occurrence} this month) will be ${money(slab)}.${strikeNote}`;
    else message = `This is ${label} #${occurrence} this month: ${money(slab)}.${strikeNote}${next && occurrence >= 1 ? ` The next one will be ${money(next)}.` : ''} Choose a valid reason if one applies.`;
    return {
        applies: true, occurrence, action: claimedValid && cfg.autoWaiveValidReasons ? 'waived' : slab?.action || 'warning',
        amount: claimedValid && cfg.autoWaiveValidReasons ? 0 : slab?.action === 'penalty' ? slab.amount : 0, strike: slab?.strike || 0,
        underReview: claimedValid && !cfg.autoWaiveValidReasons, adminReview: Boolean(slab?.adminReview), message,
        severity: claimedValid && cfg.autoWaiveValidReasons ? 'info' : slab?.action === 'penalty' ? 'penalty' : 'warning',
    };
}

/* ------------------------------ Restaurant hooks ------------------------------ */
/**
 * Called when the restaurant accepts. The approved prep time is what the restaurant entered on accept
 * (clamped to the admin ceiling) or the admin default. All times are server clock.
 */
export async function onRestaurantAccept(order, { prepMinutes } = {}) {
    try {
        if (order.prep?.approvedEta) return;
        const cfg = await getConfig();
        if (!cfg.enabled) return;
        const now = new Date();
        const { itemCount, tier } = classifyOrder(order.items, cfg);
        let mins = Number(prepMinutes);
        if (!(mins >= 1)) mins = cfg.defaultPrepMinutes;
        mins = Math.min(Math.round(mins), cfg.maxPrepMinutes);
        const eta = new Date(now.getTime() + mins * MIN);
        const prep = { acceptedAt: now, originalEta: eta, approvedEta: eta, tierKey: tier?.key || '', itemCount, extended: false, penaltyEvaluated: false, prepMinutes: mins, delayNotified: false };
        order.prep = prep;
        await FoodOrder.updateOne({ _id: order._id }, { $set: { prep } });
        try {
            const io = getIO();
            const payload = { orderId: String(order._id), approvedEta: eta, originalEta: eta, prepMinutes: mins };
            if (io) {
                io.to(rooms.user(order.userId)).emit('prep_eta_updated', payload);
                if (order.dispatch?.deliveryPartnerId) io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit('prep_eta_updated', payload);
            }
        } catch { /* socket optional */ }
    } catch (e) {
        logger.warn(`[Performance] onRestaurantAccept failed: ${e?.message}`);
    }
}

export async function onRestaurantReject(order, restaurantId, reason = '', reasonCode = '') {
    try {
        if (!String(reason).trim() && !reasonCode) return null;
        return await recordViolation({
            partyType: 'RESTAURANT', partyId: restaurantId, orderId: order._id, violationType: 'ORDER_REJECTION', reason, reasonCode
        });
    } catch (e) {
        logger.warn(`[Performance] onRestaurantReject failed: ${e?.message}`);
        return null;
    }
}

/** Restaurant cancelled after accepting: separate violation type from a pre-accept rejection. */
export async function onRestaurantCancelAfterAccept(order, restaurantId, reason = '', reasonCode = '') {
    try {
        return await recordViolation({
            partyType: 'RESTAURANT', partyId: restaurantId, orderId: order._id, violationType: 'POST_ACCEPT_CANCELLATION',
            reason: reason || 'Cancelled after acceptance', reasonCode
        });
    } catch (e) {
        logger.warn(`[Performance] onRestaurantCancelAfterAccept failed: ${e?.message}`);
        return null;
    }
}

async function evaluatePrep(order, readyAt) {
    const cfg = await getConfig();
    const approved = order.prep?.approvedEta;
    if (!cfg.enabled || !approved) return;
    // Atomic claim so two triggers (ready hook + sweep) can never double-evaluate.
    const claim = await FoodOrder.updateOne({ _id: order._id, 'prep.penaltyEvaluated': { $ne: true } }, { $set: { 'prep.penaltyEvaluated': true } });
    if (!claim.modifiedCount) return;
    const delayMinutes = computeDelayMinutes(approved, readyAt, cfg);
    if (delayMinutes <= 0) return;
    await recordViolation({
        partyType: 'RESTAURANT', partyId: order.restaurantId, orderId: order._id, violationType: 'PREP_DELAY',
        delayMinutes, originalEta: order.prep.originalEta, approvedEta: approved, actualAt: readyAt,
        reason: order.prep.extended ? 'Food not ready by the customer-approved extended ETA' : 'Food not ready by approved ETA'
    });
}

export async function onFoodReady(order) {
    try {
        await evaluatePrep(order, order.deliveryState?.foodReadyAt || new Date());
    } catch (e) {
        logger.warn(`[Performance] onFoodReady failed: ${e?.message}`);
    }
}

/* ------------------------------ Prep extension ------------------------------ */
export async function requestExtension(orderId, restaurantId, { extraMinutes, reason }) {
    const cfg = await getConfig();
    const order = await FoodOrder.findOne({ _id: oid(orderId), restaurantId: oid(restaurantId) });
    if (!order) throw new NotFoundError('Order not found');
    if (!order.prep?.approvedEta) throw new ValidationError('Accept the order before requesting more time');
    if (order.prep.penaltyEvaluated || ['ready_for_pickup', 'ready', 'reached_pickup', 'picked_up', 'reached_drop', 'delivered'].includes(order.orderStatus) || String(order.orderStatus).includes('cancel')) {
        throw new ValidationError('Extra time can no longer be requested for this order');
    }
    const deadline = new Date(order.prep.approvedEta).getTime() + (cfg.extensionCutoffMin || 0) * MIN;
    if (Date.now() > deadline) throw new ValidationError('The preparation deadline has already passed; extra time can no longer be requested');
    if (!String(reason || '').trim()) throw new ValidationError('A reason is required');
    const pending = await FoodPrepExtension.findOne({ orderId: order._id, status: { $in: ['pending_customer', 'pending_admin'] } });
    if (pending) throw new ValidationError('An extension request is already pending');

    const { itemCount, tier } = classifyOrder(order.items, cfg);
    if (!tier || !(tier.maxExtraMinutes > 0)) throw new ValidationError(`Extra time is not available for this order size (${itemCount} items)`);
    const extra = Number(extraMinutes);
    if (!(extra >= 1 && extra <= tier.maxExtraMinutes)) throw new ValidationError(`Extra time must be between 1 and ${tier.maxExtraMinutes} minutes for a ${tier.label}`);

    const status = tier.needsAdminApproval ? 'pending_admin' : (tier.needsCustomerApproval ? 'pending_customer' : 'approved');
    const requestedEta = new Date(new Date(order.prep.approvedEta).getTime() + Math.round(extra) * MIN);
    const ext = await FoodPrepExtension.create({
        orderId: order._id, restaurantId: order.restaurantId, userId: order.userId, tierKey: tier.key, itemCount,
        originalEta: order.prep.approvedEta, requestedEta, extraMinutes: Math.round(extra), reason: String(reason).trim(), status,
        expiresAt: new Date(Date.now() + cfg.extensionResponseWindowMin * MIN)
    });
    if (status === 'approved') await applyExtension(ext, 'SYSTEM');
    else if (status === 'pending_customer') await notifyCustomerExtension(ext);
    else await notifyAdmins('Bulk order extension request', `Order ${ext.orderId} (${itemCount} items) needs +${ext.extraMinutes} min: ${ext.reason}`, 'prep_extension_admin', { extensionId: String(ext._id) });
    return ext.toObject();
}

async function notifyCustomerExtension(ext) {
    try {
        await notifyOwnersSafely([{ ownerType: 'USER', ownerId: ext.userId }], {
            title: 'Restaurant needs extra time',
            body: `Your order needs ${ext.extraMinutes} more minutes (new ready time ${new Date(ext.requestedEta).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}): ${ext.reason}. Please accept or reject.`,
            data: { type: 'prep_extension_request', ring: 'true', orderId: String(ext.orderId), extensionId: String(ext._id) }
        });
        const io = getIO();
        if (io) io.to(rooms.user(ext.userId)).emit('prep_extension_request', { orderId: String(ext.orderId), extensionId: String(ext._id), extraMinutes: ext.extraMinutes, requestedEta: ext.requestedEta, originalEta: ext.originalEta, reason: ext.reason, expiresAt: ext.expiresAt, ring: true });
    } catch (e) {
        logger.warn(`[Performance] extension notify failed: ${e?.message}`);
    }
}

async function applyExtension(ext, by) {
    // Do not let a late approval rewrite history once the restaurant's delay has already been judged.
    const current = await FoodOrder.findById(ext.orderId).select('prep orderStatus').lean();
    if (current?.prep?.penaltyEvaluated) {
        ext.status = 'expired';
        ext.respondedAt = new Date();
        ext.respondedBy = 'SYSTEM';
        await ext.save();
        throw new ValidationError('The order is already ready; the extension can no longer be applied');
    }
    ext.status = 'approved';
    ext.respondedAt = new Date();
    ext.respondedBy = by;
    await ext.save();
    // prep.originalEta stays untouched; approvedEta becomes the official deadline. Both are kept in order history.
    const order = await FoodOrder.findByIdAndUpdate(
        ext.orderId, { $set: { 'prep.approvedEta': ext.requestedEta, 'prep.extended': true, 'prep.delayNotified': false, 'prep.preWarned': false } }, { new: true }
    );
    const payload = { orderId: String(ext.orderId), approvedEta: ext.requestedEta, originalEta: order?.prep?.originalEta || ext.originalEta, extended: true };
    try {
        const io = getIO();
        if (io && order) {
            io.to(rooms.restaurant(ext.restaurantId)).emit('prep_eta_updated', payload);
            io.to(rooms.user(ext.userId)).emit('prep_eta_updated', payload);
            if (order.dispatch?.deliveryPartnerId) io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit('prep_eta_updated', payload);
        }
    } catch { /* socket optional */ }
    await notify('RESTAURANT', ext.restaurantId, 'Extra time approved', `Order ${ext.orderId} deadline extended by ${ext.extraMinutes} min. No delay penalty applies within the new time.`, 'prep_extension_approved', { orderId: String(ext.orderId) });
    await notify('USER', ext.userId, 'Preparation time extended', `Your order will now be ready ${ext.extraMinutes} minutes later than first estimated.`, 'prep_extension_applied', { orderId: String(ext.orderId) });
    if (order?.dispatch?.deliveryPartnerId) {
        await notify('DELIVERY_PARTNER', order.dispatch.deliveryPartnerId, 'Pickup time updated', `Order ${ext.orderId} will be ready ${ext.extraMinutes} min later. Your delivery timer starts only at pickup.`, 'prep_eta_updated', { orderId: String(ext.orderId) });
    }
}

export async function respondExtension(extensionId, userId, accept) {
    const ext = await FoodPrepExtension.findById(extensionId);
    if (!ext || String(ext.userId) !== String(userId)) throw new NotFoundError('Request not found');
    if (ext.status !== 'pending_customer') throw new ValidationError(`Request already ${ext.status}`);
    if (ext.expiresAt && ext.expiresAt < new Date()) {
        ext.status = 'expired';
        ext.respondedBy = 'SYSTEM';
        ext.respondedAt = new Date();
        await ext.save();
        throw new ValidationError('Request has expired');
    }
    if (accept) {
        await applyExtension(ext, 'USER');
    } else {
        ext.status = 'rejected';
        ext.respondedAt = new Date();
        ext.respondedBy = 'USER';
        await ext.save();
        await notify('RESTAURANT', ext.restaurantId, 'Extra time rejected', `Customer declined extra time for order ${ext.orderId}. The original deadline stays.`, 'prep_extension_rejected', { orderId: String(ext.orderId) });
    }
    return ext.toObject();
}

/** Admin: approve exceptional (special bulk) requests. `skipCustomer` lets admin make the final call. */
export async function adminDecideExtension(extensionId, adminId, approve, { skipCustomer = false } = {}) {
    const ext = await FoodPrepExtension.findById(extensionId);
    if (!ext) throw new NotFoundError('Request not found');
    if (ext.status !== 'pending_admin') throw new ValidationError(`Request already ${ext.status}`);
    const cfg = await getConfig();
    const tier = (cfg.orderTiers || []).find((t) => t.key === ext.tierKey);
    if (approve) {
        if (skipCustomer || (tier && tier.needsCustomerApproval === false)) {
            await applyExtension(ext, 'ADMIN');
        } else {
            ext.status = 'pending_customer';
            ext.expiresAt = new Date(Date.now() + cfg.extensionResponseWindowMin * MIN);
            await ext.save();
            await notifyCustomerExtension(ext);
        }
    } else {
        ext.status = 'rejected';
        ext.respondedAt = new Date();
        ext.respondedBy = 'ADMIN';
        await ext.save();
        await notify('RESTAURANT', ext.restaurantId, 'Extra time rejected', `Admin declined extra time for order ${ext.orderId}.`, 'prep_extension_rejected', { orderId: String(ext.orderId) });
    }
    await audit(adminId, approve ? 'EXTENSION_ADMIN_APPROVE' : 'EXTENSION_ADMIN_REJECT', 'extension', extensionId, null, { status: ext.status });
    return ext.toObject();
}

export async function listExtensions({ status, orderId, restaurantId, userId } = {}) {
    const q = {};
    if (status) q.status = status;
    if (orderId) q.orderId = oid(orderId);
    if (restaurantId) q.restaurantId = oid(restaurantId);
    if (userId) q.userId = oid(userId);
    return FoodPrepExtension.find(q).sort({ createdAt: -1 }).limit(200).lean();
}

export async function expireStaleExtensions() {
    const stale = await FoodPrepExtension.find({ status: 'pending_customer', expiresAt: { $lt: new Date() } }).limit(200);
    for (const ext of stale) {
        ext.status = 'expired';
        ext.respondedBy = 'SYSTEM';
        ext.respondedAt = new Date();
        await ext.save();
        await notify('RESTAURANT', ext.restaurantId, 'Extra time request expired', `The customer did not respond for order ${ext.orderId}. The original deadline stays.`, 'prep_extension_rejected', { orderId: String(ext.orderId) });
    }
    return stale.length;
}

/* ------------------------------ Delivery partner hooks ------------------------------ */
async function estimateDeliveryMinutes(order, cfg) {
    let km = 0;
    try {
        const rest = await FoodRestaurant.findById(order.restaurantId).select('location').lean();
        const a = rest?.location?.coordinates;
        const b = order.deliveryAddress?.location?.coordinates;
        if (Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2) km = haversineKm(a[1], a[0], b[1], b[0]);
    } catch { /* distance optional */ }
    return Math.max(1, Math.ceil((cfg.deliveryBaseMinutes || 0) + (cfg.deliveryMinutesPerKm || 0) * km + (cfg.deliveryBufferMinutes || 0)));
}

/** Delivery timer starts at the real pickup time, so restaurant waiting never counts against the partner. */
export async function onOrderPickedUp(order, partnerId) {
    try {
        const cfg = await getConfig();
        if (!cfg.enabled || order.deliveryEval?.originalEta) return;
        const pickedUpAt = order.deliveryState?.pickedUpAt || new Date();
        const estimatedMinutes = await estimateDeliveryMinutes(order, cfg);
        const eta = new Date(new Date(pickedUpAt).getTime() + estimatedMinutes * MIN);
        const deliveryEval = { partnerId: oid(partnerId), pickedUpAt, estimatedMinutes, originalEta: eta, adjustedEta: eta, adjustments: [], penaltyEvaluated: false, delayNotified: false };
        order.deliveryEval = deliveryEval;
        await FoodOrder.updateOne({ _id: order._id }, { $set: { deliveryEval } });
        try {
            const io = getIO();
            const payload = { orderId: String(order._id), deliveryEta: eta, estimatedMinutes };
            if (io) {
                io.to(rooms.user(order.userId)).emit('delivery_eta_updated', payload);
                io.to(rooms.delivery(partnerId)).emit('delivery_eta_updated', payload);
                io.to(rooms.restaurant(order.restaurantId)).emit('delivery_eta_updated', payload);
            }
        } catch { /* socket optional */ }
    } catch (e) {
        logger.warn(`[Performance] onOrderPickedUp failed: ${e?.message}`);
    }
}

async function evaluateDelivery(order, deliveredAt) {
    const cfg = await getConfig();
    const ev = order.deliveryEval;
    if (!cfg.enabled || !ev?.adjustedEta || !ev.partnerId) return;
    const claim = await FoodOrder.updateOne({ _id: order._id, 'deliveryEval.penaltyEvaluated': { $ne: true } }, { $set: { 'deliveryEval.penaltyEvaluated': true } });
    if (!claim.modifiedCount) return;
    const delayMinutes = computeDelayMinutes(ev.adjustedEta, deliveredAt, cfg);
    if (delayMinutes <= 0) return;
    const hasPending = (ev.adjustments || []).some((a) => a.status === 'pending');
    await recordViolation({
        partyType: 'DELIVERY_PARTNER', partyId: ev.partnerId, orderId: order._id, violationType: 'DELIVERY_DELAY',
        delayMinutes, originalEta: ev.originalEta, approvedEta: ev.adjustedEta, actualAt: deliveredAt,
        reason: 'Delivered after the adjusted delivery ETA', holdForReview: hasPending
    });
}

export async function onOrderDelivered(order) {
    try {
        await evaluateDelivery(order, order.deliveryState?.deliveredAt || new Date());
    } catch (e) {
        logger.warn(`[Performance] onOrderDelivered failed: ${e?.message}`);
    }
}

/**
 * Delivery partner declined an assignment. Before acceptance = ASSIGNMENT_REJECTION,
 * after acceptance = POST_ACCEPT_CANCELLATION (tracked separately).
 */
export async function onAssignmentRejected(orderId, partnerId, { reason = '', reasonCode = '', wasAccepted = false } = {}) {
    try {
        return await recordViolation({
            partyType: 'DELIVERY_PARTNER', partyId: partnerId, orderId, reason, reasonCode,
            violationType: wasAccepted ? 'POST_ACCEPT_CANCELLATION' : 'ASSIGNMENT_REJECTION'
        });
    } catch (e) {
        logger.warn(`[Performance] onAssignmentRejected failed: ${e?.message}`);
        return null;
    }
}

/** External delay (traffic, rain, road closure, customer location) reported by the partner, approved by admin. */
export async function reportDeliveryDelay(orderId, partnerId, { minutes, reasonCode, note = '' }) {
    const cfg = await getConfig();
    if (!(cfg.externalDelayReasons || []).includes(reasonCode)) throw new ValidationError('Select a valid delay reason');
    const m = Math.round(Number(minutes));
    if (!(m >= 1 && m <= cfg.maxExternalDelayMinutes)) throw new ValidationError(`Delay must be between 1 and ${cfg.maxExternalDelayMinutes} minutes`);
    const res = await FoodOrder.updateOne(
        { _id: oid(orderId), 'deliveryEval.partnerId': oid(partnerId), 'deliveryEval.originalEta': { $ne: null }, orderStatus: { $in: ['picked_up', 'reached_drop'] } },
        { $push: { 'deliveryEval.adjustments': { _id: new mongoose.Types.ObjectId(), minutes: m, reasonCode, note: String(note).slice(0, 300), status: 'pending', requestedBy: 'DELIVERY_PARTNER', at: new Date() } } }
    );
    if (!res.matchedCount) throw new NotFoundError('No active delivery found for this order');
    await notifyAdmins('Delivery delay reported', `Order ${orderId}: partner reports +${m} min (${reasonCode}).`, 'delivery_adjustment_request', { orderId: String(orderId) });
    const order = await FoodOrder.findById(orderId).select('deliveryEval').lean();
    return order.deliveryEval;
}

/** Admin approves/rejects a partner report, or adds an adjustment directly (approved). */
export async function adminDecideDeliveryAdjustment(orderId, adminId, { adjustmentId, approve, minutes, reasonCode = 'admin_adjustment', note = '' }) {
    const order = await FoodOrder.findById(orderId).select('deliveryEval userId restaurantId').lean();
    if (!order || !order.deliveryEval?.originalEta) throw new NotFoundError('Order has no delivery timer');
    const before = order.deliveryEval;
    if (adjustmentId) {
        const set = { 'deliveryEval.adjustments.$.status': approve ? 'approved' : 'rejected' };
        if (approve && Number(minutes) >= 1) set['deliveryEval.adjustments.$.minutes'] = Math.round(Number(minutes));
        if (note) set['deliveryEval.adjustments.$.note'] = String(note).slice(0, 300);
        const res = await FoodOrder.updateOne(
            { _id: order._id, 'deliveryEval.adjustments': { $elemMatch: { _id: oid(adjustmentId), status: 'pending' } } },
            { $set: set }
        );
        if (!res.matchedCount) throw new ValidationError('Adjustment not found or already decided');
    } else {
        const m = Math.round(Number(minutes));
        if (!(m >= 1)) throw new ValidationError('minutes must be at least 1');
        await FoodOrder.updateOne({ _id: order._id }, { $push: { 'deliveryEval.adjustments': { _id: new mongoose.Types.ObjectId(), minutes: m, reasonCode, note: String(note).slice(0, 300), status: 'approved', requestedBy: 'ADMIN', at: new Date() } } });
    }
    // Recompute from the stored approved adjustments so repeated calls are idempotent.
    const fresh = await FoodOrder.findById(order._id).select('deliveryEval').lean();
    const ev = fresh.deliveryEval;
    const total = (ev.adjustments || []).filter((a) => a.status === 'approved').reduce((sum, a) => sum + a.minutes, 0);
    const adjustedEta = new Date(new Date(ev.originalEta).getTime() + total * MIN);
    await FoodOrder.updateOne({ _id: order._id }, { $set: { 'deliveryEval.adjustedEta': adjustedEta } });
    await audit(adminId, 'DELIVERY_ETA_ADJUST', 'order', orderId, before, { ...ev, adjustedEta }, note);
    // If the delivery was already judged, re-check it against the new ETA: a penalty that is no longer late is waived.
    const cfg = await getConfig();
    const judged = await FoodPenaltyLedger.findOne({ orderId: order._id, violationType: 'DELIVERY_DELAY', status: { $in: ['pending', 'applied', 'warning'] } });
    if (judged && computeDelayMinutes(adjustedEta, judged.actualAt, cfg) <= 0) {
        const prev = judged.toObject();
        judged.status = 'waived';
        judged.reviewHold = false;
        judged.statusReason = 'Delay covered by an approved external-delay adjustment';
        judged.decidedBy = adminId;
        await judged.save();
        await FoodStrike.updateOne({ ledgerId: judged._id }, { $set: { revoked: true } });
        await audit(adminId, 'LEDGER_AUTO_WAIVE', 'ledger', judged._id, prev, judged.toObject(), 'ETA adjustment approved after delivery');
        await notify('DELIVERY_PARTNER', judged.partyId, 'Penalty waived', `Your delay on order ${order._id} is now covered by an approved adjustment.`, 'performance_penalty_update', { ledgerId: String(judged._id) });
    }
    const payload = { orderId: String(order._id), deliveryEta: adjustedEta, originalEta: ev.originalEta };
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.user(order.userId)).emit('delivery_eta_updated', payload);
            io.to(rooms.delivery(ev.partnerId)).emit('delivery_eta_updated', payload);
            io.to(rooms.restaurant(order.restaurantId)).emit('delivery_eta_updated', payload);
        }
    } catch { /* socket optional */ }
    await notify('DELIVERY_PARTNER', ev.partnerId, 'Delivery time updated', `Your delivery ETA for order ${order._id} was adjusted by ${total} minutes.`, 'delivery_eta_updated', { orderId: String(order._id) });
    await notify('USER', order.userId, 'Delivery time updated', 'Your delivery is taking a little longer than first estimated.', 'delivery_eta_updated', { orderId: String(order._id) });
    return { ...ev, adjustedEta };
}

export async function orderTiming(orderId) {
    const order = await FoodOrder.findById(orderId).select('prep deliveryEval orderStatus deliveryState').lean();
    if (!order) throw new NotFoundError('Order not found');
    const ev = order.deliveryEval || {};
    return {
        orderStatus: order.orderStatus,
        prep: order.prep || null,
        delivery: { pickedUpAt: ev.pickedUpAt, estimatedMinutes: ev.estimatedMinutes, originalEta: ev.originalEta, adjustedEta: ev.adjustedEta, adjustments: ev.adjustments || [] },
        serverNow: new Date()
    };
}

/**
 * Everything the admin needs to see about WHO took how long on one order: restaurant time, delivery partner
 * time and the full event timeline. Built only from server timestamps already stored on the order.
 */
export async function orderTimeline(orderRef) {
    const identity = buildOrderIdentityFilter(orderRef);
    if (!identity) throw new ValidationError('Order id required');
    const o = await FoodOrder.findOne(identity).lean();
    if (!o) throw new NotFoundError('Order not found');

    const at = (v) => (v ? new Date(v) : null);
    const diffMin = (a, b) => (a && b ? Math.round(((b.getTime() - a.getTime()) / MIN) * 10) / 10 : null);
    const history = o.statusHistory || [];
    const firstAt = (...statuses) => at(history.find((h) => statuses.includes(h.to))?.at);
    const ds = o.deliveryState || {};
    const placed = at(o.createdAt);
    const accepted = at(o.prep?.acceptedAt) || firstAt('confirmed', 'preparing');
    const prepStarted = at(ds.foodPrepStartedAt) || accepted;
    const ready = at(ds.foodReadyAt) || firstAt('ready_for_pickup', 'ready');
    const assigned = at(o.dispatch?.assignedAt);
    const riderAccepted = at(o.dispatch?.acceptedAt);
    const reachedPickup = at(ds.reachedPickupAt);
    const pickedUp = at(ds.pickedUpAt) || at(o.deliveryEval?.pickedUpAt) || firstAt('picked_up');
    const reachedDrop = at(ds.reachedDropAt);
    const delivered = at(ds.deliveredAt) || (o.orderStatus === 'delivered' ? firstAt('delivered') : null);
    const cancelled = at(o.cancelledAt);

    const events = [
        ['placed', 'Order placed', placed],
        ['restaurant_accepted', 'Restaurant accepted', accepted],
        ['prep_started', 'Preparation started', prepStarted],
        ['food_ready', 'Food ready', ready],
        ['rider_assigned', 'Delivery partner assigned', assigned],
        ['rider_accepted', 'Delivery partner accepted', riderAccepted],
        ['reached_restaurant', 'Delivery partner reached restaurant', reachedPickup],
        ['picked_up', 'Food picked up', pickedUp],
        ['reached_customer', 'Reached customer', reachedDrop],
        ['delivered', 'Delivered', delivered],
        ['cancelled', `Cancelled${o.cancelledBy ? ` by ${String(o.cancelledBy).toLowerCase()}` : ''}`, cancelled],
    ].filter(([, , t]) => t).map(([key, label, t]) => ({ key, label, at: t })).sort((a, b) => a.at - b.at);

    const promisedPrep = o.prep?.approvedEta && accepted ? diffMin(accepted, at(o.prep.approvedEta)) : null;
    const actualPrep = diffMin(accepted, ready);
    const prepLate = o.prep?.approvedEta && ready ? Math.max(0, diffMin(at(o.prep.approvedEta), ready)) : null;
    const ev = o.deliveryEval || {};
    const adjustedEta = at(ev.adjustedEta);
    const deliveryTime = diffMin(pickedUp, delivered);
    const deliveryLate = adjustedEta && delivered ? Math.max(0, diffMin(adjustedEta, delivered)) : null;
    const waitedAtRestaurant = ds.riderWaitDurationMs != null && ds.riderWaitDurationMs > 0
        ? Math.round((ds.riderWaitDurationMs / MIN) * 10) / 10
        : (reachedPickup && pickedUp ? diffMin(reachedPickup, pickedUp) : null);

    const [restaurant, riderDoc, penalties, caseDoc] = await Promise.all([
        FoodRestaurant.findById(o.restaurantId).select('restaurantName name').lean(),
        (async () => {
            const rid = o.dispatch?.deliveryPartnerId || ev.partnerId;
            if (!rid) return null;
            const { FoodDeliveryPartner } = await import('../../delivery/models/deliveryPartner.model.js');
            return FoodDeliveryPartner.findById(rid).select('name fullName phone').lean();
        })(),
        FoodPenaltyLedger.find({ orderId: o._id }).select('partyType violationType delayMinutes amount stage status').lean(),
        FoodCancellationCase.findOne({ orderId: o._id }).select('stage status breakdown payMode refund').lean(),
    ]);

    return {
        orderId: String(o._id),
        orderLabel: o.order_id || String(o._id),
        orderStatus: o.orderStatus,
        events,
        restaurant: {
            name: restaurant?.restaurantName || restaurant?.name || '',
            acceptedAfterMin: diffMin(placed, accepted),
            promisedPrepMin: promisedPrep,
            actualPrepMin: actualPrep,
            lateByMin: prepLate,
            originalEta: at(o.prep?.originalEta),
            approvedEta: at(o.prep?.approvedEta),
            extended: Boolean(o.prep?.extended),
            status: ready ? (prepLate > 0 ? 'late' : 'on_time') : accepted ? 'in_progress' : 'not_accepted',
        },
        deliveryPartner: {
            name: riderDoc?.fullName || riderDoc?.name || '',
            phone: riderDoc?.phone || '',
            assignToAcceptMin: diffMin(assigned, riderAccepted),
            travelToRestaurantMin: diffMin(riderAccepted, reachedPickup),
            waitedAtRestaurantMin: waitedAtRestaurant,
            deliveryTimeMin: deliveryTime,
            estimatedDeliveryMin: ev.estimatedMinutes || null,
            deliveryEta: adjustedEta,
            lateByMin: deliveryLate,
            externalDelayMin: (ev.adjustments || []).filter((a) => a.status === 'approved').reduce((s, a) => s + a.minutes, 0),
            status: delivered ? (deliveryLate > 0 ? 'late' : 'on_time') : pickedUp ? 'in_progress' : riderAccepted ? 'going_to_restaurant' : 'not_assigned',
        },
        totals: {
            totalMin: diffMin(placed, delivered || cancelled),
            placedToReadyMin: diffMin(placed, ready),
            readyToPickupMin: diffMin(ready, pickedUp),
        },
        penalties,
        cancellation: caseDoc || null,
        serverNow: new Date(),
    };
}

/* ------------------------------ Scheduler sweep ------------------------------ */
/** Runs every minute from server.js. Idempotent; each step is guarded by atomic flags. */
export async function runPerformanceSweep() {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    const now = new Date();
    await expireStaleExtensions();

    // 0. Heads-up BEFORE the deadline, including what a delay will cost.
    const warnMin = Number(cfg.preWarnMinutes) || 0;
    if (warnMin > 0) {
        const firstPenalty = (slabs) => [...(slabs || [])].sort((a, b) => a.fromMin - b.fromMin).find((s) => s.action === 'penalty');
        const costText = (slabs) => {
            const s = firstPenalty(slabs);
            return s ? ` A delay of ${s.fromMin}+ min costs Rs ${s.amount}${s.strike ? ' + strike' : ''}.` : '';
        };
        const soon = await FoodOrder.find({
            orderStatus: { $in: ['confirmed', 'preparing'] }, 'prep.approvedEta': { $gt: now, $lte: new Date(now.getTime() + warnMin * MIN) },
            'prep.penaltyEvaluated': { $ne: true }, 'prep.preWarned': { $ne: true }
        }).select('prep restaurantId').limit(200).lean();
        for (const o of soon) {
            const c = await FoodOrder.updateOne({ _id: o._id, 'prep.preWarned': { $ne: true } }, { $set: { 'prep.preWarned': true } });
            if (!c.modifiedCount) continue;
            const left = Math.max(1, Math.ceil((new Date(o.prep.approvedEta).getTime() - now.getTime()) / MIN));
            await notify('RESTAURANT', o.restaurantId, 'Order due soon', `Order ${o._id} must be ready in ${left} min.${costText(cfg.restaurantDelaySlabs)} Need more time? Request it now.`, 'prep_due_soon', { orderId: String(o._id) });
        }
        const dueRiders = await FoodOrder.find({
            orderStatus: { $in: ['picked_up', 'reached_drop'] }, 'deliveryEval.adjustedEta': { $gt: now, $lte: new Date(now.getTime() + warnMin * MIN) },
            'deliveryEval.penaltyEvaluated': { $ne: true }, 'deliveryEval.preWarned': { $ne: true }
        }).select('deliveryEval').limit(200).lean();
        for (const o of dueRiders) {
            const c = await FoodOrder.updateOne({ _id: o._id, 'deliveryEval.preWarned': { $ne: true } }, { $set: { 'deliveryEval.preWarned': true } });
            if (!c.modifiedCount) continue;
            const left = Math.max(1, Math.ceil((new Date(o.deliveryEval.adjustedEta).getTime() - now.getTime()) / MIN));
            await notify('DELIVERY_PARTNER', o.deliveryEval.partnerId, 'Delivery due soon', `Order ${o._id} must be delivered in ${left} min.${costText(cfg.deliveryDelaySlabs)} Stuck in traffic or rain? Report the delay.`, 'delivery_due_soon', { orderId: String(o._id) });
        }
    }

    // 1. Restaurant is late and still preparing: warn once (final penalty is judged when food is ready).
    const late = await FoodOrder.find({
        orderStatus: { $in: ['confirmed', 'preparing'] }, 'prep.approvedEta': { $lt: new Date(now.getTime() - (cfg.graceSeconds || 0) * 1000) },
        'prep.penaltyEvaluated': { $ne: true }, 'prep.delayNotified': { $ne: true }
    }).select('prep restaurantId userId dispatch').limit(200).lean();
    for (const o of late) {
        const claim = await FoodOrder.updateOne({ _id: o._id, 'prep.delayNotified': { $ne: true } }, { $set: { 'prep.delayNotified': true } });
        if (!claim.modifiedCount) continue;
        await notify('RESTAURANT', o.restaurantId, 'Preparation is late', `Order ${o._id} passed its approved ready time. Mark it ready as soon as possible.`, 'prep_delay', { orderId: String(o._id) });
        if (o.dispatch?.deliveryPartnerId) await notify('DELIVERY_PARTNER', o.dispatch.deliveryPartnerId, 'Pickup delayed', `Order ${o._id} is not ready yet. This delay is not counted against you.`, 'prep_delay', { orderId: String(o._id) });
    }

    // 2. Food already picked up but the restaurant never pressed "ready": judge against pickup time.
    const unjudged = await FoodOrder.find({
        orderStatus: { $in: ['picked_up', 'reached_drop', 'delivered'] }, 'prep.approvedEta': { $ne: null }, 'prep.penaltyEvaluated': { $ne: true }
    }).limit(200);
    for (const o of unjudged) {
        await evaluatePrep(o, o.deliveryState?.foodReadyAt || o.deliveryState?.pickedUpAt || now).catch((e) => logger.warn(`[Performance] sweep prep failed: ${e?.message}`));
    }

    // 3. Delivery past adjusted ETA: warn the partner once (final penalty judged on delivery).
    const overdue = await FoodOrder.find({
        orderStatus: { $in: ['picked_up', 'reached_drop'] }, 'deliveryEval.adjustedEta': { $lt: new Date(now.getTime() - (cfg.graceSeconds || 0) * 1000) },
        'deliveryEval.penaltyEvaluated': { $ne: true }, 'deliveryEval.delayNotified': { $ne: true }
    }).select('deliveryEval').limit(200).lean();
    for (const o of overdue) {
        const claim = await FoodOrder.updateOne({ _id: o._id, 'deliveryEval.delayNotified': { $ne: true } }, { $set: { 'deliveryEval.delayNotified': true } });
        if (!claim.modifiedCount) continue;
        await notify('DELIVERY_PARTNER', o.deliveryEval.partnerId, 'Delivery is late', `Order ${o._id} passed its delivery ETA. If traffic or rain is the cause, report it from the order screen.`, 'delivery_delay', { orderId: String(o._id) });
    }
}

/* ------------------------------ Ledger admin + appeals ------------------------------ */
export async function listLedger({ partyType, partyId, status, violationType, orderId, month, from, to, page = 1, limit = 50 } = {}) {
    const q = {};
    if (partyType) q.partyType = partyType;
    if (partyId) q.partyId = oid(partyId);
    if (orderId) q.orderId = oid(orderId);
    if (status) q.status = status;
    if (violationType) q.violationType = violationType;
    if (month) q.month = month;
    if (from || to) q.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const lim = Math.min(Number(limit) || 50, 200);
    const [items, total] = await Promise.all([
        FoodPenaltyLedger.find(q).sort({ createdAt: -1 }).skip((Math.max(Number(page), 1) - 1) * lim).limit(lim).lean(),
        FoodPenaltyLedger.countDocuments(q)
    ]);
    return { items, total, page: Number(page) || 1, limit: lim };
}

/** Admin actions: approve (pending -> applied), waive, reverse, settle (finance deducted it from payout). */
export async function decideLedger(ledgerId, adminId, action, note = '') {
    const row = await FoodPenaltyLedger.findById(ledgerId);
    if (!row) throw new NotFoundError('Ledger entry not found');
    if (action !== 'approve' && action !== 'settle' && !String(note).trim()) throw new ValidationError('A reason is required');
    const before = row.toObject();
    const cfg = await getConfig();
    if (action === 'approve') {
        if (row.status !== 'pending') throw new ValidationError('Only pending penalties can be approved');
        row.status = 'applied';
        row.reviewHold = false;
    } else if (action === 'waive') {
        row.status = 'waived';
    } else if (action === 'reverse') {
        row.status = 'reversed';
    } else if (action === 'settle') {
        if (row.status !== 'applied' || row.stage !== 'penalty' || !(row.amount > 0)) throw new ValidationError('Only applied penalties can be settled');
        if (row.settled) throw new ValidationError('Already settled');
        // Defence in depth: never settle money while a dispute is open.
        if (await FoodPenaltyAppeal.exists({ ledgerId: row._id, status: 'open' })) throw new ValidationError('Penalty is under dispute');
        row.settled = true;
        row.settledAt = new Date();
    } else {
        throw new ValidationError('Unknown action');
    }
    if (note) row.statusReason = String(note).trim();
    row.decidedBy = adminId;
    await row.save();
    if (['waive', 'reverse'].includes(action)) {
        await FoodStrike.updateOne({ ledgerId: row._id }, { $set: { revoked: true } });
        // Close any open appeal in the party's favour.
        const open = await FoodPenaltyAppeal.findOne({ ledgerId: row._id, status: 'open' });
        if (open) {
            open.status = 'approved';
            open.adminNote = String(note).trim();
            open.decidedBy = adminId;
            open.decidedAt = new Date();
            await open.save();
        }
    }
    if (action === 'approve' && row.stage === 'penalty' && row.strikeCount > 0) await addStrike(row, cfg);
    await audit(adminId, `LEDGER_${action.toUpperCase()}`, 'ledger', row._id, before, row.toObject(), note);
    if (action !== 'settle') {
        await notify(row.partyType, row.partyId, `Penalty ${row.status}`, `Your penalty for order ${row.orderId} is now ${row.status}.`, 'performance_penalty_update', { ledgerId: String(row._id) });
    }
    return row.toObject();
}

export async function createAppeal(partyType, partyId, { ledgerId, reason, evidence = [] }) {
    const row = await FoodPenaltyLedger.findById(ledgerId);
    if (!row || row.partyType !== partyType || String(row.partyId) !== String(partyId)) throw new NotFoundError('Penalty not found');
    if (!String(reason || '').trim()) throw new ValidationError('Appeal reason is required');
    if (['waived', 'reversed'].includes(row.status)) throw new ValidationError('Penalty is already cleared');
    if (row.settled) throw new ValidationError('This penalty is already settled; please contact support');
    const open = await FoodPenaltyAppeal.findOne({ ledgerId: row._id, status: 'open' });
    if (open) throw new ValidationError('An appeal is already open for this penalty');
    const appeal = await FoodPenaltyAppeal.create({ ledgerId: row._id, partyType, partyId: oid(partyId), reason: String(reason).trim(), evidence: Array.isArray(evidence) ? evidence.filter((e) => typeof e === 'string').slice(0, 5) : [] });
    // No financial deduction while disputed.
    if (row.stage === 'penalty' && ['applied', 'pending'].includes(row.status)) {
        row.status = 'disputed';
        await row.save();
    }
    await notifyAdmins('New penalty appeal', `${partyType} appealed penalty on order ${row.orderId}.`, 'performance_appeal', { appealId: String(appeal._id) });
    return appeal.toObject();
}

export async function listAppeals({ partyType, partyId, status } = {}) {
    const q = {};
    if (partyType) q.partyType = partyType;
    if (partyId) q.partyId = oid(partyId);
    if (status) q.status = status;
    return FoodPenaltyAppeal.find(q).sort({ createdAt: -1 }).limit(200).lean();
}

export async function decideAppeal(appealId, adminId, approve, note = '') {
    const appeal = await FoodPenaltyAppeal.findById(appealId);
    if (!appeal) throw new NotFoundError('Appeal not found');
    if (appeal.status !== 'open') throw new ValidationError('Appeal already decided');
    if (!approve && !String(note).trim()) throw new ValidationError('A reason is required to reject an appeal');
    const ledger = await FoodPenaltyLedger.findById(appeal.ledgerId);
    appeal.status = approve ? 'approved' : 'rejected';
    appeal.adminNote = String(note || '').trim();
    appeal.decidedBy = adminId;
    appeal.decidedAt = new Date();
    await appeal.save();
    if (ledger) {
        const before = ledger.toObject();
        if (approve) {
            ledger.status = 'reversed';
            await FoodStrike.updateOne({ ledgerId: ledger._id }, { $set: { revoked: true } });
        } else if (ledger.status === 'disputed') {
            const cfg = await getConfig();
            ledger.status = (cfg.requireAdminApproval && !ledger.decidedBy) || ledger.reviewHold ? 'pending' : 'applied';
        }
        ledger.statusReason = appeal.adminNote;
        ledger.decidedBy = adminId;
        await ledger.save();
        if (!approve && ledger.status === 'applied' && ledger.stage === 'penalty' && ledger.strikeCount > 0) await addStrike(ledger, await getConfig());
        await audit(adminId, approve ? 'APPEAL_APPROVE' : 'APPEAL_REJECT', 'appeal', appeal._id, before, ledger.toObject(), note);
        await notify(appeal.partyType, appeal.partyId, `Appeal ${appeal.status}`, `Your appeal for order ${ledger.orderId} was ${appeal.status}.${appeal.adminNote ? ` Note: ${appeal.adminNote}` : ''}`, 'performance_appeal_decision', { appealId: String(appeal._id) });
    }
    return appeal.toObject();
}

export async function listStrikes({ partyType, partyId, month } = {}) {
    const q = {};
    if (partyType) q.partyType = partyType;
    if (partyId) q.partyId = oid(partyId);
    if (month) q.month = month;
    return FoodStrike.find(q).sort({ createdAt: -1 }).limit(200).lean();
}

/** Admin exception: lift a strike / suspension without touching the ledger entry. */
export async function revokeStrike(strikeId, adminId, note) {
    if (!String(note || '').trim()) throw new ValidationError('A reason is required');
    const s = await FoodStrike.findById(strikeId);
    if (!s) throw new NotFoundError('Strike not found');
    const before = s.toObject();
    s.revoked = true;
    await s.save();
    await audit(adminId, 'STRIKE_REVOKE', 'strike', strikeId, before, s.toObject(), note);
    await notify(s.partyType, s.partyId, 'Strike removed', 'An admin removed one of your strikes.', 'performance_strike_removed', { strikeId: String(s._id) });
    return s.toObject();
}

/* ------------------------------ Dashboards ------------------------------ */
export async function partySummary(partyType, partyId, month) {
    const cfg = await getConfig();
    month = month || monthKey(new Date(), cfg.timezoneOffsetMin);
    const pid = oid(partyId);
    const [ledger, strikes, susp, outstanding] = await Promise.all([
        FoodPenaltyLedger.find({ partyType, partyId: pid, month }).sort({ createdAt: -1 }).lean(),
        FoodStrike.countDocuments({ partyType, partyId: pid, month, revoked: false }),
        isSuspended(partyType, partyId),
        FoodPenaltyLedger.aggregate([{ $match: { partyType, partyId: pid, status: 'applied', stage: 'penalty', settled: false } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);
    const counted = ledger.filter((l) => COUNTED_STATUSES.includes(l.status));
    return {
        month,
        totalStrikes: strikes,
        totalPenalties: counted.reduce((s, l) => s + (l.amount || 0), 0),
        outstandingPenalties: outstanding[0]?.total || 0,
        warnings: ledger.filter((l) => l.stage === 'warning').length,
        rejections: ledger.filter((l) => ['ORDER_REJECTION', 'ASSIGNMENT_REJECTION'].includes(l.violationType)).length,
        delays: ledger.filter((l) => ['PREP_DELAY', 'DELIVERY_DELAY'].includes(l.violationType)).length,
        suspension: susp,
        recent: ledger.slice(0, 20)
    };
}

export async function restaurantDashboard(restaurantId, month) {
    const cfg = await getConfig();
    month = month || monthKey(new Date(), cfg.timezoneOffsetMin);
    const rid = oid(restaurantId);
    const [start, end] = monthRange(month, cfg.timezoneOffsetMin);
    const orders = await FoodOrder.find({ restaurantId: rid, createdAt: { $gte: start, $lt: end } })
        .select('orderStatus prep deliveryState').lean();
    const rejected = orders.filter((o) => o.orderStatus === 'cancelled_by_restaurant' && !o.prep?.acceptedAt).length;
    const accepted = orders.filter((o) => o.prep?.acceptedAt);
    const readyAtOf = (o) => o.deliveryState?.foodReadyAt || null;
    const evaluated = accepted.filter((o) => readyAtOf(o));
    const lateCount = evaluated.filter((o) => computeDelayMinutes(o.prep.approvedEta, readyAtOf(o), cfg) > 0).length;
    const avgPrep = evaluated.length
        ? Math.round(evaluated.reduce((s, o) => s + (new Date(readyAtOf(o)) - new Date(o.prep.acceptedAt)), 0) / evaluated.length / MIN)
        : 0;
    const bulkKeys = new Set((cfg.orderTiers || []).filter((t) => t.countsAsBulk).map((t) => t.key));
    const base = await partySummary('RESTAURANT', restaurantId, month);
    return {
        ...base,
        totalOrders: orders.length,
        acceptedOrders: accepted.length,
        rejectedOrders: rejected,
        prepDelayCount: lateCount,
        onTimePrepPercent: evaluated.length ? Math.round(((evaluated.length - lateCount) / evaluated.length) * 100) : 100,
        avgPrepMinutes: avgPrep,
        bulkOrders: accepted.filter((o) => bulkKeys.has(o.prep?.tierKey)).length
    };
}

export async function deliveryDashboard(partnerId, month) {
    const cfg = await getConfig();
    month = month || monthKey(new Date(), cfg.timezoneOffsetMin);
    const pid = oid(partnerId);
    const [start, end] = monthRange(month, cfg.timezoneOffsetMin);
    const orders = await FoodOrder.find({
        createdAt: { $gte: start, $lt: end },
        $or: [{ 'dispatch.deliveryPartnerId': pid }, { 'dispatch.offeredTo.partnerId': pid }, { 'deliveryEval.partnerId': pid }]
    }).select('orderStatus dispatch deliveryState deliveryEval').lean();
    const offerFor = (o) => (o.dispatch?.offeredTo || []).filter((x) => String(x.partnerId) === String(pid));
    const rejectedOffers = orders.filter((o) => offerFor(o).some((x) => x.action === 'rejected')).length;
    const accepted = orders.filter((o) => String(o.dispatch?.deliveryPartnerId) === String(pid) && o.dispatch?.acceptedAt || String(o.deliveryEval?.partnerId) === String(pid));
    const completed = orders.filter((o) => o.orderStatus === 'delivered' && String(o.deliveryEval?.partnerId || o.dispatch?.deliveryPartnerId) === String(pid));
    const judged = completed.filter((o) => o.deliveryEval?.adjustedEta && o.deliveryState?.deliveredAt);
    const late = judged.filter((o) => computeDelayMinutes(o.deliveryEval.adjustedEta, o.deliveryState.deliveredAt, cfg) > 0).length;
    const timed = judged.filter((o) => o.deliveryEval.pickedUpAt);
    const avg = timed.length ? Math.round(timed.reduce((s, o) => s + (new Date(o.deliveryState.deliveredAt) - new Date(o.deliveryEval.pickedUpAt)), 0) / timed.length / MIN) : 0;
    const base = await partySummary('DELIVERY_PARTNER', partnerId, month);
    return {
        ...base,
        totalAssigned: orders.length,
        acceptedAssignments: accepted.length,
        rejectedAssignments: rejectedOffers,
        completedDeliveries: completed.length,
        deliveryDelayCount: late,
        onTimeDeliveryPercent: judged.length ? Math.round(((judged.length - late) / judged.length) * 100) : 100,
        avgDeliveryMinutes: avg
    };
}

export async function adminOverview(partyType, month) {
    const cfg = await getConfig();
    month = month || monthKey(new Date(), cfg.timezoneOffsetMin);
    const delayType = partyType === 'RESTAURANT' ? 'PREP_DELAY' : 'DELIVERY_DELAY';
    const rejType = partyType === 'RESTAURANT' ? 'ORDER_REJECTION' : 'ASSIGNMENT_REJECTION';
    const rows = await FoodPenaltyLedger.aggregate([
        { $match: { partyType, month } },
        { $group: {
            _id: '$partyId',
            penalties: { $sum: { $cond: [{ $in: ['$status', COUNTED_STATUSES] }, '$amount', 0] } },
            outstanding: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'applied'] }, { $eq: ['$settled', false] }] }, '$amount', 0] } },
            warnings: { $sum: { $cond: [{ $eq: ['$stage', 'warning'] }, 1, 0] } },
            rejections: { $sum: { $cond: [{ $eq: ['$violationType', rejType] }, 1, 0] } },
            cancellations: { $sum: { $cond: [{ $eq: ['$violationType', 'POST_ACCEPT_CANCELLATION'] }, 1, 0] } },
            delays: { $sum: { $cond: [{ $eq: ['$violationType', delayType] }, 1, 0] } },
            violations: { $sum: 1 }
        } },
        { $sort: { penalties: -1 } },
        { $limit: 300 }
    ]);
    const strikes = await FoodStrike.aggregate([
        { $match: { partyType, month, revoked: false } },
        { $group: { _id: '$partyId', strikes: { $sum: 1 }, suspendedUntil: { $max: '$suspendedUntil' } } }
    ]);
    const sm = new Map(strikes.map((s) => [String(s._id), s]));
    return rows.map((r) => {
        const st = sm.get(String(r._id));
        return { partyId: r._id, ...r, _id: undefined, strikes: st?.strikes || 0, suspendedUntil: st?.suspendedUntil && st.suspendedUntil > new Date() ? st.suspendedUntil : null };
    });
}

export const adminRestaurantOverview = (month) => adminOverview('RESTAURANT', month);
export const adminDeliveryOverview = (month) => adminOverview('DELIVERY_PARTNER', month);

export async function listAudit({ limit = 100, action, targetType } = {}) {
    const q = {};
    if (action) q.action = action;
    if (targetType) q.targetType = targetType;
    return FoodPerformanceAudit.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
}
