import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate, authenticateOrResolveUser } from '../../middlewares/authMiddleware.js';
import {
  acceptRideBid,
  createRazorpayRideCompletionOrder,
  cancelRide,
  getCancellationBillReceipt,
  createRazorpayRideTipOrder,
  createRide,
  getRideBids,
  getRideAppTipSettings,
  getMyActiveRide,
  getRideById,
  getPendingCancellationDues,
  listMyRides,
  listAvailableDrivers,
  payRideCompletionWithWallet,
  submitRideReview,
  updateRideBidCeiling,
  updateRideStatus,
  verifyRazorpayRideCompletion,
  verifyRazorpayRideTip,
} from '../controllers/rideController.js';

export const rideRouter = Router();

rideRouter.post('/', authenticateOrResolveUser(['user']), asyncHandler(createRide));
rideRouter.get('/', authenticateOrResolveUser(['user', 'driver']), asyncHandler(listMyRides));
rideRouter.get('/pending-cancellation-dues', authenticate(['user']), asyncHandler(getPendingCancellationDues));
rideRouter.get('/app-settings/tip', asyncHandler(getRideAppTipSettings));
rideRouter.get('/available-drivers', asyncHandler(listAvailableDrivers));
rideRouter.get('/active/me', authenticateOrResolveUser(['user', 'driver']), asyncHandler(getMyActiveRide));
rideRouter.patch('/:rideId/cancel', authenticate(['user']), asyncHandler(cancelRide));
rideRouter.post('/:rideId/cancel', authenticate(['user']), asyncHandler(cancelRide));
rideRouter.get('/:rideId/cancellation-bill', authenticateOrResolveUser(['user', 'driver', 'admin']), asyncHandler(getCancellationBillReceipt));
rideRouter.get('/:rideId/bids', authenticate(['user']), asyncHandler(getRideBids));
rideRouter.patch('/:rideId/bids/ceiling', authenticate(['user']), asyncHandler(updateRideBidCeiling));
rideRouter.post('/:rideId/bids/:bidId/accept', authenticate(['user']), asyncHandler(acceptRideBid));
rideRouter.get('/:rideId', authenticateOrResolveUser(['user', 'driver']), asyncHandler(getRideById));
rideRouter.patch('/:rideId/status', authenticate(['driver']), asyncHandler(updateRideStatus));
rideRouter.post('/:rideId/complete-payment/razorpay/order', authenticate(['user']), asyncHandler(createRazorpayRideCompletionOrder));
rideRouter.post('/:rideId/complete-payment/razorpay/verify', authenticate(['user']), asyncHandler(verifyRazorpayRideCompletion));
rideRouter.post('/:rideId/complete-payment/wallet', authenticate(['user']), asyncHandler(payRideCompletionWithWallet));
rideRouter.post('/:rideId/tip/razorpay/order', authenticate(['user']), asyncHandler(createRazorpayRideTipOrder));
rideRouter.post('/:rideId/tip/razorpay/verify', authenticate(['user']), asyncHandler(verifyRazorpayRideTip));
rideRouter.patch('/:rideId/feedback', authenticate(['user']), asyncHandler(submitRideReview));
