import crypto from 'crypto';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import { applyValidationResult } from '../payoutAccount.service.js';
import { applyPayoutEvent } from '../../../modules/food/admin/services/withdrawalPayout.service.js';
import { FoodDeliveryPartner } from '../../../modules/food/delivery/models/deliveryPartner.model.js';
import { FoodRestaurant } from '../../../modules/food/restaurant/models/restaurant.model.js';
import { Driver } from '../../../modules/taxi/driver/models/Driver.js';
import { Owner } from '../../../modules/taxi/admin/models/Owner.js';
import { applyTaxiPayoutEvent } from '../../../modules/taxi/services/withdrawalPayout.service.js';

/** Models that carry a `payoutVerification` sub-document and can be updated by validation webhooks. */
const VERIFIABLE_MODELS = [FoodDeliveryPartner, FoodRestaurant, Driver, Owner];

/**
 * RazorpayX webhook: bank-account validation results and payout status.
 * Path: /api/v1/payments/webhook/razorpayx  (use RAZORPAYX_WEBHOOK_SECRET)
 */
export const handleRazorpayxWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.razorpayxWebhookSecret;

    if (!signature || !secret || !req.rawBody) {
        logger.warn('RazorpayX Webhook: missing signature, secret or raw body.');
        return res.status(400).send('Invalid signature');
    }

    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        logger.warn('RazorpayX Webhook: signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    const { event, payload } = req.body || {};
    logger.info(`RazorpayX Webhook Received: ${event}`);

    try {
        if (event === 'fund_account.validation.completed' || event === 'fund_account.validation.failed') {
            const validation = payload?.fund_account_validation?.entity;
            if (validation?.id) {
                for (const Model of VERIFIABLE_MODELS) {
                    if (await applyValidationResult(Model, validation)) break;
                }
            }
            return res.status(200).json({ received: true });
        }

        if (typeof event === 'string' && event.startsWith('payout.')) {
            const payout = payload?.payout?.entity;
            const handled = (await applyPayoutEvent(event, payout)) || (await applyTaxiPayoutEvent(event, payout));
            if (!handled) {
                // The withdrawal may not be saved yet (webhook raced the approval). Ask Razorpay to retry if the payout is fresh.
                const ageSec = Date.now() / 1000 - Number(payout?.created_at || 0);
                if (ageSec < 120) return res.status(503).json({ received: false, retry: true });
            }
            return res.status(200).json({ received: true });
        }

        return res.status(200).json({ received: true, ignored: true });
    } catch (err) {
        logger.error(`RazorpayX Webhook Logic Error: ${err.message}`);
        return res.status(500).json({ received: false });
    }
};
