import mongoose from 'mongoose';

const deliverySelfieLogSchema = new mongoose.Schema(
  {
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodDeliveryPartner',
      required: true,
      index: true
    },
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodGig',
      default: null
    },
    selfieUrl: {
      type: String,
      required: true
    },
    profilePhotoUrl: {
      type: String,
      default: ''
    },
    matchScore: {
      type: Number,
      default: 0 // Percentage 0 - 100
    },
    status: {
      type: String,
      enum: ['verified', 'failed', 'flagged'],
      required: true,
      index: true
    },
    failureReason: {
      type: String,
      default: ''
    },
    capturedAt: {
      type: Date,
      default: Date.now
    },
    reviewedByAdmin: {
      type: Boolean,
      default: false
    },
    adminNote: {
      type: String,
      default: ''
    }
  },
  {
    collection: 'delivery_selfie_logs',
    timestamps: true
  }
);

deliverySelfieLogSchema.index({ deliveryPartnerId: 1, createdAt: -1 });

export const DeliverySelfieLog = mongoose.models.DeliverySelfieLog || mongoose.model('DeliverySelfieLog', deliverySelfieLogSchema);
