import { logger } from '../../../../utils/logger.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { isRazorpayxConfigured } from '../../../../core/payments/razorpayx.service.js';
import { assertVerifiedForPayout } from '../../../../core/payments/payoutAccount.service.js';
import { sendVerifiedPayout } from '../../../../core/payments/payout.service.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../../restaurant/models/foodRestaurantWithdrawal.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodDeliveryWithdrawal } from '../../delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryWallet } from '../../delivery/models/deliveryWallet.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';

/**
 * Automatic payout of approved withdrawals through RazorpayX.
 *
 * Flow: admin approves -> account must be verified (penny drop + name match) -> RazorpayX payout is created ->
 * webhook (payout.processed / failed / reversed) finalises the withdrawal and tells the user.
 * When RazorpayX is not configured the old manual flow is untouched.
 */

export const APPROVED_STATUSES = ['approved', 'processed', 'completed', 'settled'];
const FAILED_PAYOUT_STATUSES = ['failed', 'reversed', 'cancelled', 'rejected'];

const KINDS = {
    restaurant: {
        WithdrawalModel: FoodRestaurantWithdrawal,
        OwnerModel: FoodRestaurant,
        ownerField: 'restaurantId',
        ownerType: 'RESTAURANT',
        ownerSelect: 'accountNumber ifscCode upiId payoutVerification',
        accountOf: (o) => ({ accountNumber: o.accountNumber, ifsc: o.ifscCode, upiId: o.upiId }),
    },
    delivery: {
        WithdrawalModel: FoodDeliveryWithdrawal,
        OwnerModel: FoodDeliveryPartner,
        ownerField: 'deliveryPartnerId',
        ownerType: 'DELIVERY_PARTNER',
        ownerSelect: 'bankAccountNumber bankIfscCode upiId payoutVerification',
        accountOf: (o) => ({ accountNumber: o.bankAccountNumber, ifsc: o.bankIfscCode, upiId: o.upiId }),
    },
};

const idOf = (v) => v?._id || v;

async function notifyOwner(kind, ownerId, { title, body, type, withdrawal }) {
    try {
        const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnersSafely([{ ownerType: KINDS[kind].ownerType, ownerId }], {
            title,
            body,
            data: { type, withdrawalId: String(withdrawal._id), amount: String(withdrawal.amount) },
        });
    } catch (err) {
        logger.warn(`Withdrawal notification failed: ${err?.message || err}`);
    }
}

/**
 * Creates the RazorpayX payout for a pending withdrawal. Returns the `payout` sub-document to store, or null when
 * RazorpayX is not configured (caller then falls back to the manual flow).
 * Throws ValidationError (withdrawal stays pending) when the account is not verified or the payout is refused.
 */
export async function createPayoutForWithdrawal(kind, withdrawal) {
    if (!isRazorpayxConfigured()) return null;
    const cfg = KINDS[kind];

    const owner = await cfg.OwnerModel.findById(idOf(withdrawal[cfg.ownerField])).select(cfg.ownerSelect).lean();
    if (!owner) throw new ValidationError('Account holder not found for this withdrawal');

    let verification;
    try {
        verification = assertVerifiedForPayout(owner.payoutVerification, cfg.accountOf(owner));
    } catch (err) {
        throw new ValidationError(`Cannot pay out: ${err.message}`);
    }

    const attempt = Number(withdrawal.payout?.attempt || 0) + 1;
    try {
        const result = await sendVerifiedPayout({
            verification,
            amountInr: withdrawal.amount,
            referenceId: String(withdrawal._id),
            narration: 'Eqosy withdrawal',
            idempotencyKey: `wd_${kind}_${withdrawal._id}_${attempt}`,
        });
        return {
            razorpayPayoutId: result.razorpayPayoutId,
            status: result.status,
            mode: result.mode,
            utr: result.utr,
            verifiedName: verification.registeredName,
            failureReason: '',
            attempt,
            initiatedAt: new Date(),
            completedAt: result.status === 'processed' ? new Date() : undefined,
        };
    } catch (err) {
        logger.error(`RazorpayX payout failed (${kind} withdrawal ${withdrawal._id}): ${err?.message || err}`);
        throw new ValidationError(`Payout could not be started: ${err?.message || 'RazorpayX error'}`);
    }
}

/** Undo what approval did, so a failed payout can be approved again later. */
async function revertApprovalSideEffects(kind, withdrawal) {
    if (kind === 'delivery') {
        const amount = Number(withdrawal.amount || 0);
        if (amount > 0) {
            await FoodDeliveryWallet.findOneAndUpdate(
                { deliveryPartnerId: idOf(withdrawal.deliveryPartnerId) },
                { $inc: { balance: amount, totalSettled: -amount } },
            );
        }
    } else {
        await FoodTransaction.updateMany(
            { 'settlement.restaurantWithdrawalId': withdrawal._id },
            {
                $set: { 'settlement.isRestaurantSettled': false },
                $unset: { 'settlement.restaurantSettledAt': '', 'settlement.restaurantWithdrawalId': '' },
            },
        );
    }
}

export async function notifyWithdrawalCredited(kind, withdrawal) {
    await notifyOwner(kind, idOf(withdrawal[KINDS[kind].ownerField]), {
        title: 'Withdrawal Request Approved! 🎉',
        body: 'Your withdrawal request has been approved and the money has been credited to your selected bank account',
        type: 'WITHDRAWAL_APPROVED',
        withdrawal,
    });
}

/** Handles RazorpayX `payout.*` webhooks. Returns true if the payout belongs to a withdrawal. */
export async function applyPayoutEvent(event, payoutEntity) {
    const payoutId = payoutEntity?.id;
    if (!payoutId) return false;

    for (const kind of Object.keys(KINDS)) {
        const { WithdrawalModel } = KINDS[kind];
        const withdrawal = await WithdrawalModel.findOne({ 'payout.razorpayPayoutId': payoutId }).lean();
        if (!withdrawal) continue;

        const status = String(payoutEntity.status || '').toLowerCase();
        const alreadyFinal = ['processed', ...FAILED_PAYOUT_STATUSES].includes(withdrawal.payout?.status);

        if (event === 'payout.processed' || status === 'processed') {
            if (withdrawal.payout?.status === 'processed') return true;
            const updated = await WithdrawalModel.findOneAndUpdate(
                { _id: withdrawal._id, 'payout.status': { $ne: 'processed' } },
                {
                    $set: {
                        'payout.status': 'processed',
                        'payout.utr': payoutEntity.utr || withdrawal.payout?.utr || '',
                        'payout.completedAt': new Date(),
                        status: 'approved',
                        transactionId: payoutEntity.utr || withdrawal.transactionId || payoutId,
                    },
                },
                { new: true },
            ).lean();
            if (updated) await notifyWithdrawalCredited(kind, updated);
            return true;
        }

        if (['payout.failed', 'payout.reversed', 'payout.rejected'].includes(event) || FAILED_PAYOUT_STATUSES.includes(status)) {
            if (alreadyFinal && FAILED_PAYOUT_STATUSES.includes(withdrawal.payout?.status)) return true;
            const reason =
                payoutEntity.failure_reason || payoutEntity.status_details?.description || `Payout ${status || 'failed'}`;
            const updated = await WithdrawalModel.findOneAndUpdate(
                { _id: withdrawal._id, 'payout.status': { $nin: FAILED_PAYOUT_STATUSES } },
                {
                    $set: {
                        'payout.status': FAILED_PAYOUT_STATUSES.includes(status) ? status : 'failed',
                        'payout.failureReason': reason,
                        status: 'pending',
                        adminNote: `Auto payout failed: ${reason}. Approve again to retry.`,
                    },
                },
                { new: true },
            ).lean();
            if (updated) {
                await revertApprovalSideEffects(kind, updated);
                await notifyOwner(kind, idOf(updated[KINDS[kind].ownerField]), {
                    title: 'Withdrawal could not be completed',
                    body: 'Your withdrawal payout failed and will be retried. Please check your bank details if this keeps happening.',
                    type: 'WITHDRAWAL_PAYOUT_FAILED',
                    withdrawal: updated,
                });
            }
            return true;
        }

        // queued / pending / processing: just record the latest state.
        if (status && withdrawal.payout?.status !== status && !alreadyFinal) {
            await WithdrawalModel.updateOne({ _id: withdrawal._id }, { $set: { 'payout.status': status } });
        }
        return true;
    }
    return false;
}
