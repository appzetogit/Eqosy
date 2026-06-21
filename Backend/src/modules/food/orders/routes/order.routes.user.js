import express from 'express';
import {
    calculateOrderController,
    createOrderController,
    verifyPaymentController,
    listOrdersUserController,
    getOrderPaymentsUserController,
    getOrderByIdUserController,
    cancelOrderController,
    submitOrderRatingsController,
    getOrderDropOtpUserController,
    updateOrderInstructionsController
} from '../controllers/order.controller.js';
import { getOrderPublic } from '../services/order.service.js';
import { sendResponse } from '../../../../utils/response.js';

const router = express.Router();

router.get('/public/:orderId', async (req, res, next) => {
    try {
        const data = await getOrderPublic(req.params.orderId);
        return sendResponse(res, 200, 'Order info', data);
    } catch (err) {
        next(err);
    }
});

router.post('/calculate', calculateOrderController);
router.post('/', createOrderController);
router.post('/verify-payment', verifyPaymentController);
router.get('/', listOrdersUserController);
router.get('/:orderId/payments', getOrderPaymentsUserController);
router.get('/:orderId/drop-otp', getOrderDropOtpUserController);
router.get('/:orderId', getOrderByIdUserController);
router.patch('/:orderId/cancel', cancelOrderController);
router.patch('/:orderId/ratings', submitOrderRatingsController);
router.patch('/:orderId/instructions', updateOrderInstructionsController);

export default router;
