import mongoose from 'mongoose';

const tripSeatInventorySchema = new mongoose.Schema(
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
    scheduleId: {
      type: String,
      required: true,
      trim: true,
    },
    travelDate: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    seatId: {
      type: String,
      required: true,
      trim: true,
    },
    seatLabel: {
      type: String,
      default: '',
      trim: true,
    },
    deck: {
      type: String,
      enum: ['lower', 'upper'],
      default: 'lower',
    },
    seatType: {
      type: String,
      enum: ['seat', 'window', 'aisle', 'sleeper'],
      default: 'seat',
    },
    position: {
      row: { type: Number, default: 0 },
      col: { type: Number, default: 0 },
    },
    price: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['available', 'held', 'booked', 'blocked'],
      default: 'available',
      index: true,
    },
    bookedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiUser', default: null },
      driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiBusDriver', default: null },
      bookingSource: { type: String, enum: ['user', 'bus_driver', 'admin'], default: 'user' },
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      default: null,
      index: true,
    },
    holdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusSeatHold',
      default: null,
      index: true,
    },
    holdExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

tripSeatInventorySchema.index(
  { tripId: 1, seatId: 1 },
  { unique: true, name: 'unique_trip_seat_inventory' },
);

export const TripSeatInventory =
  mongoose.models.TaxiTripSeatInventory ||
  mongoose.model('TaxiTripSeatInventory', tripSeatInventorySchema);
