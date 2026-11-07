import express from 'express';
import * as c from '../controllers/performance.controller.js';
import { requireFoodResourceAccess } from '../../admin/middlewares/foodAdmin.middleware.js';

/** Mounted inside the admin router at /performance (admin auth + context already applied). */
export const adminPerformanceRouter = express.Router();
const access = requireFoodResourceAccess('fee_settings', 'fee_settings');
adminPerformanceRouter.get('/config', access, c.getConfig);
adminPerformanceRouter.put('/config', access, c.updateConfig);
adminPerformanceRouter.get('/ledger', access, c.listLedger);
adminPerformanceRouter.post('/ledger', access, c.createLedger);
adminPerformanceRouter.patch('/ledger/:id', access, c.editLedger);
adminPerformanceRouter.post('/ledger/:id/decision', access, c.decideLedger);
adminPerformanceRouter.get('/wallet/:partyType/:partyId', access, c.getWallet);
adminPerformanceRouter.post('/wallet/:partyType/:partyId/adjust', access, c.adjustWallet);
adminPerformanceRouter.get('/appeals', access, c.listAppeals);
adminPerformanceRouter.post('/appeals/:id/decision', access, c.decideAppeal);
adminPerformanceRouter.get('/extensions', access, c.listExtensions);
adminPerformanceRouter.post('/extensions/:id/decision', access, c.decideExtension);
adminPerformanceRouter.get('/restaurants', access, c.restaurantOverview);
adminPerformanceRouter.get('/restaurants/:id', access, c.restaurantDetail);
adminPerformanceRouter.get('/delivery-partners', access, c.deliveryOverview);
adminPerformanceRouter.get('/delivery-partners/:id', access, c.deliveryDetail);
adminPerformanceRouter.get('/strikes', access, c.listStrikes);
adminPerformanceRouter.post('/strikes/:id/revoke', access, c.revokeStrike);
adminPerformanceRouter.get('/orders/:orderId/timing', access, c.orderTiming);
adminPerformanceRouter.get('/orders/:orderId/timeline', access, c.orderTimeline);
adminPerformanceRouter.post('/orders/:orderId/delivery-adjustment', access, c.adjustDelivery);
adminPerformanceRouter.get('/audit', access, c.listAudit);

/** Mounted inside the restaurant router at /performance (authMiddleware + requireRestaurant applied by caller). */
export const restaurantPerformanceRouter = express.Router();
restaurantPerformanceRouter.get('/config', c.publicConfig);
restaurantPerformanceRouter.get('/dashboard', c.myDashboard);
restaurantPerformanceRouter.get('/preview', c.myPreview);
restaurantPerformanceRouter.get('/ledger', c.myLedger);
restaurantPerformanceRouter.get('/wallet', c.myWallet);
restaurantPerformanceRouter.get('/appeals', c.myAppeals);
restaurantPerformanceRouter.post('/appeals', c.createAppeal);
restaurantPerformanceRouter.get('/extensions', c.myExtensions);
restaurantPerformanceRouter.post('/orders/:orderId/extension', c.requestExtension);

/** Mounted in the delivery router at /performance (auth + DELIVERY_PARTNER applied by caller). */
export const deliveryPerformanceRouter = express.Router();
deliveryPerformanceRouter.get('/config', c.publicConfig);
deliveryPerformanceRouter.get('/dashboard', c.deliveryMyDashboard);
deliveryPerformanceRouter.get('/preview', c.deliveryPreview);
deliveryPerformanceRouter.get('/ledger', c.deliveryMyLedger);
deliveryPerformanceRouter.get('/wallet', c.deliveryMyWallet);
deliveryPerformanceRouter.get('/appeals', c.deliveryMyAppeals);
deliveryPerformanceRouter.post('/appeals', c.deliveryCreateAppeal);
deliveryPerformanceRouter.get('/orders/:orderId/timing', c.deliveryOrderTiming);
deliveryPerformanceRouter.post('/orders/:orderId/delay-report', c.deliveryReportDelay);

/** Customer: GET /v1/food/orders/prep-extensions/pending, POST /v1/food/orders/prep-extensions/:id/respond */
export const userPerformanceRouter = express.Router();
userPerformanceRouter.get('/prep-extensions/pending', c.myPendingExtensions);
userPerformanceRouter.post('/prep-extensions/:id/respond', c.respondExtension);
