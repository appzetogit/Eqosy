import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
    {
        itemId: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        variantId: { type: String, trim: true, default: '' },
        variantName: { type: String, trim: true, default: '' },
        variantPrice: { type: Number, min: 0, default: 0 },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        isVeg: { type: Boolean, default: true },
        image: { type: String, default: '' },
        notes: { type: String, default: '' },
        isAddon: { type: Boolean, default: false },
        addons: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    { _id: false }
);

const deliveryAddressSchema = new mongoose.Schema(
    {
        label: { type: String, enum: ['Home', 'Office', 'Other'], default: 'Home' },
        name: { type: String, default: '', trim: true },
        fullName: { type: String, default: '', trim: true },
        street: { type: String, required: true, trim: true },
        additionalDetails: { type: String, default: '', trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        zipCode: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: undefined }
        }
    },
    { _id: false }
);

const pricingSchema = new mongoose.Schema(
    {
        subtotal: { type: Number, required: true, min: 0 },
        tax: { type: Number, default: 0, min: 0 },
        gstRate: { type: Number, default: 0, min: 0, max: 100 },
        gstBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },
        packagingFee: { type: Number, default: 0, min: 0 },
        deliveryFee: { type: Number, default: 0, min: 0 },
        deliveryFeeBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },
        adminDeliveryCommissionEnabled: { type: Boolean, default: false },
        adminDeliveryCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
        adminDeliveryCommissionAmount: { type: Number, default: 0, min: 0 },
        riderDeliveryEarningAfterAdminCommission: { type: Number, default: 0, min: 0 },
        deliveryPartnerIncentiveEnabled: { type: Boolean, default: false },
        deliveryPartnerIncentivePercent: { type: Number, default: 0, min: 0, max: 100 },
        deliveryPartnerIncentiveAmount: { type: Number, default: 0, min: 0 },
        deliveryPartnerIncentiveEligible: { type: Boolean, default: false },
        platformFee: { type: Number, default: 0, min: 0 },
        surgeAmount: { type: Number, default: 0, min: 0 },
        surgeTitle: { type: String, default: 'Surge Charge', trim: true },
        // Snapshot of admin-configured additional charges (e.g. Small Cart Charge) as applied to this order.
        additionalCharges: {
            type: [
                new mongoose.Schema(
                    {
                        chargeId: { type: String, default: '' },
                        name: { type: String, required: true, trim: true },
                        amount: { type: Number, default: 0, min: 0 },
                        applicableUnder: { type: Number, default: 0, min: 0 },
                        isFree: { type: Boolean, default: false },
                        freeLabel: { type: String, default: '' },
                        chargedAmount: { type: Number, default: 0, min: 0 }
                    },
                    { _id: false }
                )
            ],
            default: []
        },
        additionalChargesTotal: { type: Number, default: 0, min: 0 },
        restaurantCommission: { type: Number, default: 0, min: 0 },
        // Snapshot of how restaurantCommission was derived; never recomputed after the order is placed.
        restaurantCommissionRate: { type: Number, default: 0, min: 0 },
        restaurantCommissionType: { type: String, enum: ['percentage', 'amount', ''], default: '' },
        restaurantCommissionSource: { type: String, enum: ['league', 'custom_admin', 'default', ''], default: '' },
        restaurantCommissionLeague: { type: String, default: '' },
        restaurantCommissionMonth: { type: String, default: '' },
        discount: { type: Number, default: 0, min: 0 },
        /** Prepaid (online / wallet) discount configured by admin. */
        prepaidDiscount: { type: Number, default: 0, min: 0 },
        /** COD handling charge (admin-set). Only on cash orders; the charge goes to the rider who verifies the order. */
        codCharge: { type: Number, default: 0, min: 0 },
        codChargeGstRate: { type: Number, default: 0, min: 0, max: 100 },
        codChargeGst: { type: Number, default: 0, min: 0 },
        deliveryPartnerTip: { type: Number, default: 0, min: 0 },
        total: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' }
    },
    { _id: false }
);

const paymentSchema = new mongoose.Schema(
    {
        method: {
            type: String,
            enum: ['cash', 'razorpay', 'razorpay_qr', 'wallet'],
            required: true
        },
        status: {
            type: String,
            enum: [
                'cod_pending',
                'created',
                'authorized',
                'paid',
                'failed',
                'refunded',
                'pending_qr'
            ],
            default: 'cod_pending'
        },
        amountDue: { type: Number, min: 0 },
        razorpay: {
            orderId: { type: String },
            paymentId: { type: String },
            signature: { type: String }
        },
        qr: {
            qrId: { type: String },
            imageUrl: { type: String },
            paymentLinkId: { type: String },
            shortUrl: { type: String },
            status: { type: String },
            expiresAt: { type: Date }
        },
        // ✅ NEW: Added refund object to track refund status without breaking existing flow
        refund: {
            status: { 
                type: String, 
                enum: ['none', 'pending', 'processed', 'failed'], 
                default: 'none' 
            },
            amount: { type: Number, default: 0 },
            refundId: { type: String, default: '' },
            manual: { type: Boolean, default: false }, // admin paid it back outside the Razorpay API; refundId then holds the admin's reference
            processedAt: { type: Date }
        }
    },
    { _id: false }
);

const dispatchSchema = new mongoose.Schema(
    {
        modeAtCreation: { type: String, enum: ['auto'], default: 'auto' },
        status: {
            type: String,
            enum: ['unassigned', 'assigned', 'accepted', 'rejected', 'cancelled', 'handover_requested'],
            default: 'unassigned'
        },
        deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null },
        assignedAt: { type: Date },
        acceptedAt: { type: Date },
        /** List of partners who were offered this order (to avoid repeats and track timeouts) */
        offeredTo: [{
            partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner' },
            at: { type: Date, default: Date.now },
            action: { type: String, enum: ['offered', 'rejected', 'handover', 'timeout'], default: 'offered' }
        }],
        handoverRequest: {
            status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
            requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null },
            reason: { type: String, default: '' },
            note: { type: String, default: '' },
            requestedAt: { type: Date, default: null },
            approvedAt: { type: Date, default: null },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
            rejectionReason: { type: String, default: '' }
        },
        dispatchingAt: { type: Date }
    },
    { _id: false }
);

const deliveryStateSchema = new mongoose.Schema(
    {
        currentPhase: {
            type: String,
            enum: [
                'en_route_to_pickup',
                'at_pickup',
                'en_route_to_delivery',
                'at_drop',
                'delivered',
                'completed'
            ],
            default: 'en_route_to_pickup'
        },
        status: { type: String, default: '' },
        reachedPickupAt: { type: Date, default: null },
        reachedDropAt: { type: Date, default: null },
        pickedUpAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },
        foodPrepStartedAt: { type: Date, default: null },
        foodReadyAt: { type: Date, default: null },
        isFoodReady: { type: Boolean, default: false },
        riderWaitDurationMs: { type: Number, default: 0 }
    },
    { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        byRole: { type: String, enum: ['USER', 'RESTAURANT', 'DELIVERY_PARTNER', 'ADMIN', 'SYSTEM'] },
        byId: { type: mongoose.Schema.Types.ObjectId },
        from: { type: String },
        to: { type: String },
        note: { type: String, default: '' }
    },
    { _id: false }
);

const orderEntityRatingSchema = new mongoose.Schema(
    {
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String, default: '', trim: true },
        ratedAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const orderRatingsSchema = new mongoose.Schema(
    {
        restaurant: { type: orderEntityRatingSchema, default: undefined },
        deliveryPartner: { type: orderEntityRatingSchema, default: undefined },
        isSkipped: { type: Boolean, default: false }
    },
    { _id: false }
);

const deliveryVerificationSchema = new mongoose.Schema(
    {
        dropOtp: {
            required: { type: Boolean, default: false },
            verified: { type: Boolean, default: false },
            lastSmsSentAt: { type: Date, default: null }
        },
        handoverImageUrl: { type: String, default: '' },
        handoverUploadedAt: { type: Date, default: null }
    },
    { _id: false }
);

/**
 * Customer unreachable flow: the delivery partner reached the drop point but the customer did not answer.
 * requested -> (admin) approved | rejected -> (restaurant OTP verified by rider) returned
 */
const undeliveredReturnSchema = new mongoose.Schema(
    {
        status: { type: String, enum: ['none', 'requested', 'approved', 'rejected', 'returned', 'rescued'], default: 'none' },
        /** Set when admin sent a prepaid no-show order to Food Rescue instead of returning it. */
        rescueFoodPrice: { type: Number, default: 0, min: 0 },
        reason: { type: String, default: '' },
        note: { type: String, default: '' },
        callAttempts: { type: Number, default: 0, min: 0 },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null },
        requestedAt: { type: Date, default: null },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        decidedAt: { type: Date, default: null },
        adminNote: { type: String, default: '' },
        rejectionReason: { type: String, default: '' },
        penaltyAmount: { type: Number, default: 0, min: 0 },
        returnedAt: { type: Date, default: null },
        /** Earning that was credited to the delivery partner when the food reached the restaurant */
        riderPayoutAmount: { type: Number, default: 0, min: 0 }
    },
    { _id: false }
);

/**
 * COD phone verification, done by a delivery partner BEFORE the order reaches the restaurant.
 * awaiting_rider (offered to one rider at a time, 2 min each) -> calling (rider approved; 2 min to reach the
 * customer) -> confirmed (order goes to the restaurant) | cancelled. `scheduled` = future order, started 20 min
 * before scheduledAt. See codVerification.service.js.
 */
const codVerificationSchema = new mongoose.Schema(
    {
        state: {
            type: String,
            enum: ['scheduled', 'awaiting_rider', 'calling', 'confirmed', 'cancelled'],
            default: 'awaiting_rider'
        },
        startedAt: { type: Date, default: null },
        /** Give up (cancel) if no rider has approved by this time. */
        searchDeadlineAt: { type: Date, default: null },
        currentOfferPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null },
        offerExpiresAt: { type: Date, default: null },
        /** No rider was free: try again at this time. */
        nextRetryAt: { type: Date, default: null },
        /** Optimistic lock so two workers never offer the order at the same time. */
        offerVersion: { type: Number, default: 0 },
        offers: [{
            _id: false,
            partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner' },
            at: { type: Date, default: Date.now },
            action: { type: String, enum: ['offered', 'approved', 'rejected', 'timeout', 'released'], default: 'offered' }
        }],
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null },
        approvedAt: { type: Date, default: null },
        /** Customer must be reached and confirm before this time, otherwise the order is cancelled. */
        callDeadlineAt: { type: Date, default: null },
        callAttempts: { type: Number, default: 0, min: 0 },
        callLog: [{ _id: false, at: { type: Date, default: Date.now } }],
        confirmedAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, default: '' }
    },
    { _id: false }
);

/**
 * Smart partial fulfilment / item replacement. Additive: orders that never hit an unavailable item keep
 * `state: 'none'` and behave exactly as before. The order's own `orderStatus` is NOT changed by this flow
 * (it stays `created` until the store confirms the final order), so dispatch/cancellation/payout logic is untouched.
 */
const fulfilmentSchema = new mongoose.Schema(
    {
        state: {
            type: String,
            enum: ['none', 'awaiting_customer', 'applying', 'awaiting_payment', 'resolved', 'cancelled'],
            default: 'none'
        },
        version: { type: Number, default: 0 },
        reportedAt: { type: Date, default: null },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        deadlineAt: { type: Date, default: null },
        responseWindowSec: { type: Number, default: 300 },
        timeoutNotifiedAt: { type: Date, default: null },
        /** Lines the store could not fulfil in the current round. lineKey = index into order.items. */
        unavailableItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
        /** Store suggestions. The customer still has to pick and confirm every replacement. */
        suggestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
        /** Frozen copy of the order as first placed (items, pricing, payment total). Never overwritten. */
        original: { type: mongoose.Schema.Types.Mixed, default: null },
        /** Proposed change waiting for the customer's extra payment (prepaid upsell). */
        pending: { type: mongoose.Schema.Types.Mixed, default: null },
        decision: {
            action: { type: String, default: '' }, // replace | remove | mixed | cancel | auto_remove
            at: { type: Date, default: null },
            by: { type: String, default: '' }
        },
        /** Every applied change: before/after bill, what was removed/replaced and how it was settled. */
        modifications: { type: [mongoose.Schema.Types.Mixed], default: [] },
        refunds: { type: [mongoose.Schema.Types.Mixed], default: [] },
        additionalPayments: { type: [mongoose.Schema.Types.Mixed], default: [] },
        history: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        order_id: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },
        /** Compatibility alias: satisfies rogue unique index 'orderId_1' found in legacy deployments. */
        orderId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },
        shareTrackingId: {
            type: String,
            index: true,
            unique: true,
            sparse: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true
        },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            index: true
        },
        transactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTransaction',
            index: true
        },
        items: {
            type: [orderItemSchema],
            required: true,
            validate: (v) => Array.isArray(v) && v.length > 0
        },
        deliveryAddress: {
            type: deliveryAddressSchema,
            required: true
        },
        customerName: { type: String, default: '', trim: true },
        customerPhone: { type: String, default: '', trim: true },
        /** "Order for someone else": the person who receives the food (the payer is `userId`). */
        recipient: {
            type: new mongoose.Schema(
                {
                    isSomeoneElse: { type: Boolean, default: false },
                    name: { type: String, default: '', trim: true },
                    phone: { type: String, default: '', trim: true }
                },
                { _id: false }
            ),
            default: undefined
        },
        pricing: {
            type: pricingSchema,
            required: false
        },
        /**
         * Denormalized payment snapshot for fast reads & legacy clients.
         * Authoritative audit trail: collection `food_order_payments` (FoodOrderPayment model).
         */
        payment: {
            type: paymentSchema,
            required: false
        },
        orderStatus: {
            type: String,
            enum: [
                'pending_payment',
                /** COD order waiting for a delivery partner to confirm it with the customer by phone. */
                'pending_cod_verification',
                'created',
                'confirmed',
                'preparing',
                'ready_for_pickup',
                'reached_pickup',
                'picked_up',
                'reached_drop',
                'delivered',
                'cancelled_by_user',
                'cancelled_by_restaurant',
                'cancelled_by_admin',
                'handover_requested',
                'returned_to_restaurant'
            ],
            default: 'created'
        },
        dispatch: {
            type: dispatchSchema,
            default: () => ({})
        },
        deliveryState: {
            type: deliveryStateSchema,
            default: () => ({})
        },
        /** GPS distance the assigned rider travelled towards the restaurant (used for cancellation compensation). */
        cancelTracking: {
            type: new mongoose.Schema(
                {
                    trackedKm: { type: Number, default: 0 },
                    lastLat: { type: Number, default: null },
                    lastLng: { type: Number, default: null },
                    lastAt: { type: Date, default: null }
                },
                { _id: false }
            ),
            default: () => ({})
        },
        /** COD phone verification by the delivery partner (see codVerificationSchema). Absent on prepaid orders. */
        codVerification: { type: codVerificationSchema, default: undefined },
        /** Partial fulfilment / replacement workflow state (see fulfilmentSchema). */
        fulfilment: { type: fulfilmentSchema, default: undefined },
        /** Customer-cancellation policy result (stage, penalty, rescue state), synced to all apps. */
        cancellationPolicy: {
            type: new mongoose.Schema(
                {
                    caseId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    stage: { type: Number, default: 0 },
                    penaltyTotal: { type: Number, default: 0 },
                    payMode: { type: String, default: '' },
                    deducted: { type: Number, default: 0 },
                    refundAmount: { type: Number, default: 0 },
                    rescueStatus: { type: String, default: '' }, // active | claimed | expired
                    rescueExpiresAt: { type: Date, default: null },
                    statusLabel: { type: String, default: '' }
                },
                { _id: false }
            ),
            default: undefined
        },
        /** Set on an order that was created by claiming rescued food. */
        rescueInfo: {
            type: new mongoose.Schema(
                {
                    listingId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    originalOrderId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    originalFoodValue: { type: Number, default: 0 },
                    discountPercent: { type: Number, default: 0 }
                },
                { _id: false }
            ),
            default: undefined
        },
        /** Preparation deadline tracking (performance/penalty system). Server timestamps only. */
        prep: {
            type: new mongoose.Schema(
                {
                    acceptedAt: { type: Date, default: null },
                    originalEta: { type: Date, default: null },
                    approvedEta: { type: Date, default: null },
                    tierKey: { type: String, default: '' },
                    itemCount: { type: Number, default: 0 },
                    extended: { type: Boolean, default: false },
                    penaltyEvaluated: { type: Boolean, default: false },
                    prepMinutes: { type: Number, default: 0 },
                    preWarned: { type: Boolean, default: false },
                    delayNotified: { type: Boolean, default: false }
                },
                { _id: false }
            ),
            default: () => ({})
        },
        /** Delivery-partner deadline tracking. The timer starts at the real pickup time. */
        deliveryEval: {
            type: new mongoose.Schema(
                {
                    partnerId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    pickedUpAt: { type: Date, default: null },
                    estimatedMinutes: { type: Number, default: 0 },
                    originalEta: { type: Date, default: null },
                    adjustedEta: { type: Date, default: null },
                    adjustments: {
                        type: [
                            new mongoose.Schema(
                                {
                                    minutes: { type: Number, required: true },
                                    reasonCode: { type: String, default: '' },
                                    note: { type: String, default: '' },
                                    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
                                    requestedBy: { type: String, default: '' },
                                    at: { type: Date, default: Date.now }
                                },
                                { _id: true }
                            )
                        ],
                        default: []
                    },
                    penaltyEvaluated: { type: Boolean, default: false },
                    preWarned: { type: Boolean, default: false },
                    delayNotified: { type: Boolean, default: false }
                },
                { _id: false }
            ),
            default: () => ({})
        },
        statusHistory: {
            type: [statusHistorySchema],
            default: []
        },
        ratings: {
            type: orderRatingsSchema,
            default: () => ({})
        },
        note: { type: String, default: '', trim: true },
        cancellationReason: { type: String, default: '', trim: true },
        cancellationComment: { type: String, default: '', trim: true },
        cancelledAt: { type: Date, default: null },
        cancelledBy: { type: String, enum: ['USER', 'RESTAURANT', 'ADMIN', 'SYSTEM', ''], default: '' },
        sendCutlery: { type: Boolean, default: true },
        deliveryFleet: { type: String, default: 'standard', trim: true },
        scheduledAt: { type: Date, default: null },
        scheduledDispatched: { type: Boolean, default: false },
        riderBasePay: { type: Number, default: 0, min: 0 },
        riderSurgePay: { type: Number, default: 0, min: 0 },
        riderDeliveryFeeShare: { type: Number, default: 0, min: 0 },
        riderIncentivePay: { type: Number, default: 0, min: 0 },
        /** COD charge earned by the rider who verified the order (added to riderTotalPayout on confirmation). */
        riderCodChargePay: { type: Number, default: 0, min: 0 },
        riderTotalPayout: { type: Number, default: 0, min: 0 },
        riderEarning: { type: Number, default: 0, min: 0 },
        platformProfit: { type: Number, default: 0, min: 0 },
        /** Plain 4-digit OTP for handover; cleared after successful verify (never expose to partner in API responses). */
        deliveryOtp: { type: String, default: '', select: false },
        /** Customer-unreachable return to restaurant (see undeliveredReturnSchema) */
        undeliveredReturn: { type: undeliveredReturnSchema, default: () => ({}) },
        /** 4-digit OTP shown in the restaurant panel; the rider enters it to confirm the food was handed back. */
        returnOtp: { type: String, default: '', select: false },
        deliveryVerification: {
            type: deliveryVerificationSchema,
            default: () => ({})
        },
        /** Latest rider location for this specific order (GeoJSON Point) */
        lastRiderLocation: {
            type: { type: String, enum: ['Point'] },
            coordinates: { type: [Number] }
        }
    },
    {
        collection: 'food_orders',
        timestamps: true
    }
);

orderSchema.index({ 'deliveryAddress.location': '2dsphere' });
orderSchema.index({ lastRiderLocation: '2dsphere' });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, orderStatus: 1, createdAt: -1 });
orderSchema.index({ 'dispatch.deliveryPartnerId': 1, orderStatus: 1 });
orderSchema.index({ 'dispatch.status': 1, orderStatus: 1 });
orderSchema.index({ 'dispatch.status': 1, orderStatus: 1, updatedAt: -1 });
orderSchema.index({ 'dispatch.deliveryPartnerId': 1, 'dispatch.status': 1, updatedAt: -1 });
orderSchema.index({ 'payment.status': 1, createdAt: -1 });
orderSchema.index({ 'payment.method': 1, createdAt: -1 });
orderSchema.index({ 'fulfilment.state': 1, 'fulfilment.deadlineAt': 1 }, { sparse: true });
orderSchema.index({ orderStatus: 1, 'codVerification.state': 1 }, { sparse: true });

orderSchema.pre('save', async function (next) {
    if (!this.order_id) {
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(100 + Math.random() * 900);
        this.order_id = `FOD-${timestamp}${random}`;
    }
    // Synchronize camelCase alias to satisfy unique index 'orderId_1'
    if (this.order_id) {
        this.orderId = this.order_id;
    }
    next();
});

export const FoodOrder = mongoose.model('FoodOrder', orderSchema);

const settingsSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        dispatchMode: { type: String, enum: ['auto'], default: 'auto' },
        maxDistanceCycle: { type: Number, default: 5 }, // default 5km
        maxDistanceElectricScooter: { type: Number, default: 10 }, // default 10km
        // Dev Mode (key: 'demo_mode'): lets reviewers/testers see demo data from any location.
        // Partial order fulfilment & replacement settings (key: 'partial_fulfilment'); see partialFulfilment.service.
        partialFulfilment: { type: mongoose.Schema.Types.Mixed, default: undefined },
        demoMode: {
            locationBypass: { type: Boolean, default: false },
            zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone' },
            groups: { type: mongoose.Schema.Types.Mixed, default: {} }
        },
        updatedBy: {
            role: { type: String },
            adminId: { type: mongoose.Schema.Types.ObjectId },
            at: { type: Date }
        }
    },
    { collection: 'food_settings', timestamps: true }
);

export const FoodSettings = mongoose.model('FoodSettings', settingsSchema);
