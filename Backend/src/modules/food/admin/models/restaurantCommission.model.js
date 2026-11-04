import mongoose from 'mongoose';

const restaurantCommissionSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            unique: true,
            index: true
        },
        defaultCommission: {
            type: {
                type: String,
                enum: ['percentage', 'amount'],
                default: 'percentage'
            },
            value: { type: Number, default: 0 }
        },
        /**
         * An active row (status !== false) is a CUSTOM ADMIN commission: the automatic league rules are skipped for
         * this restaurant. Disabling the row (status=false) hands the restaurant back to the league system.
         */
        notes: { type: String, trim: true, default: '' },
        status: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_restaurant_commissions', timestamps: true }
);


export const FoodRestaurantCommission = mongoose.model('FoodRestaurantCommission', restaurantCommissionSchema);

