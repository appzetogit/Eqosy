import mongoose from 'mongoose';

const foodReviewSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodOrder',
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true
        },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            default: null,
            index: true
        },
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            default: null,
            index: true
        },
        targetType: {
            type: String,
            enum: ['restaurant', 'delivery_partner'],
            required: true,
            index: true
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            default: '',
            trim: true
        }
    },
    {
        timestamps: true
    }
);

foodReviewSchema.index({ restaurantId: 1, createdAt: -1 });
foodReviewSchema.index({ deliveryPartnerId: 1, createdAt: -1 });

export const FoodReview = mongoose.models.FoodReview || mongoose.model('FoodReview', foodReviewSchema);
