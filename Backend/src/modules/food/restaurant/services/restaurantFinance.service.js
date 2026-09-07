import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { getRestaurantWithdrawalSettings } from '../../admin/services/admin.service.js';

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

    const globalEstimatedPayout = allCompletedTx.reduce(
        (sum, tx) => sum + (Number(resolveTxPayout(tx)) || 0),
        0
    );

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
        orders: currentCycleOrders
    };

    // Invoice Summary (derived from current cycle or broader if needed)
    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
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
            address
        },
        currentCycle,
        invoiceSummary,
        pastCycles: pastCyclesResult
    };
}

