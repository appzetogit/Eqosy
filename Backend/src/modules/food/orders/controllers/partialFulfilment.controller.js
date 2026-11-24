import * as svc from '../services/partialFulfilment.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { stopOrderRing } from '../services/orderRingStop.service.js';

const wrap = (fn, message = 'OK') => async (req, res, next) => {
    try {
        return sendResponse(res, 200, message, await fn(req));
    } catch (err) {
        next(err);
    }
};

/* Customer */
export const publicConfig = wrap(() => svc.getPublicConfig());
export const getPreference = wrap((req) => svc.getUserPreference(req.user.userId));
export const setPreference = wrap((req) => svc.setUserPreference(req.user.userId, req.body?.unavailableItemPreference));
export const decisionView = wrap((req) => svc.getDecisionView(req.params.orderId, req.user.userId));
export const preview = wrap((req) => svc.previewDecision(req.params.orderId, req.user.userId, req.body || {}));
export const decide = wrap((req) => svc.submitDecision(req.params.orderId, req.user.userId, req.body || {}), 'Decision recorded');
export const verifyPayment = wrap((req) => svc.verifyAdditionalPayment(req.params.orderId, req.user.userId, req.body || {}), 'Payment verified');

/* Store */
export const reportUnavailable = wrap(async (req) => {
    const result = await svc.reportUnavailableItems(req.params.orderId, req.user.userId, req.body || {});
    // The store acted on the order, so stop the new-order ring on its phone.
    stopOrderRing('RESTAURANT', req.user.userId, req.params.orderId, { body: 'Customer asked about unavailable items' });
    return result;
}, 'Customer notified');
export const storeAlternatives = wrap((req) => svc.getStoreAlternatives(req.params.orderId, req.user.userId));

/* Admin */
export const getSettings = wrap(() => svc.getSettings({ fresh: true }));
export const updateSettings = wrap((req) => svc.updateSettings(req.body || {}, req.user?.userId), 'Settings saved');
export const summary = wrap((req) => svc.summaryAdmin(req.adminContext));
export const list = wrap((req) => svc.listForAdmin(req.query, req.adminContext));
export const detail = wrap((req) => svc.getForAdmin(req.params.orderId, req.adminContext));
export const extend = wrap((req) => svc.extendDeadline(req.params.orderId, req.user?.userId, req.body?.minutes, req.adminContext));
export const retryRefund = wrap((req) => svc.retryRefund(req.params.orderId, req.user?.userId, req.body?.key, req.adminContext));
