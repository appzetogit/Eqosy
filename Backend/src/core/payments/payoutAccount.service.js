import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import {
    isRazorpayxConfigured,
    createContact,
    createBankFundAccount,
    createVpaFundAccount,
    createFundAccountValidation,
    fetchFundAccountValidation,
} from './razorpayx.service.js';

/**
 * Payout-account verification ("penny drop").
 *
 * Whenever someone gives us bank/UPI details we create a RazorpayX fund account, send a Re.1 validation and compare
 * the account-holder name the BANK returns with the person's verified identity name (partner name / owner name).
 * Only a "verified" account whose details have not changed since is ever paid out.
 */

/** Mongoose field definitions; spread into a schema as `payoutVerification: PAYOUT_VERIFICATION_FIELDS`. */
export const PAYOUT_VERIFICATION_FIELDS = {
    status: {
        type: String,
        enum: ['unverified', 'pending', 'verified', 'name_mismatch', 'failed'],
        default: 'unverified',
    },
    mode: { type: String, enum: ['bank', 'upi', ''], default: '' },
    registeredName: { type: String, default: '' },
    expectedNames: { type: [String], default: [] },
    fingerprint: { type: String, default: '' },
    maskedAccount: { type: String, default: '' },
    contactId: { type: String, default: '' },
    fundAccountId: { type: String, default: '' },
    validationId: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    checkedAt: { type: Date },
    verifiedAt: { type: Date },
};

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const POLL_ATTEMPTS = 5;
const POLL_DELAY_MS = 2000;

const clean = (v) => String(v ?? '').trim();

export function normalizeAccountInput({ accountNumber, ifsc, upiId } = {}) {
    return {
        accountNumber: clean(accountNumber).replace(/\s+/g, ''),
        ifsc: clean(ifsc).toUpperCase(),
        upiId: clean(upiId).toLowerCase(),
    };
}

/** Bank account wins over UPI when both are present. */
export function resolveTarget(input) {
    const { accountNumber, ifsc, upiId } = normalizeAccountInput(input);
    if (accountNumber || ifsc) return { mode: 'bank', accountNumber, ifsc };
    if (upiId) return { mode: 'upi', upiId };
    return null;
}

export function accountFingerprint(input) {
    const t = resolveTarget(input);
    if (!t) return '';
    const raw = t.mode === 'bank' ? `bank|${t.accountNumber}|${t.ifsc}` : `upi|${t.upiId}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

const maskTarget = (t) =>
    t.mode === 'bank' ? `XXXXXX${t.accountNumber.slice(-4)} (${t.ifsc})` : t.upiId.replace(/^(.{2}).*(@.*)$/, '$1***$2');

/* ----------------------------- name matching ----------------------------- */

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'shri', 'shree', 'smt', 'sri', 'dr', 'late', 'm', 's', 'sh', 'kumari', 'pvt', 'ltd', 'private', 'limited']);

const tokenize = (name) =>
    clean(name)
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t && !TITLES.has(t));

function editDistanceAtMostOne(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (a.length > b.length) i++;
        else if (a.length < b.length) j++;
        else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
}

const tokenMatches = (a, b) => {
    if (a === b) return true;
    if (a.length === 1 || b.length === 1) return a[0] === b[0]; // initial vs full name
    return a.length >= 5 && b.length >= 5 && editDistanceAtMostOne(a, b);
};

/** True when every word of the shorter name appears (allowing initials and a 1-letter typo) in the longer one. */
export function namesMatch(nameA, nameB) {
    const a = tokenize(nameA);
    const b = tokenize(nameB);
    if (!a.length || !b.length) return false;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (short.length === 1 && long.length > 1) return false; // a single word is too weak to prove identity
    const pool = [...long];
    for (const token of short) {
        const idx = pool.findIndex((t) => tokenMatches(token, t));
        if (idx === -1) return false;
        pool.splice(idx, 1);
    }
    return true;
}

/* ------------------------------ verification ----------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function evaluateValidation(validation, expectedNames) {
    const status = String(validation?.status || '').toLowerCase();
    const accountStatus = String(validation?.results?.account_status || '').toLowerCase();
    const registeredName = clean(validation?.results?.registered_name);

    if (status === 'failed' || accountStatus === 'invalid') {
        return { status: 'failed', registeredName, failureReason: 'Bank could not validate this account. Please check the details.' };
    }
    if (status !== 'completed') return { status: 'pending', registeredName };
    if (accountStatus !== 'active') {
        return { status: 'failed', registeredName, failureReason: 'Bank account is not active.' };
    }
    if (!registeredName) {
        return { status: 'failed', registeredName, failureReason: 'Bank did not return an account-holder name, so ownership could not be confirmed.' };
    }
    const names = (expectedNames || []).filter(Boolean);
    if (names.some((n) => namesMatch(n, registeredName))) {
        return { status: 'verified', registeredName };
    }
    return {
        status: 'name_mismatch',
        registeredName,
        failureReason: `Account holder name "${registeredName}" does not match your registered name.`,
    };
}

async function persist(Model, docId, patch) {
    const $set = {};
    for (const [k, v] of Object.entries(patch)) $set[`payoutVerification.${k}`] = v;
    await Model.updateOne({ _id: docId }, { $set });
}

/**
 * Verifies the account in `input` and stores the outcome on the document.
 * Never throws: failures are recorded on the document and returned.
 *
 * @param {object} p
 * @param {import('mongoose').Model} p.Model        owner model (partner / restaurant / ...)
 * @param {*} p.docId                               owner _id
 * @param {string} p.ownerType                      'delivery' | 'restaurant' | ...
 * @param {string[]} p.identityNames                trusted names the bank-registered name must match
 * @param {{accountNumber?:string, ifsc?:string, upiId?:string}} p.input
 */
export async function verifyPayoutAccount({ Model, docId, ownerType, identityNames, phone, email, input }) {
    try {
        const target = resolveTarget(input);
        const existing = (await Model.findById(docId).select('payoutVerification').lean())?.payoutVerification || {};

        if (!target) {
            await persist(Model, docId, { status: 'unverified', fingerprint: '', maskedAccount: '', mode: '', failureReason: '' });
            return { status: 'unverified' };
        }

        const names = (identityNames || []).map(clean).filter(Boolean);
        if (!names.length) {
            const failureReason = 'No registered name found to match the bank account against.';
            await persist(Model, docId, { status: 'failed', failureReason, checkedAt: new Date() });
            return { status: 'failed', failureReason };
        }

        if (target.mode === 'bank') {
            if (!ACCOUNT_RE.test(target.accountNumber) || !IFSC_RE.test(target.ifsc)) {
                const failureReason = 'Invalid account number or IFSC code.';
                await persist(Model, docId, { status: 'failed', failureReason, mode: 'bank', fingerprint: accountFingerprint(input), checkedAt: new Date() });
                return { status: 'failed', failureReason };
            }
        } else if (!UPI_RE.test(target.upiId)) {
            const failureReason = 'Invalid UPI ID.';
            await persist(Model, docId, { status: 'failed', failureReason, mode: 'upi', fingerprint: accountFingerprint(input), checkedAt: new Date() });
            return { status: 'failed', failureReason };
        }

        const fingerprint = accountFingerprint(input);
        const sameAccount = existing.fingerprint === fingerprint;
        if (sameAccount && ['verified', 'pending'].includes(existing.status)) return existing;
        if (sameAccount && existing.checkedAt && Date.now() - new Date(existing.checkedAt).getTime() < RETRY_COOLDOWN_MS) {
            return existing;
        }

        if (!isRazorpayxConfigured()) {
            // Cannot verify -> keep it unverified so payouts stay blocked until RazorpayX is configured.
            await persist(Model, docId, {
                status: 'unverified', fingerprint, mode: target.mode, maskedAccount: maskTarget(target),
                expectedNames: names, failureReason: 'Bank verification is not available right now.', checkedAt: new Date(),
            });
            return { status: 'unverified' };
        }

        await persist(Model, docId, {
            status: 'pending', fingerprint, mode: target.mode, maskedAccount: maskTarget(target),
            expectedNames: names, registeredName: '', failureReason: '', verifiedAt: null, checkedAt: new Date(),
            validationId: '', fundAccountId: '',
        });

        let contactId = existing.contactId || '';
        if (!contactId) {
            const contact = await createContact({ name: names[0], referenceId: `${ownerType}_${docId}`, phone, email });
            contactId = contact.id;
        }
        const fundAccount =
            target.mode === 'bank'
                ? await createBankFundAccount({ contactId, name: names[0], ifsc: target.ifsc, accountNumber: target.accountNumber })
                : await createVpaFundAccount({ contactId, upiId: target.upiId });

        let validation = await createFundAccountValidation({ fundAccountId: fundAccount.id, referenceId: `${ownerType}_${docId}` });
        await persist(Model, docId, { contactId, fundAccountId: fundAccount.id, validationId: validation.id });

        for (let i = 0; i < POLL_ATTEMPTS && String(validation.status).toLowerCase() === 'created'; i++) {
            await sleep(POLL_DELAY_MS);
            validation = await fetchFundAccountValidation(validation.id);
        }

        const outcome = evaluateValidation(validation, names);
        await persist(Model, docId, {
            status: outcome.status,
            registeredName: outcome.registeredName || '',
            failureReason: outcome.failureReason || '',
            verifiedAt: outcome.status === 'verified' ? new Date() : null,
            checkedAt: new Date(),
        });
        return { ...outcome, fundAccountId: fundAccount.id };
    } catch (err) {
        logger.error(`Payout account verification failed (${ownerType} ${docId}): ${err?.message || err}`);
        const failureReason = err?.message || 'Verification failed. Please try again.';
        try {
            await persist(Model, docId, { status: 'failed', failureReason, checkedAt: new Date() });
        } catch {
            // ignore secondary failure
        }
        return { status: 'failed', failureReason };
    }
}

/** Called by the RazorpayX webhook when an async validation finishes. Returns true if an owner was updated. */
export async function applyValidationResult(Model, validation) {
    const owner = await Model.findOne({ 'payoutVerification.validationId': validation.id })
        .select('payoutVerification')
        .lean();
    if (!owner) return false;
    const outcome = evaluateValidation(validation, owner.payoutVerification?.expectedNames);
    if (outcome.status === 'pending') return true;
    await persist(Model, owner._id, {
        status: outcome.status,
        registeredName: outcome.registeredName || '',
        failureReason: outcome.failureReason || '',
        verifiedAt: outcome.status === 'verified' ? new Date() : null,
        checkedAt: new Date(),
    });
    return true;
}

/**
 * Guard used right before money moves. The stored verification must be "verified" AND still be for the
 * account that is currently saved (details edited after verification invalidate it).
 */
export function assertVerifiedForPayout(payoutVerification, currentInput) {
    const v = payoutVerification || {};
    if (v.status !== 'verified' || !v.fundAccountId) {
        const err = new Error(
            v.status === 'name_mismatch'
                ? 'Bank account holder name does not match the registered name. Please update your bank details.'
                : v.status === 'pending'
                    ? 'Bank details are still being verified. Please try again in a few minutes.'
                    : 'Bank details are not verified yet. Please add and verify your bank details first.',
        );
        err.code = 'PAYOUT_ACCOUNT_NOT_VERIFIED';
        throw err;
    }
    if (v.fingerprint !== accountFingerprint(currentInput)) {
        const err = new Error('Bank details were changed after verification. Please re-verify your bank details.');
        err.code = 'PAYOUT_ACCOUNT_NOT_VERIFIED';
        throw err;
    }
    return v;
}
