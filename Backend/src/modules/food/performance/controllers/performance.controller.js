import * as svc from '../services/performance.service.js';
import { sendResponse } from '../../../../utils/response.js';

const wrap = (fn) => async (req, res, next) => {
    try {
        const data = await fn(req);
        return sendResponse(res, 200, 'OK', data);
    } catch (err) {
        next(err);
    }
};

/* Shared */
export const publicConfig = wrap(() => svc.getPublicConfig());

/* Admin */
export const getConfig = wrap(() => svc.getConfig({ fresh: true }));
export const updateConfig = wrap((req) => svc.updateConfig(req.body || {}, req.user?.userId));
export const listLedger = wrap((req) => svc.listLedger(req.query));
export const decideLedger = wrap((req) => svc.decideLedger(req.params.id, req.user?.userId, req.body?.action, req.body?.note));
export const listAppeals = wrap((req) => svc.listAppeals(req.query));
export const decideAppeal = wrap((req) => svc.decideAppeal(req.params.id, req.user?.userId, !!req.body?.approve, req.body?.note));
export const listExtensions = wrap((req) => svc.listExtensions(req.query));
export const decideExtension = wrap((req) => svc.adminDecideExtension(req.params.id, req.user?.userId, !!req.body?.approve, { skipCustomer: !!req.body?.skipCustomer }));
export const restaurantOverview = wrap((req) => svc.adminRestaurantOverview(req.query.month));
export const restaurantDetail = wrap((req) => svc.restaurantDashboard(req.params.id, req.query.month));
export const deliveryOverview = wrap((req) => svc.adminDeliveryOverview(req.query.month));
export const deliveryDetail = wrap((req) => svc.deliveryDashboard(req.params.id, req.query.month));
export const listStrikes = wrap((req) => svc.listStrikes(req.query));
export const revokeStrike = wrap((req) => svc.revokeStrike(req.params.id, req.user?.userId, req.body?.note));
export const adjustDelivery = wrap((req) => svc.adminDecideDeliveryAdjustment(req.params.orderId, req.user?.userId, req.body || {}));
export const orderTiming = wrap((req) => svc.orderTiming(req.params.orderId));
export const orderTimeline = wrap((req) => svc.orderTimeline(req.params.orderId));
export const listAudit = wrap((req) => svc.listAudit(req.query));

/* Restaurant */
export const myPreview = wrap((req) => svc.previewViolation({ partyType: 'RESTAURANT', partyId: req.user.userId, violationType: String(req.query.violationType || 'ORDER_REJECTION'), reasonCode: String(req.query.reasonCode || '') }));
export const myDashboard = wrap((req) => svc.restaurantDashboard(req.user.userId, req.query.month));
export const myLedger = wrap((req) => svc.listLedger({ ...req.query, partyType: 'RESTAURANT', partyId: req.user.userId }));
export const requestExtension = wrap((req) => svc.requestExtension(req.params.orderId, req.user.userId, req.body || {}));
export const createAppeal = wrap((req) => svc.createAppeal('RESTAURANT', req.user.userId, req.body || {}));
export const myAppeals = wrap((req) => svc.listAppeals({ partyType: 'RESTAURANT', partyId: req.user.userId }));
export const myExtensions = wrap((req) => svc.listExtensions({ orderId: req.query.orderId, restaurantId: req.user.userId, status: req.query.status }));

/* Delivery partner */
export const deliveryPreview = wrap((req) => svc.previewViolation({ partyType: 'DELIVERY_PARTNER', partyId: req.user.userId, violationType: String(req.query.violationType || 'ASSIGNMENT_REJECTION'), reasonCode: String(req.query.reasonCode || '') }));
export const deliveryMyDashboard = wrap((req) => svc.deliveryDashboard(req.user.userId, req.query.month));
export const deliveryMyLedger = wrap((req) => svc.listLedger({ ...req.query, partyType: 'DELIVERY_PARTNER', partyId: req.user.userId }));
export const deliveryCreateAppeal = wrap((req) => svc.createAppeal('DELIVERY_PARTNER', req.user.userId, req.body || {}));
export const deliveryMyAppeals = wrap((req) => svc.listAppeals({ partyType: 'DELIVERY_PARTNER', partyId: req.user.userId }));
export const deliveryReportDelay = wrap((req) => svc.reportDeliveryDelay(req.params.orderId, req.user.userId, req.body || {}));
export const deliveryOrderTiming = wrap((req) => svc.orderTiming(req.params.orderId));

/* Customer */
export const respondExtension = wrap((req) => svc.respondExtension(req.params.id, req.user.userId, !!req.body?.accept));
export const myPendingExtensions = wrap((req) => svc.listExtensions({ userId: req.user.userId, status: 'pending_customer' }));
