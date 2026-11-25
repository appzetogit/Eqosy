import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { getRestaurantWithdrawalSettings } from '../../admin/services/admin.service.js';
import { getCurrentCommissionDisplay } from '../../admin/services/commissionLeague.service.js';

function toTwoDigitYearString(dateObj) {
    const y = String(dateObj.getFullYear());
    return y.slice(-2);
}

function monthShort(monthIndex) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthIndex] || 'Jan';
}

function getFixedCurrentCycleWindow(now = new Date()) {
    const startDay = 15;
    
    let year = now.getFullYear();
    let month = now.getMonth();

    // If before start day, settlement belongs to previous month cycle.
    if (now.getDate() < startDay) {
        month = month - 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }

    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    // End should be either fixed 21 or now, let's make it more inclusive for "Current Cycle"
    // Users want to see their active earnings, so we extend it to 'now'
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return {
        start,
        end,
        startMeta: { day: String(startDay), month: monthShort(month), year: toTwoDigitYearString(new Date(year, month, startDay)) },
        endMeta: { day: String(now.getDate()), month: monthShort(now.getMonth()), year: toTwoDigitYearString(now) }
    };
}

function parseISODateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseISODateParamEnd(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d;
}

function resolveTxPayout(tx) {
    const rawShare = Number(tx?.amounts?.restaurantShare);
    if (Number.isFinite(rawShare) && rawShare > 0) {
        return rawShare;
    }
    const order = (tx?.orderId && typeof tx.orderId === 'object') ? tx.orderId : {};
    const subtotal = Number(order?.pricing?.subtotal) || 0;
    const packagingFee = Number(order?.pricing?.packagingFee) || 0;
    const restaurantCommission = Number(tx?.amounts?.restaurantCommission ?? order?.pricing?.restaurantCommission ?? 0);
    return Math.max(0, subtotal + packagingFee - restaurantCommission);
}

function resolveTxCommission(tx) {
    const rawComm = Number(tx?.amounts?.restaurantCommission);
    if (Number.isFinite(rawComm) && rawComm >= 0) {
        return rawComm;
    }
    const order = (tx?.orderId && typeof tx.orderId === 'object') ? tx.orderId : {};
    return Number(order?.pricing?.restaurantCommission) || 0;
}

function isCompletedTx(tx) {
    if (!tx) return false;
    const order = (tx.orderId && typeof tx.orderId === 'object') ? tx.orderId : {};
    const orderStatus = String(order.orderStatus || order.deliveryState?.currentPhase || order.deliveryState?.status || '').toLowerCase();
    if (['delivered', 'completed'].includes(orderStatus)) return true;
    // Earnings count only for completed orders. An online-paid (captured) order that is still in progress
    // or got cancelled must not show up as restaurant earning.
    if (order.orderStatus) return false;
    const txStatus = String(tx.status || '').toLowerCase();
    const payStatus = String(tx.payment?.status || '').toLowerCase();
    return ['captured', 'authorized', 'settled', 'completed', 'paid'].includes(txStatus) || payStatus === 'paid';
}

export async function getRestaurantFinance(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    // Fetch restaurant profile for header display.
    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName addressLine1 addressLine2 area city state pincode location')
        .lean();

    const address =
        restaurant?.location?.formattedAddress ||
        (restaurant?.addressLine1
            ? [restaurant.addressLine1, restaurant.addressLine2, restaurant.area].filter(Boolean).join(', ')
            : restaurant?.addressLine1 || '');

    const nowWindow = getFixedCurrentCycleWindow(new Date());

    // Current cycle: sum ledger payouts in the fixed window.
    const rawCurrentTransactions = await FoodTransaction.find({
        restaurantId: rid,
        createdAt: { $gte: nowWindow.start, $lte: nowWindow.end }
    })
        .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const currentTransactions = (rawCurrentTransactions || []).filter(isCompletedTx);

    const currentCycleOrders = currentTransactions.map((tx) => {
        const order = (tx.orderId && typeof tx.orderId === 'object') ? tx.orderId : {};
        const items = Array.isArray(order.items) ? order.items : [];
        const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
        const orderTotalExclTax = Math.max(
            0,
            Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
        );
        const payout = resolveTxPayout(tx);
        const commission = resolveTxCommission(tx);

        return {
            orderId: order?.orderId || tx.orderReadableId,
            createdAt: tx.createdAt,
            items,
            foodNames,
            orderTotal: orderTotalExclTax,
            totalAmount: tx.amounts?.totalCustomerPaid || order?.pricing?.total || 0,
            payout,
            commission,
            paymentMethod: tx.paymentMethod || order?.payment?.method,
            orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status || tx.status,
            status: tx.status
        };
    });

    const currentCycleEstimatedPayout = currentCycleOrders.reduce(
        (sum, o) => sum + (Number(o.payout) || 0),
        0
    );

    // Calculate global estimated payout (all completed/captured transactions)
    const rawAllTransactions = await FoodTransaction.find({
        restaurantId: rid
    })
        .populate('orderId', 'pricing orderStatus deliveryState')
        .select('amounts.restaurantShare amounts.restaurantCommission status payment orderId')
        .lean();

    const allCompletedTx = (rawAllTransactions || []).filter(isCompletedTx);

    const txPayout = allCompletedTx.reduce(
        (sum, tx) => sum + (Number(resolveTxPayout(tx)) || 0),
        0
    );

    // Backup query: count delivered orders directly from FoodOrder to ensure no delivered order earnings are missed
    const deliveredOrders = await FoodOrder.find({
        restaurantId: rid,
        $or: [
            { orderStatus: { $in: ['delivered', 'completed'] } },
            { 'deliveryState.currentPhase': { $in: ['delivered', 'completed'] } }
        ]
    }).select('pricing orderStatus').lean();

    // Each order is counted exactly once: through its transaction when it has one (that figure already accounts
    // for restaurant-funded discounts), otherwise from the order itself. Taking max(txPayout, ordersPayout) as
    // before over-paid whenever the order-based figure was larger.
    const orderIdsWithTx = new Set(
        allCompletedTx.map((tx) => String(tx?.orderId?._id || tx?.orderId || '')).filter(Boolean)
    );
    const ordersWithoutTxPayout = (deliveredOrders || []).reduce((sum, order) => {
        if (orderIdsWithTx.has(String(order._id))) return sum;
        const subtotal = Number(order?.pricing?.subtotal) || 0;
        const packagingFee = Number(order?.pricing?.packagingFee) || 0;
        const commission = Number(order?.pricing?.restaurantCommission) || 0;
        const share = Math.max(0, subtotal + packagingFee - commission);
        return sum + share;
    }, 0);

    const globalEstimatedPayout = Math.round((txPayout + ordersWithoutTxPayout) * 100) / 100;

    // Subtract pending AND approved/completed/processing/settled withdrawals from available balance.
    // Rejected withdrawals are returned to available balance.
    const withdrawalsAgg = await FoodRestaurantWithdrawal.aggregate([
        {
            $match: {
                restaurantId: rid,
                $expr: {
                    $in: [{ $toLower: { $trim: { input: '$status' } } }, ['pending', 'approved', 'processing', 'completed', 'settled']]
                }
            }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeductedWithdrawals = Number(withdrawalsAgg?.[0]?.total || 0);
    const availableBalance = Math.max(0, globalEstimatedPayout - totalDeductedWithdrawals);
    const withdrawalSettings = await getRestaurantWithdrawalSettings();
    const minimumWithdrawalAmount = Number(withdrawalSettings?.minimumWithdrawalAmount) || 0;

    let commDisplay = { type: 'percentage', value: 10, formattedRate: '10%' };
    try {
        commDisplay = await getCurrentCommissionDisplay(rid);
    } catch (err) {}
    const commVal = Math.max(0, Number(commDisplay.value) || 0);
    const commType = commDisplay.type || 'percentage';
    const commissionRateFormatted = commDisplay.formattedRate || (commType === 'amount' ? `₹${commVal}` : `${commVal}%`);

    const currentCycle = {
        start: { ...nowWindow.startMeta },
        end: { ...nowWindow.endMeta },
        totalEarnings: currentCycleEstimatedPayout, // We still show current cycle earnings label
        totalWithdrawn: totalDeductedWithdrawals,
        estimatedPayout: currentCycleEstimatedPayout,
        netAvailable: availableBalance,
        minimumWithdrawalAmount,
        totalOrders: currentCycleOrders.length,
        payoutDate: null,
        commissionRate: commissionRateFormatted,
        adminCommission: { type: commType, value: commVal, formattedRate: commissionRateFormatted },
        orders: currentCycleOrders
    };

    // Invoice Summary (derived from current cycle or broader if needed)
    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0),
        commissionRate: commissionRateFormatted
    };

    // Past cycles: build from provided startDate/endDate query.
    const startDate = parseISODateParam(query.startDate);
    const endDate = parseISODateParamEnd(query.endDate);

    let pastCyclesResult = { orders: [], totalOrders: 0 };
    if (startDate && endDate) {
        const rawPastTransactions = await FoodTransaction.find({
            restaurantId: rid,
            createdAt: { $gte: startDate, $lte: endDate }
        })
            .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
            .sort({ createdAt: -1 })
            .lean();

        const pastTransactions = (rawPastTransactions || []).filter(isCompletedTx);

        const pastCycleOrders = pastTransactions.map((tx) => {
            const order = (tx.orderId && typeof tx.orderId === 'object') ? tx.orderId : {};
            const items = Array.isArray(order.items) ? order.items : [];
            const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
            const orderTotalExclTax = Math.max(
                0,
                Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
            );

            return {
                orderId: order?.orderId || tx.orderReadableId,
                createdAt: tx.createdAt,
                items,
                foodNames,
                orderTotal: orderTotalExclTax,
                totalAmount: tx.amounts?.totalCustomerPaid || order?.pricing?.total || 0,
                payout: resolveTxPayout(tx),
                commission: resolveTxCommission(tx),
                paymentMethod: tx.paymentMethod || order?.payment?.method,
                orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status || tx.status,
                status: tx.status
            };
        });

        pastCyclesResult = {
            orders: pastCycleOrders,
            totalOrders: pastCycleOrders.length
        };
    }

    return {
        restaurant: {
            name: restaurant?.restaurantName || '',
            restaurantId: restaurant?._id ? `REST${restaurant._id.toString().slice(-6).padStart(6, '0')}` : 'N/A',
            address,
            commissionRate: commissionRateFormatted,
            adminCommission: { type: commType, value: commVal, formattedRate: commissionRateFormatted }
        },
        commissionRate: commissionRateFormatted,
        adminCommission: { type: commType, value: commVal, formattedRate: commissionRateFormatted },
        currentCycle,
        // Lifetime figures so clients can show total earned / withdrawable balance without the cycle window.
        lifetimeEarnings: globalEstimatedPayout,
        availableBalance,
        invoiceSummary,
        pastCycles: pastCyclesResult
    };
}


const WITHDRAWAL_PAID_STATUSES = ['approved', 'processing', 'completed', 'settled'];

/**
 * Admin payout overview: for every restaurant, the same lifetime figures the restaurant sees in its own wallet
 * (getRestaurantFinance), plus what the platform still owes it.
 *   earned            = lifetime earning from completed orders
 *   paidOut           = approved / processed withdrawals (money already sent)
 *   pendingRequests   = withdrawal requests waiting for admin action
 *   availableBalance  = earned - paidOut - pendingRequests   (what the restaurant can still request)
 *   totalPayable      = earned - paidOut                     (what the platform still has to pay)
 * Query: search (restaurant name), onlyPayable ('true'), sort ('payable' | 'earned' | 'pending' | 'name').
 */
export async function getRestaurantPayoutOverview(query = {}) {
    const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const byRestaurant = new Map();
    const row = (rid) => {
        const key = String(rid);
        if (!byRestaurant.has(key)) {
            byRestaurant.set(key, {
                restaurantId: key,
                earned: 0,
                completedOrders: 0,
                paidOut: 0,
                paidCount: 0,
                pendingRequests: 0,
                pendingCount: 0,
                lastWithdrawalAt: null,
            });
        }
        return byRestaurant.get(key);
    };

    // 1. Earnings from transactions (same completion + payout rules as getRestaurantFinance).
    const countedOrderIds = new Set();
    const txCursor = FoodTransaction.find({ restaurantId: { $ne: null } })
        .populate('orderId', 'pricing orderStatus deliveryState')
        .select('restaurantId amounts.restaurantShare amounts.restaurantCommission status payment orderId')
        .lean()
        .cursor();
    for await (const tx of txCursor) {
        if (!isCompletedTx(tx)) continue;
        const r = row(tx.restaurantId);
        r.earned += Number(resolveTxPayout(tx)) || 0;
        r.completedOrders += 1;
        const oid = String(tx?.orderId?._id || tx?.orderId || '');
        if (oid) countedOrderIds.add(oid);
    }

    // 2. Delivered orders that never got a transaction row.
    const orderCursor = FoodOrder.find({
        $or: [
            { orderStatus: { $in: ['delivered', 'completed'] } },
            { 'deliveryState.currentPhase': { $in: ['delivered', 'completed'] } },
        ],
    }).select('restaurantId pricing').lean().cursor();
    for await (const order of orderCursor) {
        if (!order.restaurantId || countedOrderIds.has(String(order._id))) continue;
        const r = row(order.restaurantId);
        const share = Math.max(
            0,
            (Number(order?.pricing?.subtotal) || 0) + (Number(order?.pricing?.packagingFee) || 0) - (Number(order?.pricing?.restaurantCommission) || 0),
        );
        r.earned += share;
        r.completedOrders += 1;
    }

    // 3. Withdrawals: pending vs already paid (rejected ones go back to the balance and are ignored).
    const withdrawals = await FoodRestaurantWithdrawal.aggregate([
        { $project: { restaurantId: 1, amount: 1, createdAt: 1, status: { $toLower: { $trim: { input: '$status' } } } } },
        { $match: { status: { $in: ['pending', ...WITHDRAWAL_PAID_STATUSES] } } },
        {
            $group: {
                _id: { restaurantId: '$restaurantId', status: '$status' },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                last: { $max: '$createdAt' },
            },
        },
    ]);
    for (const w of withdrawals) {
        if (!w._id?.restaurantId) continue;
        const r = row(w._id.restaurantId);
        if (w._id.status === 'pending') {
            r.pendingRequests += Number(w.total) || 0;
            r.pendingCount += Number(w.count) || 0;
        } else {
            r.paidOut += Number(w.total) || 0;
            r.paidCount += Number(w.count) || 0;
        }
        if (w.last && (!r.lastWithdrawalAt || w.last > r.lastWithdrawalAt)) r.lastWithdrawalAt = w.last;
    }

    // 4. Names / bank details for the rows we have.
    const ids = [...byRestaurant.keys()].filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const restaurants = await FoodRestaurant.find({ _id: { $in: ids } })
        .select('restaurantName ownerName phone ownerPhone city area profileImage accountNumber ifscCode bankName upiId')
        .lean();
    const infoById = new Map(restaurants.map((r) => [String(r._id), r]));

    let rows = [...byRestaurant.values()].map((r) => {
        const info = infoById.get(r.restaurantId) || {};
        const earned = round(r.earned);
        const paidOut = round(r.paidOut);
        const pendingRequests = round(r.pendingRequests);
        const accountNumber = String(info.accountNumber || '');
        return {
            restaurantId: r.restaurantId,
            restaurantName: info.restaurantName || 'Deleted restaurant',
            ownerName: info.ownerName || '',
            phone: info.phone || info.ownerPhone || '',
            city: info.city || info.area || '',
            profileImage: info.profileImage || '',
            payoutTo: info.upiId
                ? `UPI ${info.upiId}`
                : accountNumber
                    ? `${info.bankName || 'Bank'} ••${accountNumber.slice(-4)}`
                    : '',
            completedOrders: r.completedOrders,
            earned,
            paidOut,
            paidCount: r.paidCount,
            pendingRequests,
            pendingCount: r.pendingCount,
            // Same formula as the restaurant's own wallet.
            availableBalance: round(Math.max(0, earned - paidOut - pendingRequests)),
            totalPayable: round(Math.max(0, earned - paidOut)),
            lastWithdrawalAt: r.lastWithdrawalAt,
        };
    });

    const totals = rows.reduce(
        (acc, r) => {
            acc.earned += r.earned;
            acc.paidOut += r.paidOut;
            acc.pendingRequests += r.pendingRequests;
            acc.pendingCount += r.pendingCount;
            acc.availableBalance += r.availableBalance;
            acc.totalPayable += r.totalPayable;
            if (r.totalPayable > 0) acc.restaurantsWithBalance += 1;
            return acc;
        },
        { earned: 0, paidOut: 0, pendingRequests: 0, pendingCount: 0, availableBalance: 0, totalPayable: 0, restaurantsWithBalance: 0 },
    );
    for (const k of ['earned', 'paidOut', 'pendingRequests', 'availableBalance', 'totalPayable']) totals[k] = round(totals[k]);
    totals.restaurantCount = rows.length;

    const search = String(query.search || '').trim().toLowerCase();
    if (search) rows = rows.filter((r) => r.restaurantName.toLowerCase().includes(search) || r.ownerName.toLowerCase().includes(search));
    if (String(query.onlyPayable) === 'true') rows = rows.filter((r) => r.totalPayable > 0);
    const sortKey = String(query.sort || 'payable');
    const sorters = {
        payable: (a, b) => b.totalPayable - a.totalPayable,
        earned: (a, b) => b.earned - a.earned,
        pending: (a, b) => b.pendingRequests - a.pendingRequests,
        name: (a, b) => a.restaurantName.localeCompare(b.restaurantName),
    };
    rows.sort(sorters[sortKey] || sorters.payable);

    return { totals, restaurants: rows, generatedAt: new Date() };
}

/**
 * Sales report for a restaurant: delivered orders only, with sales / earning / admin commission.
 * Query: from, to (ISO dates), page, limit.
 */
export async function getRestaurantSalesReport(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    const from = parseISODateParam(query.from);
    const to = parseISODateParamEnd(query.to);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);

    const filter = { restaurantId: rid };
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
    }

    const rawTx = await FoodTransaction.find(filter)
        .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const completed = (rawTx || []).filter(isCompletedTx);

    const rows = completed.map((tx) => {
        const order = (tx.orderId && typeof tx.orderId === 'object') ? tx.orderId : {};
        const items = (Array.isArray(order.items) ? order.items : []).map((it) => ({
            name: it?.name || '',
            quantity: Number(it?.quantity) || 1,
            price: Number(it?.price) || 0,
        }));
        const subtotal = Number(order?.pricing?.subtotal ?? tx?.pricing?.subtotal) || 0;
        const packagingFee = Number(order?.pricing?.packagingFee ?? tx?.pricing?.packagingFee) || 0;
        const commission = resolveTxCommission(tx);
        return {
            id: String(tx._id),
            orderId: order?.orderId || String(tx.orderId?._id || tx.orderId || ''),
            createdAt: tx.createdAt,
            items,
            sale: subtotal + packagingFee,
            customerPaid: Number(tx.amounts?.totalCustomerPaid) || 0,
            commission,
            earning: resolveTxPayout(tx),
            paymentMethod: tx.paymentMethod || order?.payment?.method || '',
            orderStatus: order?.orderStatus || tx.status,
            settled: Boolean(tx.settlement?.isRestaurantSettled),
        };
    });

    const round = (n) => Math.round(n * 100) / 100;
    const summary = rows.reduce(
        (acc, r) => {
            acc.totalOrders += 1;
            acc.totalSales += r.sale;
            acc.totalCommission += r.commission;
            acc.totalEarning += r.earning;
            if (r.settled) acc.settledEarning += r.earning;
            return acc;
        },
        { totalOrders: 0, totalSales: 0, totalCommission: 0, totalEarning: 0, settledEarning: 0 }
    );
    summary.totalSales = round(summary.totalSales);
    summary.totalCommission = round(summary.totalCommission);
    summary.totalEarning = round(summary.totalEarning);
    summary.settledEarning = round(summary.settledEarning);
    summary.pendingEarning = round(summary.totalEarning - summary.settledEarning);

    const total = rows.length;
    return {
        summary,
        orders: rows.slice((page - 1) * limit, page * limit),
        total,
        page,
        limit,
    };
}
