import mongoose from 'mongoose';

/**
 * Penalty put on a customer account (e.g. the customer did not pick up the delivery partner's calls and the order
 * had to be returned to the restaurant). A `pending` penalty is added as a charge to the customer's next order.
 */
const userPenaltySchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        /** The order that caused this penalty */
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', default: null },
        amount: { type: Number, required: true, min: 0 },
        reason: { type: String, default: '', trim: true },
        status: { type: String, enum: ['pending', 'applied', 'paid', 'waived'], default: 'pending', index: true },
        /** 'cancellation_policy' penalties also disable Cash on Delivery until they are paid. */
        source: { type: String, default: '', index: true },
        caseId: { type: mongoose.Schema.Types.ObjectId, default: null },
        breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
        /** Set only when the money was actually received (verified online payment). */
        paidAt: { type: Date, default: null },
        lastReminderAt: { type: Date, default: null },
        paidVia: { type: String, default: '' },
        paidRef: { type: String, default: '' },
        waivedReason: { type: String, default: '' },
        /** The later order the penalty was charged on */
        appliedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', default: null },
        appliedAt: { type: Date, default: null },
        createdByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    { collection: 'food_user_penalties', timestamps: true }
);

userPenaltySchema.index({ userId: 1, status: 1, createdAt: 1 });

export const FoodUserPenalty = mongoose.model('FoodUserPenalty', userPenaltySchema);
