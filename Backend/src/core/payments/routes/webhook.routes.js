import express from 'express';
import { handleRazorpayWebhook } from '../controllers/razorpayWebhook.controller.js';
import { handleRazorpayxWebhook } from '../controllers/razorpayxWebhook.controller.js';

/** ✅ NEW: Webhook Routes Module */
const router = express.Router();

/**
 * Endpoint for Razorpay payment/refund events (Public)
 * Path: /api/v1/payments/webhook/razorpay
 */
router.post('/razorpay', handleRazorpayWebhook);

/**
 * Endpoint for RazorpayX payout + bank-account validation events (Public, signature verified)
 * Path: /api/v1/payments/webhook/razorpayx
 */
router.post('/razorpayx', handleRazorpayxWebhook);

export default router;
