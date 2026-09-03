import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { handleRazorpayBusWebhook } from '../user/controllers/userController.js';

export const webhookRouter = Router();

webhookRouter.post('/webhooks/razorpay', asyncHandler(handleRazorpayBusWebhook));
