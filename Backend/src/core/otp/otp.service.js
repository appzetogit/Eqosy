import crypto from 'crypto';
import ms from 'ms';
import { FoodOtp } from './otp.model.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../auth/errors.js';
import { sendOtpSms } from '../../modules/taxi/services/smsService.js';

const generateOtpCode = () => {
    const code = crypto.randomInt(1000, 9999);
    return String(code);
};

const normalizeOtpPhone = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '').trim();
    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(2);
    }
    return digits.slice(-10);
};

const normalizeOtpScope = (scope) => {
    const normalized = String(scope || '').trim().toLowerCase();
    return normalized || 'default';
};

/**
 * Sends SMS via SMS India Hub API
 * @param {string} phone - 10-digit mobile number (will be prefixed with 91)
 * @param {string} otp
 */
const sendSmsViaIndiaHub = async (phone, otp) => {
    try {
        const digits = String(phone || '').replace(/\D/g, '');
        const msisdn = digits.startsWith('91') ? digits : `91${digits}`;
        const apiKey = (config.smsApiKey || process.env.SMS_INDIA_HUB_API_KEY || '').trim();
        const senderId = (config.smsSenderId || process.env.SMS_INDIA_HUB_SENDER_ID || 'BGADEC').trim();
        const peId = (config.smsPeId || process.env.SMS_INDIA_HUB_PE_ID || '1001164203633432409').trim();
        const templateId = (config.smsDltTemplateId || process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '1007282516644508833').trim();
        const message = `Welcome to Eqosy. Your OTP for registration is ${otp}.BGADEC`;

        logger.info(`[SMS] Dispatching live SMS OTP ${otp} to ${msisdn} via SMS India Hub...`);

        // Primary: MT SendSMS GET endpoint
        const sendUrl = new URL('http://cloud.smsindiahub.in/api/mt/SendSMS');
        sendUrl.searchParams.append('APIKey', apiKey);
        sendUrl.searchParams.append('senderid', senderId);
        sendUrl.searchParams.append('channel', 'Trans');
        sendUrl.searchParams.append('DCS', '0');
        sendUrl.searchParams.append('flashsms', '0');
        sendUrl.searchParams.append('number', msisdn);
        sendUrl.searchParams.append('text', message);
        sendUrl.searchParams.append('TemplateId', templateId);
        sendUrl.searchParams.append('PEID', peId);

        try {
            const res = await fetch(sendUrl.toString(), { signal: AbortSignal.timeout(15000) });
            const text = await res.text();
            logger.info(`[SMS] Primary SendSMS response for ${msisdn}: ${text}`);
            console.log(`[SMS] Primary SendSMS response for ${msisdn}: ${text}`);
            if (res.ok && !/error|invalid|failed|unauthor|reject/i.test(text)) {
                return;
            }
        } catch (primaryErr) {
            logger.warn(`[SMS] Primary SendSMS failed: ${primaryErr.message}. Trying vendor fallback...`);
        }

        // Fallback: Vendor PushSMS GET endpoint
        const pushUrl = new URL('http://cloud.smsindiahub.in/vendorsms/pushsms.aspx');
        pushUrl.searchParams.append('APIKey', apiKey);
        pushUrl.searchParams.append('sid', senderId);
        pushUrl.searchParams.append('msisdn', msisdn);
        pushUrl.searchParams.append('msg', message);
        pushUrl.searchParams.append('gwid', '2');
        pushUrl.searchParams.append('fl', '0');
        pushUrl.searchParams.append('DLT_TE_ID', templateId);
        pushUrl.searchParams.append('PEID', peId);

        const fallbackRes = await fetch(pushUrl.toString(), { signal: AbortSignal.timeout(15000) });
        const fallbackText = await fallbackRes.text();
        logger.info(`[SMS] Vendor fallback response for ${msisdn}: ${fallbackText}`);
        console.log(`[SMS] Vendor fallback response for ${msisdn}: ${fallbackText}`);
    } catch (error) {
        logger.error(`Error sending SMS to ${phone}: ${error.message}`);
    }
};

export const createOrUpdateOtp = async (phone, scope = 'default') => {
    const normalizedPhone = normalizeOtpPhone(phone);
    const normalizedScope = normalizeOtpScope(scope);
    if (!normalizedPhone || normalizedPhone.length < 8) {
        throw new ValidationError('A valid phone number is required');
    }

    let existing = await FoodOtp.findOne({
        phone: normalizedPhone,
        $or: [{ scope: normalizedScope }, { scope: { $exists: false } }]
    }).sort({ createdAt: -1 });

    if (existing && String(existing.scope || '') !== normalizedScope) {
        existing.scope = normalizedScope;
    }
    const now = new Date();

    // Rate Limiting Logic
    if (existing) {
        const windowMs = (config.otpRateWindow || 600) * 1000;
        const isInWindow = now - existing.lastRequestAt < windowMs;

        if (isInWindow) {
            if (existing.requestCount >= (config.otpRateLimit || 3)) {
                logger.warn(`Rate limit exceeded for phone ${phone} scope=${normalizedScope}`);
                throw new ValidationError(`Too many OTP requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`);
            }
            existing.requestCount += 1;
        } else {
            // Reset count if window has passed
            existing.requestCount = 1;
        }
    }

    let otp;
    if (config.useDefaultOtp) {
        otp = '1234';
        logger.info(`Default OTP mode enabled â€“ OTP is ${otp} for phone ${normalizedPhone}`);
    } else {
        otp = generateOtpCode();
    }

    // Dev debugging: print generated OTP in backend logs.
    // Keep this enabled only for local/testing usage.
    logger.info(`[OTP DEBUG] Generated OTP ${otp} for phone ${normalizedPhone}`);
    // eslint-disable-next-line no-console
    console.log(`[OTP DEBUG] Generated OTP ${otp} for phone ${normalizedPhone}`);

    // Expiry calculation: prioritize seconds, then minutes, then fallback to MS string
    let ttlMs;
    if (config.otpExpirySeconds) {
        ttlMs = config.otpExpirySeconds * 1000;
    } else if (config.otpExpiryMinutes) {
        ttlMs = config.otpExpiryMinutes * 60 * 1000;
    } else {
        ttlMs = ms(config.otpExpiry || '5m');
    }
    const expiresAt = new Date(now.getTime() + ttlMs);

    if (existing) {
        existing.otp = otp;
        existing.expiresAt = expiresAt;
        existing.attempts = 0;
        existing.lastRequestAt = now;
        await existing.save();
    } else {
        await FoodOtp.create({
            phone: normalizedPhone, 
            scope: normalizedScope,
            otp, 
            expiresAt,
            requestCount: 1,
            lastRequestAt: now
        });
    }

    // Only send SMS if not in default OTP mode
    if (!config.useDefaultOtp) {
        await sendSmsViaIndiaHub(normalizedPhone, otp);
    }

    return otp;
};

export const verifyOtp = async (phone, otp, scope = 'default') => {
    const normalizedPhone = normalizeOtpPhone(phone);
    const normalizedScope = normalizeOtpScope(scope);
    if (!normalizedPhone || normalizedPhone.length < 8) {
        return { valid: false, reason: 'Invalid phone format' };
    }

    const record = await FoodOtp.findOne({
        phone: normalizedPhone,
        $or: [{ scope: normalizedScope }, { scope: { $exists: false } }]
    }).sort({ createdAt: -1 });
    if (!record) {
        return { valid: false, reason: 'OTP not found' };
    }

    if (record.expiresAt < new Date()) {
        return { valid: false, reason: 'OTP expired' };
    }

    if (record.attempts >= config.otpMaxAttempts) {
        return { valid: false, reason: 'Max attempts exceeded' };
    }

    record.attempts += 1;

    if (record.otp !== otp) {
        // Do not block auth response on attempts write.
        void record.save().catch((err) => {
            logger.warn(`[OTP VERIFY] Failed to persist attempts for ${normalizedPhone}: ${err.message}`);
        });
        return { valid: false, reason: 'Invalid OTP' };
    }

    // OTP is valid - return immediately and delete in background.
    void record.deleteOne().catch((err) => {
        logger.warn(`[OTP VERIFY] Failed to delete OTP record for ${normalizedPhone}: ${err.message}`);
    });
    return { valid: true };
};


