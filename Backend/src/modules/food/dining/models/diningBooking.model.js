import mongoose from 'mongoose';

const diningBookingSchema = new mongoose.Schema(
    {
        bookingId: { type: String, required: true, unique: true, index: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        user: {
            name: { type: String, trim: true, default: '' },
            phone: { type: String, trim: true, default: '' },
            email: { type: String, trim: true, default: '' }
        },
        guests: { type: Number, required: true, min: 1, max: 100 },
        date: { type: Date, required: true, index: true },
        timeSlot: { type: String, required: true, trim: true },
        specialRequest: { type: String, trim: true, default: '' },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'accepted', 'checked-in', 'completed', 'cancelled', 'rejected', 'no_show'],
            default: 'confirmed',
            index: true
        },
        review: {
            rating: { type: Number, min: 0, max: 5 },
            comment: { type: String, trim: true, default: '' },
            createdAt: { type: Date }
        }
    },
    { collection: 'food_dining_bookings', timestamps: true }
);

diningBookingSchema.index({ restaurantId: 1, date: -1 });
diningBookingSchema.index({ userId: 1, createdAt: -1 });

export const FoodDiningBooking = mongoose.model('FoodDiningBooking', diningBookingSchema);
