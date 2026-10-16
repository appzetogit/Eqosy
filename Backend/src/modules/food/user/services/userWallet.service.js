import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { createRazorpayCheckoutOrder, isRazorpayConfigured, verifyCapturedPaymentForReceipt } from '../../orders/helpers/razorpay.helper.js';

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    return FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
};

/**
 * Single atomic wallet movement: balance change + ledger row happen in ONE update, and a debit can never take
 * the balance below zero. Returns the updated wallet, or null when the guard did not match (e.g. insufficient
 * balance, or the same payment was already credited).
 */
const applyWalletMovement = async (userId, delta, tx, { guard = {}, extraInc = {} } = {}) => {
    const wallet = await ensureWallet(userId);
    const now = new Date();
    const filter = { _id: wallet._id, ...guard };
    if (delta < 0) filter.balance = { $gte: -delta };
    return FoodUserWallet.findOneAndUpdate(
        filter,
        {
            $inc: { balance: delta, ...extraInc },
            $push: { transactions: { $each: [{ ...tx, createdAt: now, updatedAt: now }], $position: 0 } },
        },
        { new: true },
    );
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    await applyWalletMovement(
        userId,
        amount,
        {
            type: 'addition',
            amount,
            status: 'Completed',
            description: 'Referral reward',
            metadata: { source: 'referral_reward', ...(metadata || {}) },
        },
        { extraInc: { referralEarnings: amount } },
    );
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

export const createWalletTopupOrder = async (userId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    const amountPaise = Math.round(amount * 100);

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay payment gateway is not configured');
    }

    const receipt = `wallet_topup_${String(userId).slice(-8)}_${Date.now()}`;
    try {
        const razorpay = await createRazorpayCheckoutOrder(amountPaise, 'INR', receipt);
        return { razorpay };
    } catch (error) {
        throw new ValidationError(error?.message || 'Payment gateway error');
    }
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();

    // NOTE: any `amount` sent by the client is ignored on purpose; the credited amount is what Razorpay received.
    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');

    const wallet = await ensureWallet(userId);
    const existing = wallet.transactions.find((t) => String(t.razorpayOrderId || '') === orderId);
    if (existing && String(existing.status).toLowerCase() === 'completed') {
        return { wallet: await getUserWallet(userId) };
    }

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay payment gateway is not configured');
    }

    // One Razorpay payment can only ever be credited once, across all wallets.
    if (await FoodUserWallet.exists({ 'transactions.razorpayPaymentId': paymentId })) {
        throw new ValidationError('This payment has already been used');
    }

    let verified;
    try {
        verified = await verifyCapturedPaymentForReceipt({
            orderId,
            paymentId,
            signature,
            receiptPrefix: `wallet_topup_${String(userId).slice(-8)}_`,
        });
    } catch (err) {
        throw new ValidationError(err?.message || 'Payment verification failed');
    }

    // Atomic + idempotent: the guard fails if this order was credited by a concurrent request.
    const credited = await applyWalletMovement(
        userId,
        verified.amountInr,
        {
            type: 'addition',
            amount: verified.amountInr,
            status: 'Completed',
            description: 'Wallet top-up',
            metadata: { source: 'wallet_topup', mode: 'razorpay' },
            razorpayOrderId: verified.orderId,
            razorpayPaymentId: verified.paymentId,
            razorpaySignature: signature,
        },
        { guard: { transactions: { $not: { $elemMatch: { razorpayOrderId: verified.orderId } } } } },
    );
    if (!credited) {
        // A parallel request already credited this order.
        return { wallet: await getUserWallet(userId) };
    }

    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    // Atomic: balance check and deduction are one update, so concurrent orders cannot overspend.
    const updated = await applyWalletMovement(userId, -amount, {
        type: 'deduction',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_payment', ...(metadata || {}) },
    });
    if (!updated) throw new ValidationError('Insufficient wallet balance');

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    // Atomic; when an orderId is given the same order can never be refunded to the wallet twice.
    const orderRef = metadata?.orderId;
    await applyWalletMovement(
        userId,
        amount,
        {
            type: 'refund',
            amount,
            status: 'Completed',
            description,
            metadata: { source: 'order_refund', ...(metadata || {}) },
        },
        orderRef
            ? { guard: { transactions: { $not: { $elemMatch: { type: 'refund', 'metadata.orderId': orderRef } } } } }
            : {},
    );

    return { wallet: await getUserWallet(userId) };
};
