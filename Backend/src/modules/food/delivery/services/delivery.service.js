import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { DeliverySupportTicket } from '../models/supportTicket.model.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { FoodEarningAddon } from '../../admin/models/earningAddon.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { uploadImageBuffer } from '../../../../services/cloudinary.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';

export const registerDeliveryPartner = async (payload, files) => {
    const { 
        name, phone, email, countryCode, address, city, state, zoneId, zoneName,
        vehicleType, vehicleName, vehicleNumber, drivingLicenseNumber, panNumber, aadharNumber,
        fcmToken, platform 
    } = payload;
    const refRaw = typeof payload?.ref === 'string' ? String(payload.ref).trim() : '';

    const existing = await FoodDeliveryPartner.findOne({ phone });
    if (existing) {
        if (existing.status !== 'rejected') {
            throw new ValidationError('Delivery partner with this phone already exists');
        }
        // If rejected, delete the old record so they can start fresh with same phone
        await FoodDeliveryPartner.deleteMany({ phone });
    }

    const images = {};

    if (files?.profilePhoto?.[0]) {
        images.profilePhoto = await uploadImageBuffer(files.profilePhoto[0].buffer, 'food/delivery/profile');
    }
    if (files?.aadharPhoto?.[0]) {
        images.aadharPhoto = await uploadImageBuffer(files.aadharPhoto[0].buffer, 'food/delivery/aadhar');
    }
    if (files?.aadharPhotoBack?.[0]) {
        images.aadharPhotoBack = await uploadImageBuffer(files.aadharPhotoBack[0].buffer, 'food/delivery/aadhar');
    }
    if (files?.panPhoto?.[0]) {
        images.panPhoto = await uploadImageBuffer(files.panPhoto[0].buffer, 'food/delivery/pan');
    }
    if (files?.panPhotoBack?.[0]) {
        images.panPhotoBack = await uploadImageBuffer(files.panPhotoBack[0].buffer, 'food/delivery/pan');
    }
    if (files?.drivingLicensePhoto?.[0]) {
        images.drivingLicensePhoto = await uploadImageBuffer(
            files.drivingLicensePhoto[0].buffer,
            'food/delivery/license'
        );
    }
    if (files?.drivingLicensePhotoBack?.[0]) {
        images.drivingLicensePhotoBack = await uploadImageBuffer(
            files.drivingLicensePhotoBack[0].buffer,
            'food/delivery/license'
        );
    }
    if (files?.bankPassbookPhoto?.[0]) {
        images.bankPassbookPhoto = await uploadImageBuffer(
            files.bankPassbookPhoto[0].buffer,
            'food/delivery/bank'
        );
    }

    const partner = await FoodDeliveryPartner.create({
        name,
        phone,
        email: email && String(email).trim() ? String(email).trim() : undefined,
        countryCode,
        address,
        city,
        state,
        zoneId: zoneId && mongoose.Types.ObjectId.isValid(zoneId) ? zoneId : null,
        zoneName: zoneName ? String(zoneName).trim() : '',
        vehicleType,
        vehicleName,
        vehicleNumber,
        drivingLicenseNumber,
        panNumber,
        aadharNumber,
        status: 'pending',
        ...images
    });

    // Update FCM token if provided
    if (fcmToken) {
        if (platform === 'mobile') {
            partner.fcmTokenMobile = [fcmToken];
        } else {
            partner.fcmTokens = [fcmToken];
        }
    }

    // Ensure referralCode exists for sharing.
    if (!partner.referralCode) {
        partner.referralCode = String(partner._id);
    }

    // Store referredBy (no credit here; credit happens on admin approval).
    if (refRaw && mongoose.Types.ObjectId.isValid(refRaw) && String(refRaw) !== String(partner._id)) {
        const referrer = await FoodDeliveryPartner.findById(refRaw).select('_id').lean();
        if (referrer) {
            partner.referredBy = referrer._id;
        }
    }

    await partner.save();

    try {
        const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
        void notifyAdminsSafely({
            title: 'New Delivery Partner Registration 🚲',
            body: `A new delivery partner "${partner.name}" has signed up and is pending approval.`,
            data: {
                type: 'new_registration',
                subType: 'delivery_partner',
                id: String(partner._id)
            }
        });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to notify admins of new delivery partner registration:', e);
    }

    return partner.toObject();
};

export const updateDeliveryPartnerProfile = async (userId, payload, files) => {
    const partner = await FoodDeliveryPartner.findById(userId);
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }

    const {
        name, countryCode, address, city, state,
        vehicleType, vehicleName, vehicleNumber, drivingLicenseNumber, panNumber, aadharNumber,
        fcmToken, platform
    } = payload;

    if (name) partner.name = name;
    if (countryCode !== undefined) partner.countryCode = countryCode;
    if (address !== undefined) partner.address = address;
    if (city !== undefined) partner.city = city;
    if (state !== undefined) partner.state = state;
    if (vehicleType !== undefined) partner.vehicleType = vehicleType;
    if (vehicleName !== undefined) partner.vehicleName = vehicleName;
    if (vehicleNumber !== undefined) partner.vehicleNumber = vehicleNumber;
    if (drivingLicenseNumber !== undefined) partner.drivingLicenseNumber = drivingLicenseNumber;

    if (fcmToken) {
        if (platform === 'mobile') {
            if (!partner.fcmTokenMobile) partner.fcmTokenMobile = [];
            if (!partner.fcmTokenMobile.includes(fcmToken)) {
                partner.fcmTokenMobile.push(fcmToken);
            }
        } else {
            if (!partner.fcmTokens) partner.fcmTokens = [];
            if (!partner.fcmTokens.includes(fcmToken)) {
                partner.fcmTokens.push(fcmToken);
            }
        }
    }

    let updatedDocsRequiringReapproval = false;

    if (files?.profilePhoto?.[0]) {
        partner.profilePhoto = await uploadImageBuffer(files.profilePhoto[0].buffer, 'food/delivery/profile');
    }

    await partner.save();
    return {
        partner: partner.toObject(),
        requiresReapproval: false
    };
};

export const updateDeliveryPartnerDetails = async (userId, payload) => {
    const partner = await FoodDeliveryPartner.findById(userId);
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }

    const vehicle = payload?.vehicle;
    if (vehicle && typeof vehicle === 'object') {
        if (vehicle.number !== undefined) partner.vehicleNumber = String(vehicle.number || '').trim();
        if (vehicle.type !== undefined) partner.vehicleType = String(vehicle.type || '').trim();
        if (vehicle.brand !== undefined) partner.vehicleName = String(vehicle.brand || '').trim();
        if (vehicle.model !== undefined) partner.vehicleName = String(vehicle.model || '').trim();
    }

    if (payload?.profilePhoto !== undefined) {
        partner.profilePhoto = payload.profilePhoto ? String(payload.profilePhoto).trim() : '';
    }

    await partner.save();
    return partner.toObject();
};

export const updateDeliveryPartnerProfilePhotoBase64 = async (userId, payload) => {
    const partner = await FoodDeliveryPartner.findById(userId);
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }
    const base64 = payload?.base64;
    const mimeType = payload?.mimeType || 'image/jpeg';
    if (!base64 || typeof base64 !== 'string') {
        throw new ValidationError('base64 is required');
    }
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer || !buffer.length) {
        throw new ValidationError('Invalid base64 image');
    }
    if (buffer.length > 8 * 1024 * 1024) {
        throw new ValidationError('Image too large (max 8MB)');
    }
    // uploadImageBuffer expects raw bytes; mimeType is ignored by current implementation, but buffer is valid.
    partner.profilePhoto = await uploadImageBuffer(buffer, 'food/delivery/profile');
    await partner.save();
    return partner.toObject();
};

export const updateDeliveryPartnerBankDetails = async (userId, payload, files) => {
    const partner = await FoodDeliveryPartner.findById(userId);
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }

    // Handle both nested JSON and flat FormData from multer
    let bankDetails = payload?.documents?.bankDetails;
    let panDetails = payload?.documents?.pan;

    // Multer flattens FormData keys like 'documents[bankDetails][accountNumber]'
    if (!bankDetails && payload) {
        const b = {};
        if (payload['documents[bankDetails][accountHolderName]'] !== undefined) b.accountHolderName = payload['documents[bankDetails][accountHolderName]'];
        if (payload['documents[bankDetails][accountNumber]'] !== undefined) b.accountNumber = payload['documents[bankDetails][accountNumber]'];
        if (payload['documents[bankDetails][ifscCode]'] !== undefined) b.ifscCode = payload['documents[bankDetails][ifscCode]'];
        if (payload['documents[bankDetails][bankName]'] !== undefined) b.bankName = payload['documents[bankDetails][bankName]'];
        if (payload['documents[bankDetails][upiId]'] !== undefined) b.upiId = payload['documents[bankDetails][upiId]'];
        if (Object.keys(b).length > 0) bankDetails = b;
    }

    if (!panDetails && payload?.['documents[pan][number]'] !== undefined) {
        panDetails = { number: payload['documents[pan][number]'] };
    }

    if (bankDetails) {
        const b = bankDetails;
        if (b.accountHolderName !== undefined) partner.bankAccountHolderName = b.accountHolderName ? String(b.accountHolderName).trim() : '';
        if (b.accountNumber !== undefined) partner.bankAccountNumber = b.accountNumber ? String(b.accountNumber).trim() : '';
        if (b.ifscCode !== undefined) partner.bankIfscCode = b.ifscCode ? String(b.ifscCode).trim().toUpperCase() : '';
        if (b.bankName !== undefined) partner.bankName = b.bankName ? String(b.bankName).trim() : '';
        if (b.upiId !== undefined) partner.upiId = b.upiId ? String(b.upiId).trim() : '';
    }

    if (panDetails?.number !== undefined) {
        partner.panNumber = panDetails.number ? String(panDetails.number).trim().toUpperCase() : '';
    }

    if (files?.upiQrCode?.[0]) {
        partner.upiQrCode = await uploadImageBuffer(files.upiQrCode[0].buffer, 'food/delivery/upi');
    }

    await partner.save();
    return partner.toObject();
};

function generateTicketId() {
    const n = Date.now().toString(36).slice(-6).toUpperCase();
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TKT-${n}${r}`;
}

export const listSupportTicketsByPartner = async (deliveryPartnerId) => {
    const list = await DeliverySupportTicket.find({ deliveryPartnerId })
        .sort({ createdAt: -1 })
        .lean();
    return list;
};

export const createSupportTicket = async (deliveryPartnerId, payload) => {
    const { subject, description, category = 'other', priority = 'medium' } = payload;
    if (!subject || !description || subject.trim().length < 3) {
        throw new ValidationError('Subject is required (min 3 characters)');
    }
    if (description.trim().length < 10) {
        throw new ValidationError('Description must be at least 10 characters');
    }
    let ticketId = generateTicketId();
    let exists = await DeliverySupportTicket.findOne({ ticketId }).lean();
    while (exists) {
        ticketId = generateTicketId();
        exists = await DeliverySupportTicket.findOne({ ticketId }).lean();
    }
    const ticket = await DeliverySupportTicket.create({
        deliveryPartnerId,
        ticketId,
        subject: subject.trim(),
        description: description.trim(),
        category: ['payment', 'account', 'technical', 'order', 'other'].includes(category) ? category : 'other',
        priority: ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium',
        status: 'open'
    });
    return ticket.toObject();
};

export const getSupportTicketByIdAndPartner = async (ticketId, deliveryPartnerId) => {
    const ticket = await DeliverySupportTicket.findOne({
        _id: ticketId,
        deliveryPartnerId
    }).lean();
    return ticket;
};

export const updateDeliveryAvailability = async (userId, payload) => {
    const partner = await FoodDeliveryPartner.findById(userId);
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }
    const { status, latitude, longitude, selfieImageUrl, forceBypassForDev } = payload || {};
    let validStatus = 'offline';
    if (status === 'online' || status === true) validStatus = 'online';
    else if (status === 'offline' || status === false) validStatus = 'offline';

    const todayKey = new Date().toISOString().slice(0, 10);

    if (validStatus === 'online' && !forceBypassForDev) {
        // Step 1: Enforce Active Gig Check (Online status allowed 15-30 mins before gig start)
        const { getActiveGigForPartner, getUpcomingGigLoginDetails } = await import('./gig.service.js');
        const activeGig = await getActiveGigForPartner(partner._id);

        if (!activeGig) {
            const upcomingInfo = await getUpcomingGigLoginDetails(partner._id);
            if (upcomingInfo) {
                const err = new ValidationError(
                    `You can only log in online within 30 minutes of your scheduled gig start time (Your shift starts at ${upcomingInfo.startTime}).`
                );
                err.code = 'GIG_LOGIN_TOO_EARLY';
                throw err;
            }
            const err = new ValidationError("You don't have an active gig. Please book a gig before going online.");
            err.code = 'NO_ACTIVE_GIG';
            throw err;
        }

        // Step 2: Enforce Verified Selfie Check for Today
        const onlineSelfie = partner.onlineSelfie || {};
        const isVerifiedToday =
            onlineSelfie.forDate === todayKey &&
            onlineSelfie.imageUrl &&
            onlineSelfie.verifiedStatus === 'verified';

        if (!isVerifiedToday && !String(selfieImageUrl || '').trim()) {
            const err = new ValidationError('Selfie verification is required before going online today.');
            err.code = 'SELFIE_REQUIRED';
            throw err;
        }

        if (String(selfieImageUrl || '').trim()) {
            partner.onlineSelfie = {
                ...(onlineSelfie || {}),
                imageUrl: selfieImageUrl.trim(),
                capturedAt: new Date(),
                uploadedAt: new Date(),
                forDate: todayKey,
                verifiedStatus: 'verified'
            };
        }

        // Step 3: Mark gig booking status to completed
        const { FoodGigBooking } = await import('../models/foodGigBooking.model.js');
        await FoodGigBooking.updateOne(
            { gigId: activeGig._id, deliveryPartnerId: partner._id, status: 'booked' },
            { $set: { status: 'completed', completedAt: new Date() } }
        );
    }

    if (validStatus === 'offline') {
        // Guard 1: Active Order Running Check
        const { FoodOrder } = await import('../orders/models/order.model.js');
        const activeRunningOrder = await FoodOrder.findOne({
            'dispatch.deliveryPartnerId': partner._id,
            orderStatus: {
                $in: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop']
            }
        }).select('orderId _id order_id').lean();

        if (activeRunningOrder) {
            const displayId = activeRunningOrder.order_id || activeRunningOrder.orderId || activeRunningOrder._id;
            const err = new ValidationError(
                `You cannot go offline while you have an active order (#${displayId}) in progress.`
            );
            err.code = 'ACTIVE_ORDER_IN_PROGRESS';
            throw err;
        }

        // Guard 2: Active Scheduled Gig Shift Emergency Admin Approval Check
        const { getActiveGigForPartner } = await import('./gig.service.js');
        const activeGig = await getActiveGigForPartner(partner._id);

        if (activeGig && !partner.emergencyOfflineApproved && !forceBypassForDev) {
            const err = new ValidationError(
                'You are currently working an active gig shift. You can only go offline during an active shift in an emergency situation with Admin approval.'
            );
            err.code = 'EMERGENCY_OFFLINE_REQUIRED';
            err.canRequestEmergency = true;
            throw err;
        }

        // Reset emergency offline approval flag after successfully turning offline
        if (partner.emergencyOfflineApproved) {
            partner.emergencyOfflineApproved = false;
        }
    }

    partner.availabilityStatus = validStatus;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
        partner.lastLocation = {
            type: 'Point',
            coordinates: [longitude, latitude]
        };
        partner.lastLat = latitude;
        partner.lastLng = longitude;
        partner.lastLocationAt = new Date();
    }
    await partner.save();
    return {
        availabilityStatus: partner.availabilityStatus,
        onlineSelfie: partner.onlineSelfie || {}
    };
};

// ----- Delivery partner wallet (Pocket / requests page) -----
export const getDeliveryPartnerWallet = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Delivery partner not found');
    }
    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }

    const cashLimitSettings = await getDeliveryCashLimitSettings();
    const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
    const deliveryWithdrawalLimit = Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

    // Earnings paid to rider through completed deliveries
    const [earningsAgg, cashAgg] = await Promise.all([
        FoodOrder.aggregate([
            {
                $match: {
                    'dispatch.deliveryPartnerId': partnerId,
                    orderStatus: 'delivered',
                }
            },
            {
                $group: {
                    _id: null,
                    totalEarned: { $sum: { $ifNull: ['$riderEarning', '$pricing.deliveryFee'] } }
                }
            }
        ]),
        FoodOrder.aggregate([
            {
                $match: {
                    'dispatch.deliveryPartnerId': partnerId,
                    orderStatus: 'delivered',
                    'payment.method': 'cash',
                    'payment.status': 'paid'
                }
            },
            {
                $group: {
                    _id: null,
                    cashInHand: { $sum: { $ifNull: ['$riderEarning', 0] } }
                }
            }
        ])
    ]);

    const totalEarned = Number(earningsAgg?.[0]?.totalEarned) || 0;
    const cashInHand = Number(cashAgg?.[0]?.cashInHand) || 0;

    // Admin-set delivery bonuses / earning addons
    const bonusAgg = await DeliveryBonusTransaction.aggregate([
        { $match: { deliveryPartnerId: partnerId } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalBonus = bonusAgg?.[0] ? Number(bonusAgg[0].total) : 0;

    // Keep transactions list reasonably small (UI only needs recent data for charts)
    const [paymentTxList, bonusTxList] = await Promise.all([
        FoodOrder.find({
            'dispatch.deliveryPartnerId': partnerId,
            orderStatus: 'delivered',
        })
            .sort({ 'deliveryState.deliveredAt': -1, createdAt: -1 })
            .select('orderId riderEarning payment orderStatus deliveryState createdAt deliveryState.deliveredAt')
            .limit(2000)
            .lean(),
        DeliveryBonusTransaction.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(1000)
            .lean(),
    ]);

    const paymentTransactions = (paymentTxList || []).map((o) => {
        const deliveredAt = o?.deliveryState?.deliveredAt || o?.deliveredAt || null;
        const date = deliveredAt || o?.createdAt || new Date();
        return {
            _id: o._id,
            type: 'payment',
            amount: Number(o.riderEarning) || Number(o?.pricing?.deliveryFee) || 0,
            status: 'Completed',
            date,
            createdAt: date,
            orderId: o.orderId || String(o._id),
            paymentMethod: o?.payment?.method || '',
            metadata: { orderId: o.orderId || String(o._id) },
            description: o?.payment?.method === 'cash' ? 'COD delivery earning' : 'Online delivery earning'
        };
    });

    // Frontend weekly earnings expects bonus transactions as `earning_addon`.
    const bonusTransactions = (bonusTxList || []).map((t) => ({
        _id: t._id,
        type: 'earning_addon',
        amount: Number(t.amount) || 0,
        status: 'Completed',
        date: t.createdAt,
        createdAt: t.createdAt,
        metadata: { reference: t.reference || '' },
        description: t.reference ? `Bonus - ${t.reference}` : 'Bonus'
    }));

    const totalWithdrawn = 0;
    const totalBalance = totalEarned + totalBonus;
    const availableCashLimit = Math.max(0, totalCashLimit - cashInHand);

    return {
        totalBalance,
        pocketBalance: totalBalance,
        cashInHand,
        totalWithdrawn,
        totalEarned,
        totalCashLimit,
        availableCashLimit,
        deliveryWithdrawalLimit,
        transactions: [...paymentTransactions, ...bonusTransactions].sort((a, b) => {
            const ad = a?.date ? new Date(a.date).getTime() : 0;
            const bd = b?.date ? new Date(b.date).getTime() : 0;
            return bd - ad;
        }),
        joiningBonusClaimed: false,
        joiningBonusAmount: 0
    };
};

// ----- Delivery partner earnings summary (Pocket / requests page) -----
export const getDeliveryPartnerEarnings = async (deliveryPartnerId, query = {}) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Delivery partner not found');
    }
    const period = String(query.period || 'week').toLowerCase();
    const date = query.date ? new Date(query.date) : new Date();
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

    let range = null;
    if (period === 'today') {
        range = { start: toStartOfDay(date), end: toEndOfDay(date) };
    } else if (period === 'week') {
        range = getWeekRange(date);
    } else if (period === 'month') {
        range = getMonthRange(date);
    } else if (period === 'all') {
        range = null;
    } else {
        // fallback to week
        range = getWeekRange(date);
    }

    const match = {
        'dispatch.deliveryPartnerId': partnerId,
        orderStatus: 'delivered',
    };
    if (range) {
        match['deliveryState.deliveredAt'] = { $gte: range.start, $lte: range.end };
    }

    const [totalOrders, agg] = await Promise.all([
        FoodOrder.countDocuments(match),
        FoodOrder.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalEarnings: { $sum: { $ifNull: ['$riderEarning', '$pricing.deliveryFee'] } }
                }
            }
        ])
    ]);

    const totalEarnings = Number(agg?.[0]?.totalEarnings) || 0;

    // Frontend only strongly relies on totalEarnings + totalOrders.
    const summary = {
        totalEarnings,
        totalOrders,
        totalHours: 0,
        totalMinutes: 0,
        orderEarning: totalEarnings,
        incentive: 0,
        otherEarnings: 0
    };

    return {
        summary,
        period,
        date: date.toISOString(),
        pagination: { page, limit, total: totalOrders }
    };
};

const normalizeStatusFilter = (status) => {
    if (!status) return null;
    const s = String(status || '').trim();
    if (!s || s.toUpperCase() === 'ALL TRIPS') return null;
    // UI uses Completed/Cancelled/Pending
    return s;
};

const toStartOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};

const toEndOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
};

const getWeekRange = (anchorDate) => {
    const d = new Date(anchorDate);
    const start = toStartOfDay(d);
    start.setDate(start.getDate() - start.getDay()); // Sunday
    const end = toEndOfDay(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
};

const getMonthRange = (anchorDate) => {
    const d = new Date(anchorDate);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const computeRange = (period, date) => {
    const p = String(period || 'daily').toLowerCase();
    const anchor = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    if (p === 'weekly' || p === 'week') return getWeekRange(anchor);
    if (p === 'monthly' || p === 'month') return getMonthRange(anchor);
    // daily
    return { start: toStartOfDay(anchor), end: toEndOfDay(anchor) };
};

const toTripDto = (order) => {
    const createdAt = order?.createdAt || null;
    const deliveredAt = order?.deliveryState?.deliveredAt || order?.deliveredAt || order?.completedAt || null;
    const dateForUi = deliveredAt || createdAt || order?.updatedAt || null;

    const time = dateForUi
        ? new Date(dateForUi).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '';

    const orderStatus = String(order?.orderStatus || order?.status || '').toLowerCase();
    const isDelivered = orderStatus === 'delivered' || String(order?.deliveryState?.currentPhase || '').toLowerCase() === 'delivered';
    const isCancelled = orderStatus.startsWith('cancelled') || String(order?.deliveryState?.status || '').toLowerCase().includes('cancel');

    const status = isDelivered ? 'Completed' : isCancelled ? 'Cancelled' : 'Pending';

    const restaurantName =
        order?.restaurantId?.restaurantName ||
        order?.restaurantName ||
        order?.restaurant?.restaurantName ||
        '';

    const paymentMethod = order?.payment?.method || order?.paymentMethod || '';
    const pricingTotal = Number(order?.pricing?.total) || Number(order?.totalAmount) || 0;

    const earningAmount = Number(order?.riderEarning ?? order?.deliveryEarning ?? 0) || 0;
    const riderBasePay = Number(order?.riderBasePay) || Number(order?.pricing?.deliveryFeeBreakdown?.basePayout) || 0;
    const riderDeliveryFeeShare = Number(order?.riderDeliveryFeeShare) || Number(order?.pricing?.riderDeliveryEarningAfterAdminCommission) || 0;
    const riderSurgePay = Number(order?.riderSurgePay) || Number(order?.pricing?.surgeAmount) || 0;
    const riderIncentivePay = Number(order?.riderIncentivePay) || Number(order?.pricing?.deliveryPartnerIncentiveAmount) || 0;
    const riderTipPay = Number(order?.pricing?.deliveryPartnerTip) || 0;
    const computedTotalPayout = Math.round((riderDeliveryFeeShare + riderSurgePay + riderIncentivePay + riderTipPay) * 100) / 100;
    const riderTotalPayout =
        Number(order?.riderTotalPayout) ||
        computedTotalPayout ||
        earningAmount;
    const codAmount = paymentMethod === 'cash' ? Number(order?.payment?.amountDue) || 0 : 0;
    const codCollectedAmount = paymentMethod === 'cash' && order?.payment?.status === 'paid' ? codAmount : 0;
    return {
        id: order?._id,
        _id: order?._id,
        orderId: order?.orderId || order?._id,
        status,
        restaurantName,
        restaurant: restaurantName,
        items: order?.items || order?.orderItems || [],
        orderItems: order?.orderItems || order?.items || [],
        paymentMethod,
        totalAmount: pricingTotal,
        orderTotal: pricingTotal,
        codAmount: codAmount,
        codCollectedAmount,
        deliveryEarning: riderTotalPayout,
        earningAmount: riderTotalPayout,
        amount: riderTotalPayout, // legacy fallback
        riderBasePay,
        riderDeliveryFeeShare,
        riderSurgePay,
        riderIncentivePay,
        riderTipPay,
        deliveryPartnerTip: riderTipPay,
        riderTotalPayout,
        createdAt: order?.createdAt,
        deliveredAt: deliveredAt,
        completedAt: deliveredAt,
        date: dateForUi,
        time
    };
};

export const getDeliveryPartnerTripHistory = async (deliveryPartnerId, query = {}) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Delivery partner not found');
    }
    const period = query.period || 'daily';
    const date = query.date ? new Date(query.date) : new Date();
    const statusFilter = normalizeStatusFilter(query.status);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);

    const { start, end } = computeRange(period, date);

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const match = { 'dispatch.deliveryPartnerId': partnerId };

    const sf = String(statusFilter || '').toLowerCase();
    if (sf === 'completed') {
        match.orderStatus = 'delivered';
        match['deliveryState.deliveredAt'] = { $gte: start, $lte: end };
    } else if (sf === 'cancelled') {
        match.orderStatus = { $regex: '^cancelled', $options: 'i' };
        match.createdAt = { $gte: start, $lte: end };
    } else if (sf === 'pending') {
        match.createdAt = { $gte: start, $lte: end };
        // Pending = not delivered and not cancelled
        match.$and = [
            { orderStatus: { $ne: 'delivered' } },
            { orderStatus: { $not: { $regex: '^cancelled', $options: 'i' } } },
        ];
    } else {
        // ALL TRIPS: show anything created in range, and compute earnings only for delivered orders.
        match.createdAt = { $gte: start, $lte: end };
    }

    const orders = await FoodOrder.find(match)
        .populate({ path: 'restaurantId', select: 'restaurantName' })
        .sort({ 'deliveryState.deliveredAt': -1, createdAt: -1 })
        .limit(limit)
        .lean();

    return {
        period,
        date: (date || new Date()).toISOString(),
        range: { start: start.toISOString(), end: end.toISOString() },
        trips: (orders || []).map(toTripDto)
    };
};

export const getDeliveryPocketDetails = async (deliveryPartnerId, query = {}) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Delivery partner not found');
    }
    const date = query.date ? new Date(query.date) : new Date();
    const { start, end } = getWeekRange(date);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1000, 1), 2000);

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

    const orders = await FoodOrder.find({
        'dispatch.deliveryPartnerId': partnerId,
        orderStatus: 'delivered',
        $or: [
            { 'deliveryState.deliveredAt': { $gte: start, $lte: end } },
            { deliveredAt: { $gte: start, $lte: end } },
            { completedAt: { $gte: start, $lte: end } },
            { updatedAt: { $gte: start, $lte: end } },
            { createdAt: { $gte: start, $lte: end } }
        ]
    })
        .populate({ path: 'restaurantId', select: 'restaurantName' })
        .sort({ 'deliveryState.deliveredAt': -1, deliveredAt: -1, completedAt: -1, updatedAt: -1, createdAt: -1 })
        .limit(limit)
        .lean();

    const bonusTxList = await DeliveryBonusTransaction.find({
        deliveryPartnerId: partnerId,
        createdAt: { $gte: start, $lte: end }
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    const trips = (orders || []).map(toTripDto);

    const paymentTransactions = (orders || []).map((o) => ({
        _id: o._id,
        type: 'payment',
        amount: Number(o.riderEarning) || 0,
        status: 'Completed',
        date: o?.deliveryState?.deliveredAt || o?.deliveredAt || o?.createdAt,
        createdAt: o?.deliveryState?.deliveredAt || o?.deliveredAt || o?.createdAt,
        orderId: o.orderId || String(o._id),
        metadata: { orderId: o.orderId || String(o._id) },
        description: o?.restaurantId?.restaurantName ? `Order earning - ${o.restaurantId.restaurantName}` : 'Order earning'
    }));

    const bonusTransactions = (bonusTxList || []).map((t) => ({
        _id: t._id,
        type: 'bonus',
        amount: Number(t.amount) || 0,
        status: 'Completed',
        date: t.createdAt,
        createdAt: t.createdAt,
        metadata: { reference: t.reference || '' },
        description: t.reference ? `Bonus - ${t.reference}` : 'Bonus'
    }));

    const totalEarning = paymentTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalBonus = bonusTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    return {
        week: { start: start.toISOString(), end: end.toISOString() },
        summary: { totalEarning, totalBonus, grandTotal: totalEarning + totalBonus },
        trips,
        transactions: {
            payment: paymentTransactions,
            bonus: bonusTransactions
        }
    };
};

export const getActiveEarningAddonsForPartner = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Delivery partner not found');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const now = new Date();

    const addons = await FoodEarningAddon.find({
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
    })
        .sort({ endDate: 1, createdAt: 1 })
        .lean();

    const liveAddons = (addons || []).filter((addon) => {
        if (!addon) return false;
        const maxRedemptions = Number(addon.maxRedemptions);
        if (!Number.isFinite(maxRedemptions) || maxRedemptions <= 0) return true;
        return Number(addon.currentRedemptions || 0) < maxRedemptions;
    });

    const offers = await Promise.all(
        liveAddons.map(async (addon) => {
            const startDate = addon.startDate ? new Date(addon.startDate) : null;
            const endDate = addon.endDate ? new Date(addon.endDate) : null;

            const baseMatch = {
                'dispatch.deliveryPartnerId': partnerId,
                orderStatus: 'delivered'
            };

            if (startDate && endDate) {
                baseMatch['deliveryState.deliveredAt'] = { $gte: startDate, $lte: endDate };
            }

            const [currentOrders, earningsAgg] = await Promise.all([
                FoodOrder.countDocuments(baseMatch),
                FoodOrder.aggregate([
                    { $match: baseMatch },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: { $ifNull: ['$riderEarning', 0] } }
                        }
                    }
                ])
            ]);

            const currentEarnings = Number(earningsAgg?.[0]?.total) || 0;

            return {
                id: addon._id,
                title: addon.title || 'Earnings Guarantee',
                description: addon.description || '',
                targetAmount: Number(addon.earningAmount) || 0,
                targetOrders: Number(addon.requiredOrders) || 0,
                currentOrders: Number(currentOrders) || 0,
                currentEarnings,
                startDate,
                endDate,
                validTill: endDate ? endDate.toISOString() : null,
                isLive: true
            };
        })
    );

    return {
        activeOffer: offers[0] || null,
        offers
    };
};


/**
 * Delete a delivery partner and all associated data (wallet, tickets) permanently.
 */
export const deleteDeliveryPartnerAccount = async (partnerId) => {
    // Dynamic imports
    const { DeliverySupportTicket } = await import('../models/supportTicket.model.js');
    const { FoodDeliveryWallet } = await import('../models/deliveryWallet.model.js');

    const partner = await FoodDeliveryPartner.findById(partnerId);
    if (!partner) throw new ValidationError('Delivery partner not found');

    // Remove associated documents
    await FoodDeliveryWallet.findOneAndDelete({ deliveryPartnerId: partnerId });
    await DeliverySupportTicket.deleteMany({ deliveryPartnerId: partnerId });

    // Remove Partner
    await FoodDeliveryPartner.findByIdAndDelete(partnerId);

    return { success: true };
};

export const getDeliveryPartnerReviews = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Delivery partner not found');
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select('rating totalRatings name').lean();
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }

    const { FoodReview } = await import('../../orders/models/foodReview.model.js');
    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

    // Fetch from FoodReview collection
    const reviewDocs = await FoodReview.find({ deliveryPartnerId: partnerId })
        .populate('userId', 'name profileImage avatar')
        .populate('orderId', 'orderId order_id')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    let reviews = reviewDocs.map((doc) => ({
        _id: doc._id,
        rating: doc.rating,
        comment: doc.comment || '',
        customerName: doc.userId?.name || 'Customer',
        orderId: doc.orderId?.order_id || doc.orderId?.orderId || doc.orderId?._id || 'N/A',
        createdAt: doc.createdAt
    }));

    // If FoodReview table has no docs yet for this partner, fallback to historical FoodOrder.ratings.deliveryPartner
    if (reviews.length === 0) {
        const orderDocs = await FoodOrder.find({
            'dispatch.deliveryPartnerId': partnerId,
            'ratings.deliveryPartner.rating': { $exists: true, $ne: null }
        })
            .populate('userId', 'name profileImage avatar')
            .select('orderId order_id ratings.deliveryPartner createdAt')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        reviews = orderDocs.map((o) => ({
            _id: o._id,
            rating: o.ratings?.deliveryPartner?.rating || 0,
            comment: o.ratings?.deliveryPartner?.comment || '',
            customerName: o.userId?.name || 'Customer',
            orderId: o.order_id || o.orderId || o._id,
            createdAt: o.ratings?.deliveryPartner?.ratedAt || o.createdAt
        }));
    }

    const overallRating = Number(partner.rating || 0);
    const totalRatings = Number(partner.totalRatings || reviews.length || 0);

    return {
        rating: overallRating,
        totalRatings: totalRatings,
        reviews
    };
};

/**
 * Request emergency offline permission during an active gig shift
 */
export const requestEmergencyOffline = async (partnerId, reason) => {
    const partner = await FoodDeliveryPartner.findById(partnerId);
    if (!partner) throw new ValidationError('Delivery partner not found');

    if (!reason || !String(reason).trim()) {
        throw new ValidationError('Emergency reason is required');
    }

    partner.emergencyOfflineRequest = {
        status: 'pending',
        reason: String(reason).trim(),
        requestedAt: new Date()
    };
    await partner.save();

    return {
        success: true,
        message: 'Emergency offline request submitted to Admin successfully',
        emergencyOfflineRequest: partner.emergencyOfflineRequest
    };
};

/**
 * Get emergency offline request status for delivery partner
 */
export const getEmergencyOfflineStatus = async (partnerId) => {
    const partner = await FoodDeliveryPartner.findById(partnerId).select('emergencyOfflineRequest emergencyOfflineApproved availabilityStatus').lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    return {
        emergencyOfflineApproved: Boolean(partner.emergencyOfflineApproved),
        emergencyOfflineRequest: partner.emergencyOfflineRequest || { status: 'none' },
        availabilityStatus: partner.availabilityStatus
    };
};

/**
 * Admin approves emergency offline request
 */
export const approveEmergencyOfflineByAdmin = async (partnerId, adminId) => {
    const partner = await FoodDeliveryPartner.findById(partnerId);
    if (!partner) throw new ValidationError('Delivery partner not found');

    partner.emergencyOfflineApproved = true;
    partner.availabilityStatus = 'offline';
    partner.emergencyOfflineRequest = {
        ...(partner.emergencyOfflineRequest || {}),
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: adminId || null
    };

    await partner.save();

    return {
        success: true,
        message: 'Emergency offline request approved by Admin',
        partnerId: partner._id
    };
};


