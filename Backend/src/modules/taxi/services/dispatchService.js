import mongoose from 'mongoose';
import { Ride } from '../user/models/Ride.js';
import { User } from '../user/models/User.js';
import { Driver } from '../driver/models/Driver.js';
import { matchDrivers } from './matchingService.js';
import {
  RIDE_LIVE_STATUS,
  RIDE_STATUS,
} from '../constants/index.js';
import { Delivery } from '../user/models/Delivery.js';
import { getRideRoom } from './rideService.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { resolveTransportDispatchConfig } from './transportSettingsService.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';
import { processRideCancellation } from './cancellationService.js';

const activeDispatches = new Map();
let ioInstance = null;
const scheduledDispatchTimers = new Map();
const actualTimeNotificationTimers = new Map();

const clearActualTimeNotificationTimer = (rideId) => {
  const key = String(rideId);
  const timer = actualTimeNotificationTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    actualTimeNotificationTimers.delete(key);
  }
};

export const getUserRoom = (userId) => `user:${userId}`;
export const getDriverRoom = (driverId) => `driver:${driverId}`;
export const getAdminRoom = () => 'admin:broadcast';

export const setSocketServer = (io) => {
  ioInstance = io;
};

export const joinRideRoom = (socket, rideId) => {
  socket.join(getRideRoom(rideId));
};

export const addSocketSubscriptions = (socket, { role, entityId }) => {
  if (role === 'admin') {
    socket.join(getAdminRoom());
    return;
  }

  if (role === 'user') {
    socket.join(getUserRoom(entityId));
    return;
  }

  if (role === 'driver') {
    socket.join(getDriverRoom(entityId));
  }
};

const getDispatchVehicleTypeIds = (ride) => {
  const ids = [
    ...(Array.isArray(ride.dispatchVehicleTypeIds) ? ride.dispatchVehicleTypeIds : []),
    ride.vehicleTypeId,
  ];

  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
};

const emitToSocket = (socketId, event, payload) => {
  if (ioInstance && socketId) {
    ioInstance.to(socketId).emit(event, payload);
  }
};

export const emitToRoom = (room, event, payload) => {
  if (ioInstance) {
    ioInstance.to(room).emit(event, payload);
  }
};

export const notifyUserAccountDeleted = (userId) => {
  if (!userId) return;
  emitToRoom(getUserRoom(userId), 'account:deleted', {
    reason: 'delete_request_approved',
  });
};

export const emitToDriver = (driverId, event, payload) => {
  if (driverId) {
    emitToRoom(getDriverRoom(driverId), event, payload);
  }
};

export const emitToAdmins = (event, payload) => {
  emitToRoom(getAdminRoom(), event, payload);
};

const clearDispatchTimer = (rideId) => {
  const state = activeDispatches.get(String(rideId));

  if (state?.timer) {
    clearTimeout(state.timer);
  }
};

const clearScheduledDispatchTimer = (rideId) => {
  const key = String(rideId);
  const timer = scheduledDispatchTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    scheduledDispatchTimers.delete(key);
  }
};

export const stopDispatchFlow = (rideId) => {
  clearDispatchTimer(rideId);
  clearScheduledDispatchTimer(rideId);
  clearActualTimeNotificationTimer(rideId);
  activeDispatches.delete(String(rideId));
};

export const restartRideDispatchWithLatestFare = async (rideId) => {
  if (!rideId) {
    return;
  }

  const state = getDispatchState(rideId);
  closeDriverRequestWindow(rideId, [
    ...state.driverIds,
    ...state.notifiedDriverIds,
    ...state.rejectedDriverIds,
  ]);
  stopDispatchFlow(rideId);

  const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode');
  if (!ride || ride.status !== RIDE_STATUS.SEARCHING || ride.liveStatus !== RIDE_LIVE_STATUS.SEARCHING) {
    return;
  }

  await startDispatchFlow(ride);
};

const getDispatchState = (rideId) => {
  const rideKey = String(rideId);
  const state = activeDispatches.get(rideKey) || {};

  return {
    radiusIndex: Number.isInteger(state.radiusIndex) ? state.radiusIndex : 0,
    timer: state.timer || null,
    driverIds: Array.isArray(state.driverIds) ? state.driverIds : [],
    notifiedDriverIds: Array.isArray(state.notifiedDriverIds) ? state.notifiedDriverIds : [],
    rejectedDriverIds: Array.isArray(state.rejectedDriverIds) ? state.rejectedDriverIds : [],
  };
};

const saveDispatchState = (rideId, nextState = {}) => {
  const rideKey = String(rideId);
  const currentState = getDispatchState(rideKey);

  activeDispatches.set(rideKey, {
    ...currentState,
    ...nextState,
  });

  return activeDispatches.get(rideKey);
};

const closeDriverRequestWindow = (rideId, driverIds = []) => {
  const safeDriverIds = [...new Set((Array.isArray(driverIds) ? driverIds : []).map((id) => String(id || '')).filter(Boolean))];

  for (const driverId of safeDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(rideId),
      reason: 'search-window-expired',
    });
  }
};

const emitRideRequestToDrivers = async ({
  ride,
  targetDrivers = [],
  zone = null,
  effectiveRadius = 0,
  dispatchVehicleTypeIds = [],
  dispatchConfig,
  attemptIndex = 0,
}) => {
  if (!ride || !targetDrivers.length) {
    return;
  }

  const requestExpiresAt = new Date(Date.now() + dispatchConfig.retryDelayMs).toISOString();

  for (const driver of targetDrivers) {
    console.log(`[DISPATCH_SERVICE] Emitting 'rideRequest' to Driver: ${driver._id} (Room: ${getDriverRoom(driver._id)}) for Ride: ${ride._id}`);
    emitToDriver(driver._id, 'rideRequest', {
      rideId: String(ride._id),
      type: ride.serviceType || 'ride',
      serviceType: ride.serviceType || 'ride',
      userId: String(ride.userId),
      user: {
        id: ride.userId?._id ? String(ride.userId._id) : String(ride.userId || ''),
        name: ride.userId?.name || 'Customer',
        phone: ride.userId?.phone || '',
        countryCode: ride.userId?.countryCode || '',
      },
      pickupLocation: ride.pickupLocation,
      pickupAddress: ride.pickupAddress || '',
      dropLocation: ride.dropLocation,
      dropAddress: ride.dropAddress || '',
      scheduledAt: ride.scheduledAt || null,
      estimatedDistanceMeters: ride.estimatedDistanceMeters || 0,
      estimatedDurationMinutes: ride.estimatedDurationMinutes || 0,
      vehicleTypeId: ride.vehicleTypeId ? String(ride.vehicleTypeId) : null,
      vehicleTypeIds: dispatchVehicleTypeIds,
      vehicleIconType: ride.vehicleIconType,
      vehicleIconUrl: ride.vehicleIconUrl || '',
      fare: ride.fare,
      baseFare: Number(ride.baseFare || ride.fare || 0),
      bookingMode: ride.bookingMode || 'normal',
      pricingNegotiationMode: ride.pricingNegotiationMode || 'none',
      biddingStatus: ride.biddingStatus || 'none',
      bidding: ride.pricingNegotiationMode === 'driver_bid'
        ? {
            enabled: true,
            baseFare: Number(ride.baseFare || ride.fare || 0),
            bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
            userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
            bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
            bidStepAmount: Number(ride.bidStepAmount || 10),
          }
        : {
            enabled: false,
          },
      fareIncreaseWaitMinutes: Number(ride.fareIncreaseWaitMinutes || 0),
      nextFareIncreaseAt: ride.nextFareIncreaseAt || null,
      paymentMethod: ride.paymentMethod,
      parcel: ride.parcel || null,
      intercity: ride.intercity || null,
      radius: effectiveRadius,
      attempt: attemptIndex + 1,
      maxAttempts: dispatchConfig.maxAttempts,
      acceptRejectDurationSeconds: dispatchConfig.retryWindowSeconds,
      expiresInSeconds: dispatchConfig.retryWindowSeconds,
      requestExpiresAt,
      zoneId: zone?._id ? String(zone._id) : null,
    });
  }

  sendPushNotificationToEntities({
    driverIds: targetDrivers.map((driver) => String(driver._id)),
    title: ride.serviceType === 'parcel' ? 'New delivery request' : 'New ride request',
    body: ride.pickupAddress
      ? `Pickup: ${ride.pickupAddress}`
      : 'A new booking is waiting for your response.',
    data: {
      type: 'ride_request',
      rideId: String(ride._id),
      serviceType: ride.serviceType || 'ride',
      userId: String(ride.userId?._id || ride.userId || ''),
      targetUrl: `/taxi/driver/home?rideId=${String(ride._id)}`,
      link: `/taxi/driver/home?rideId=${String(ride._id)}`,
    },
  }).catch((error) => {
    console.error('Failed to send driver ride-request push notification', error);
  });
};

export const markDriverRejectedFromDispatch = (rideId, driverId) => {
  if (!rideId || !driverId) {
    return;
  }

  const state = getDispatchState(rideId);
  const rejectedDriverIds = [...new Set([...state.rejectedDriverIds, String(driverId)])];

  saveDispatchState(rideId, { rejectedDriverIds });
};

const closeRideAsUnmatched = async (rideId) => {
  const dispatchState = getDispatchState(rideId);
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, status: RIDE_STATUS.SEARCHING },
    {
      status: RIDE_STATUS.CANCELLED,
      liveStatus: RIDE_LIVE_STATUS.CANCELLED,
      biddingStatus: 'expired',
    },
    { returnDocument: 'after' },
  );

  if (!ride) {
    return;
  }

  if (ride.deliveryId) {
    await Delivery.findByIdAndUpdate(ride.deliveryId, {
      status: ride.status,
      liveStatus: ride.liveStatus,
    });
  }

  await User.findByIdAndUpdate(ride.userId, { currentRideId: null });

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: 'No drivers accepted the ride request',
  });

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'unmatched',
  });

  for (const driverId of dispatchState.notifiedDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'unmatched',
    });
  }

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
  });
};

export const cancelRideByAdmin = async (rideId) => {
  stopDispatchFlow(rideId);

  const ride = await Ride.findById(rideId);

  if (!ride) {
    return null;
  }

  ride.status = RIDE_STATUS.CANCELLED;
  ride.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
  if (ride.bookingMode === 'bidding') {
    ride.biddingStatus = 'cancelled';
  }
  await ride.save();

  if (ride.deliveryId) {
    await Delivery.findByIdAndUpdate(ride.deliveryId, {
      driverId: ride.driverId || null,
      status: ride.status,
      liveStatus: ride.liveStatus,
    });
  }

  await Promise.all([
    User.findByIdAndUpdate(ride.userId, { currentRideId: null }),
    ride.driverId ? Driver.findByIdAndUpdate(ride.driverId, { isOnRide: false }) : Promise.resolve(),
  ]);

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: 'Ride was deleted by admin',
  });

  if (ride.driverId) {
    emitToRoom(getDriverRoom(ride.driverId), 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'deleted-by-admin',
    });
  }

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'deleted-by-admin',
  });

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
  });

  return ride;
};

export const cancelRideByUser = async ({ rideId, userId, reason = '', comment = '' }) => {
  const dispatchState = getDispatchState(rideId);
  stopDispatchFlow(rideId);
  const session = await mongoose.startSession();
  let ride = null;
  let cancellationBill = null;

  try {
    session.startTransaction();

    ride = await Ride.findOne({ _id: rideId, userId }).session(session);

    if (!ride) {
      await session.abortTransaction();
      return null;
    }

    if (ride.status === RIDE_STATUS.COMPLETED || ride.liveStatus === RIDE_LIVE_STATUS.COMPLETED) {
      throw new Error('Completed rides cannot be cancelled');
    }

    if (ride.status === RIDE_STATUS.CANCELLED || ride.liveStatus === RIDE_LIVE_STATUS.CANCELLED) {
      await session.commitTransaction();
      return ride;
    }

    cancellationBill = await processRideCancellation({
      ride,
      cancelledBy: 'user',
      reason,
      comment,
      cancellerId: userId,
      session,
    });

    ride.status = RIDE_STATUS.CANCELLED;
    ride.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
    if (ride.bookingMode === 'bidding') {
      ride.biddingStatus = 'cancelled';
    }
    await ride.save({ session });

    if (ride.deliveryId) {
      await Delivery.findByIdAndUpdate(ride.deliveryId, {
        driverId: ride.driverId || null,
        status: ride.status,
        liveStatus: ride.liveStatus,
      }, { session });
    }

    await Promise.all([
      User.findByIdAndUpdate(ride.userId, { currentRideId: null }, { session }),
      ride.driverId ? Driver.findByIdAndUpdate(ride.driverId, { isOnRide: false }, { session }) : Promise.resolve(),
    ]);

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  const cancelPayload = {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: reason || 'You cancelled the ride',
    cancellationBill,
  };

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', cancelPayload);

  if (ride.driverId) {
    emitToRoom(getDriverRoom(ride.driverId), 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'user-cancelled',
      message: 'User cancelled the ride.',
      cancellationBill,
    });
    emitToRoom(getDriverRoom(ride.driverId), 'rideCancelled', cancelPayload);
  }

  for (const driverId of dispatchState.notifiedDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'user-cancelled',
      message: 'User cancelled the ride.',
    });
  }

  emitToRoom(getRideRoom(ride._id), 'rideCancelled', cancelPayload);

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'user-cancelled',
    message: 'User cancelled the ride.',
  });

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
    cancellationBill,
  });

  return ride;
};

export const cancelScheduledRideByDriver = async ({ rideId, driverId, reason = '' }) => {
  const dispatchState = getDispatchState(rideId);
  stopDispatchFlow(rideId);
  const session = await mongoose.startSession();
  let ride = null;
  let cancellationBill = null;

  try {
    session.startTransaction();

    ride = await Ride.findOne({ _id: rideId, driverId }).session(session);

    if (!ride) {
      await session.abortTransaction();
      return null;
    }

    if (ride.status === RIDE_STATUS.COMPLETED || ride.liveStatus === RIDE_LIVE_STATUS.COMPLETED) {
      throw new Error('Completed rides cannot be cancelled');
    }

    if (ride.status === RIDE_STATUS.CANCELLED || ride.liveStatus === RIDE_LIVE_STATUS.CANCELLED) {
      await session.commitTransaction();
      return ride;
    }

    cancellationBill = await processRideCancellation({
      ride,
      cancelledBy: 'driver',
      reason,
      cancellerId: driverId,
      session,
    });

    ride.status = RIDE_STATUS.CANCELLED;
    ride.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
    if (ride.bookingMode === 'bidding') {
      ride.biddingStatus = 'cancelled';
    }
    await ride.save({ session });

    if (ride.deliveryId) {
      await Delivery.findByIdAndUpdate(ride.deliveryId, {
        driverId: ride.driverId || null,
        status: ride.status,
        liveStatus: ride.liveStatus,
      }, { session });
    }

    await Promise.all([
      User.findByIdAndUpdate(ride.userId, { currentRideId: null }, { session }),
      ride.driverId ? Driver.findByIdAndUpdate(ride.driverId, { isOnRide: false }, { session }) : Promise.resolve(),
    ]);

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  const cancelReason = reason || 'Your ride was cancelled by the driver.';

  const cancelPayload = {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: cancelReason,
    cancellationBill,
  };

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', cancelPayload);

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'driver-cancelled',
    message: cancelReason,
    cancellationBill,
  });

  if (ride.driverId) {
    emitToRoom(getDriverRoom(ride.driverId), 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'driver-cancelled',
      message: 'Ride cancelled.',
      cancellationBill,
    });
    emitToRoom(getDriverRoom(ride.driverId), 'rideCancelled', cancelPayload);
  }

  for (const notifiedDriverId of dispatchState.notifiedDriverIds) {
    emitToDriver(notifiedDriverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'driver-cancelled',
      message: cancelReason,
    });
  }

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
    cancellationBill,
  });

  sendPushNotificationToEntities({
    userIds: [String(ride.userId)],
    title: 'Ride cancelled',
    body: cancelReason,
    data: {
      type: 'ride_cancelled_by_driver',
      rideId: String(ride._id),
      serviceType: ride.serviceType || 'ride',
    },
  }).catch((error) => {
    console.error('Failed to send user ride cancellation push notification', error);
  });

  return ride;
};

const scheduleNextAttempt = (rideId, nextAttemptIndex, retryDelayMs) => {
  const timer = setTimeout(() => {
    dispatchAttempt(rideId, nextAttemptIndex).catch((error) => {
      console.error('Dispatch retry failed', error);
    });
  }, retryDelayMs);

  saveDispatchState(rideId, { timer });
};

const getAttemptRadiusMeters = (baseDistanceMeters, attemptIndex) => {
  const safeBaseDistance = Math.max(1000, Number(baseDistanceMeters) || 0);
  const growthMultiplier = Math.min(1 + (Math.max(0, attemptIndex) * 0.5), 3);

  return Math.round(safeBaseDistance * growthMultiplier);
};

const dispatchAttempt = async (rideId, attemptIndex = 0) => {
  const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode');

  if (!ride || ride.status !== RIDE_STATUS.SEARCHING) {
    stopDispatchFlow(rideId);
    return;
  }

  try {
    const dispatchConfig = await resolveTransportDispatchConfig();
    const radius = getAttemptRadiusMeters(
      dispatchConfig.baseDistanceMeters || dispatchConfig.maxDistanceMeters,
      attemptIndex,
    );
    const dispatchVehicleTypeIds = getDispatchVehicleTypeIds(ride);
    const dispatchState = getDispatchState(rideId);
    if (dispatchConfig.dispatchType === 'one_by_one' && attemptIndex > 0 && dispatchState.driverIds.length) {
      closeDriverRequestWindow(rideId, dispatchState.driverIds);
    }

    const { zone, drivers, searchRadiusMeters } = await matchDrivers(ride.pickupLocation.coordinates, {
      maxDistance: radius,
      vehicleTypeId: ride.vehicleTypeId,
      vehicleTypeIds: dispatchVehicleTypeIds,
      serviceType: ride.serviceType || 'ride',
    });
    const effectiveRadius = Number.isFinite(searchRadiusMeters) && searchRadiusMeters > 0
      ? searchRadiusMeters
      : radius;

    const rejectedDriverIds = new Set(dispatchState.rejectedDriverIds);
    const notifiedDriverIds = new Set(dispatchState.notifiedDriverIds);
    const availableDrivers = drivers.filter((driver) => {
      const driverId = String(driver._id);
      return !rejectedDriverIds.has(driverId) && !notifiedDriverIds.has(driverId);
    });
    const targetDrivers = dispatchConfig.dispatchType === 'broadcast'
      ? availableDrivers
      : availableDrivers.slice(0, 1);
    const nextNotifiedDriverIds = [
      ...dispatchState.notifiedDriverIds,
      ...targetDrivers.map((driver) => String(driver._id)),
    ];

    saveDispatchState(rideId, {
      radiusIndex: attemptIndex,
      driverIds: targetDrivers.map((driver) => String(driver._id)),
      notifiedDriverIds: nextNotifiedDriverIds,
      timer: null,
    });

    await emitRideRequestToDrivers({
      ride,
      targetDrivers,
      zone,
      effectiveRadius,
      dispatchVehicleTypeIds,
      dispatchConfig,
      attemptIndex,
    });

    emitToRoom(getUserRoom(ride.userId), 'rideSearchUpdate', {
      rideId: String(ride._id),
      status: ride.status,
      radius: effectiveRadius,
      dispatchType: dispatchConfig.dispatchType,
      attempt: attemptIndex + 1,
      maxAttempts: dispatchConfig.maxAttempts,
      matchedDrivers: targetDrivers.length,
      totalNotifiedDrivers: nextNotifiedDriverIds.length,
    });

    if (attemptIndex >= dispatchConfig.maxAttempts - 1) {
      // Final attempt waits one more cycle before the ride is closed as unmatched.
      const timer = setTimeout(() => {
        closeRideAsUnmatched(rideId)
          .catch((error) => console.error('Failed to mark ride unmatched', error))
          .finally(() => stopDispatchFlow(rideId));
      }, dispatchConfig.retryDelayMs);

        saveDispatchState(rideId, {
          radiusIndex: attemptIndex,
          driverIds: targetDrivers.map((driver) => String(driver._id)),
          notifiedDriverIds: nextNotifiedDriverIds,
          timer,
        });

      return;
    }

    scheduleNextAttempt(rideId, attemptIndex + 1, dispatchConfig.retryDelayMs);
  } catch (error) {
    await closeRideAsUnmatched(rideId);
    stopDispatchFlow(rideId);
    throw error;
  }
};

export const handleScheduledRidePreTrigger = async (rideId) => {
  const ride = await Ride.findById(rideId);
  if (!ride) return;

  if (ride.status === RIDE_STATUS.SEARCHING) {
    dispatchAttempt(ride._id, 0).catch((error) => {
      console.error('Scheduled dispatch failed', error);
    });
  } else if (ride.status === RIDE_STATUS.ACCEPTED && ride.driverId) {
    sendPushNotificationToEntities({
      driverIds: [String(ride.driverId)],
      title: 'Scheduled Ride Reminder',
      body: 'Your scheduled ride starts in 30 minutes. Please prepare for pickup.',
      data: {
        type: 'scheduled_ride_reminder',
        rideId: String(ride._id),
      },
    }).catch((error) => {
      console.error('Failed to send driver scheduled-ride 30m reminder push', error);
    });
  }
};

export const scheduleActualTimeNotification = async (rideId, scheduledAt) => {
  const delayMs = new Date(scheduledAt).getTime() - Date.now();
  const key = String(rideId);

  clearActualTimeNotificationTimer(rideId);

  if (delayMs <= 0) {
    sendActualTimeNotifications(rideId).catch(err => console.error(err));
    return;
  }

  const timer = setTimeout(() => {
    actualTimeNotificationTimers.delete(key);
    sendActualTimeNotifications(rideId).catch(err => console.error(err));
  }, delayMs);

  actualTimeNotificationTimers.set(key, timer);
};

export const sendActualTimeNotifications = async (rideId) => {
  const ride = await Ride.findById(rideId);
  if (!ride) return;

  if (ride.status === RIDE_STATUS.ACCEPTED && ride.driverId) {
    // Notify driver
    sendPushNotificationToEntities({
      driverIds: [String(ride.driverId)],
      title: 'Scheduled Ride Starting Now',
      body: "It's time for your scheduled ride! Please start heading to the pickup location.",
      data: {
        type: 'scheduled_ride_start_driver',
        rideId: String(ride._id),
      },
    }).catch((error) => {
      console.error('Failed to notify driver at scheduled time', error);
    });

    // Notify user
    sendPushNotificationToEntities({
      userIds: [String(ride.userId)],
      title: 'Scheduled Ride Starting Now',
      body: 'Your scheduled ride is about to start! Your driver is on the way.',
      data: {
        type: 'scheduled_ride_start_user',
        rideId: String(ride._id),
      },
    }).catch((error) => {
      console.error('Failed to notify user at scheduled time', error);
    });
  } else if (ride.status === RIDE_STATUS.SEARCHING) {
    sendPushNotificationToEntities({
      userIds: [String(ride.userId)],
      title: 'Scheduled Ride Starting Now',
      body: 'Your scheduled ride is starting now. We are looking for drivers near you.',
      data: {
        type: 'scheduled_ride_start_searching',
        rideId: String(ride._id),
      },
    }).catch((error) => {
      console.error('Failed to notify user at scheduled searching time', error);
    });
  }
};

export const startDispatchFlow = async (ride) => {
  stopDispatchFlow(ride._id);

  const scheduledAt = ride?.scheduledAt ? new Date(ride.scheduledAt) : null;
  const bookingMode = String(ride?.bookingMode || 'normal').trim().toLowerCase();
  const shouldDispatchImmediately = bookingMode === 'bidding';

  if (!shouldDispatchImmediately && scheduledAt) {
    const rideId = String(ride._id);
    const timeToStartMs = scheduledAt.getTime() - 30 * 60 * 1000;
    const delayMs = timeToStartMs - Date.now();

    if (delayMs > 0) {
      const timer = setTimeout(() => {
        scheduledDispatchTimers.delete(rideId);
        handleScheduledRidePreTrigger(rideId).catch((error) => {
          console.error('Scheduled pre-trigger failed', error);
        });
      }, delayMs);

      scheduledDispatchTimers.set(rideId, timer);

      scheduleActualTimeNotification(rideId, scheduledAt).catch(err => console.error(err));
      return;
    } else {
      handleScheduledRidePreTrigger(rideId).catch(err => console.error(err));
      scheduleActualTimeNotification(rideId, scheduledAt).catch(err => console.error(err));
      return;
    }
  }

  await dispatchAttempt(ride._id, 0);
};

export const restoreScheduledDispatches = async () => {
  const rides = await Ride.find({
    status: { $in: [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED] },
    scheduledAt: { $ne: null },
  }).select('_id scheduledAt');

  for (const ride of rides) {
    await startDispatchFlow(ride);
  }
};

export const notifyLateAvailableDriver = async (driverId) => {
  if (!driverId || activeDispatches.size === 0) {
    return;
  }

  const driver = await Driver.findById(driverId)
    .select('_id isOnline isOnRide wallet location zoneId vehicleTypeId vehicleType vehicleIconType');

  if (!driver?.isOnline || driver?.isOnRide || driver?.wallet?.isBlocked || !driver?.location?.coordinates?.length) {
    return;
  }

  const activeRideIds = Array.from(activeDispatches.keys());

  for (const rideId of activeRideIds) {
    const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode');

    if (!ride || ride.status !== RIDE_STATUS.SEARCHING) {
      continue;
    }

    const dispatchState = getDispatchState(rideId);
    const driverKey = String(driver._id);

    if (
      dispatchState.notifiedDriverIds.includes(driverKey) ||
      dispatchState.rejectedDriverIds.includes(driverKey)
    ) {
      continue;
    }

    const dispatchConfig = await resolveTransportDispatchConfig();
    const attemptIndex = Number.isInteger(dispatchState.radiusIndex) ? dispatchState.radiusIndex : 0;
    const radius = getAttemptRadiusMeters(
      dispatchConfig.baseDistanceMeters || dispatchConfig.maxDistanceMeters,
      attemptIndex,
    );
    const dispatchVehicleTypeIds = getDispatchVehicleTypeIds(ride);
    const { zone, drivers, searchRadiusMeters } = await matchDrivers(ride.pickupLocation.coordinates, {
      maxDistance: radius,
      vehicleTypeId: ride.vehicleTypeId,
      vehicleTypeIds: dispatchVehicleTypeIds,
      serviceType: ride.serviceType || 'ride',
    });

    const matchedDriver = drivers.find((item) => String(item._id) === driverKey);
    if (!matchedDriver) {
      continue;
    }

    const effectiveRadius = Number.isFinite(searchRadiusMeters) && searchRadiusMeters > 0
      ? searchRadiusMeters
      : radius;

    const nextNotifiedDriverIds = [...dispatchState.notifiedDriverIds, driverKey];
    const nextDriverIds = dispatchConfig.dispatchType === 'broadcast'
      ? [...new Set([...dispatchState.driverIds, driverKey])]
      : dispatchState.driverIds.length
        ? dispatchState.driverIds
        : [driverKey];

    saveDispatchState(rideId, {
      driverIds: nextDriverIds,
      notifiedDriverIds: nextNotifiedDriverIds,
    });

    await emitRideRequestToDrivers({
      ride,
      targetDrivers: [matchedDriver],
      zone,
      effectiveRadius,
      dispatchVehicleTypeIds,
      dispatchConfig,
      attemptIndex,
    });
  }
};

export const notifyRideAccepted = async (ride) => {
  const state = getDispatchState(ride._id);
  stopDispatchFlow(ride._id);

  // Once one driver wins the race, the rider is updated and the rest are told to stop.
  const populatedRide = await Ride.findById(ride._id).populate(
    'driverId',
    'name phone profileImage vehicleTypeId vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating',
  );

  if (!populatedRide) {
    return;
  }

  emitToRoom(getUserRoom(populatedRide.userId), 'rideAccepted', {
    rideId: String(populatedRide._id),
    room: getRideRoom(populatedRide._id),
    type: populatedRide.serviceType || 'ride',
    serviceType: populatedRide.serviceType || 'ride',
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    otp: populatedRide.otp || '',
    vehicleIconType: populatedRide.vehicleIconType || '',
    vehicleIconUrl: populatedRide.vehicleIconUrl || '',
    driver: populatedRide.driverId,
    parcel: populatedRide.parcel || null,
  });

  emitToRoom(getUserRoom(populatedRide.userId), SOCKET_EVENTS.RIDE_STATE, {
    rideId: String(populatedRide._id),
    room: getRideRoom(populatedRide._id),
    type: populatedRide.serviceType || 'ride',
    serviceType: populatedRide.serviceType || 'ride',
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    fare: populatedRide.fare,
    estimatedDistanceMeters: populatedRide.estimatedDistanceMeters || 0,
    estimatedDurationMinutes: populatedRide.estimatedDurationMinutes || 0,
    paymentMethod: populatedRide.paymentMethod,
    otp: populatedRide.otp || '',
    vehicleIconType: populatedRide.vehicleIconType || '',
    vehicleIconUrl: populatedRide.vehicleIconUrl || '',
    parcel: populatedRide.parcel || null,
    intercity: populatedRide.intercity || null,
    commissionAmount: populatedRide.commissionAmount,
    driverEarnings: populatedRide.driverEarnings,
    pickupLocation: populatedRide.pickupLocation,
    pickupAddress: populatedRide.pickupAddress || '',
    dropLocation: populatedRide.dropLocation,
    dropAddress: populatedRide.dropAddress || '',
    acceptedAt: populatedRide.acceptedAt,
    startedAt: populatedRide.startedAt,
    completedAt: populatedRide.completedAt,
    lastDriverLocation: populatedRide.lastDriverLocation?.coordinates?.length
      ? {
          type: populatedRide.lastDriverLocation.type,
          coordinates: populatedRide.lastDriverLocation.coordinates,
          heading: populatedRide.lastDriverLocation.heading,
          speed: populatedRide.lastDriverLocation.speed,
          updatedAt: populatedRide.lastDriverLocation.updatedAt,
        }
      : null,
    driver: populatedRide.driverId,
  });

  emitToRoom(getRideRoom(populatedRide._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(populatedRide._id),
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    acceptedAt: populatedRide.acceptedAt,
  });

  emitToRoom(getDriverRoom(populatedRide.driverId._id), 'rideAccepted', {
    rideId: String(populatedRide._id),
    room: getRideRoom(populatedRide._id),
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    acceptedAt: populatedRide.acceptedAt,
    otp: populatedRide.otp || '',
  });

  emitToRoom(getRideRoom(populatedRide._id), 'rideRequestClosed', {
    rideId: String(populatedRide._id),
        acceptedDriverId: String(populatedRide.driverId._id),
        notifiedDriverIds: state.notifiedDriverIds,
        reason: 'accepted-by-another-driver',
  });

  for (const driverId of state.notifiedDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(populatedRide._id),
      acceptedDriverId: String(populatedRide.driverId._id),
      reason: 'accepted-by-another-driver',
    });
  }

  sendPushNotificationToEntities({
    userIds: [String(populatedRide.userId)],
    title: 'Ride accepted',
    body: populatedRide.driverId?.name
      ? `${populatedRide.driverId.name} accepted your request.`
      : 'A driver accepted your request.',
    data: {
      type: 'ride_accepted',
      rideId: String(populatedRide._id),
      serviceType: populatedRide.serviceType || 'ride',
      driverId: String(populatedRide.driverId?._id || ''),
    },
  }).catch((error) => {
    console.error('Failed to send user ride-accepted push notification', error);
  });
};

export const notifyRideBidUpdated = async ({ ride, bid }) => {
  const safeRide = ride?._id ? ride : await Ride.findById(ride?.rideId || ride);

  if (!safeRide) {
    return;
  }

  const payload = {
    rideId: String(safeRide._id),
    bookingMode: safeRide.bookingMode || 'normal',
    pricingNegotiationMode: safeRide.pricingNegotiationMode || 'none',
    biddingStatus: safeRide.biddingStatus || 'none',
    fare: Number(safeRide.fare || 0),
    baseFare: Number(safeRide.baseFare || safeRide.fare || 0),
    bidFloorFare: Number(safeRide.bidFloorFare ?? safeRide.baseFare ?? safeRide.fare ?? 0),
    userMaxBidFare: Number(safeRide.userMaxBidFare || safeRide.fare || 0),
    bidCeilingMaxFare: Number(safeRide.bidCeilingMaxFare || safeRide.userMaxBidFare || safeRide.fare || 0),
    bidStepAmount: Number(safeRide.bidStepAmount || 10),
    fareIncreaseWaitMinutes: Number(safeRide.fareIncreaseWaitMinutes || 0),
    nextFareIncreaseAt: safeRide.nextFareIncreaseAt || null,
    bid,
  };

  emitToRoom(getUserRoom(safeRide.userId), 'rideBidUpdated', payload);
  emitToRoom(getRideRoom(safeRide._id), 'rideBidUpdated', payload);
};

export const notifyRideBiddingUpdated = async (ride) => {
  const safeRide = ride?._id ? ride : await Ride.findById(ride);

  if (!safeRide) {
    return;
  }

  const payload = {
    rideId: String(safeRide._id),
    bookingMode: safeRide.bookingMode || 'normal',
    pricingNegotiationMode: safeRide.pricingNegotiationMode || 'none',
    biddingStatus: safeRide.biddingStatus || 'none',
    fare: Number(safeRide.fare || 0),
    baseFare: Number(safeRide.baseFare || safeRide.fare || 0),
    bidFloorFare: Number(safeRide.bidFloorFare ?? safeRide.baseFare ?? safeRide.fare ?? 0),
    userMaxBidFare: Number(safeRide.userMaxBidFare || safeRide.fare || 0),
    bidCeilingMaxFare: Number(safeRide.bidCeilingMaxFare || safeRide.userMaxBidFare || safeRide.fare || 0),
    bidStepAmount: Number(safeRide.bidStepAmount || 10),
    fareIncreaseWaitMinutes: Number(safeRide.fareIncreaseWaitMinutes || 0),
    nextFareIncreaseAt: safeRide.nextFareIncreaseAt || null,
  };

  emitToRoom(getUserRoom(safeRide.userId), 'rideBiddingUpdated', payload);
  emitToRoom(getRideRoom(safeRide._id), 'rideBiddingUpdated', payload);

  const dispatchState = getDispatchState(safeRide._id);
  for (const driverId of dispatchState.notifiedDriverIds) {
    emitToDriver(driverId, 'rideBiddingUpdated', payload);
  }
};

export const getActivePendingDispatchForDriver = async (driverId, requestedRideId = null) => {
  if (!driverId) return null;

  const driverKey = String(driverId);
  let candidateRideIds = [];

  if (requestedRideId) {
    candidateRideIds.push(String(requestedRideId));
  }

  for (const rId of activeDispatches.keys()) {
    if (!candidateRideIds.includes(rId)) {
      candidateRideIds.push(rId);
    }
  }

  if (candidateRideIds.length === 0) {
    const recentRides = await Ride.find({
      status: RIDE_STATUS.SEARCHING,
      liveStatus: RIDE_LIVE_STATUS.SEARCHING,
      createdAt: { $gte: new Date(Date.now() - 3 * 60 * 1000) },
    })
      .select('_id')
      .lean();

    candidateRideIds = recentRides.map((r) => String(r._id));
  }

  for (const rideId of candidateRideIds) {
    const dispatchState = getDispatchState(rideId);

    if (dispatchState.rejectedDriverIds.includes(driverKey)) {
      continue;
    }

    const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode').lean();
    if (!ride || ride.status !== RIDE_STATUS.SEARCHING) {
      continue;
    }

    const isDriverTargeted =
      dispatchState.notifiedDriverIds.includes(driverKey) ||
      dispatchState.driverIds.includes(driverKey);

    let isMatched = isDriverTargeted;

    if (!isMatched) {
      const driver = await Driver.findById(driverId)
        .select('_id isOnline isOnRide wallet location zoneId vehicleTypeId vehicleType vehicleIconType')
        .lean();

      if (driver?.isOnline && !driver?.isOnRide && !driver?.wallet?.isBlocked && driver?.location?.coordinates?.length) {
        const dispatchConfig = await resolveTransportDispatchConfig();
        const attemptIndex = Number.isInteger(dispatchState.radiusIndex) ? dispatchState.radiusIndex : 0;
        const radius = getAttemptRadiusMeters(
          dispatchConfig.baseDistanceMeters || dispatchConfig.maxDistanceMeters,
          attemptIndex,
        );
        const dispatchVehicleTypeIds = getDispatchVehicleTypeIds(ride);
        const { drivers } = await matchDrivers(ride.pickupLocation.coordinates, {
          maxDistance: radius,
          vehicleTypeId: ride.vehicleTypeId,
          vehicleTypeIds: dispatchVehicleTypeIds,
        });

        if (drivers.some((d) => String(d._id) === driverKey)) {
          isMatched = true;
        }
      }
    }

    if (isMatched) {
      const dispatchConfig = await resolveTransportDispatchConfig();
      const dispatchVehicleTypeIds = getDispatchVehicleTypeIds(ride);
      const attemptIndex = Number.isInteger(dispatchState.radiusIndex) ? dispatchState.radiusIndex : 0;
      const requestExpiresAt = new Date(Date.now() + (dispatchConfig.retryDelayMs || 25000)).toISOString();

      return {
        rideId: String(ride._id),
        type: ride.serviceType || 'ride',
        serviceType: ride.serviceType || 'ride',
        userId: String(ride.userId?._id || ride.userId || ''),
        user: {
          id: ride.userId?._id ? String(ride.userId._id) : String(ride.userId || ''),
          name: ride.userId?.name || 'Customer',
          phone: ride.userId?.phone || '',
          countryCode: ride.userId?.countryCode || '',
        },
        pickupLocation: ride.pickupLocation,
        pickupAddress: ride.pickupAddress || '',
        dropLocation: ride.dropLocation,
        dropAddress: ride.dropAddress || '',
        scheduledAt: ride.scheduledAt || null,
        estimatedDistanceMeters: ride.estimatedDistanceMeters || 0,
        estimatedDurationMinutes: ride.estimatedDurationMinutes || 0,
        vehicleTypeId: ride.vehicleTypeId ? String(ride.vehicleTypeId) : null,
        vehicleTypeIds: dispatchVehicleTypeIds,
        vehicleIconType: ride.vehicleIconType,
        vehicleIconUrl: ride.vehicleIconUrl || '',
        fare: ride.fare,
        baseFare: Number(ride.baseFare || ride.fare || 0),
        bookingMode: ride.bookingMode || 'normal',
        pricingNegotiationMode: ride.pricingNegotiationMode || 'none',
        biddingStatus: ride.biddingStatus || 'none',
        bidding: ride.pricingNegotiationMode === 'driver_bid'
          ? {
              enabled: true,
              baseFare: Number(ride.baseFare || ride.fare || 0),
              bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
              userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
              bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
              bidStepAmount: Number(ride.bidStepAmount || 10),
            }
          : {
              enabled: false,
            },
        fareIncreaseWaitMinutes: Number(ride.fareIncreaseWaitMinutes || 0),
        nextFareIncreaseAt: ride.nextFareIncreaseAt || null,
        paymentMethod: ride.paymentMethod || 'cash',
        parcel: ride.parcel || null,
        intercity: ride.intercity || null,
        attempt: attemptIndex + 1,
        maxAttempts: dispatchConfig.maxAttempts || 5,
        acceptRejectDurationSeconds: dispatchConfig.retryWindowSeconds || 30,
        expiresInSeconds: dispatchConfig.retryWindowSeconds || 30,
        requestExpiresAt,
      };
    }
  }

  return null;
};
