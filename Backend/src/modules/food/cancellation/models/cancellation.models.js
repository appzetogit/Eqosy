import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Notification templates. Placeholders: {orderId} {amount} {restaurant} {minutes} {price} {original}. */
export const DEFAULT_MESSAGES = {
    s1_customer: 'Your order has been cancelled successfully. No cancellation charges have been applied.',
    s1_restaurant: 'Order #{orderId} has been cancelled by the customer. No preparation is required.',
    s1_rider: 'Order #{orderId} has been cancelled. Please disregard this delivery assignment.',
    s2_customer:
        'Your cancellation request has been processed. Since the restaurant had already started preparing your food, applicable food preparation compensation, delivery partner compensation, platform fees and cancellation charges (Rs {amount}) have been added to your outstanding balance. You can view the complete breakdown in your account.',
    s2_restaurant:
        "Order #{orderId} has been cancelled after food preparation started. The applicable cancellation compensation (Rs {amount}) will be processed according to Eqosy's cancellation policy.",
    s2_rider:
        "Order #{orderId} has been cancelled. Your eligible travel compensation (Rs {amount}) has been calculated and will be credited according to Eqosy's payment policy.",
    s3_customer:
        'Your order has been cancelled after the food was prepared and picked up. Eqosy Food Rescue has been activated. Your applicable cancellation liability (Rs {amount}) has been added to your outstanding balance. You can view the complete penalty breakdown in your account.',
    s3_restaurant:
        'Order #{orderId} has been cancelled after food pickup. Eqosy Food Rescue has been activated. You will receive the applicable settlement based on the rescue outcome.',
    s3_rider:
        'Food Rescue has been activated for order #{orderId}. Please keep the food safely and wait for the rescue process to complete. You will receive further instructions automatically.',
    nofee_customer: 'Your order has been cancelled. No cancellation charges have been applied ({reason}).',
    rescue_claimed_rider: 'Food Rescue successful! A new customer has claimed this order. Please follow the updated delivery instructions.',
    rescue_claimed_restaurant:
        'Food Rescue successful for order #{orderId}. A new customer bought the food for Rs {price}. You will receive {share}% of the rescue price (Rs {amount}) after delivery.',
    rescue_claimed_original_customer: 'The food from your cancelled order #{orderId} was rescued by another customer.',
    rescue_new_customer: 'Your rescued food order has been confirmed at a {discount}% discounted food price. Please follow the delivery instructions.',
    rescue_expired_rider:
        'Food Rescue unsuccessful. The {minutes}-minute rescue window has expired. You may retain the food for personal consumption free of charge. No return to the restaurant is required.',
    rescue_expired_restaurant:
        'Food Rescue for order #{orderId} was unsuccessful. You will receive Rs {amount} ({percent}% of the food value) as cancellation compensation.',
    rescue_nearby_customer: '{restaurant}: food at {discount}% off (Rs {price}, was Rs {original}) near you. Claim it within {minutes} minutes.',
    s2_customer_online:
        'Your cancellation request has been processed. Since the restaurant had already started preparing your food, cancellation charges of Rs {amount} were deducted from your payment. Rs {refund} is being refunded to your original payment method. You can view the breakdown in your account.',
    s3_customer_online_hold:
        'Your order has been cancelled after pickup and Eqosy Food Rescue has started. If another customer buys the food within {minutes} minutes, cancellation charges of Rs {amount} are kept and Rs {refund} is refunded to your original payment method. If nobody buys it, the full payment is kept as the cancellation charge and no refund is given.',
    rescue_expired_original_customer:
        'Food Rescue for your cancelled order #{orderId} was unsuccessful. As per the cancellation policy the full payment of Rs {amount} has been kept as the cancellation charge. No refund is applicable.',
    s3_customer_online:
        'Your order has been cancelled after the food was prepared and picked up. Eqosy Food Rescue has been activated. Cancellation charges of Rs {amount} were deducted from your payment and Rs {refund} is being refunded to your original payment method.',
    refund_customer: 'Your refund of Rs {refund} for order #{orderId} has been initiated. It reaches your original payment method in 5-7 working days (wallet refunds are instant).',
    penalty_paid_customer: 'Payment of Rs {amount} received. Your outstanding penalty is cleared and Cash on Delivery is available again.',
    cod_disabled_customer:
        'Cash on Delivery is disabled until your outstanding cancellation charge of Rs {amount} is paid. You can pay it from your account or add it to your next online order.',
};

const reasonSchema = new Schema(
    {
        code: { type: String, required: true },
        label: { type: String, required: true },
        /** customer = charges apply, anything else = no charge to the customer. */
        faultParty: { type: String, enum: ['customer', 'restaurant', 'rider', 'platform'], default: 'customer' },
    },
    { _id: false }
);

const configSchema = new Schema(
    {
        key: { type: String, default: 'default', unique: true },
        enabled: { type: Boolean, default: true },
        /** Payment methods the stage-based policy covers. Other methods keep the old behaviour. */
        appliesToPaymentMethods: { type: [String], default: ['cash', 'razorpay', 'razorpay_qr', 'wallet'] },
        stage2Statuses: { type: [String], default: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup'] },
        stage3Statuses: { type: [String], default: ['picked_up', 'reached_drop'] },

        stage2: {
            foodPenaltyPercent: { type: Number, default: 20, min: 0, max: 100 },
            includeRiderCompensation: { type: Boolean, default: true },
            includePlatformFee: { type: Boolean, default: true },
            cancellationFee: { type: Number, default: 20, min: 0 },
            /** Restaurant's compensation as % of the food value (the customer pays foodPenaltyPercent, Eqosy keeps the difference). */
            restaurantSharePercent: { type: Number, default: 15, min: 0, max: 100 },
        },
        stage3: {
            foodPenaltyPercent: { type: Number, default: 50, min: 0, max: 100 },
            includeDeliveryFee: { type: Boolean, default: true },
            includePlatformFee: { type: Boolean, default: true },
            cancellationFee: { type: Number, default: 20, min: 0 },
            /** Restaurant's compensation (% of food) when the food is returned to it. */
            restaurantSharePercent: { type: Number, default: 30, min: 0, max: 100 },
            /** Extra amount the rider gets for bringing the food back to the restaurant. */
            riderReturnPay: { type: Number, default: 20, min: 0 },
        },
        /** GST applied on platform fee + cancellation fee (and on the food penalty when gstOnFoodPenalty is on). */
        gstPercent: { type: Number, default: 18, min: 0, max: 100 },
        gstOnFoodPenalty: { type: Boolean, default: false },

        /** Rider compensation = clamp(base + perKm * trackedKm, min, max), using GPS distance travelled to the restaurant. */
        riderCompensation: {
            baseAmount: { type: Number, default: 10, min: 0 },
            perKm: { type: Number, default: 6, min: 0 },
            minAmount: { type: Number, default: 0, min: 0 },
            maxAmount: { type: Number, default: 100, min: 0 },
            minTrackedKm: { type: Number, default: 0.2, min: 0 },
            paidInStage3: { type: Boolean, default: true },
            /** Eqosy still pays the rider's travel when the customer is not charged (restaurant/rider/platform fault). */
            payWhenWaived: { type: Boolean, default: true },
        },

        /** No charge when the restaurant was this many minutes past its approved prep time. */
        restaurantLateGraceMinutes: { type: Number, default: 5, min: 0 },
        cancelReasons: {
            type: [reasonSchema],
            default: () => [
                { code: 'changed_mind', label: 'I changed my mind', faultParty: 'customer' },
                { code: 'ordered_by_mistake', label: 'Ordered by mistake', faultParty: 'customer' },
                { code: 'wrong_address', label: 'Wrong address / location', faultParty: 'customer' },
                { code: 'taking_too_long', label: 'Taking too long', faultParty: 'customer' },
                { code: 'restaurant_issue', label: 'Restaurant problem (item unavailable / delay)', faultParty: 'restaurant' },
                { code: 'rider_issue', label: 'Delivery partner problem', faultParty: 'rider' },
                { code: 'platform_issue', label: 'App / payment problem', faultParty: 'platform' },
                { code: 'other', label: 'Other', faultParty: 'customer' },
            ],
        },

        rescue: {
            enabled: { type: Boolean, default: true },
            /** Prepaid order where the customer never comes to the door: admin may send the food to Food Rescue. */
            noShowEnabled: { type: Boolean, default: true },
            /** Default penalty (% of food value) when an unreceived PREPAID order goes to Food Rescue; admin can change it per case. */
            noShowPenaltyPercent: { type: Number, default: 50, min: 0, max: 100 },
            /** Default penalty (% of food value) suggested when an unreceived COD order is returned to the restaurant. */
            noShowReturnPenaltyPercent: { type: Number, default: 20, min: 0, max: 100 },
            /** Prepaid, Food Rescue SOLD: food penalty % for the original customer (rest of the payment refunded). If nobody buys, the full payment is kept. */
            successPenaltyPercent: { type: Number, default: 60, min: 0, max: 100 },
            radiusKm: { type: Number, default: 3, min: 0.1 },
            windowMinutes: { type: Number, default: 15, min: 1 },
            discountPercent: { type: Number, default: 50, min: 0, max: 100 },
            /** Restaurant gets this % of the rescue SELLING price; Eqosy keeps the rest. */
            restaurantSharePercent: { type: Number, default: 80, min: 0, max: 100 },
            /** If nobody claims in time, the restaurant gets this % of the ORIGINAL food value. */
            failedRestaurantCompPercent: { type: Number, default: 50, min: 0, max: 100 },
            riderKeepsFoodOnExpiry: { type: Boolean, default: true },
            claimHoldMinutes: { type: Number, default: 3, min: 1 },
            /** Charges for the new customer's rescue order, separate from the food price. */
            deliveryFee: { type: Number, default: 30, min: 0 },
            platformFee: { type: Number, default: 0, min: 0 },
            gstPercentOnFood: { type: Number, default: 5, min: 0, max: 100 },
            maxNotifyUsers: { type: Number, default: 200, min: 0 },
        },

        cod: {
            blockWhileOutstanding: { type: Boolean, default: true },
            reminderIntervalHours: { type: Number, default: 24, min: 1 },
        },

        messages: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_MESSAGES }) },
        updatedBy: { type: Schema.Types.ObjectId, default: null },
    },
    { collection: 'food_cancellation_config', timestamps: true, minimize: false }
);

const settlementSchema = new Schema(
    {
        /** Unique per case + purpose so a retry can never pay twice. */
        key: { type: String, required: true },
        party: { type: String, enum: ['RESTAURANT', 'DELIVERY_PARTNER', 'CUSTOMER', 'EQOSY'], required: true },
        partyId: { type: Schema.Types.ObjectId, default: null },
        kind: { type: String, required: true },
        amount: { type: Number, default: 0 },
        status: { type: String, enum: ['done', 'pending', 'failed', 'skipped'], default: 'pending' },
        transactionId: { type: String, default: '' },
        note: { type: String, default: '' },
        at: { type: Date, default: Date.now },
    },
    { _id: false }
);

const caseSchema = new Schema(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'FoodOrder', required: true, unique: true },
        orderLabel: { type: String, default: '' },
        userId: { type: Schema.Types.ObjectId, required: true, index: true },
        restaurantId: { type: Schema.Types.ObjectId, required: true, index: true },
        riderId: { type: Schema.Types.ObjectId, default: null, index: true },
        stage: { type: Number, enum: [1, 2, 3], required: true },
        cancelledFromStatus: { type: String, default: '' },
        status: {
            type: String,
            enum: ['cancelled', 'rescue_active', 'rescue_claimed', 'rescue_expired', 'closed'],
            default: 'cancelled',
            index: true,
        },
        reasonCode: { type: String, default: '' },
        reasonLabel: { type: String, default: '' },
        faultParty: { type: String, default: 'customer' },
        chargeWaived: { type: Boolean, default: false },
        chargeWaivedReason: { type: String, default: '' },
        breakdown: {
            foodValue: { type: Number, default: 0 },
            foodPenaltyPercent: { type: Number, default: 0 },
            foodPenalty: { type: Number, default: 0 },
            restaurantPayable: { type: Number, default: 0 },
            restaurantSharePercent: { type: Number, default: 0 },
            riderReturnPay: { type: Number, default: 0 },
            riderCompensation: { type: Number, default: 0 },
            riderPayable: { type: Number, default: 0 },
            riderTrackedKm: { type: Number, default: 0 },
            deliveryFee: { type: Number, default: 0 },
            platformFee: { type: Number, default: 0 },
            cancellationFee: { type: Number, default: 0 },
            gst: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
        },
        /** Exact rates used, frozen so later admin edits never change a past case. */
        configSnapshot: { type: Schema.Types.Mixed, default: null },
        penaltyId: { type: Schema.Types.ObjectId, default: null },
        /** 'outstanding' = COD style (added to dues). 'refund_deduction' = already paid online, charge cut from the refund. */
        payMode: { type: String, enum: ['outstanding', 'refund_deduction'], default: 'outstanding' },
        paidAmount: { type: Number, default: 0 },
        refund: {
            status: { type: String, enum: ['none', 'held', 'pending', 'processing', 'processed', 'failed'], default: 'none' },
            amount: { type: Number, default: 0 },
            deducted: { type: Number, default: 0 },
            shortfall: { type: Number, default: 0 },
            refundId: { type: String, default: '' },
            attempts: { type: Number, default: 0 },
            error: { type: String, default: '' },
            at: { type: Date, default: null },
        },
        listingId: { type: Schema.Types.ObjectId, default: null },
        /** Notification markers (key:ownerType:ownerId) so every message is delivered exactly once. */
        notified: { type: [String], default: [] },
        settlements: { type: [settlementSchema], default: [] },
        timeline: {
            type: [new Schema({ at: { type: Date, default: Date.now }, event: String, note: String }, { _id: false })],
            default: [],
        },
        override: {
            by: { type: Schema.Types.ObjectId, default: null },
            at: { type: Date, default: null },
            note: { type: String, default: '' },
            previousTotal: { type: Number, default: 0 },
        },
    },
    { collection: 'food_cancellation_cases', timestamps: true }
);
caseSchema.index({ createdAt: -1 });

const listingSchema = new Schema(
    {
        caseId: { type: Schema.Types.ObjectId, ref: 'FoodCancellationCase', required: true, unique: true },
        originalOrderId: { type: Schema.Types.ObjectId, required: true, index: true },
        restaurantId: { type: Schema.Types.ObjectId, required: true },
        restaurantName: { type: String, default: '' },
        riderId: { type: Schema.Types.ObjectId, default: null },
        items: { type: [Schema.Types.Mixed], default: [] },
        originalFoodValue: { type: Number, required: true },
        rescueFoodPrice: { type: Number, required: true },
        discountPercent: { type: Number, default: 50 },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true }, // [lng, lat]
        },
        expiresAt: { type: Date, required: true },
        status: { type: String, enum: ['active', 'held', 'claimed', 'expired', 'cancelled'], default: 'active' },
        heldBy: { type: Schema.Types.ObjectId, default: null },
        holdUntil: { type: Date, default: null },
        holdOrderId: { type: Schema.Types.ObjectId, default: null },
        claimedBy: { type: Schema.Types.ObjectId, default: null },
        claimOrderId: { type: Schema.Types.ObjectId, default: null },
        claimedAt: { type: Date, default: null },
        notifiedCount: { type: Number, default: 0 },
    },
    { collection: 'food_rescue_listings', timestamps: true }
);
listingSchema.index({ location: '2dsphere' });
listingSchema.index({ status: 1, expiresAt: 1 });

const penaltyPaymentSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, required: true, index: true },
        penaltyIds: { type: [Schema.Types.ObjectId], default: [] },
        amount: { type: Number, required: true },
        status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
        razorpayOrderId: { type: String, default: '', index: true },
        razorpayPaymentId: { type: String, default: undefined },
        paidAt: { type: Date, default: null },
    },
    { collection: 'food_penalty_payments', timestamps: true }
);
penaltyPaymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });

const auditSchema = new Schema(
    {
        actorId: { type: Schema.Types.ObjectId, default: null },
        action: { type: String, required: true },
        targetType: { type: String, default: '' },
        targetId: { type: String, default: '' },
        before: { type: Schema.Types.Mixed, default: null },
        after: { type: Schema.Types.Mixed, default: null },
        note: { type: String, default: '' },
    },
    { collection: 'food_cancellation_audit', timestamps: true }
);

export const FoodCancellationConfig = mongoose.model('FoodCancellationConfig', configSchema);
export const FoodCancellationCase = mongoose.model('FoodCancellationCase', caseSchema);
export const FoodRescueListing = mongoose.model('FoodRescueListing', listingSchema);
export const FoodPenaltyPayment = mongoose.model('FoodPenaltyPayment', penaltyPaymentSchema);
export const FoodCancellationAudit = mongoose.model('FoodCancellationAudit', auditSchema);
