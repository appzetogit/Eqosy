import mongoose from 'mongoose';

const busSeatHoldSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiTripInstance',
      required: true,
      index: true,
    },
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusDriver',
      default: null,
      index: true,
    },
    scheduleId: {
      type: String,
      required: true,
      trim: true,
    },
    travelDate: {
      type: String,
      required: true,
      trim: true,
    },
    seatId: {
      type: String,
      required: true,
      trim: true,
    },
    seatIds: {
      type: [String],
      default: [],
    },
    holdToken: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['held', 'converted', 'expired', 'released'],
      default: 'held',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

busSeatHoldSchema.index({ tripId: 1, holdToken: 1 });
busSeatHoldSchema.index({ tripId: 1, seatId: 1, status: 1 });

export const BusSeatHold =
  mongoose.models.TaxiBusSeatHold || mongoose.model('TaxiBusSeatHold', busSeatHoldSchema);

