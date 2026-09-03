import mongoose from 'mongoose';

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    payloadHash: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['processed', 'ignored', 'failed'],
      default: 'processed',
      index: true,
    },
    error: {
      type: String,
      default: '',
      trim: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export const RazorpayWebhookEvent =
  mongoose.models.TaxiRazorpayWebhookEvent ||
  mongoose.model('TaxiRazorpayWebhookEvent', razorpayWebhookEventSchema);
