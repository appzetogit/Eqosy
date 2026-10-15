import { createPayout } from './razorpayx.service.js';

const IMPS_LIMIT_INR = 500000;

/**
 * Sends money to an already-verified RazorpayX fund account.
 * `idempotencyKey` must be stable per withdrawal so a retry can never pay twice.
 */
export async function sendVerifiedPayout({ verification, amountInr, referenceId, narration, idempotencyKey }) {
    const amount = Math.round(Number(amountInr) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 1) throw new Error('Invalid payout amount');

    const mode = verification.mode === 'upi' ? 'UPI' : amount > IMPS_LIMIT_INR ? 'NEFT' : 'IMPS';
    const payout = await createPayout({
        fundAccountId: verification.fundAccountId,
        amountInr: amount,
        mode,
        referenceId,
        narration,
        idempotencyKey,
    });

    return {
        razorpayPayoutId: payout.id,
        status: String(payout.status || 'queued').toLowerCase(),
        mode,
        utr: payout.utr || '',
    };
}
