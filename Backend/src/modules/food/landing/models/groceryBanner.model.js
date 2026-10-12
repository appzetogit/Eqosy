import mongoose from 'mongoose';

const foodGroceryBannerSchema = new mongoose.Schema(
    {
        imageUrl: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        },
        title: {
            type: String
        },
        ctaText: {
            type: String
        },
        ctaLink: {
            type: String
        },
        sortOrder: {
            type: Number,
            default: 0,
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_grocery_banners',
        timestamps: true
    }
);

foodGroceryBannerSchema.index({ isActive: 1, sortOrder: 1 });

export const FoodGroceryBanner = mongoose.model('FoodGroceryBanner', foodGroceryBannerSchema);

