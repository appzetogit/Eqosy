import mongoose from 'mongoose';

const foodGigBookingSchema = new mongoose.Schema(
  {
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodGig',
      required: true,
      index: true
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodDeliveryPartner',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['booked', 'completed', 'cancelled', 'no_show'],
      default: 'booked',
      index: true
    },
    bookedAt: {
      type: Date,
      default: Date.now
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    reminder10MinSent: {
      type: Boolean,
      default: false
    },
    reminder10MinSentAt: {
      type: Date,
      default: null
    },
    shiftStartedRingSent: {
      type: Boolean,
      default: false
    },
    lastRingAt: {
      type: Date,
      default: null
    },
    ringCount: {
      type: Number,
      default: 0
    }
  },
  {
    collection: 'food_gig_bookings',
    timestamps: true
  }
);

foodGigBookingSchema.index({ gigId: 1, deliveryPartnerId: 1, status: 1 });
foodGigBookingSchema.index({ deliveryPartnerId: 1, status: 1 });

export const FoodGigBooking = mongoose.models.FoodGigBooking || mongoose.model('FoodGigBooking', foodGigBookingSchema);
