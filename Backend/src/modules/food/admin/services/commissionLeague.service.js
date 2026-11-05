import mongoose from 'mongoose';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodRestaurantCommission } from '../models/restaurantCommission.model.js';
import { FoodZone } from '../models/zone.model.js';
import {
    FoodCommissionLeagueSettings,
    FoodCommissionLeagueAudit,
    FoodRestaurantMonthlyLeague
} from '../models/commissionLeague.model.js';

/* ------------------------------------------------------------------ */
/* Constants & small helpers                                          */
/* ------------------------------------------------------------------ */

const IST_OFFSET_MS = 330 * 60 * 1000; // Asia/Kolkata, no DST
const IST_TZ = 'Asia/Kolkata';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULT_SLABS = [
    { key: 'bronze', name: 'Bronze', maxSales: 15000, commissionPercent: 5, color: '#b45309' },
    { key: 'silver', name: 'Silver', maxSales: 30000, commissionPercent: 7, color: '#64748b' },
    { key: 'gold', name: 'Gold', maxSales: 100000, commissionPercent: 8, color: '#ca8a04' },
    { key: 'platinum', name: 'Platinum', maxSales: 200000, commissionPercent: 8, color: '#0891b2' },
    { key: 'premium_diamond', name: 'Premium Diamond', maxSales: null, commissionPercent: 8, color: '#7c3aed' }
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toOid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => Boolean(v) && mongoose.Types.ObjectId.isValid(String(v));

/** 'YYYY-MM' of the IST calendar month containing `date`. */
export function monthKeyOf(date = new Date()) {
    const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthKey(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { year, month };
}

/** UTC [start, end) instants of an IST calendar month. */
export function monthRange(key) {
    const p = parseMonthKey(key);
    if (!p) return null;
    const start = new Date(Date.UTC(p.year, p.month - 1, 1) - IST_OFFSET_MS);
    const end = new Date(Date.UTC(p.year, p.month, 1) - IST_OFFSET_MS);
    return { start, end };
}

export function monthLabel(key) {
    const p = parseMonthKey(key);
    return p ? `${MONTH_NAMES[p.month - 1]} ${p.year}` : String(key || '');
}

function prevMonthKey(key) {
    const p = parseMonthKey(key);
    const d = new Date(Date.UTC(p.year, p.month - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthIndex(key) {
    const p = parseMonthKey(key);
    return p.year * 12 + (p.month - 1);
}

/** UTC range of a single IST calendar day given 'YYYY-MM-DD'. */
function dayRange(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!m) return null;
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS);
    return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

/* ------------------------------------------------------------------ */
/* Settings (slabs) - admin-managed, cached briefly                    */
/* ------------------------------------------------------------------ */

let settingsCache = null;
let settingsCacheAt = 0;
const SETTINGS_CACHE_MS = 30 * 1000;

export function invalidateLeagueSettingsCache() {
    settingsCache = null;
    settingsCacheAt = 0;
}

function sanitizeSlabs(rawSlabs) {
    if (!Array.isArray(rawSlabs) || rawSlabs.length < 1 || rawSlabs.length > 10) {
        throw new ValidationError('Provide between 1 and 10 league slabs');
    }
    const seenKeys = new Set();
    const seenNames = new Set();
    let prevMax = 0;
    const slabs = rawSlabs.map((s, i) => {
        const name = String(s?.name || '').trim();
        if (!name) throw new ValidationError(`Slab ${i + 1}: name is required`);
        if (seenNames.has(name.toLowerCase())) throw new ValidationError(`Slab names must be unique ("${name}")`);
        seenNames.add(name.toLowerCase());

        const percent = Number(s?.commissionPercent);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            throw new ValidationError(`Slab "${name}": commission must be between 0 and 100`);
        }

        const isLast = i === rawSlabs.length - 1;
        let maxSales = null;
        if (!isLast) {
            maxSales = Number(s?.maxSales);
            if (s?.maxSales === null || s?.maxSales === '' || s?.maxSales === undefined || !Number.isFinite(maxSales)) {
                throw new ValidationError(`Slab "${name}": upper sales limit is required (only the last slab is open-ended)`);
            }
            if (maxSales <= prevMax) {
                throw new ValidationError(`Slab "${name}": upper limit must be greater than the previous slab's limit`);
            }
            prevMax = maxSales;
        }

        let key = String(s?.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        if (!key) key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `slab_${i + 1}`;
        while (seenKeys.has(key)) key = `${key}_${i + 1}`;
        seenKeys.add(key);

        return {
            key,
            name,
            maxSales: maxSales === null ? null : round2(maxSales),
            commissionPercent: round2(percent),
            color: String(s?.color || '').trim().slice(0, 20)
        };
    });
    return slabs;
}

export async function getLeagueSettings({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && settingsCache && now - settingsCacheAt < SETTINGS_CACHE_MS) return settingsCache;

    let doc = await FoodCommissionLeagueSettings.findOne({ key: 'default' }).lean();
    if (!doc) {
        try {
            await FoodCommissionLeagueSettings.create({
                key: 'default',
                enabled: true,
                fallbackPercent: 10,
                slabs: DEFAULT_SLABS
            });
        } catch (err) {
            // concurrent first-boot create: the unique key makes the loser fail harmlessly
        }
        doc = await FoodCommissionLeagueSettings.findOne({ key: 'default' }).lean();
    }

    const slabs = Array.isArray(doc?.slabs) && doc.slabs.length ? doc.slabs : DEFAULT_SLABS;
    settingsCache = {
        enabled: doc?.enabled !== false,
        fallbackPercent: Number.isFinite(Number(doc?.fallbackPercent)) ? Number(doc.fallbackPercent) : 10,
        slabs,
        updatedAt: doc?.updatedAt || null,
        updatedBy: doc?.updatedBy || null
    };
    settingsCacheAt = now;
    return settingsCache;
}

export async function updateLeagueSettings(body = {}, actor = {}) {
    const next = {};
    if (body.enabled !== undefined) next.enabled = body.enabled === true || body.enabled === 'true';
    if (body.fallbackPercent !== undefined) {
        const fb = Number(body.fallbackPercent);
        if (!Number.isFinite(fb) || fb < 0 || fb > 100) throw new ValidationError('Fallback commission must be between 0 and 100');
        next.fallbackPercent = round2(fb);
    }
    if (body.slabs !== undefined) next.slabs = sanitizeSlabs(body.slabs);
    if (!Object.keys(next).length) throw new ValidationError('Nothing to update');

    const before = await getLeagueSettings({ fresh: true });

    await FoodCommissionLeagueSettings.findOneAndUpdate(
        { key: 'default' },
        { $set: { ...next, updatedBy: { adminId: actor.adminId || null, name: actor.name || '' } } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    invalidateLeagueSettingsCache();
    const after = await getLeagueSettings({ fresh: true });

    await writeAudit({
        action: 'settings_updated',
        before: { enabled: before.enabled, fallbackPercent: before.fallbackPercent, slabs: before.slabs },
        after: { enabled: after.enabled, fallbackPercent: after.fallbackPercent, slabs: after.slabs },
        note: String(body.note || ''),
        actor
    });
    return after;
}

async function writeAudit({ action, restaurantId = null, restaurantName = '', before = null, after = null, note = '', actor = {} }) {
    try {
        await FoodCommissionLeagueAudit.create({
            action,
            restaurantId,
            restaurantName,
            before,
            after,
            note,
            adminId: actor.adminId && isOid(actor.adminId) ? toOid(actor.adminId) : null,
            adminName: actor.name || ''
        });
    } catch (err) {
        logger.error(`Commission audit write failed: ${err.message}`);
    }
}

/* ------------------------------------------------------------------ */
/* Pure league maths                                                  */
/* ------------------------------------------------------------------ */

/** Returns { index, slab, min, max, next, remaining, progressPercent } for a sales figure. */
export function evaluateLeague(sales, slabs) {
    const amount = Math.max(0, Number(sales) || 0);
    let index = slabs.findIndex((s) => s.maxSales === null || s.maxSales === undefined || amount <= s.maxSales);
    if (index < 0) index = slabs.length - 1;
    const slab = slabs[index];
    const min = index === 0 ? 0 : Number(slabs[index - 1].maxSales) || 0; // exclusive lower bound
    const max = slab.maxSales === null || slab.maxSales === undefined ? null : Number(slab.maxSales);
    const next = slabs[index + 1] || null;

    let remaining = 0;
    let progressPercent = 100;
    if (next && max !== null) {
        remaining = Math.max(0, round2(max - amount));
        const span = max - min;
        progressPercent = span > 0 ? Math.min(100, Math.max(0, round2(((amount - min) / span) * 100))) : 100;
    }
    return { index, slab, min, max, next, remaining, progressPercent };
}

function leagueView(slab) {
    return slab
        ? { key: slab.key, name: slab.name, commissionPercent: slab.commissionPercent, color: slab.color || '' }
        : null;
}

/* ------------------------------------------------------------------ */
/* Order aggregation                                                  */
/* ------------------------------------------------------------------ */

/** Orders that count as sales: delivered and not refunded. Cancelled / returned never match. */
const ELIGIBLE_ORDER_MATCH = {
    orderStatus: 'delivered',
    'payment.status': { $ne: 'refunded' }
};

/** Effective date of an order: delivery time, else creation time. */
const EFF_DATE_STAGE = {
    $addFields: { effDate: { $ifNull: ['$deliveryState.deliveredAt', '$createdAt'] } }
};

export async function getMonthlyStats(restaurantId, key = monthKeyOf()) {
    const range = monthRange(key);
    if (!range || !isOid(restaurantId)) return { sales: 0, orders: 0, commission: 0 };
    const rows = await FoodOrder.aggregate([
        { $match: { restaurantId: toOid(restaurantId), ...ELIGIBLE_ORDER_MATCH } },
        EFF_DATE_STAGE,
        { $match: { effDate: { $gte: range.start, $lt: range.end } } },
        {
            $group: {
                _id: null,
                sales: { $sum: { $ifNull: ['$pricing.subtotal', 0] } },
                orders: { $sum: 1 },
                commission: { $sum: { $ifNull: ['$pricing.restaurantCommission', 0] } }
            }
        }
    ]);
    const r = rows[0] || {};
    return { sales: round2(r.sales), orders: r.orders || 0, commission: round2(r.commission) };
}

/** Per-month totals for one restaurant, across its whole life (IST months). */
async function getRestaurantMonthlyTotals(restaurantId) {
    return FoodOrder.aggregate([
        { $match: { restaurantId: toOid(restaurantId), ...ELIGIBLE_ORDER_MATCH } },
        EFF_DATE_STAGE,
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$effDate', timezone: IST_TZ } },
                sales: { $sum: { $ifNull: ['$pricing.subtotal', 0] } },
                orders: { $sum: 1 },
                commission: { $sum: { $ifNull: ['$pricing.restaurantCommission', 0] } }
            }
        },
        { $sort: { _id: -1 } }
    ]);
}

/* ------------------------------------------------------------------ */
/* Commission resolution (used when an order is placed)               */
/* ------------------------------------------------------------------ */

async function findCustomRule(restaurantId) {
    return FoodRestaurantCommission.findOne({
        $or: [{ restaurantId: toOid(restaurantId) }, { restaurant: toOid(restaurantId) }],
        status: { $ne: false }
    }).lean();
}

/**
 * Decides which commission applies to a new order and computes it from the food subtotal only.
 * The result is stored on the order, so later league changes never alter it.
 */
export async function resolveOrderCommission({ restaurantId, baseAmount, at = new Date() }) {
    const base = Math.max(0, Number(baseAmount) || 0);
    const monthKey = monthKeyOf(at);
    const empty = {
        commissionAmount: 0,
        commissionType: 'percentage',
        commissionValue: 0,
        commissionRate: 0,
        source: 'default',
        leagueKey: '',
        monthKey,
        baseAmount: base
    };
    if (!restaurantId || !isOid(restaurantId?._id ?? restaurantId)) return empty;
    const rid = String(restaurantId?._id ?? restaurantId);

    const compute = (type, value) => {
        let amount = type === 'amount' ? value : base * (value / 100);
        amount = Math.max(0, Math.min(round2(amount), base));
        const rate = type === 'amount' ? (base > 0 ? round2((amount / base) * 100) : 0) : value;
        return { amount, rate };
    };

    // 1. Custom admin commission wins and disables league rules for this restaurant.
    const custom = await findCustomRule(rid);
    if (custom) {
        const type = custom.defaultCommission?.type === 'amount' ? 'amount' : 'percentage';
        const value = Math.max(0, Number(custom.defaultCommission?.value) || 0);
        const { amount, rate } = compute(type, value);
        return {
            ...empty,
            commissionAmount: amount,
            commissionType: type,
            commissionValue: value,
            commissionRate: rate,
            source: 'custom_admin'
        };
    }

    const settings = await getLeagueSettings();

    // 2. League is switched off globally -> fallback flat percentage.
    if (!settings.enabled) {
        const { amount, rate } = compute('percentage', settings.fallbackPercent);
        return { ...empty, commissionAmount: amount, commissionValue: settings.fallbackPercent, commissionRate: rate, source: 'default' };
    }

    // 3. Automatic league commission from this calendar month's delivered sales.
    const stats = await getMonthlyStats(rid, monthKey);
    const ev = evaluateLeague(stats.sales, settings.slabs);
    const { amount, rate } = compute('percentage', Number(ev.slab.commissionPercent) || 0);
    return {
        ...empty,
        commissionAmount: amount,
        commissionValue: Number(ev.slab.commissionPercent) || 0,
        commissionRate: rate,
        source: 'league',
        leagueKey: ev.slab.key
    };
}

/* ------------------------------------------------------------------ */
/* Restaurant dashboard data                                          */
/* ------------------------------------------------------------------ */

async function describeCommissionMode(restaurantId, settings) {
    const custom = await findCustomRule(restaurantId);
    if (custom) {
        return {
            mode: 'custom_admin',
            label: 'Custom Admin Commission',
            type: custom.defaultCommission?.type === 'amount' ? 'amount' : 'percentage',
            value: Number(custom.defaultCommission?.value) || 0,
            notes: custom.notes || ''
        };
    }
    if (!settings.enabled) {
        return { mode: 'default', label: 'Standard Commission', type: 'percentage', value: settings.fallbackPercent, notes: '' };
    }
    return { mode: 'league', label: 'Automatic League Commission', type: 'percentage', value: null, notes: '' };
}

function averageLeague({ lifetimeSales, completedMonthTotals, currentMonthSales, slabs }) {
    const completedMonths = completedMonthTotals.length;
    const completedSales = completedMonthTotals.reduce((s, m) => s + m.sales, 0);
    // No completed month yet -> provisional average from the running month.
    const provisional = completedMonths === 0;
    const months = provisional ? 1 : completedMonths;
    const avg = round2((provisional ? currentMonthSales : completedSales) / months);
    const ev = evaluateLeague(avg, slabs);
    return {
        lifetimeSales: round2(lifetimeSales),
        completedMonths,
        averageMonthlySales: avg,
        provisional,
        league: leagueView(ev.slab)
    };
}

export async function getRestaurantLeagueDashboard(restaurantId, { historyMonths = 12 } = {}) {
    if (!isOid(restaurantId)) throw new ValidationError('Invalid restaurant');
    const [settings, restaurant, monthly, snapshots] = await Promise.all([
        getLeagueSettings(),
        FoodRestaurant.findById(restaurantId).select('restaurantName createdAt').lean(),
        getRestaurantMonthlyTotals(restaurantId),
        FoodRestaurantMonthlyLeague.find({ restaurantId: toOid(restaurantId) }).lean()
    ]);
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const slabs = settings.slabs;
    const curKey = monthKeyOf();
    const byKey = new Map(monthly.map((m) => [m._id, m]));
    const snapByKey = new Map(snapshots.map((s) => [s.monthKey, s]));

    const cur = byKey.get(curKey) || { sales: 0, orders: 0, commission: 0 };
    const curSales = round2(cur.sales);
    const ev = evaluateLeague(curSales, slabs);
    const modeInfo = await describeCommissionMode(restaurantId, settings);

    // Month history: from the registration month up to last month (zero-sales months included), newest first.
    const regKey = monthKeyOf(restaurant.createdAt || new Date());
    const history = [];
    for (let k = prevMonthKey(curKey), guard = 0; monthIndex(k) >= monthIndex(regKey) && guard < 600; k = prevMonthKey(k), guard++) {
        const live = byKey.get(k) || { sales: 0, orders: 0, commission: 0 };
        const snap = snapByKey.get(k);
        const sales = round2(snap ? snap.sales : live.sales);
        const lev = evaluateLeague(sales, slabs);
        const commission = round2(snap ? snap.commissionDeducted : live.commission);
        history.push({
            monthKey: k,
            label: monthLabel(k),
            sales,
            orders: snap ? snap.orders : live.orders,
            leagueKey: snap?.leagueKey || lev.slab.key,
            leagueName: snap?.leagueName || lev.slab.name,
            leagueCommissionPercent: snap ? snap.slabCommissionPercent : lev.slab.commissionPercent,
            commissionDeducted: commission,
            effectiveCommissionPercent: sales > 0 ? round2((commission / sales) * 100) : 0
        });
    }

    const lifetimeSales = monthly.reduce((s, m) => s + (m.sales || 0), 0);
    const completedTotals = history.map((h) => ({ sales: h.sales }));
    const average = averageLeague({
        lifetimeSales,
        completedMonthTotals: completedTotals,
        currentMonthSales: curSales,
        slabs
    });

    return {
        leagueSystemEnabled: settings.enabled,
        commissionMode: modeInfo,
        currentMonth: {
            monthKey: curKey,
            label: monthLabel(curKey),
            sales: curSales,
            orders: cur.orders || 0,
            league: leagueView(ev.slab),
            // Rate shown to the restaurant is what will actually be applied to its next order.
            commissionPercent: modeInfo.mode === 'custom_admin' ? modeInfo.value : modeInfo.mode === 'default' ? modeInfo.value : ev.slab.commissionPercent,
            commissionType: modeInfo.mode === 'custom_admin' ? modeInfo.type : 'percentage',
            leagueCommissionPercent: ev.slab.commissionPercent,
            commissionDeducted: round2(cur.commission),
            nextLeague: ev.next ? leagueView(ev.next) : null,
            remainingToNext: ev.remaining,
            progressPercent: ev.progressPercent,
            rangeMin: ev.min,
            rangeMax: ev.max,
            resetsOn: monthRange(curKey).end
        },
        averagePerformance: average,
        history: history.slice(0, Math.max(1, Math.min(60, Number(historyMonths) || 12))),
        slabs: slabs.map((s, i) => ({
            key: s.key,
            name: s.name,
            commissionPercent: s.commissionPercent,
            color: s.color || '',
            from: i === 0 ? 0 : slabs[i - 1].maxSales,
            to: s.maxSales
        }))
    };
}

/* ------------------------------------------------------------------ */
/* Month-end snapshots (history that survives slab edits)             */
/* ------------------------------------------------------------------ */

let finalizing = false;

/** Idempotent: stores a frozen row for each finished (restaurant, month) that has sales. */
export async function finalizeCompletedMonths() {
    if (finalizing) return { upserted: 0 };
    finalizing = true;
    try {
        const settings = await getLeagueSettings();
        const curKey = monthKeyOf();
        const curRange = monthRange(curKey);

        const latest = await FoodRestaurantMonthlyLeague.findOne().sort({ monthKey: -1 }).select('monthKey').lean();
        const fromKey = latest?.monthKey || null;
        const fromDate = fromKey ? monthRange(fromKey).start : new Date(0);

        const rows = await FoodOrder.aggregate([
            { $match: { ...ELIGIBLE_ORDER_MATCH, createdAt: { $gte: new Date(fromDate.getTime() - 40 * 24 * 3600 * 1000) } } },
            EFF_DATE_STAGE,
            { $match: { effDate: { $gte: fromDate, $lt: curRange.start } } },
            {
                $group: {
                    _id: {
                        restaurantId: '$restaurantId',
                        monthKey: { $dateToString: { format: '%Y-%m', date: '$effDate', timezone: IST_TZ } }
                    },
                    sales: { $sum: { $ifNull: ['$pricing.subtotal', 0] } },
                    orders: { $sum: 1 },
                    commission: { $sum: { $ifNull: ['$pricing.restaurantCommission', 0] } }
                }
            }
        ]);

        if (!rows.length) return { upserted: 0 };
        const ops = rows.map((r) => {
            const sales = round2(r.sales);
            const ev = evaluateLeague(sales, settings.slabs);
            return {
                updateOne: {
                    filter: { restaurantId: r._id.restaurantId, monthKey: r._id.monthKey },
                    update: {
                        $setOnInsert: {
                            sales,
                            orders: r.orders,
                            commissionDeducted: round2(r.commission),
                            leagueKey: ev.slab.key,
                            leagueName: ev.slab.name,
                            slabCommissionPercent: ev.slab.commissionPercent
                        }
                    },
                    upsert: true
                }
            };
        });
        const res = await FoodRestaurantMonthlyLeague.bulkWrite(ops, { ordered: false });
        return { upserted: res.upsertedCount || 0 };
    } catch (err) {
        logger.error(`Commission league month finalize failed: ${err.message}`);
        return { upserted: 0, error: err.message };
    } finally {
        finalizing = false;
    }
}

/* ------------------------------------------------------------------ */
/* Admin: restaurant list with league filter                          */
/* ------------------------------------------------------------------ */

function adminZoneFilter(adminContext, isSuper, normalizeIds) {
    if (!adminContext || isSuper) return null;
    const ids = normalizeIds(adminContext.food_zone_ids || adminContext.zone_ids || []).map((z) => String(z));
    return ids.map(toOid);
}

export async function listRestaurantsByLeague(query = {}, scope = {}) {
    const settings = await getLeagueSettings();
    const slabs = settings.slabs;
    const curKey = monthKeyOf();
    const range = monthRange(curKey);

    const filter = { status: 'approved' };
    if (scope.zoneIds) filter.zoneId = { $in: scope.zoneIds };
    if (isOid(query.zoneId)) {
        if (scope.zoneIds && !scope.zoneIds.some((z) => String(z) === String(query.zoneId))) {
            filter.zoneId = { $in: [] };
        } else {
            filter.zoneId = toOid(query.zoneId);
        }
    }
    const search = String(query.search || '').trim();
    if (search) {
        const esc = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [{ restaurantName: new RegExp(esc, 'i') }, { ownerName: new RegExp(esc, 'i') }];
    }

    const [restaurants, salesRows, customRows, zones] = await Promise.all([
        FoodRestaurant.find(filter).select('restaurantName ownerName zoneId profileImage createdAt').lean(),
        FoodOrder.aggregate([
            { $match: { ...ELIGIBLE_ORDER_MATCH } },
            EFF_DATE_STAGE,
            { $match: { effDate: { $gte: range.start, $lt: range.end } } },
            {
                $group: {
                    _id: '$restaurantId',
                    sales: { $sum: { $ifNull: ['$pricing.subtotal', 0] } },
                    orders: { $sum: 1 },
                    commission: { $sum: { $ifNull: ['$pricing.restaurantCommission', 0] } }
                }
            }
        ]),
        FoodRestaurantCommission.find({ status: { $ne: false } }).lean(),
        FoodZone.find({}).select('name zoneName').lean()
    ]);

    const salesBy = new Map(salesRows.map((r) => [String(r._id), r]));
    const customBy = new Map(customRows.map((r) => [String(r.restaurantId || r.restaurant), r]));
    const zoneName = new Map(zones.map((z) => [String(z._id), z.zoneName || z.name || '']));

    const rows = restaurants.map((r) => {
        const s = salesBy.get(String(r._id)) || { sales: 0, orders: 0, commission: 0 };
        const sales = round2(s.sales);
        const ev = evaluateLeague(sales, slabs);
        const custom = customBy.get(String(r._id));
        const customActive = Boolean(custom);
        return {
            restaurantId: String(r._id),
            name: r.restaurantName || '',
            ownerName: r.ownerName || '',
            profileImage: r.profileImage?.url || r.profileImage || '',
            zoneId: r.zoneId ? String(r.zoneId) : '',
            zoneName: r.zoneId ? zoneName.get(String(r.zoneId)) || '' : '',
            monthlySales: sales,
            monthlyOrders: s.orders,
            commissionDeducted: round2(s.commission),
            league: leagueView(ev.slab),
            remainingToNext: ev.remaining,
            nextLeague: ev.next ? leagueView(ev.next) : null,
            commissionMode: customActive ? 'custom_admin' : settings.enabled ? 'league' : 'default',
            commissionModeLabel: customActive ? 'Custom Admin Commission' : settings.enabled ? 'Automatic League Commission' : 'Standard Commission',
            appliedCommission: customActive
                ? { type: custom.defaultCommission?.type === 'amount' ? 'amount' : 'percentage', value: Number(custom.defaultCommission?.value) || 0 }
                : { type: 'percentage', value: settings.enabled ? ev.slab.commissionPercent : settings.fallbackPercent },
            customNotes: custom?.notes || ''
        };
    });

    const counts = Object.fromEntries(slabs.map((s) => [s.key, 0]));
    rows.forEach((r) => { counts[r.league.key] = (counts[r.league.key] || 0) + 1; });

    const leagueFilter = String(query.league || '').trim();
    let filtered = leagueFilter ? rows.filter((r) => r.league.key === leagueFilter) : rows;
    const modeFilter = String(query.mode || '').trim();
    if (modeFilter) filtered = filtered.filter((r) => r.commissionMode === modeFilter);

    filtered.sort((a, b) => b.monthlySales - a.monthlySales || a.name.localeCompare(b.name));

    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const page = Math.max(1, Number(query.page) || 1);
    const total = filtered.length;

    return {
        monthKey: curKey,
        monthLabel: monthLabel(curKey),
        leagueSystemEnabled: settings.enabled,
        slabs: slabs.map((s) => ({ key: s.key, name: s.name, commissionPercent: s.commissionPercent, color: s.color || '' })),
        counts: slabs.map((s) => ({ key: s.key, name: s.name, color: s.color || '', count: counts[s.key] || 0 })),
        totalRestaurants: rows.length,
        total,
        page,
        limit,
        restaurants: filtered.slice((page - 1) * limit, page * limit)
    };
}

/* ------------------------------------------------------------------ */
/* Admin: per-restaurant override                                     */
/* ------------------------------------------------------------------ */

export async function setRestaurantCommissionMode(restaurantId, body = {}, actor = {}) {
    if (!isOid(restaurantId)) throw new ValidationError('Invalid restaurant');
    const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName').lean();
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const mode = String(body.mode || '').trim();
    if (!['league', 'custom'].includes(mode)) throw new ValidationError('mode must be "league" or "custom"');
    const note = String(body.note || '').trim().slice(0, 500);

    const existing = await FoodRestaurantCommission.findOne({ restaurantId: toOid(restaurantId) });
    const snapshotOf = (doc) =>
        doc
            ? { mode: doc.status !== false ? 'custom_admin' : 'league', type: doc.defaultCommission?.type, value: doc.defaultCommission?.value, notes: doc.notes }
            : { mode: 'league' };
    const before = snapshotOf(existing);

    if (mode === 'league') {
        if (existing && existing.status !== false) {
            existing.status = false;
            if (note) existing.notes = note;
            await existing.save();
        }
        await writeAudit({
            action: 'restaurant_league_enabled',
            restaurantId: toOid(restaurantId),
            restaurantName: restaurant.restaurantName,
            before,
            after: { mode: 'league' },
            note,
            actor
        });
    } else {
        const type = body.type === 'amount' ? 'amount' : 'percentage';
        const value = Number(body.value);
        if (!Number.isFinite(value) || value < 0) throw new ValidationError('Enter a valid commission value');
        if (type === 'percentage' && value > 100) throw new ValidationError('Percentage cannot exceed 100');

        if (existing) {
            existing.defaultCommission = { type, value: round2(value) };
            existing.status = true;
            existing.notes = note || existing.notes || '';
            await existing.save();
        } else {
            await FoodRestaurantCommission.create({
                restaurantId: toOid(restaurantId),
                defaultCommission: { type, value: round2(value) },
                notes: note,
                status: true
            });
        }
        await writeAudit({
            action: before.mode === 'custom_admin' ? 'restaurant_custom_updated' : 'restaurant_custom_set',
            restaurantId: toOid(restaurantId),
            restaurantName: restaurant.restaurantName,
            before,
            after: { mode: 'custom_admin', type, value: round2(value) },
            note,
            actor
        });
    }
    return { restaurantId: String(restaurantId), mode: mode === 'custom' ? 'custom_admin' : 'league' };
}

/** Audit helper for the legacy Restaurant Commission CRUD screen. */
export async function auditLegacyCommissionChange({ action, restaurantId, before, after, note = '', actor = {} }) {
    let restaurantName = '';
    try {
        if (isOid(restaurantId)) {
            const r = await FoodRestaurant.findById(restaurantId).select('restaurantName').lean();
            restaurantName = r?.restaurantName || '';
        }
    } catch (e) { /* non-fatal */ }
    await writeAudit({
        action,
        restaurantId: isOid(restaurantId) ? toOid(restaurantId) : null,
        restaurantName,
        before,
        after,
        note,
        actor
    });
}

export async function listCommissionAudit(query = {}) {
    const filter = {};
    if (isOid(query.restaurantId)) filter.restaurantId = toOid(query.restaurantId);
    if (query.action) filter.action = String(query.action);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const page = Math.max(1, Number(query.page) || 1);
    const [items, total] = await Promise.all([
        FoodCommissionLeagueAudit.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        FoodCommissionLeagueAudit.countDocuments(filter)
    ]);
    return { items, total, page, limit };
}

/* ------------------------------------------------------------------ */
/* Admin: analytics with date + zone filters                          */
/* ------------------------------------------------------------------ */

/** Turns filter params into a UTC range (null = all time) plus a label. */
export function resolveDateFilter(q = {}) {
    const range = String(q.range || 'current_month');
    const today = monthKeyOf();
    switch (range) {
        case 'day': {
            const r = dayRange(q.date);
            if (!r) throw new ValidationError('Select a valid date');
            return { ...r, label: `Day ${q.date}`, range };
        }
        case 'custom': {
            const a = dayRange(q.from);
            const b = dayRange(q.to);
            if (!a || !b) throw new ValidationError('Select a valid from and to date');
            if (b.start < a.start) throw new ValidationError('"To" date cannot be before "From" date');
            return { start: a.start, end: b.end, label: `${q.from} to ${q.to}`, range };
        }
        case 'today':
        case 'this_week':
        case 'last_week': {
            const ist = new Date(Date.now() + IST_OFFSET_MS);
            const dayStartUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
            const DAY = 24 * 3600 * 1000;
            if (range === 'today') {
                return { start: new Date(dayStartUtc), end: new Date(dayStartUtc + DAY), label: 'Today', range };
            }
            const sinceMonday = (ist.getUTCDay() + 6) % 7; // Monday-based week
            const weekStart = dayStartUtc - sinceMonday * DAY;
            const start = range === 'this_week' ? weekStart : weekStart - 7 * DAY;
            return { start: new Date(start), end: new Date(start + 7 * DAY), label: range === 'this_week' ? 'This week' : 'Last week', range };
        }
        case 'previous_month': {
            const k = prevMonthKey(today);
            return { ...monthRange(k), label: monthLabel(k), range };
        }
        case 'month': {
            const r = monthRange(q.month);
            if (!r) throw new ValidationError('Select a valid month');
            return { ...r, label: monthLabel(q.month), range };
        }
        case 'all':
            return { start: null, end: null, label: 'All time', range };
        case 'current_month':
        default:
            return { ...monthRange(today), label: monthLabel(today), range: 'current_month' };
    }
}

function effDateMatch(df) {
    if (!df.start) return null;
    return { effDate: { $gte: df.start, $lt: df.end } };
}

const CANCELLED_STATUSES = ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'];

function summaryGroupStage(idExpr) {
    const delivered = { $and: [{ $eq: ['$orderStatus', 'delivered'] }, { $ne: ['$payment.status', 'refunded'] }] };
    return {
        $group: {
            _id: idExpr,
            totalOrders: { $sum: 1 },
            completedOrders: { $sum: { $cond: [delivered, 1, 0] } },
            cancelledOrders: { $sum: { $cond: [{ $in: ['$orderStatus', CANCELLED_STATUSES] }, 1, 0] } },
            sales: { $sum: { $cond: [delivered, { $ifNull: ['$pricing.subtotal', 0] }, 0] } },
            commission: { $sum: { $cond: [delivered, { $ifNull: ['$pricing.restaurantCommission', 0] }, 0] } }
        }
    };
}

function finishSummary(r = {}) {
    const completed = r.completedOrders || 0;
    const sales = round2(r.sales);
    return {
        totalOrders: r.totalOrders || 0,
        completedOrders: completed,
        cancelledOrders: r.cancelledOrders || 0,
        totalSales: sales,
        totalCommission: round2(r.commission),
        aov: completed > 0 ? round2(sales / completed) : 0
    };
}

/** Orders placed but not yet paid / abandoned never count as an order in analytics. */
const NOT_ABANDONED = { orderStatus: { $ne: 'pending_payment' } };

export async function getRestaurantPerformance(restaurantId, q = {}) {
    if (!isOid(restaurantId)) throw new ValidationError('Invalid restaurant');
    const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName ownerName zoneId createdAt').lean();
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const df = resolveDateFilter(q);
    const match = { restaurantId: toOid(restaurantId), ...NOT_ABANDONED };
    if (isOid(q.zoneId)) match.zoneId = toOid(q.zoneId);

    const dm = effDateMatch(df);
    const pipelineBase = [{ $match: match }, EFF_DATE_STAGE, ...(dm ? [{ $match: dm }] : [])];

    const [summaryRows, zoneRows, settings, dashboard, commissionHistory] = await Promise.all([
        FoodOrder.aggregate([...pipelineBase, summaryGroupStage(null)]),
        FoodOrder.aggregate([...pipelineBase, summaryGroupStage('$zoneId')]),
        getLeagueSettings(),
        getRestaurantLeagueDashboard(restaurantId, { historyMonths: 36 }),
        // Per-order commission-rate usage (rates are stored on each order and never rewritten)
        FoodOrder.aggregate([
            { $match: { restaurantId: toOid(restaurantId), orderStatus: 'delivered', 'payment.status': { $ne: 'refunded' } } },
            EFF_DATE_STAGE,
            ...(dm ? [{ $match: dm }] : []),
            {
                $group: {
                    _id: {
                        month: { $dateToString: { format: '%Y-%m', date: '$effDate', timezone: IST_TZ } },
                        source: { $ifNull: ['$pricing.restaurantCommissionSource', ''] },
                        league: { $ifNull: ['$pricing.restaurantCommissionLeague', ''] },
                        rate: { $ifNull: ['$pricing.restaurantCommissionRate', null] }
                    },
                    orders: { $sum: 1 },
                    sales: { $sum: { $ifNull: ['$pricing.subtotal', 0] } },
                    commission: { $sum: { $ifNull: ['$pricing.restaurantCommission', 0] } }
                }
            },
            { $sort: { '_id.month': -1, '_id.rate': 1 } }
        ])
    ]);

    const zoneIds = zoneRows.map((z) => z._id).filter(Boolean);
    const zoneDocs = zoneIds.length ? await FoodZone.find({ _id: { $in: zoneIds } }).select('name zoneName').lean() : [];
    const zoneName = new Map(zoneDocs.map((z) => [String(z._id), z.zoneName || z.name || '']));

    const slabByKey = new Map(settings.slabs.map((s) => [s.key, s]));

    return {
        restaurant: {
            id: String(restaurant._id),
            name: restaurant.restaurantName || '',
            ownerName: restaurant.ownerName || '',
            registeredAt: restaurant.createdAt
        },
        filter: { range: df.range, label: df.label, start: df.start, end: df.end, zoneId: q.zoneId || '' },
        summary: finishSummary(summaryRows[0]),
        byZone: zoneRows.map((z) => ({ zoneId: z._id ? String(z._id) : '', zoneName: z._id ? zoneName.get(String(z._id)) || 'Unknown zone' : 'No zone', ...finishSummary(z) })),
        currentLeague: dashboard.currentMonth.league,
        currentCommissionPercent: dashboard.currentMonth.commissionPercent,
        currentCommissionType: dashboard.currentMonth.commissionType,
        commissionMode: dashboard.commissionMode,
        currentMonth: dashboard.currentMonth,
        averagePerformance: dashboard.averagePerformance,
        monthlyHistory: dashboard.history,
        commissionRecords: commissionHistory.map((r) => ({
            month: r._id.month,
            monthLabel: monthLabel(r._id.month),
            source: r._id.source || 'legacy',
            league: r._id.league ? slabByKey.get(r._id.league)?.name || r._id.league : '',
            ratePercent: r._id.rate,
            orders: r.orders,
            sales: round2(r.sales),
            commission: round2(r.commission)
        }))
    };
}

/** Weights of the overall performance score (sum = 100). Shown to the admin in the UI. */
export const PERFORMANCE_SCORE_WEIGHTS = { sales: 40, orders: 25, completionRate: 20, rating: 15 };

/**
 * Restaurant leaderboard for a day / week / month / custom range.
 * Score (0-100) = sales (relative to best) + completed orders (relative to best)
 *               + completion rate + customer rating, using PERFORMANCE_SCORE_WEIGHTS.
 */
export async function getRestaurantLeaderboard(q = {}, scope = {}) {
    const df = resolveDateFilter(q);
    const dm = effDateMatch(df);
    const match = { ...NOT_ABANDONED };
    if (scope.zoneIds) match.zoneId = { $in: scope.zoneIds };
    if (isOid(q.zoneId)) match.zoneId = toOid(q.zoneId);

    const rows = await FoodOrder.aggregate([
        { $match: match },
        EFF_DATE_STAGE,
        ...(dm ? [{ $match: dm }] : []),
        summaryGroupStage('$restaurantId')
    ]);

    const restaurants = await FoodRestaurant.find({ _id: { $in: rows.map((r) => r._id).filter(Boolean) } })
        .select('restaurantName profileImage rating totalRatings zoneId')
        .populate('zoneId', 'name zoneName')
        .lean();
    const byId = new Map(restaurants.map((r) => [String(r._id), r]));

    const list = rows
        .filter((r) => r._id && byId.has(String(r._id)))
        .map((r) => {
            const rest = byId.get(String(r._id));
            const sm = finishSummary(r);
            const decided = sm.completedOrders + sm.cancelledOrders;
            return {
                restaurantId: String(r._id),
                name: rest.restaurantName || 'Unknown',
                image: rest.profileImage || '',
                zoneName: rest.zoneId?.zoneName || rest.zoneId?.name || '',
                rating: round2(rest.rating || 0),
                reviews: Number(rest.totalRatings || 0),
                completionRate: decided > 0 ? round2((sm.completedOrders / decided) * 100) : 0,
                ...sm
            };
        });

    const maxSales = Math.max(0, ...list.map((r) => r.totalSales));
    const maxOrders = Math.max(0, ...list.map((r) => r.completedOrders));
    const W = PERFORMANCE_SCORE_WEIGHTS;
    for (const r of list) {
        r.score = round2(
            (maxSales > 0 ? (r.totalSales / maxSales) * W.sales : 0) +
                (maxOrders > 0 ? (r.completedOrders / maxOrders) * W.orders : 0) +
                (r.completionRate / 100) * W.completionRate +
                (Math.min(r.rating, 5) / 5) * W.rating
        );
    }
    list.sort((a, b) => b.score - a.score || b.totalSales - a.totalSales);
    list.forEach((r, i) => {
        r.rank = i + 1;
    });

    const totals = list.reduce(
        (t, r) => ({
            totalOrders: t.totalOrders + r.totalOrders,
            completedOrders: t.completedOrders + r.completedOrders,
            cancelledOrders: t.cancelledOrders + r.cancelledOrders,
            totalSales: t.totalSales + r.totalSales,
            totalCommission: t.totalCommission + r.totalCommission
        }),
        { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalSales: 0, totalCommission: 0 }
    );

    return {
        filter: { range: df.range, label: df.label, start: df.start, end: df.end },
        weights: W,
        totals: { ...totals, totalSales: round2(totals.totalSales), totalCommission: round2(totals.totalCommission), restaurants: list.length },
        restaurants: list
    };
}

/** Compare zones (and restaurants within them) over a date range. */
export async function getZoneComparison(q = {}, scope = {}) {
    const df = resolveDateFilter(q);
    const dm = effDateMatch(df);
    const match = { ...NOT_ABANDONED };
    if (scope.zoneIds) match.zoneId = { $in: scope.zoneIds };
    if (isOid(q.zoneId)) match.zoneId = toOid(q.zoneId);

    const base = [{ $match: match }, EFF_DATE_STAGE, ...(dm ? [{ $match: dm }] : [])];
    const [zoneRows, restaurantRows] = await Promise.all([
        FoodOrder.aggregate([...base, summaryGroupStage('$zoneId'), { $sort: { sales: -1 } }]),
        FoodOrder.aggregate([
            ...base,
            summaryGroupStage({ restaurantId: '$restaurantId', zoneId: '$zoneId' }),
            { $sort: { sales: -1 } },
            { $limit: 500 }
        ])
    ]);

    const [zones, restaurants] = await Promise.all([
        FoodZone.find({}).select('name zoneName').lean(),
        FoodRestaurant.find({ _id: { $in: restaurantRows.map((r) => r._id.restaurantId) } }).select('restaurantName').lean()
    ]);
    const zoneName = new Map(zones.map((z) => [String(z._id), z.zoneName || z.name || '']));
    const restName = new Map(restaurants.map((r) => [String(r._id), r.restaurantName || '']));

    return {
        filter: { range: df.range, label: df.label, start: df.start, end: df.end },
        zones: zoneRows.map((z) => ({
            zoneId: z._id ? String(z._id) : '',
            zoneName: z._id ? zoneName.get(String(z._id)) || 'Unknown zone' : 'No zone',
            ...finishSummary(z)
        })),
        restaurants: restaurantRows.map((r) => ({
            restaurantId: String(r._id.restaurantId),
            name: restName.get(String(r._id.restaurantId)) || 'Unknown',
            zoneId: r._id.zoneId ? String(r._id.zoneId) : '',
            zoneName: r._id.zoneId ? zoneName.get(String(r._id.zoneId)) || '' : 'No zone',
            ...finishSummary(r)
        }))
    };
}

export function buildAdminScope(adminContext, isSuperAdminLike, normalizeObjectIdList) {
    const ids = adminZoneFilter(adminContext, adminContext ? isSuperAdminLike(adminContext) : true, normalizeObjectIdList);
    return { zoneIds: ids };
}

/** The commission a restaurant would be charged on its next order (for profile / finance displays). */
export async function getCurrentCommissionDisplay(restaurantId) {
    const r = await resolveOrderCommission({ restaurantId, baseAmount: 100 });
    const type = r.commissionType === 'amount' ? 'amount' : 'percentage';
    const value = type === 'amount' ? r.commissionValue : r.commissionRate;
    return {
        type,
        value,
        formattedRate: type === 'amount' ? `₹${value}` : `${value}%`,
        source: r.source,
        leagueKey: r.leagueKey
    };
}
