import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
  transactionId: String,
  driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver' },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiOwner' },
  amount: Number,
  // 'wallet' = normal wallet withdrawal; 'bus' = payout of completed-trip bus earnings (no wallet money involved)
  kind: { type: String, enum: ['wallet', 'bus'], default: 'wallet' },
  ongoingAmount: { type: Number, default: 0 },
  busBookings: [{ _id: false, bookingId: mongoose.Schema.Types.ObjectId, amount: Number }],
  payment_method: String,
  upiQrCode: String,
  upiId: String,
  accountHolderName: String,
  accountNumber: String,
  ifscCode: String,
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  // Automatic RazorpayX payout. While it is in flight the request stays 'pending'; the webhook completes it.
  payout: {
    razorpayPayoutId: { type: String, index: true },
    status: { type: String, enum: ['queued', 'pending', 'processing', 'processed', 'failed', 'reversed', 'cancelled', 'rejected'] },
    mode: String,
    utr: String,
    attempt: Number,
    verifiedName: String,
    failureReason: String,
    initiatedAt: Date,
    completedAt: Date
  }
}, { timestamps: true });

export const WithdrawalRequest = mongoose.models.TaxiWithdrawalRequest || mongoose.model('TaxiWithdrawalRequest', withdrawalRequestSchema);
