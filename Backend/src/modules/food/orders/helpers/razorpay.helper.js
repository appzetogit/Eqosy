import crypto from 'crypto';

let Razorpay;
try {
    const mod = await import('razorpay');
    Razorpay = mod.default;
} catch {
    Razorpay = null;
}

import { config } from '../../../../config/env.js';

const KEY_ID = String(config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '').trim();
const KEY_SECRET = String(config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '').trim();

function getRazorpayErrorMessage(error) {
    return (
        error?.error?.description ||
        error?.error?.message ||
        error?.description ||
        error?.message ||
        'Razorpay request failed'
    );
}

export function isRazorpayConfigured() {
    return Boolean(KEY_ID && KEY_SECRET && Razorpay);
}

export function getRazorpayKeyId() {
    return KEY_ID;
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    return new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
}

export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '') {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.orders
        .create({
            amount: Math.round(amountPaise),
            currency,
            receipt: receipt || undefined
        })
        .catch((error) => {
            throw new Error(getRazorpayErrorMessage(error));
        });
}

export async function createRazorpayCheckoutOrder(amountPaise, currency = 'INR', receipt = '') {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay payment gateway is not configured');
    }

    const roundedAmount = Math.round(Number(amountPaise) || 0);
    if (roundedAmount < 100) {
        throw new Error('Amount too low for online payment');
    }

    const order = await createRazorpayOrder(roundedAmount, currency, receipt);
    if (!order?.id) {
        throw new Error('Razorpay order was created without an order id');
    }

    return {
        key: getRazorpayKeyId(),
        orderId: String(order.id || ''),
        amount: Number(order.amount) || roundedAmount,
        currency: order.currency || currency
    };
}

export function createPaymentLink({ amountPaise, currency = 'INR', description, orderId, customerName, customerEmail, customerPhone }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.paymentLink
        .create({
            amount: Math.round(amountPaise),
            currency,
            description: description || `Order ${orderId}`,
            customer: {
                name: customerName || 'Customer',
                email: customerEmail || 'customer@example.com',
                contact: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999'
            }
        })
        .catch((error) => {
            throw new Error(getRazorpayErrorMessage(error));
        });
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    if (!KEY_SECRET) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    return expected === signature;
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return instance.payments.fetch(String(paymentId)).catch((error) => {
        throw new Error(getRazorpayErrorMessage(error));
    });
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return instance.paymentLink.fetch(String(paymentLinkId)).catch((error) => {
        throw new Error(getRazorpayErrorMessage(error));
    });
}

/**
 * ✅ NEW: Initiate a refund for a successful payment.
 * NON-BREAKING Extension for automated cancellation refunds.
 * @param {string} paymentId - Original Razorpay payment_id (captured)
 * @param {number} amount - Amount to refund (in major unit, e.g., INR 123.45)
 */
export async function initiateRazorpayRefund(paymentId, amount) {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay is not configured on this server');
    }
    const instance = getRazorpayInstance();
    try {
        const refund = await instance.payments.refund(paymentId, {
            amount: Math.round(Number(amount) * 100), // convert to paise
            notes: {
                reason: 'Order cancelled by system flow',
                at: new Date().toISOString()
            }
        });
        return {
            success: true,
            refundId: refund.id,
            status: refund.status || 'processed',
            raw: refund
        };
    } catch (err) {
        // Log locally but pass the error to the service to handle status update
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Razorpay refund API error',
            status: 'failed'
        };
    }
}

/**
 * Fetch a Razorpay order (server-side) so amounts/receipts are read from Razorpay, never from the client.
 * @param {string} orderId
 */
export async function fetchRazorpayOrder(orderId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!orderId) throw new Error('orderId is required');
    return instance.orders.fetch(String(orderId)).catch((error) => {
        throw new Error(getRazorpayErrorMessage(error));
    });
}

/**
 * Verifies a checkout payment end to end and returns the amount Razorpay actually received.
 *  1. signature is valid for orderId|paymentId,
 *  2. the payment belongs to that order and is captured/authorized,
 *  3. the order was created for this purpose and user (receipt prefix),
 *  4. payment amount equals the order amount.
 * The caller must credit the returned `amountInr`, never an amount sent by the client.
 *
 * @returns {Promise<{ amountInr: number, paymentId: string, orderId: string }>}
 */
export async function verifyCapturedPaymentForReceipt({ orderId, paymentId, signature, receiptPrefix }) {
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new Error('Payment verification failed');
    }

    const payment = await fetchRazorpayPayment(paymentId);
    if (String(payment?.order_id || '') !== String(orderId)) {
        throw new Error('Payment does not belong to this order');
    }
    if (!['captured', 'authorized'].includes(String(payment?.status || '').toLowerCase())) {
        throw new Error('Payment is not completed');
    }

    const order = await fetchRazorpayOrder(orderId);
    if (!receiptPrefix || !String(order?.receipt || '').startsWith(receiptPrefix)) {
        throw new Error('Payment was not made for this request');
    }
    if (Number(order.amount) !== Number(payment.amount)) {
        throw new Error('Paid amount does not match the order amount');
    }

    return {
        amountInr: Math.round(Number(payment.amount)) / 100,
        paymentId: String(payment.id),
        orderId: String(order.id),
    };
}
