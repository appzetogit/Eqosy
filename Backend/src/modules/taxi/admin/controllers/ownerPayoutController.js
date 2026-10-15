import mongoose from 'mongoose';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { Owner } from '../models/Owner.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { OwnerWalletTransaction } from '../models/OwnerWalletTransaction.js';
import { createTaxiPayout } from '../../services/withdrawalPayout.service.js';
import { isRazorpayxConfigured } from '../../../../core/payments/razorpayx.service.js';
import {
  applyOwnerWalletAdjustment,
  finishBusPayoutRequest,
  getOwnerPayoutSettings,
  resolveOwnerPayout,
  updateOwnerPayoutOverride,
  updateOwnerPayoutSettings,
} from '../../services/ownerPayoutService.js';

const ok = (res, data, message = 'OK') => res.json({ success: true, message, data });

export const getOwnerPayoutSettingsController = asyncHandler(async (_req, res) =>
  ok(res, await getOwnerPayoutSettings()),
);

export const updateOwnerPayoutSettingsController = asyncHandler(async (req, res) =>
  ok(res, await updateOwnerPayoutSettings(req.body || {}), 'Owner payout settings saved'),
);

export const getOwnerPayoutController = asyncHandler(async (req, res) => {
  const owner = await Owner.findById(req.params.id).select('payout wallet company_name name').lean();
  if (!owner) throw new ApiError(404, 'Owner not found');
  ok(res, {
    override: owner.payout || { model: 'default', ownerSharePercent: null },
    effective: await resolveOwnerPayout(owner),
    global: await getOwnerPayoutSettings(),
    walletBalance: Number(owner.wallet?.balance || 0),
  });
});

export const updateOwnerPayoutController = asyncHandler(async (req, res) =>
  ok(res, await updateOwnerPayoutOverride(req.params.id, req.body || {}), 'Owner payout rule saved'),
);

const serializeRequest = (item) => ({
  _id: String(item._id),
  transactionId: item.transactionId || '',
  amount: Number(item.amount || 0),
  kind: item.kind || 'wallet',
  ongoingAmount: Number(item.ongoingAmount || 0),
  status: item.status || 'pending',
  payment_method: item.payment_method || '',
  upiId: item.upiId || '',
  accountHolderName: item.accountHolderName || '',
  accountNumber: item.accountNumber || '',
  ifscCode: item.ifscCode || '',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const listOwnerWithdrawalsController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Valid owner id is required');
  const owner = await Owner.findById(id).select('company_name owner_name name mobile email wallet').lean();
  if (!owner) throw new ApiError(404, 'Owner not found');
  const requests = await WithdrawalRequest.find({ owner_id: id }).sort({ createdAt: -1 }).lean();
  ok(res, {
    owner: {
      _id: String(owner._id),
      name: owner.company_name || owner.owner_name || owner.name || '',
      mobile: owner.mobile || '',
      email: owner.email || '',
      wallet_balance: Number(owner.wallet?.balance || 0).toFixed(2),
    },
    results: requests.map(serializeRequest),
  });
});

export const approveOwnerWithdrawalController = asyncHandler(async (req, res) => {
  // Auto payout (RazorpayX): create the payout and leave the request 'pending'; the payout webhook completes it
  // (and does the paid bookkeeping) once the bank confirms.
  if (isRazorpayxConfigured()) {
    const pending = await WithdrawalRequest.findOne({
      _id: req.params.requestId,
      owner_id: { $ne: null },
      status: 'pending',
    }).lean();
    if (!pending) throw new ApiError(409, 'Request not found or already processed');
    const payout = await createTaxiPayout(pending);
    const started = await WithdrawalRequest.findOneAndUpdate(
      { _id: pending._id, status: 'pending' },
      { $set: { payout } },
      { new: true },
    ).lean();
    if (!started) throw new ApiError(409, 'Request was already processed');
    return ok(res, serializeRequest(started), 'Payout started. It will be marked paid once the bank confirms.');
  }

  const request = await WithdrawalRequest.findOneAndUpdate(
    { _id: req.params.requestId, owner_id: { $ne: null }, status: 'pending' },
    { $set: { status: 'completed' } },
    { new: true },
  ).lean();
  if (!request) throw new ApiError(409, 'Request not found or already processed');
  if (request.kind === 'bus') {
    await finishBusPayoutRequest(request, true);
    return ok(res, serializeRequest(request), 'Bus payout marked as paid');
  }
  // Money was already reserved from the wallet when the owner asked; approving only marks it paid out.
  await OwnerWalletTransaction.updateOne(
    { ownerId: request.owner_id, 'metadata.withdrawalRequestId': String(request._id) },
    { $set: { title: `Withdrawal paid (${String(request.payment_method || '').toUpperCase()})` } },
  );
  ok(res, serializeRequest(request), 'Withdrawal marked as paid');
});

export const rejectOwnerWithdrawalController = asyncHandler(async (req, res) => {
  const request = await WithdrawalRequest.findOneAndUpdate(
    {
      _id: req.params.requestId,
      owner_id: { $ne: null },
      status: 'pending',
      // never refund while a RazorpayX payout is in flight or done
      'payout.status': { $nin: ['queued', 'pending', 'processing', 'processed'] },
    },
    { $set: { status: 'cancelled' } },
    { new: true },
  ).lean();
  if (!request) throw new ApiError(409, 'Request not found or already processed');
  if (request.kind === 'bus') {
    await finishBusPayoutRequest(request, false);
    return ok(res, serializeRequest(request), 'Bus payout rejected');
  }
  await applyOwnerWalletAdjustment({
    ownerId: request.owner_id,
    amount: Number(request.amount || 0),
    category: 'withdrawal_reversal',
    title: 'Withdrawal rejected · amount returned',
    metadata: { withdrawalRequestId: String(request._id), reason: String(req.body?.reason || '') },
  });
  ok(res, serializeRequest(request), 'Withdrawal rejected and amount returned to wallet');
});
