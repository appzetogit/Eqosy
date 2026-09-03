import { TripInstance } from '../user/models/TripInstance.js';
import { TripSeatInventory } from '../user/models/TripSeatInventory.js';
import { BusBooking } from '../user/models/BusBooking.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';
import { ApiError } from '../../../utils/ApiError.js';

const flattenBlueprint = (blueprint = {}) => {
  const lower = (Array.isArray(blueprint?.lowerDeck) ? blueprint.lowerDeck : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat' && cell?.id)
    .map((cell) => ({ ...cell, deck: 'lower' }));

  const upper = (Array.isArray(blueprint?.upperDeck) ? blueprint.upperDeck : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat' && cell?.id)
    .map((cell) => ({ ...cell, deck: 'upper' }));

  return [...lower, ...upper];
};

export const replaceBusForTripInstance = async ({ tripId, newBusService, replacementNotes = '' }) => {
  const trip = await TripInstance.findById(tripId);
  if (!trip) {
    throw new ApiError(404, 'Trip instance not found');
  }

  if (['completed', 'cancelled'].includes(trip.status)) {
    throw new ApiError(400, 'Cannot replace bus for a completed or cancelled trip');
  }

  const oldSeats = await TripSeatInventory.find({ tripId }).lean();
  const oldSeatMap = new Map(oldSeats.map((item) => [String(item.seatId), item]));
  const newBlueprintSeats = flattenBlueprint(newBusService.blueprint);
  const newSeatMap = new Map(newBlueprintSeats.map((item) => [String(item.id), item]));

  const incompatibleSeats = [];
  const compatibleUpdates = [];

  for (const [seatId, oldInventory] of oldSeatMap.entries()) {
    if (oldInventory.status === 'available' || oldInventory.status === 'blocked') {
      continue;
    }

    const newCell = newSeatMap.get(seatId);
    if (!newCell) {
      incompatibleSeats.push({ seatId, reason: 'Seat removed in new layout', oldInventory });
      continue;
    }

    const oldVariant = String(oldInventory.seatType || 'seat').toLowerCase();
    const newVariant = String(newCell.variant || 'seat').toLowerCase();
    const oldDeck = String(oldInventory.deck || 'lower').toLowerCase();
    const newDeck = String(newCell.deck || 'lower').toLowerCase();

    if (oldVariant !== newVariant || oldDeck !== newDeck) {
      incompatibleSeats.push({
        seatId,
        reason: `Seat attributes changed (${oldVariant}/${oldDeck} -> ${newVariant}/${newDeck})`,
        oldInventory,
      });
    } else {
      compatibleUpdates.push({ seatId, newCell });
    }
  }

  trip.busId = newBusService._id;
  trip.busSnapshot = {
    registrationNumber: newBusService.registrationNumber || '',
    model: newBusService.coachType || newBusService.busCategory || '',
    capacity: Number(newBusService.capacity || 0),
    operatorId: newBusService.ownerId || null,
    operatorName: newBusService.operatorName || '',
  };
  await trip.save();

  if (incompatibleSeats.length > 0) {
    const affectedBookingIds = [
      ...new Set(incompatibleSeats.map((item) => String(item.oldInventory.bookingId)).filter(Boolean)),
    ];

    const affectedBookings = await BusBooking.find({ _id: { $in: affectedBookingIds } });
    for (const booking of affectedBookings) {
      booking.failureReason = 'bus_replacement_layout_conflict';
      booking.failureMetadata = {
        replacementNotes,
        incompatibleSeats: incompatibleSeats.filter(
          (item) => String(item.oldInventory.bookingId) === String(booking._id),
        ),
      };
      await booking.save();

      try {
        await sendPushNotificationToEntities({
          entityType: 'user',
          entityIds: [booking.userId],
          title: 'Bus Layout Changed',
          body: `Due to a bus replacement on your trip (${booking.routeSnapshot?.originCity} to ${booking.routeSnapshot?.destinationCity}), your selected seat configuration has changed. Please review your booking or contact support for full refund options.`,
          data: { bookingId: String(booking._id), scope: 'bus' },
        });
      } catch (err) {
        console.error('Failed to notify passenger of bus replacement conflict:', err);
      }
    }
  }

  return {
    success: true,
    tripId: String(trip._id),
    compatibleSeatsCount: compatibleUpdates.length,
    incompatibleSeatsCount: incompatibleSeats.length,
    incompatibleSeats,
  };
};
