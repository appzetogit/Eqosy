import mongoose from 'mongoose';

/**
 * Admin-configurable league slabs (single document, key = 'default').
 * A slab covers monthly sales up to and including `maxSales` (and above the previous slab's `maxSales`).
 * The last slab has `maxSales = null` (open-ended).
 */
const slabSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        maxSales: { type: Number, default: null, min: 0 },
        commissionPercent: { type: Number, required: true, min: 0, max: 100 },
        color: { type: String, default: '' }
    },
    { _id: false }
);

const settingsSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },
        enabled: { type: Boolean, default: true },
        /** Used when the league system is disabled globally and a restaurant has no custom admin commission. */
        fallbackPercent: { type: Number, default: 10, min: 0, max: 100 },
        slabs: { type: [slabSchema], default: [] },
        updatedBy: {
            adminId: { type: mongoose.Schema.Types.ObjectId, default: null },
            name: { type: String, default: '' }
        }
    },
    { collection: 'food_commission_league_settings', timestamps: true }
);

export const FoodCommissionLeagueSettings = mongoose.model('FoodCommissionLeagueSettings', settingsSchema);

/** Immutable record of every admin change (slabs, global switch, per-restaurant override). */
const auditSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ['settings_updated', 'restaurant_custom_set', 'restaurant_custom_updated', 'restaurant_league_enabled'],
            required: true,
            index: true
        },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', default: null, index: true },
        restaurantName: { type: String, default: '' },
        before: { type: mongoose.Schema.Types.Mixed, default: null },
        after: { type: mongoose.Schema.Types.Mixed, default: null },
        note: { type: String, default: '' },
        adminId: { type: mongoose.Schema.Types.ObjectId, default: null },
        adminName: { type: String, default: '' }
    },
    { collection: 'food_commission_league_audit', timestamps: { createdAt: true, updatedAt: false } }
);
auditSchema.index({ createdAt: -1 });

export const FoodCommissionLeagueAudit = mongoose.model('FoodCommissionLeagueAudit', auditSchema);

/** Frozen result of a completed calendar month, so past league labels survive later slab edits. */
const monthlySnapshotSchema = new mongoose.Schema(
    {
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true },
        monthKey: { type: String, required: true }, // YYYY-MM (IST calendar month)
        sales: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
        commissionDeducted: { type: Number, default: 0 },
        leagueKey: { type: String, default: '' },
        leagueName: { type: String, default: '' },
        slabCommissionPercent: { type: Number, default: 0 }
    },
    { collection: 'food_restaurant_monthly_league', timestamps: true }
);
monthlySnapshotSchema.index({ restaurantId: 1, monthKey: 1 }, { unique: true });
monthlySnapshotSchema.index({ monthKey: 1 });

export const FoodRestaurantMonthlyLeague = mongoose.model('FoodRestaurantMonthlyLeague', monthlySnapshotSchema);
