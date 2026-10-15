import { ApiError } from '../../../utils/ApiError.js';
import { logger } from '../../../utils/logger.js';
import { isRazorpayxConfigured } from '../../../core/payments/razorpayx.service.js';
import { assertVerifiedForPayout, verifyPayoutAccount } from '../../../core/payments/payoutAccount.service.js';
import { sendVerifiedPayout } from '../../../core/payments/payout.service.js';
import { Driver } from '../driver/models/Driver.js';
import { Owner } from '../admin/models/Owner.js';
import { WithdrawalRequest } from '../admin/models/WithdrawalRequest.js';
import { OwnerWalletTransaction } from '../admin/models/OwnerWalletTransaction.js';
import { finishBusPayoutRequest } from './ownerPayoutService.js';

/**
 * Taxi withdrawals (driver wallet, owner wallet, owner bus payouts) use the shared RazorpayX flow:
 *   1. account is verified (penny drop + name match) when the details are given,
 *   2. admin approval creates the payout while the request stays 'pending',
 *   3. the payout webhook completes the request (or leaves it pending, with the failure shown, so it can be retried).
 * The wallet money / bus bookings were reserved when the request was made, so a failed payout needs no refund.
 */

const IN_FLIGHT = ['queued', 'pending', 'processing'];
const FAILED = ['failed', 'reversed', 'cancelled', 'rejected'];

/** Account to pay for a request, honouring the chosen payment method (UPI vs bank). */
export const requestAccountInput = (request) =>
    String(request.payment_method || '').toLowerCase() === 'upi'
        ? { upiId: request.upiId }
        : { accountNumber: request.accountNumber, ifsc: request.ifscCode };

const ownerIdentityNames = (owner) =>
    [owner.owner_name, [owner.name, owner.surname].filter(Boolean).join(' '), owner.name, owner.company_name].filter(Boolean);

/**
 * Called when someone gives bank/UPI details for a payout. Verifies that the account belongs to them and throws
 * (so no money is reserved) unless it is verified. No-op when RazorpayX is not configured.
 */
export async function ensureTaxiAccountVerified({ kind, doc, input }) {
    if (!isRazorpayxConfigured()) return null;
    const isDriver = kind === 'driver';
    const result = await verifyPayoutAccount({
        Model: isDriver ? Driver : Owner,
        docId: doc._id,
        ownerType: isDriver ? 'taxi_driver' : 'taxi_owner',
        identityNames: isDriver ? [doc.name] : ownerIdentityNames(doc),
        phone: doc.phone || doc.mobile,
        email: doc.email,
        input,
    });
    if (result.status === 'verified') return result;

    const message =
        result.status === 'name_mismatch'
            ? `The account holder name (${result.registeredName}) does not match your registered name. Please use your own bank account.`
            : result.status === 'pending'
                ? 'Bank verification is in progress. Please try again in a minute.'
                : result.failureReason || 'Bank details could not be verified. Please check them and try again.';
    throw new ApiError(result.status === 'pending' ? 409 : 400, message);
}

/** Creates the payout for a pending request. Returns the payout sub-document, or null if auto payout is off. */
export async function createTaxiPayout(request) {
    if (!isRazorpayxConfigured()) return null;
    if (IN_FLIGHT.includes(request.payout?.status) || request.payout?.status === 'processed') {
        throw new ApiError(409, 'A payout for this request is already in progress');
    }

    const isDriver = Boolean(request.driver_id);
    const holder = await (isDriver ? Driver : Owner)
        .findById(isDriver ? request.driver_id : request.owner_id)
        .select('payoutVerification')
        .lean();
    if (!holder) throw new ApiError(404, 'Account holder not found');

    let verification;
    try {
        verification = assertVerifiedForPayout(holder.payoutVerification, requestAccountInput(request));
    } catch (err) {
        throw new ApiError(400, `Cannot pay out: ${err.message}`);
    }

    const attempt = Number(request.payout?.attempt || 0) + 1;
    try {
        const result = await sendVerifiedPayout({
            verification,
            amountInr: request.amount,
            referenceId: String(request._id),
            narration: 'Eqosy withdrawal',
            idempotencyKey: `taxi_wd_${request._id}_${attempt}`,
        });
        return {
            razorpayPayoutId: result.razorpayPayoutId,
            status: result.status,
            mode: result.mode,
            utr: result.utr,
            attempt,
            verifiedName: verification.registeredName,
            failureReason: '',
            initiatedAt: new Date(),
        };
    } catch (err) {
        logger.error(`RazorpayX payout failed (taxi withdrawal ${request._id}): ${err?.message || err}`);
        throw new ApiError(502, `Payout could not be started: ${err?.message || 'RazorpayX error'}`);
    }
}

/** Runs once the bank confirms the payout: marks the request completed and does the per-type bookkeeping. */
async function finalizePaidRequest(request) {
    if (request.kind === 'bus') {
        await finishBusPayoutRequest(request, true);
    } else if (request.owner_id) {
        await OwnerWalletTransaction.updateOne(
            { ownerId: request.owner_id, 'metadata.withdrawalRequestId': String(request._id) },
            { $set: { title: `Withdrawal paid (${String(request.payment_method || '').toUpperCase()})` } },
        );
    }

    if (request.driver_id) {
        try {
            const { notifyOwnersSafely } = await import('../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely([{ ownerType: 'TAXI_DRIVER', ownerId: request.driver_id }], {
                title: 'Withdrawal Request Approved! 🎉',
                body: 'Your withdrawal request has been approved successfully and money has been credited to your selected bank account',
                data: { type: 'WITHDRAWAL_APPROVED', withdrawalRequestId: String(request._id), amount: String(request.amount) },
            });
        } catch (err) {
            logger.warn(`Driver payout notification failed: ${err?.message || err}`);
        }
    }
}

/** Handles RazorpayX `payout.*` webhooks for taxi withdrawals. Returns true if the payout belongs to one. */
export async function applyTaxiPayoutEvent(event, payoutEntity) {
    const payoutId = payoutEntity?.id;
    if (!payoutId) return false;

    const request = await WithdrawalRequest.findOne({ 'payout.razorpayPayoutId': payoutId }).lean();
    if (!request) return false;

    const status = String(payoutEntity.status || '').toLowerCase();

    if (event === 'payout.processed' || status === 'processed') {
        const updated = await WithdrawalRequest.findOneAndUpdate(
            { _id: request._id, status: 'pending', 'payout.status': { $ne: 'processed' } },
            {
                $set: {
                    status: 'completed',
                    'payout.status': 'processed',
                    'payout.utr': payoutEntity.utr || request.payout?.utr || '',
                    'payout.completedAt': new Date(),
                },
            },
            { new: true },
        ).lean();
        if (updated) await finalizePaidRequest(updated);
        return true;
    }

    if (['payout.failed', 'payout.reversed', 'payout.rejected'].includes(event) || FAILED.includes(status)) {
        const reason = payoutEntity.failure_reason || payoutEntity.status_details?.description || `Payout ${status || 'failed'}`;
        await WithdrawalRequest.updateOne(
            { _id: request._id, status: 'pending', 'payout.status': { $nin: FAILED } },
            { $set: { 'payout.status': FAILED.includes(status) ? status : 'failed', 'payout.failureReason': reason } },
        );
        return true;
    }

    if (status && request.payout?.status !== status && IN_FLIGHT.includes(request.payout?.status)) {
        await WithdrawalRequest.updateOne({ _id: request._id }, { $set: { 'payout.status': status } });
    }
    return true;
}
