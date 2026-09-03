import mongoose from 'mongoose';

const tripInstanceSchema = new mongoose.Schema(
  {
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
    departureDateTime: {
      type: Date,
      required: true,
    },
    arrivalDateTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'boarding', 'in_transit', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    generationStatus: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
      index: true,
    },
    busId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      default: null,
    },
    busSnapshot: {
      registrationNumber: { type: String, default: '' },
      model: { type: String, default: '' },
      capacity: { type: Number, default: 0 },
      operatorId: { type: mongoose.Schema.Types.ObjectId, default: null },
      operatorName: { type: String, default: '' },
    },
    assignedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusDriver',
      default: null,
      index: true,
    },
    driverSnapshot: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      licenseNumber: { type: String, default: '' },
    },
    blueprintSnapshot: {
      templateKey: { type: String, default: 'seater_2_2' },
      lowerDeck: { type: mongoose.Schema.Types.Mixed, default: [] },
      upperDeck: { type: mongoose.Schema.Types.Mixed, default: [] },
    },
    cancellationReason: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

tripInstanceSchema.index(
  { busServiceId: 1, scheduleId: 1, travelDate: 1 },
  { unique: true, name: 'unique_trip_instance' },
);

export const TripInstance =
  mongoose.models.TaxiTripInstance || mongoose.model('TaxiTripInstance', tripInstanceSchema);
