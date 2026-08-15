import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { normalizePoint } from '../../../../utils/geo.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import { Driver } from '../../driver/models/Driver.js';
import { WalletTransaction } from '../../driver/models/WalletTransaction.js';
import { applyDriverWalletAdjustment, serializeDriverWallet } from '../../driver/services/walletService.js';
import { Notification } from '../../admin/promotions/models/Notification.js';
import { RIDE_LIVE_STATUS, RIDE_STATUS } from '../../constants/index.js';
import {
  acceptRideBidAssignment,
  createRideRecord,
  ensureRideParticipantAccess,
  getAllowedRidePaymentMethodsForPricing,
  getActiveRideForIdentity,
  getRideDetails,
  getRideRoom,
  increaseRideBidCeiling,
  listRideBidsForUser,
  listRideHistoryForIdentity,
  serializeRideRealtime,
  submitRideFeedback,
  updateRideLifecycle,
} from '../../services/rideService.js';
import {
  cancelRideByUser,
  emitToDriver,
  emitToRoom,
  getDriverRoom,
  notifyRideAccepted,
  notifyRideBiddingUpdated,
  restartRideDispatchWithLatestFare,
  startDispatchFlow,
} from '../../services/dispatchService.js';
import { getTipSettings } from '../../services/appSettingsService.js';

const formatMoneyDisplay = (val) => (Number.isInteger(Number(val)) ? String(val) : Number(val).toFixed(2));
import { calculateCancellationBill } from '../../services/cancellationService.js';
import { Ride } from '../models/Ride.js';
import { UserWallet } from '../models/UserWallet.js';

const EARTH_RADIUS_METERS = 6371000;
const AVERAGE_CITY_SPEED_KMPH = 24;
const PAYMENT_PAID_STATUSES = new Set(['paid', 'captured', 'completed']);

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceMeters = (fromCoords = [], toCoords = []) => {
  const [fromLng, fromLat] = fromCoords;
  const [toLng, toLat] = toCoords;

  if (![fromLng, fromLat, toLng, toLat].every((value) => Number.isFinite(Number(value)))) {
    return null;
  }

  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
};

const estimateEtaMinutes = (distanceMeters) => {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 1;
  }

  const metersPerMinute = (AVERAGE_CITY_SPEED_KMPH * 1000) / 60;
  return Math.max(1, Math.round(distanceMeters / metersPerMinute));
};

const normalizeMoneyAmount = (value, fieldName = 'amount') => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, `${fieldName} must be greater than zero`);
  }

  return Math.round(amount * 100) / 100;
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const ensureUserWallet = async (userId, session = null) => {
  if (!userId) return;
  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true, ...(session ? { session } : {}) },
  );
};

const isDriverCollectionPaid = (ride = {}) =>
  Boolean(ride?.driverPaymentCollection?.paidAt) ||
  PAYMENT_PAID_STATUSES.has(String(ride?.driverPaymentCollection?.status || '').trim().toLowerCase());

const buildCompletionAmounts = (ride, tipAmount = 0) => {
  const fare = roundMoney(ride?.fare || 0);
  const normalizedTipAmount = roundMoney(tipAmount || 0);
  const fareDue = isDriverCollectionPaid(ride) ? 0 : fare;
  return {
    fare,
    fareDue,
    tipAmount: normalizedTipAmount,
    totalCharge: roundMoney(fareDue + normalizedTipAmount),
  };
};

const validateRideCompletionFeedback = async ({ rating, tipAmount }) => {
  const numericRating = Number(rating);
  const numericTip = roundMoney(tipAmount || 0);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError(400, 'rating must be an integer between 1 and 5');
  }

  if (!Number.isFinite(numericTip) || numericTip < 0) {
    throw new ApiError(400, 'tipAmount must be zero or greater');
  }

  const tipSettings = await getTipSettings();
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);

  if (!tipsEnabled && numericTip > 0) {
    throw new ApiError(400, 'Tips are currently disabled');
  }

  if (tipsEnabled && numericTip > 0 && minimumTipAmount > 0 && numericTip < minimumTipAmount) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  return {
    rating: numericRating,
    tipAmount: numericTip,
  };
};

const loadCompletedRideForUser = async (rideId, userId, session = null) => {
  const ride = await Ride.findOne({
    _id: rideId,
    userId,
    status: RIDE_STATUS.COMPLETED,
  }).session(session);

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  return ride;
};

const finalizeRideCompletion = async ({
  ride,
  userId,
  rating,
  comment = '',
  tipAmount = 0,
  paymentRecord = null,
  paymentSource = '',
  session = null,
}) => {
  if (ride.feedback?.submittedAt) {
    const samePayment =
      (paymentRecord?.providerPaymentId && String(ride.driverPaymentCollection?.providerPaymentId || '') === paymentRecord.providerPaymentId) ||
      (paymentRecord?.providerPaymentId && String(ride.feedback?.tipPaymentId || '') === paymentRecord.providerPaymentId);

    if (samePayment) {
      return getRideDetails(ride._id);
    }

    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const driver = await Driver.findById(ride.driverId).session(session);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const { fare, fareDue, totalCharge } = buildCompletionAmounts(ride, tipAmount);
  const previousPaymentMethod = String(ride.paymentMethod || 'cash').trim().toLowerCase() === 'cash' ? 'cash' : 'online';
  const isOnlineTip = previousPaymentMethod !== 'cash' || String(paymentSource).toLowerCase() === 'online' || fareDue > 0;
  const creditedTipAmount = isOnlineTip ? tipAmount : 0;
  const driverCreditAmount = roundMoney(
    creditedTipAmount + (fareDue > 0 && previousPaymentMethod === 'cash' ? fare : 0),
  );

  let walletResult = null;
  if (driverCreditAmount > 0) {
    walletResult = await applyDriverWalletAdjustment({
      driverId: ride.driverId,
      rideId: ride._id,
      amount: driverCreditAmount,
      type: 'adjustment',
      description: fareDue > 0
        ? 'Ride completion payment credited from rider'
        : 'Ride tip credited from rider',
      metadata: {
        source: paymentSource || 'ride_completion',
        rideId: String(ride._id),
        userId: String(userId),
        farePortion: fareDue > 0 ? fare : 0,
        tipAmount,
        totalCharge,
        provider: paymentRecord?.provider || '',
        providerOrderId: paymentRecord?.providerOrderId || '',
        providerPaymentId: paymentRecord?.providerPaymentId || '',
      },
      session,
    });
  }

  if (fareDue > 0) {
    ride.paymentMethod = 'online';
    ride.driverPaymentCollection = {
      provider: paymentRecord?.provider || ride.driverPaymentCollection?.provider || '',
      providerId: paymentRecord?.providerId || ride.driverPaymentCollection?.providerId || paymentRecord?.providerPaymentId || '',
      providerOrderId: paymentRecord?.providerOrderId || '',
      providerPaymentId: paymentRecord?.providerPaymentId || '',
      providerMode: paymentRecord?.providerMode || ride.driverPaymentCollection?.providerMode || '',
      source: paymentRecord?.source || paymentSource || '',
      status: 'paid',
      amount: totalCharge,
      currency: paymentRecord?.currency || ride.driverPaymentCollection?.currency || 'INR',
      linkUrl: paymentRecord?.linkUrl || ride.driverPaymentCollection?.linkUrl || '',
      paidAt: paymentRecord?.paidAt || new Date(),
      updatedAt: new Date(),
    };
  } else if (paymentRecord?.providerPaymentId && !isDriverCollectionPaid(ride) && paymentRecord?.provider) {
    ride.driverPaymentCollection = {
      provider: paymentRecord.provider,
      providerId: paymentRecord.providerId || paymentRecord.providerPaymentId || '',
      providerOrderId: paymentRecord.providerOrderId || '',
      providerPaymentId: paymentRecord.providerPaymentId || '',
      providerMode: paymentRecord.providerMode || '',
      source: paymentRecord.source || paymentSource || '',
      status: 'paid',
      amount: totalCharge,
      currency: paymentRecord.currency || 'INR',
      linkUrl: paymentRecord.linkUrl || '',
      paidAt: paymentRecord.paidAt || new Date(),
      updatedAt: new Date(),
    };
  }

  ride.feedback = {
    rating,
    comment: String(comment || '').trim(),
    tipAmount,
    tipPaymentId: paymentRecord?.providerPaymentId || '',
    tipOrderId: paymentRecord?.providerOrderId || '',
    tipPaidAt: paymentRecord?.providerPaymentId ? (paymentRecord?.paidAt || new Date()) : null,
    submittedAt: new Date(),
  };

  driver.ratingCount = Number(driver.ratingCount || 0) + 1;
  driver.totalRatingScore = Number(driver.totalRatingScore || 0) + rating;
  driver.rating = Number((driver.totalRatingScore / driver.ratingCount).toFixed(1));

  await Promise.all([
    ride.save({ session }),
    driver.save({ session }),
  ]);

  return {
    ride: await getRideDetails(ride._id),
    walletResult,
  };
};

const resolveRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials('razor_pay');
};

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }

  return payload;
};

export const createRide = async (req, res) => {
  const { pickup, drop, pickupAddress, dropAddress, fare, estimatedDistanceMeters, estimatedDurationMinutes, vehicleTypeId, vehicleTypeIds, vehicleIconType, vehicleIconUrl, paymentMethod, serviceType, intercity, promo_code, service_location_id, transport_type, scheduledAt, bookingMode, userMaxBidFare, bidStepAmount } =
    req.body;

  if (!pickup || !drop) {
    throw new ApiError(400, 'pickup and drop are required');
  }

  const ride = await createRideRecord({
    userId: req.auth.sub,
    pickupCoords: normalizePoint(pickup, 'pickup'),
    dropCoords: normalizePoint(drop, 'drop'),
    pickupAddress,
    dropAddress,
    fare: Number(fare || 0),
    estimatedDistanceMeters: Number(estimatedDistanceMeters || 0),
    estimatedDurationMinutes: Number(estimatedDurationMinutes || 0),
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    serviceType,
    intercity,
    promo_code,
    service_location_id,
    transport_type,
    scheduledAt,
    bookingMode,
    userMaxBidFare,
    bidStepAmount,
  });

  await startDispatchFlow(ride);

  res.status(201).json({
    success: true,
    data: {
      ride,
      realtime: {
        room: getRideRoom(ride._id),
        rideId: String(ride._id),
      },
    },
  });
};

export const getRideById = async (req, res) => {
  await ensureRideParticipantAccess({
    rideId: req.params.rideId,
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  const ride = await getRideDetails(req.params.rideId);

  res.json({
    success: true,
    data: ride,
  });
};

export const getMyActiveRide = async (req, res) => {
  const ride = await getActiveRideForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.json({
    success: true,
    data: ride ? serializeRideRealtime(ride) : null,
  });
};

export const listMyRides = async (req, res) => {
  const role = req.auth?.role || 'user';
  const entityId = req.auth?.sub;

  if (!entityId) {
    return res.json({
      success: true,
      data: {
        results: [],
        total: 0,
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      },
    });
  }

  const history = await listRideHistoryForIdentity({
    role,
    entityId,
    limit: req.query?.limit,
    page: req.query?.page,
    category: req.query?.category,
  });

  res.json({
    success: true,
    data: {
      results: history?.results || [],
      total: history?.pagination?.total || 0,
      pagination: history?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
    },
  });
};

export const updateRideStatus = async (req, res) => {
  if (req.auth.role !== 'driver') {
    throw new ApiError(403, 'Only drivers can update ride status');
  }

  const nextStatus = String(req.body.status || '').trim().toLowerCase();

  if (![RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.STARTED, RIDE_LIVE_STATUS.ARRIVED, RIDE_LIVE_STATUS.COMPLETED].includes(nextStatus)) {
    throw new ApiError(400, 'status must be accepted, arriving, started, arrived, or completed');
  }

  const ride = await updateRideLifecycle({
    rideId: req.params.rideId,
    driverId: req.auth.sub,
    nextStatus,
    paymentMethod: req.body.paymentMethod,
  });

  res.json({
    success: true,
    data: serializeRideRealtime(ride),
  });
};

export const submitRideReview = async (req, res) => {
  if (req.auth.role !== 'user') {
    throw new ApiError(403, 'Only users can rate completed rides');
  }

  const ride = await submitRideFeedback({
    rideId: req.params.rideId,
    userId: req.auth.sub,
    rating: req.body.rating,
    comment: req.body.comment,
    tipAmount: req.body.tipAmount,
  });

  res.json({
    success: true,
    data: serializeRideRealtime(ride),
  });
};

export const createRazorpayRideCompletionOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const { tipAmount } = await validateRideCompletionFeedback({
    rating: Number(req.body?.rating || 0),
    tipAmount: req.body?.tipAmount,
  });

  const ride = await loadCompletedRideForUser(rideId, req.auth.sub);

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const paymentAmounts = buildCompletionAmounts(ride, tipAmount);

  if (paymentAmounts.totalCharge <= 0) {
    throw new ApiError(400, 'No payable amount remains for this ride');
  }

  const compactRideId = rideId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'ride';
  const compactUserId = String(req.auth?.sub || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const receipt = `uride_${compactUserId}_${compactRideId}_${Date.now().toString(36)}`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(paymentAmounts.totalCharge * 100),
      currency: 'INR',
      receipt,
      notes: {
        rideId,
        userId: String(req.auth.sub),
        driverId: String(ride.driverId),
        fareDue: String(paymentAmounts.fareDue),
        tipAmount: String(tipAmount),
        source: 'ride_completion',
      },
    },
    keyId,
    keySecret,
  });

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      fare: paymentAmounts.fare,
      fareDue: paymentAmounts.fareDue,
      tipAmount: paymentAmounts.tipAmount,
      totalCharge: paymentAmounts.totalCharge,
    },
  });
};

export const verifyRazorpayRideCompletion = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '');
  const { tipAmount } = await validateRideCompletionFeedback({
    rating,
    tipAmount: req.body?.tipAmount,
  });
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const ride = await loadCompletedRideForUser(rideId, req.auth.sub);

  if (
    ride.feedback?.submittedAt &&
    (String(ride.driverPaymentCollection?.providerPaymentId || '') === paymentId || String(ride.feedback?.tipPaymentId || '') === paymentId)
  ) {
    return res.json({
      success: true,
      data: await getRideDetails(rideId),
    });
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const order = await razorpayRequest({
    method: 'GET',
    path: `/orders/${encodeURIComponent(orderId)}`,
    keyId,
    keySecret,
  });

  const paymentAmounts = buildCompletionAmounts(ride, tipAmount);
  const verifiedTotalCharge = roundMoney(Number(order?.amount || 0) / 100);
  if (verifiedTotalCharge <= 0) {
    throw new ApiError(400, 'Invalid order amount');
  }

  if (Math.abs(verifiedTotalCharge - paymentAmounts.totalCharge) > 0.001) {
    throw new ApiError(400, 'Verified payment amount does not match the payable ride total');
  }

  const existingWalletCredit = await WalletTransaction.findOne({
    driverId: ride.driverId,
    'metadata.providerPaymentId': paymentId,
  })
    .select('_id')
    .lean();

  if (
    existingWalletCredit &&
    String(ride.driverPaymentCollection?.providerPaymentId || '') !== paymentId &&
    String(ride.feedback?.tipPaymentId || '') !== paymentId
  ) {
    throw new ApiError(409, 'This ride completion payment was already processed');
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const liveRide = await loadCompletedRideForUser(rideId, req.auth.sub, session);
    const result = await finalizeRideCompletion({
      ride: liveRide,
      userId: req.auth.sub,
      rating,
      comment,
      tipAmount,
      paymentSource: 'ride_completion_razorpay',
      paymentRecord: {
        provider: 'razorpay',
        providerId: paymentId,
        providerOrderId: orderId,
        providerPaymentId: paymentId,
        providerMode: 'razorpay_order',
        source: 'ride_completion_razorpay',
        currency: order.currency || 'INR',
        paidAt: new Date(),
      },
      session,
    });

    await session.commitTransaction();

    if (result.walletResult?.transaction) {
      emitToDriver(liveRide.driverId, 'driver:wallet:updated', {
        wallet: result.walletResult.wallet,
        transaction: result.walletResult.transaction,
        notification: {
          id: `ride-payment-${paymentId}`,
          title: 'Payment received',
          body: `Rs ${formatMoneyDisplay(paymentAmounts.totalCharge)} received from rider for completed ride.`,
          sentAt: new Date().toISOString(),
        },
      });
    }

    res.json({
      success: true,
      data: result.ride,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const payRideCompletionWithWallet = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '');
  const { tipAmount } = await validateRideCompletionFeedback({
    rating,
    tipAmount: req.body?.tipAmount,
  });

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ride = await loadCompletedRideForUser(rideId, req.auth.sub, session);
    const paymentAmounts = buildCompletionAmounts(ride, tipAmount);

    if (paymentAmounts.totalCharge <= 0) {
      throw new ApiError(400, 'No payable amount remains for this ride');
    }

    await ensureUserWallet(req.auth.sub, session);
    const userWallet = await UserWallet.findOne({ userId: req.auth.sub }).session(session);
    if (!userWallet) {
      throw new ApiError(404, 'User wallet not found');
    }

    if (Number(userWallet.balance || 0) < paymentAmounts.totalCharge) {
      throw new ApiError(400, 'Insufficient wallet balance');
    }

    const transferId = crypto.randomUUID();
    userWallet.balance = roundMoney(Number(userWallet.balance || 0) - paymentAmounts.totalCharge);
    userWallet.transactions.push({
      kind: 'debit',
      amount: paymentAmounts.totalCharge,
      title: `Ride payment for ${rideId.slice(-6)}${tipAmount > 0 ? ' with tip' : ''}`,
      provider: 'ride_completion_wallet',
      providerPaymentId: transferId,
    });
    userWallet.transactions = userWallet.transactions.slice(-50);
    await userWallet.save({ session });

    const result = await finalizeRideCompletion({
      ride,
      userId: req.auth.sub,
      rating,
      comment,
      tipAmount,
      paymentSource: 'ride_completion_wallet',
      paymentRecord: {
        provider: 'wallet',
        providerId: transferId,
        providerOrderId: '',
        providerPaymentId: transferId,
        providerMode: 'wallet_internal',
        source: 'ride_completion_wallet',
        currency: 'INR',
        paidAt: new Date(),
      },
      session,
    });

    await session.commitTransaction();

    if (result.walletResult?.transaction) {
      emitToDriver(ride.driverId, 'driver:wallet:updated', {
        wallet: result.walletResult.wallet,
        transaction: result.walletResult.transaction,
        notification: {
          id: `ride-wallet-${transferId}`,
          title: 'Payment received',
          body: `Rs ${formatMoneyDisplay(paymentAmounts.totalCharge)} received from rider wallet for completed ride.`,
          sentAt: new Date().toISOString(),
        },
      });
    }

    res.status(201).json({
      success: true,
      data: result.ride,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const createRazorpayRideTipOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const tipAmount = normalizeMoneyAmount(req.body?.tipAmount, 'tipAmount');
  const tipSettings = await getTipSettings();
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);

  if (!tipsEnabled) {
    throw new ApiError(403, 'Tips are currently disabled');
  }

  if (minimumTipAmount > 0 && tipAmount < minimumTipAmount) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  const ride = await Ride.findOne({
    _id: rideId,
    userId: req.auth.sub,
    status: 'completed',
  }).select('_id driverId feedback');

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const amountPaise = Math.round(tipAmount * 100);
  const compactRideId = rideId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'ride';
  const compactUserId = String(req.auth?.sub || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const receipt = `utip_${compactUserId}_${compactRideId}_${Date.now().toString(36)}`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        rideId,
        userId: String(req.auth.sub),
        driverId: String(ride.driverId),
        kind: 'ride_tip',
      },
    },
    keyId,
    keySecret,
  });

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      tipAmount,
    },
  });
};

export const verifyRazorpayRideTip = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '');
  const tipAmount = normalizeMoneyAmount(req.body?.tipAmount, 'tipAmount');
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be between 1 and 5');
  }

  const tipSettings = await getTipSettings();
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);

  if (!tipsEnabled) {
    throw new ApiError(403, 'Tips are currently disabled');
  }

  if (minimumTipAmount > 0 && tipAmount < minimumTipAmount) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  const ride = await Ride.findOne({
    _id: rideId,
    userId: req.auth.sub,
    status: 'completed',
  });

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  if (ride.feedback?.submittedAt && String(ride.feedback?.tipPaymentId || '') === paymentId) {
    const existingRide = await getRideDetails(rideId);
    res.json({
      success: true,
      data: existingRide,
    });
    return;
  }

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const order = await razorpayRequest({
    method: 'GET',
    path: `/orders/${encodeURIComponent(orderId)}`,
    keyId,
    keySecret,
  });

  const amountPaise = Number(order?.amount);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(400, 'Invalid order amount');
  }

  const verifiedTipAmount = Math.round(amountPaise) / 100;
  if (Math.abs(verifiedTipAmount - tipAmount) > 0.001) {
    throw new ApiError(400, 'Verified tip amount does not match selected tip');
  }

  const driver = await Driver.findById(ride.driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const existingWalletCredit = await WalletTransaction.findOne({
    driverId: ride.driverId,
    'metadata.providerPaymentId': paymentId,
  })
    .select('_id')
    .lean();

  if (existingWalletCredit && String(ride.feedback?.tipPaymentId || '') !== paymentId) {
    throw new ApiError(409, 'This tip payment was already processed');
  }

  const walletResult = existingWalletCredit
    ? {
        wallet: await serializeDriverWallet(driver),
        transaction: null,
      }
    : await applyDriverWalletAdjustment({
        driverId: ride.driverId,
        rideId: ride._id,
        amount: verifiedTipAmount,
        type: 'ride_tip',
        description: 'Ride tip credited from rider (online)',
        metadata: {
          source: 'ride_tip',
          paymentMode: 'online',
          provider: 'razorpay',
          providerOrderId: orderId,
          providerPaymentId: paymentId,
          rideId: String(ride._id),
          userId: String(req.auth.sub),
        },
      });

  ride.feedback = {
    rating,
    comment: comment.trim(),
    tipAmount: verifiedTipAmount,
    tipPaymentId: paymentId,
    tipOrderId: orderId,
    tipPaidAt: new Date(),
    submittedAt: new Date(),
  };

  driver.ratingCount = Number(driver.ratingCount || 0) + 1;
  driver.totalRatingScore = Number(driver.totalRatingScore || 0) + rating;
  driver.rating = Number((driver.totalRatingScore / driver.ratingCount).toFixed(1));

  await Promise.all([ride.save(), driver.save()]);

  if (walletResult.transaction) {
    emitToDriver(ride.driverId, 'driver:wallet:updated', {
      wallet: walletResult.wallet,
      transaction: walletResult.transaction,
      notification: {
        id: `ride-tip-${paymentId}`,
        title: 'Payment received',
        body: `Rs ${formatMoneyDisplay(verifiedTipAmount)} tip received from rider.`,
        sentAt: new Date().toISOString(),
      },
    });
  }

  try {
    emitToRoom(getDriverRoom(ride.driverId), 'ride:tip:received', {
      rideId: String(ride._id),
      tipAmount: verifiedTipAmount,
      rating,
      comment: comment.trim(),
      message: `You received a tip of Rs ${verifiedTipAmount} from passenger!`,
    });
  } catch (_e) {}

  if (verifiedTipAmount > 0) {
    const serviceName = ride.serviceType === 'parcel' ? 'parcel delivery' : 'ride';
    const tipFormatted = Number.isInteger(verifiedTipAmount) ? String(verifiedTipAmount) : verifiedTipAmount.toFixed(2);
    await Notification.create({
      service_location_id: ride.service_location_id || 'all',
      send_to: 'driver',
      recipient_driver_id: ride.driverId,
      push_title: '🎉 Tip Received!',
      message: `You received an online tip of Rs ${tipFormatted} from rider for ${serviceName}.`,
      type: 'tip',
      status: 'sent',
      sent_at: new Date(),
    }).catch((notifErr) => console.warn('Failed to save tip notification:', notifErr?.message));
  }

  const populatedRide = await getRideDetails(ride._id);

  res.json({
    success: true,
    data: populatedRide,
  });
};

export const getRideAppTipSettings = async (_req, res) => {
  try {
    const tipSettings = await getTipSettings();

    res.json({
      success: true,
      data: {
        settings: tipSettings,
      },
    });
  } catch (_e) {
    res.json({
      success: true,
      data: {
        settings: {
          enable_tips: '1',
          min_tip_amount: '0',
        },
      },
    });
  }
};

export const cancelRide = async (req, res) => {
  const reason = req.body?.cancellationReason || req.body?.reason || req.query?.reason || '';
  const comment = req.body?.cancellationComment || req.body?.comment || req.query?.comment || '';

  const ride = await cancelRideByUser({
    rideId: req.params.rideId,
    userId: req.auth.sub,
    reason,
    comment,
  });

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  const cancellationBill = await calculateCancellationBill({
    ride,
    cancelledBy: 'user',
    reason,
  });

  res.json({
    success: true,
    data: {
      rideId: String(ride._id),
      status: ride.status,
      liveStatus: ride.liveStatus,
      cancellationCharge: cancellationBill?.billBreakdown?.totalAmount || 0,
      isFeeApplied: !cancellationBill?.billBreakdown?.isWaived,
      cancellationBill,
    },
  });
};

export const getCancellationBillReceipt = async (req, res) => {
  const { rideId } = req.params;
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  const cancelledBy = ride.cancellation?.cancelled_by || 'user';
  const reason = ride.cancellation?.reason || '';

  const cancellationBill = await calculateCancellationBill({
    ride,
    cancelledBy,
    reason,
  });

  res.json({
    status: true,
    data: cancellationBill,
  });
};

export const listAvailableDrivers = async (req, res) => {
  try {
    const { vehicleTypeId, lat, lng, maxDistance, limit = 30, service_location_id, transport_type } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);
    const distance = Number(maxDistance);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(200).json({
        success: true,
        data: {
          totalDrivers: 0,
          closestDriverDistanceMeters: null,
          closestDriverEtaMinutes: null,
          allowedPaymentMethods: ['cash', 'online'],
          drivers: [],
        },
      });
    }

    const query = {
      isOnline: true,
      isOnRide: false,
    };

    if (vehicleTypeId && mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
      const isDelivery = transport_type === 'delivery' || transport_type === 'parcel';
      if (isDelivery) {
        query.$or = [
          { vehicleTypeId },
          { serviceCategories: { $in: ['delivery', 'parcel'] } },
          { registerFor: { $in: ['delivery', 'both'] } },
        ];
      } else {
        query.vehicleTypeId = vehicleTypeId;
      }
    }

    const near = {
      $geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      $maxDistance: Number.isFinite(distance) && distance > 0 ? Math.min(distance, 25000) : 15000,
    };

    query.location = { $near: near };

    let drivers = [];
    try {
      drivers = await Driver.find(query)
        .limit(Math.min(Number(limit) || 30, 50))
        .select('name phone vehicleTypeId vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel rating location')
        .lean();
    } catch (_e) {
      drivers = [];
    }

    const enrichedDrivers = (drivers || []).map((driver) => {
      const coords = driver.location?.coordinates || [longitude, latitude];
      const distanceMeters = calculateDistanceMeters([longitude, latitude], coords);
      const etaMinutes = estimateEtaMinutes(distanceMeters);

      return {
        id: String(driver._id),
        name: driver.name || 'Rider',
        vehicleTypeId: driver.vehicleTypeId,
        vehicleType: driver.vehicleType,
        vehicleIconType: driver.vehicleIconType || (transport_type === 'delivery' ? 'truck' : 'car'),
        vehicleNumber: driver.vehicleNumber || 'MP-09-RIDER',
        vehicleColor: driver.vehicleColor || '',
        vehicleMake: driver.vehicleMake || '',
        vehicleModel: driver.vehicleModel || '',
        rating: driver.rating || 4.9,
        heading: driver.heading || 90,
        location: driver.location,
        distanceMeters,
        etaMinutes,
      };
    });

    let allowedPaymentMethods = ['cash', 'online'];
    try {
      const paymentInfo = await getAllowedRidePaymentMethodsForPricing({
        serviceLocationId: service_location_id && mongoose.Types.ObjectId.isValid(service_location_id)
          ? new mongoose.Types.ObjectId(service_location_id)
          : null,
        transportType: transport_type || 'taxi',
        vehicleTypeId: vehicleTypeId && mongoose.Types.ObjectId.isValid(vehicleTypeId) ? vehicleTypeId : null,
      });
      if (Array.isArray(paymentInfo?.allowedPaymentMethods) && paymentInfo.allowedPaymentMethods.length) {
        allowedPaymentMethods = paymentInfo.allowedPaymentMethods;
      }
    } catch (_e) {
      allowedPaymentMethods = ['cash', 'online'];
    }

    const closestDriver = enrichedDrivers[0] || null;

    return res.json({
      success: true,
      data: {
        totalDrivers: enrichedDrivers.length,
        closestDriverDistanceMeters: closestDriver?.distanceMeters ?? null,
        closestDriverEtaMinutes: closestDriver?.etaMinutes ?? null,
        allowedPaymentMethods,
        drivers: enrichedDrivers,
      },
    });
  } catch (error) {
    console.error('[listAvailableDrivers] Handled error:', error);
    return res.status(200).json({
      success: true,
      data: {
        totalDrivers: 0,
        closestDriverDistanceMeters: null,
        closestDriverEtaMinutes: null,
        allowedPaymentMethods: ['cash', 'online'],
        drivers: [],
      },
    });
  }
};

export const getRideBids = async (req, res) => {
  const result = await listRideBidsForUser({
    rideId: req.params.rideId,
    userId: req.auth.sub,
  });

  res.json({
    success: true,
    data: result,
  });
};

export const acceptRideBid = async (req, res) => {
  const ride = await acceptRideBidAssignment({
    rideId: req.params.rideId,
    bidId: req.params.bidId,
    userId: req.auth.sub,
  });

  await notifyRideAccepted(ride);

  res.json({
    success: true,
    data: {
      rideId: String(ride._id),
      status: ride.status,
      liveStatus: ride.liveStatus,
      acceptedAt: ride.acceptedAt,
    },
  });
};

export const updateRideBidCeiling = async (req, res) => {
  const ride = await increaseRideBidCeiling({
    rideId: req.params.rideId,
    userId: req.auth.sub,
    incrementSteps: req.body.incrementSteps,
  });

  await notifyRideBiddingUpdated(ride.rideId || req.params.rideId);
  if (ride.pricingNegotiationMode === 'user_increment_only') {
    await restartRideDispatchWithLatestFare(ride.rideId || req.params.rideId);
  }

  res.json({
    success: true,
    data: ride,
  });
};

export const getPendingCancellationDues = async (req, res) => {
  const userId = req.auth.sub;
  const pendingDueRides = await Ride.find({
    userId,
    'cancellation.payment_status': 'added_to_next_ride_due',
    'cancellation.cancellation_charge': { $gt: 0 },
  }).select('_id cancellation createdAt').lean();

  const totalDueAmount = Math.round(pendingDueRides.reduce(
    (sum, r) => sum + Number(r.cancellation?.cancellation_charge || 0),
    0,
  ));

  res.json({
    success: true,
    data: {
      totalDueAmount,
      pendingCount: pendingDueRides.length,
      rides: pendingDueRides.map((r) => ({
        rideId: String(r._id),
        cancellationFee: Number(r.cancellation?.cancellation_charge || 0),
        cancelledAt: r.cancellation?.cancelled_at || r.createdAt,
      })),
    },
  });
};
