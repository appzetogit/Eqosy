import express from 'express';
import * as c from '../controllers/partialFulfilment.controller.js';
import { requireFoodResourceAccess } from '../../admin/middlewares/foodAdmin.middleware.js';

/** Mounted at /v1/food/orders (before the generic order router) with authMiddleware + requireRoles('USER'). */
export const userFulfilmentRouter = express.Router();
userFulfilmentRouter.get('/fulfilment/config', c.publicConfig);
userFulfilmentRouter.get('/fulfilment/preference', c.getPreference);
userFulfilmentRouter.put('/fulfilment/preference', c.setPreference);
userFulfilmentRouter.get('/:orderId/fulfilment', c.decisionView);
userFulfilmentRouter.post('/:orderId/fulfilment/preview', c.preview);
userFulfilmentRouter.post('/:orderId/fulfilment/decision', c.decide);
userFulfilmentRouter.post('/:orderId/fulfilment/verify-payment', c.verifyPayment);

/** Registered inside restaurant.routes.js (authMiddleware + requireRestaurant added there). */
export const restaurantFulfilmentHandlers = {
    reportUnavailable: c.reportUnavailable,
    alternatives: c.storeAlternatives,
};

/** Mounted inside the admin router at /partial-fulfilment (admin auth + context already applied). */
export const adminFulfilmentRouter = express.Router();
const settingsAccess = requireFoodResourceAccess('fee_settings', 'fee_settings');
const ordersAccess = requireFoodResourceAccess('orders', 'orders');
adminFulfilmentRouter.get('/settings', settingsAccess, c.getSettings);
adminFulfilmentRouter.put('/settings', settingsAccess, c.updateSettings);
adminFulfilmentRouter.get('/summary', ordersAccess, c.summary);
adminFulfilmentRouter.get('/orders', ordersAccess, c.list);
adminFulfilmentRouter.get('/orders/:orderId', ordersAccess, c.detail);
adminFulfilmentRouter.post('/orders/:orderId/extend', ordersAccess, c.extend);
adminFulfilmentRouter.post('/orders/:orderId/retry-refund', ordersAccess, c.retryRefund);
