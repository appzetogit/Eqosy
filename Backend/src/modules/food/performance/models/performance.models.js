import mongoose from 'mongoose';

const { Schema } = mongoose;

/* ---------- Admin-editable configuration (singleton) ---------- */
const delaySlabSchema = new Schema(
    {
        fromMin: { type: Number, required: true, min: 0 },
        toMin: { type: Number, default: null }, // null = open ended
        action: { type: String, enum: ['warning', 'penalty'], default: 'penalty' },
        amount: { type: Number, default: 0, min: 0 },
        strike: { type: Number, default: 0, min: 0 }
    },
    { _id: false }
);
const rejectionSlabSchema = new Schema(
    {
        occurrence: { type: Number, required: true, min: 1 }, // Nth rejection in the month; the last slab repeats
        action: { type: String, enum: ['warning', 'penalty'], default: 'penalty' },
        amount: { type: Number, default: 0, min: 0 },
        strike: { type: Number, default: 0, min: 0 },
        adminReview: { type: Boolean, default: false }
    },
    { _id: false }
);
const strikeStepSchema = new Schema(
    {
        count: { type: Number, required: true, min: 1 },
        action: { type: String, enum: ['warning', 'notice', 'suspend', 'review'], default: 'warning' },
        suspendHours: { type: Number, default: 0, min: 0 }
    },
    { _id: false }
);
const orderTierSchema = new Schema(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
        minItems: { type: Number, required: true, min: 0 },
        maxItems: { type: Number, default: null },
        extraMinutes: { type: Number, default: 0, min: 0 }, // suggested extra time
        maxExtraMinutes: { type: Number, default: 0, min: 0 }, // hard cap per request; 0 = extra time not allowed
        needsCustomerApproval: { type: Boolean, default: true },
        needsAdminApproval: { type: Boolean, default: false },
        countsAsBulk: { type: Boolean, default: false }
    },
    { _id: false }
);

const defaultDelaySlabs = () => [
    { fromMin: 1, toMin: 5, action: 'warning', amount: 0, strike: 0 },
    { fromMin: 6, toMin: 10, action: 'penalty', amount: 10, strike: 0 },
    { fromMin: 11, toMin: 20, action: 'penalty', amount: 20, strike: 0 },
    { fromMin: 21, toMin: null, action: 'penalty', amount: 30, strike: 1 }
];
const defaultRejectionSlabs = () => [
    { occurrence: 1, action: 'warning', amount: 0, strike: 0 },
    { occurrence: 2, action: 'penalty', amount: 10, strike: 0 },
    { occurrence: 3, action: 'penalty', amount: 20, strike: 0 },
    { occurrence: 4, action: 'penalty', amount: 30, strike: 1 },
    { occurrence: 5, action: 'penalty', amount: 30, strike: 1, adminReview: true }
];

const performanceConfigSchema = new Schema(
    {
        key: { type: String, default: 'default', unique: true },
        enabled: { type: Boolean, default: true },
        defaultPrepMinutes: { type: Number, default: 20, min: 1 },
        /** Ceiling for a restaurant-entered prep time on accept. */
        maxPrepMinutes: { type: Number, default: 120, min: 1 },
        /** Warn restaurant / rider this many minutes BEFORE their deadline, with the penalty that follows. */
        preWarnMinutes: { type: Number, default: 3, min: 0 },
        /** Offset from UTC deciding which "month" a violation belongs to (IST = 330). */
        timezoneOffsetMin: { type: Number, default: 330 },
        /** Seconds of lateness ignored before any delay is counted. */
        graceSeconds: { type: Number, default: 0, min: 0 },
        /** Partial minutes: floor (5m59s = 5) or ceil (5m01s = 6). */
        delayRounding: { type: String, enum: ['floor', 'ceil'], default: 'floor' },
        /** Extension can be requested until approvedEta + this many minutes (0 = only before the deadline). */
        extensionCutoffMin: { type: Number, default: 0, min: 0 },
        /** Delivery ETA = base + perKm * distance + buffer, counted from the real pickup time. */
        deliveryBaseMinutes: { type: Number, default: 8, min: 0 },
        deliveryMinutesPerKm: { type: Number, default: 4, min: 0 },
        deliveryBufferMinutes: { type: Number, default: 5, min: 0 },
        externalDelayReasons: { type: [String], default: ['traffic_jam', 'heavy_rain', 'road_closure', 'customer_location_issue', 'customer_unreachable'] },
        maxExternalDelayMinutes: { type: Number, default: 30, min: 0 },
        restaurantDelaySlabs: { type: [delaySlabSchema], default: defaultDelaySlabs },
        deliveryDelaySlabs: { type: [delaySlabSchema], default: defaultDelaySlabs },
        restaurantRejectionSlabs: { type: [rejectionSlabSchema], default: defaultRejectionSlabs },
        deliveryRejectionSlabs: { type: [rejectionSlabSchema], default: defaultRejectionSlabs },
        strikeLadder: {
            type: [strikeStepSchema],
            default: () => [
                { count: 1, action: 'warning' },
                { count: 2, action: 'notice' },
                { count: 3, action: 'suspend', suspendHours: 24 },
                { count: 4, action: 'suspend', suspendHours: 72 },
                { count: 5, action: 'review' }
            ]
        },
        orderTiers: {
            type: [orderTierSchema],
            default: () => [
                { key: 'normal', label: 'Normal Order', minItems: 1, maxItems: 5, extraMinutes: 0, maxExtraMinutes: 0, needsCustomerApproval: false },
                { key: 'additional_time', label: 'Additional Time Request', minItems: 6, maxItems: 15, extraMinutes: 10, maxExtraMinutes: 20 },
                { key: 'bulk', label: 'Bulk Order', minItems: 16, maxItems: 30, extraMinutes: 20, maxExtraMinutes: 40, countsAsBulk: true },
                { key: 'special_bulk', label: 'Special Bulk Order', minItems: 31, maxItems: null, extraMinutes: 40, maxExtraMinutes: 90, needsAdminApproval: true, countsAsBulk: true }
            ]
        },
        extensionResponseWindowMin: { type: Number, default: 5, min: 1 },
        /** A rejection with one of these reason codes is waived automatically (no penalty, no strike). */
        validRejectionReasons: {
            type: [String],
            default: ['out_of_stock', 'technical_issue', 'outside_service_area', 'unsafe_conditions', 'restaurant_closed']
        },
        /** true = a valid reason waives instantly; false = held in 'pending' for admin review. */
        autoWaiveValidReasons: { type: Boolean, default: false },
        /** If true, every penalty starts 'pending' and needs admin approval; otherwise 'applied'. */
        requireAdminApproval: { type: Boolean, default: false },
        autoEnforceSuspension: { type: Boolean, default: false },
        updatedBy: { type: Schema.Types.ObjectId, default: null }
    },
    { collection: 'food_performance_config', timestamps: true }
);

/* ---------- Penalty ledger ---------- */
const penaltyLedgerSchema = new Schema(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'FoodOrder', required: false, default: null, index: true }, // empty for manual admin entries
        partyType: { type: String, enum: ['RESTAURANT', 'DELIVERY_PARTNER'], required: true },
        partyId: { type: Schema.Types.ObjectId, required: true },
        violationType: {
            type: String,
            enum: ['PREP_DELAY', 'DELIVERY_DELAY', 'ORDER_REJECTION', 'ASSIGNMENT_REJECTION', 'POST_ACCEPT_CANCELLATION', 'MANUAL'],
            required: true
        },
        reason: { type: String, default: '' },
        reasonCode: { type: String, default: '' },
        originalEta: { type: Date, default: null },
        approvedEta: { type: Date, default: null },
        actualAt: { type: Date, default: null },
        delayMinutes: { type: Number, default: 0 },
        occurrenceInMonth: { type: Number, default: 0 },
        stage: { type: String, enum: ['warning', 'penalty', 'waived_auto'], required: true },
        amount: { type: Number, default: 0 },
        strikeCount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['warning', 'pending', 'applied', 'disputed', 'waived', 'reversed'],
            default: 'applied',
            index: true
        },
        statusReason: { type: String, default: '' },
        month: { type: String, index: true }, // YYYY-MM
        dedupeKey: { type: String, required: true, unique: true },
        decidedBy: { type: Schema.Types.ObjectId, default: null },
        /** Finance marks a penalty settled once deducted from the payout. Never auto-deducted by this module. */
        reviewHold: { type: Boolean, default: false }, // valid reason claimed / pending adjustment: waiting for admin
        adminReview: { type: Boolean, default: false },
        settled: { type: Boolean, default: false },
        settledAt: { type: Date, default: null },
        /** Wallet integration: the penalty is debited from the party wallet once, and refunded once on waive/reverse. */
        walletDebited: { type: Boolean, default: false },
        walletDebitedAmount: { type: Number, default: 0 },
        walletDebitedAt: { type: Date, default: null },
        walletRefunded: { type: Boolean, default: false },
        createdByAdminId: { type: Schema.Types.ObjectId, default: null }
    },
    { collection: 'food_penalty_ledger', timestamps: true }
);
penaltyLedgerSchema.index({ partyType: 1, partyId: 1, month: 1, violationType: 1 });

/* ---------- Restaurant / delivery wallet movements caused by penalties and admin adjustments ---------- */
const partyWalletTxnSchema = new Schema(
    {
        partyType: { type: String, enum: ['RESTAURANT', 'DELIVERY_PARTNER'], required: true },
        partyId: { type: Schema.Types.ObjectId, required: true },
        type: { type: String, enum: ['penalty_debit', 'penalty_refund', 'penalty_adjust', 'admin_credit', 'admin_debit'], required: true },
        amount: { type: Number, required: true }, // signed: negative = money taken from the wallet
        balanceAfter: { type: Number, default: 0 },
        ledgerId: { type: Schema.Types.ObjectId, default: null },
        orderId: { type: Schema.Types.ObjectId, default: null },
        note: { type: String, default: '' },
        actorId: { type: Schema.Types.ObjectId, default: null }
    },
    { collection: 'food_party_wallet_txns', timestamps: true }
);
partyWalletTxnSchema.index({ partyType: 1, partyId: 1, createdAt: -1 });

/* ---------- Strikes ---------- */
const strikeSchema = new Schema(
    {
        partyType: { type: String, enum: ['RESTAURANT', 'DELIVERY_PARTNER'], required: true },
        partyId: { type: Schema.Types.ObjectId, required: true },
        ledgerId: { type: Schema.Types.ObjectId, ref: 'FoodPenaltyLedger', required: true, unique: true },
        orderId: { type: Schema.Types.ObjectId, default: null },
        month: { type: String, index: true },
        monthlyCount: { type: Number, default: 1 },
        action: { type: String, enum: ['warning', 'notice', 'suspend', 'review'], default: 'warning' },
        suspendedUntil: { type: Date, default: null },
        revoked: { type: Boolean, default: false }
    },
    { collection: 'food_strikes', timestamps: true }
);
strikeSchema.index({ partyType: 1, partyId: 1, month: 1 });

/* ---------- Prep extension ---------- */
const prepExtensionSchema = new Schema(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'FoodOrder', required: true, index: true },
        restaurantId: { type: Schema.Types.ObjectId, required: true },
        userId: { type: Schema.Types.ObjectId, required: true },
        tierKey: { type: String, default: '' },
        itemCount: { type: Number, default: 0 },
        originalEta: { type: Date, required: true },
        requestedEta: { type: Date, required: true },
        extraMinutes: { type: Number, required: true },
        reason: { type: String, required: true, trim: true },
        status: {
            type: String,
            enum: ['pending_admin', 'pending_customer', 'approved', 'rejected', 'expired'],
            default: 'pending_customer'
        },
        respondedAt: { type: Date, default: null },
        respondedBy: { type: String, default: '' }, // USER | ADMIN | SYSTEM
        expiresAt: { type: Date, default: null }
    },
    { collection: 'food_prep_extensions', timestamps: true }
);

/* ---------- Appeals ---------- */
const appealSchema = new Schema(
    {
        ledgerId: { type: Schema.Types.ObjectId, ref: 'FoodPenaltyLedger', required: true, index: true },
        partyType: { type: String, enum: ['RESTAURANT', 'DELIVERY_PARTNER'], required: true },
        partyId: { type: Schema.Types.ObjectId, required: true, index: true },
        reason: { type: String, required: true, trim: true },
        evidence: { type: [String], default: [] },
        status: { type: String, enum: ['open', 'approved', 'rejected'], default: 'open', index: true },
        adminNote: { type: String, default: '' },
        decidedBy: { type: Schema.Types.ObjectId, default: null },
        decidedAt: { type: Date, default: null }
    },
    { collection: 'food_penalty_appeals', timestamps: true }
);

/* ---------- Audit log ---------- */
const auditSchema = new Schema(
    {
        actorType: { type: String, default: 'ADMIN' },
        actorId: { type: Schema.Types.ObjectId, default: null },
        action: { type: String, required: true },
        targetType: { type: String, default: '' },
        targetId: { type: String, default: '' },
        before: { type: Schema.Types.Mixed, default: null },
        after: { type: Schema.Types.Mixed, default: null },
        note: { type: String, default: '' }
    },
    { collection: 'food_performance_audit', timestamps: true }
);

export const FoodPerformanceConfig = mongoose.model('FoodPerformanceConfig', performanceConfigSchema);
export const FoodPenaltyLedger = mongoose.model('FoodPenaltyLedger', penaltyLedgerSchema);
export const FoodPartyWalletTxn = mongoose.model('FoodPartyWalletTxn', partyWalletTxnSchema);
export const FoodStrike = mongoose.model('FoodStrike', strikeSchema);
export const FoodPrepExtension = mongoose.model('FoodPrepExtension', prepExtensionSchema);
export const FoodPenaltyAppeal = mongoose.model('FoodPenaltyAppeal', appealSchema);
export const FoodPerformanceAudit = mongoose.model('FoodPerformanceAudit', auditSchema);
