import * as svc from '../services/cancellation.service.js';
import { sendResponse } from '../../../../utils/response.js';

const wrap = (fn) => async (req, res, next) => {
    try {
        return sendResponse(res, 200, 'OK', await fn(req));
    } catch (err) {
        next(err);
    }
};

/* Customer */
export const publicConfig = wrap(() => svc.getPublicConfig());
export const preview = wrap((req) => svc.previewCancellation(req.params.orderId, req.user.userId, req.query.reasonCode));
export const outstanding = wrap((req) => svc.getOutstanding(req.user.userId));
export const history = wrap((req) => svc.listPenaltyHistory(req.user.userId));
export const payPenalty = wrap((req) => svc.createPenaltyPayment(req.user.userId));
export const verifyPenalty = wrap((req) => svc.verifyPenaltyPayment(req.user.userId, req.body || {}));
export const nearbyRescues = wrap((req) => svc.listNearbyRescues(req.user.userId, req.query));
export const claimRescue = wrap((req) => svc.claimRescue(req.params.id, req.user.userId, req.body || {}));
export const verifyRescue = wrap((req) => svc.verifyRescuePayment(req.user.userId, req.body || {}));

/* Admin */
export const getConfig = wrap(() => svc.getConfig({ fresh: true }));
export const updateConfig = wrap((req) => svc.updateConfig(req.body || {}, req.user?.userId));
export const summary = wrap(() => svc.summary());
export const listCases = wrap((req) => svc.listCases(req.query));
export const getCase = wrap((req) => svc.getCase(req.params.id));
export const retrySettlements = wrap((req) => svc.retrySettlements(req.params.id));
export const listRescues = wrap((req) => svc.listRescues(req.query));
export const closeRescue = wrap((req) => svc.adminCloseRescue(req.params.id, req.user?.userId, req.body?.note));
export const listPenalties = wrap((req) => svc.listPenaltiesAdmin(req.query));
export const decidePenalty = wrap((req) => svc.adminDecidePenalty(req.params.id, req.user?.userId, req.body || {}));
export const customerSummary = wrap((req) => svc.customerSummaryAdmin(req.params.userId));
export const listAudit = wrap((req) => svc.listAudit(req.query));
