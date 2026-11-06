import express from 'express';
import * as c from '../controllers/cancellation.controller.js';
import { requireFoodResourceAccess } from '../../admin/middlewares/foodAdmin.middleware.js';

/** Mounted at /v1/food/cancellation with authMiddleware + requireRoles('USER'). */
export const userCancellationRouter = express.Router();
userCancellationRouter.get('/config', c.publicConfig);
userCancellationRouter.get('/orders/:orderId/preview', c.preview);
userCancellationRouter.get('/outstanding', c.outstanding);
userCancellationRouter.get('/history', c.history);
userCancellationRouter.post('/penalty/pay', c.payPenalty);
userCancellationRouter.post('/penalty/verify', c.verifyPenalty);
userCancellationRouter.get('/rescue/nearby', c.nearbyRescues);
userCancellationRouter.post('/rescue/verify', c.verifyRescue);
userCancellationRouter.post('/rescue/:id/claim', c.claimRescue);

/** Mounted inside the admin router at /cancellation (admin auth + context already applied). */
export const adminCancellationRouter = express.Router();
const access = requireFoodResourceAccess('fee_settings', 'fee_settings');
adminCancellationRouter.get('/config', access, c.getConfig);
adminCancellationRouter.put('/config', access, c.updateConfig);
adminCancellationRouter.get('/summary', access, c.summary);
adminCancellationRouter.get('/cases', access, c.listCases);
adminCancellationRouter.get('/cases/:id', access, c.getCase);
adminCancellationRouter.post('/cases/:id/retry-settlements', access, c.retrySettlements);
adminCancellationRouter.get('/rescues', access, c.listRescues);
adminCancellationRouter.post('/rescues/:id/close', access, c.closeRescue);
adminCancellationRouter.get('/penalties', access, c.listPenalties);
adminCancellationRouter.post('/penalties/:id/decision', access, c.decidePenalty);
adminCancellationRouter.get('/customers/:userId', access, c.customerSummary);
adminCancellationRouter.get('/audit', access, c.listAudit);
