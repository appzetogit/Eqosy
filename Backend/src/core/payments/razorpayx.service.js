import { config } from '../../config/env.js';

/**
 * Thin RazorpayX REST client (contacts, fund accounts, fund-account validation, payouts).
 * Uses fetch directly so it does not depend on the razorpay SDK version.
 */
const BASE_URL = 'https://api.razorpay.com/v1';

const keyId = () => String(config.razorpayxKeyId || '').trim();
const keySecret = () => String(config.razorpayxKeySecret || '').trim();
export const getRazorpayxAccountNumber = () => String(config.razorpayxAccountNumber || '').trim();

export const isRazorpayxConfigured = () => Boolean(keyId() && keySecret() && getRazorpayxAccountNumber());

export class RazorpayxError extends Error {
    constructor(message, { status, code, raw } = {}) {
        super(message);
        this.name = 'RazorpayxError';
        this.status = status;
        this.code = code;
        this.raw = raw;
    }
}

async function rzx(method, path, body, headers = {}) {
    if (!isRazorpayxConfigured()) throw new RazorpayxError('RazorpayX is not configured on this server');
    const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    if (!res.ok) {
        const message = data?.error?.description || data?.error?.reason || `RazorpayX request failed (${res.status})`;
        throw new RazorpayxError(message, { status: res.status, code: data?.error?.code, raw: data });
    }
    return data;
}

export const createContact = ({ name, referenceId, type = 'vendor', phone, email }) =>
    rzx('POST', '/contacts', {
        name: String(name || 'Eqosy Partner').slice(0, 50),
        type,
        reference_id: referenceId ? String(referenceId).slice(0, 40) : undefined,
        contact: phone ? String(phone).replace(/\D/g, '').slice(-10) : undefined,
        email: email || undefined,
    });

export const createBankFundAccount = ({ contactId, name, ifsc, accountNumber }) =>
    rzx('POST', '/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: { name: String(name).slice(0, 120), ifsc, account_number: accountNumber },
    });

export const createVpaFundAccount = ({ contactId, upiId }) =>
    rzx('POST', '/fund_accounts', {
        contact_id: contactId,
        account_type: 'vpa',
        vpa: { address: upiId },
    });

/** Starts a Re.1 "penny drop"; the bank returns the registered account-holder name. */
export const createFundAccountValidation = ({ fundAccountId, referenceId }) =>
    rzx('POST', '/fund_accounts/validations', {
        account_number: getRazorpayxAccountNumber(),
        fund_account: { id: fundAccountId },
        amount: 100,
        currency: 'INR',
        notes: referenceId ? { reference: String(referenceId) } : undefined,
    });

export const fetchFundAccountValidation = (validationId) =>
    rzx('GET', `/fund_accounts/validations/${encodeURIComponent(validationId)}`);

export const createPayout = ({ fundAccountId, amountInr, mode, referenceId, narration, idempotencyKey }) =>
    rzx(
        'POST',
        '/payouts',
        {
            account_number: getRazorpayxAccountNumber(),
            fund_account_id: fundAccountId,
            amount: Math.round(Number(amountInr) * 100),
            currency: 'INR',
            mode,
            purpose: 'payout',
            queue_if_low_balance: false,
            reference_id: referenceId ? String(referenceId).slice(0, 40) : undefined,
            narration: narration ? String(narration).replace(/[^A-Za-z0-9 ]/g, '').slice(0, 30) : undefined,
        },
        idempotencyKey ? { 'X-Payout-Idempotency': String(idempotencyKey) } : {},
    );

export const fetchPayout = (payoutId) => rzx('GET', `/payouts/${encodeURIComponent(payoutId)}`);
