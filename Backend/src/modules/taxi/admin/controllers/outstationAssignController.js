import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import {
  assignOutstationRideToDriver,
  listOutstationDriversForRide,
  listOutstationRidesForAssignment,
} from '../../services/rideService.js';
import { emitToDriver, getRideRoom, notifyRideAccepted } from '../../services/dispatchService.js';

export const getOutstationRides = asyncHandler(async (_req, res) => {
  const results = await listOutstationRidesForAssignment();
  res.json({ success: true, data: { results } });
});

export const getOutstationRideDrivers = asyncHandler(async (req, res) => {
  const data = await listOutstationDriversForRide({
    rideId: req.params.rideId,
    serviceLocationId: req.query?.serviceLocationId,
  });
  res.json({ success: true, data: { ...data, results: data.drivers } });
});

export const assignOutstationRide = asyncHandler(async (req, res) => {
  const driverId = String(req.body?.driverId || '').trim();
  if (!driverId) {
    throw new ApiError(400, 'driverId is required');
  }

  const { ride, previousDriverId } = await assignOutstationRideToDriver({ rideId: req.params.rideId, driverId });

  if (previousDriverId) {
    emitToDriver(previousDriverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'reassigned-by-admin',
      message: 'This ride was given to another driver.',
    });
  }

  // Tells the rider, stops any running dispatch, and lets the driver app pick the ride up.
  await notifyRideAccepted(ride);
  const assignedPayload = {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
    acceptedAt: ride.acceptedAt,
    serviceType: ride.serviceType,
    assignedByAdmin: true,
  };
  emitToDriver(driverId, 'ride:assigned', assignedPayload);
  emitToDriver(driverId, 'ride:state', assignedPayload);

  res.json({ success: true, data: assignedPayload });
});
