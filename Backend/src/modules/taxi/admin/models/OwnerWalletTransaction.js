import mongoose from 'mongoose';

const ownerWalletTransactionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiOwner',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    kind: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
    // ride_earning | bus_earning | bus_refund | commission | withdrawal | withdrawal_reversal | adjustment
    category: { type: String, default: 'adjustment', index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiRide', default: null },
    busBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiBusBooking', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const OwnerWalletTransaction = mongoose.model('TaxiOwnerWalletTransaction', ownerWalletTransactionSchema);