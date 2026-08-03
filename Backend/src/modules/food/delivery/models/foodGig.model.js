import mongoose from 'mongoose';

const foodGigSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Delivery Shift'
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true
    },
    startTime: {
      type: String, // HH:mm (24-hour)
      required: true
    },
    endTime: {
      type: String, // HH:mm (24-hour)
      required: true
    },
    startDateTime: {
      type: Date,
      required: true,
      index: true
    },
    endDateTime: {
      type: Date,
      required: true,
      index: true
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodZone',
      default: null,
      index: true
    },
    zoneName: {
      type: String,
      default: 'All Zones',
      trim: true
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      default: 20
    },
    bookedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    cancellationCutoffMinutes: {
      type: Number,
      default: 60, // 60 mins before start time
      min: 0
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled'],
      default: 'active',
      index: true
    },
    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  {
    collection: 'food_gigs',
    timestamps: true
  }
);

foodGigSchema.index({ date: 1, status: 1 });
foodGigSchema.index({ startDateTime: 1, endDateTime: 1 });

export const FoodGig = mongoose.models.FoodGig || mongoose.model('FoodGig', foodGigSchema);
