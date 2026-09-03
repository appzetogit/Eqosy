import { TripInstance } from '../user/models/TripInstance.js';
import { TripSeatInventory } from '../user/models/TripSeatInventory.js';
import { BusSeatHold } from '../user/models/BusSeatHold.js';
import { BusBooking } from '../user/models/BusBooking.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';
import { ApiError } from '../../../utils/ApiError.js';
import { resolveConfiguredGatewayCredentials } from '../../../utils/gatewayResolver.js';

const razorpayRefund = async ({ paymentId, amount, notes, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      notes: notes || {},
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status || 502,
      payload?.error?.description || payload?.error?.message || 'Razorpay refund failed',
    );
  }

  return payload;
};

export const cancelTripInstance = async ({ tripId, reason = 'Trip cancelled by operator' }) => {
  const trip = await TripInstance.findById(tripId);
  if (!trip) {
    throw new ApiError(404, 'Trip instance not found');
  }

  if (trip.status === 'cancelled') {
    return { success: true, message: 'Trip instance is already cancelled', tripId: String(trip._id) };
  }

  trip.status = 'cancelled';
  trip.cancellationReason = reason;
  trip.cancelledAt = new Date();
  await trip.save();

  await BusSeatHold.updateMany(
    { tripId: trip._id, status: 'held' },
    { $set: { status: 'released' } },
  );

  await TripSeatInventory.updateMany(
    { tripId: trip._id },
    { $set: { status: 'blocked' } },
  );

  const confirmedBookings = await BusBooking.find({
    tripId: trip._id,
    status: { $in: ['confirmed', 'pending'] },
  });

  let gatewayCreds = null;
  try {
    gatewayCreds = await resolveConfiguredGatewayCredentials('razor_pay');
  } catch (err) {
    console.error('Could not resolve Razorpay credentials for trip cancellation refunds:', err);
  }

  const results = [];
  for (const booking of confirmedBookings) {
    const isConfirmed = booking.status === 'confirmed';
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.failureReason = 'trip_cancelled_by_operator';
    booking.notes = reason;

    if (isConfirmed && booking.payment?.paymentId && gatewayCreds?.keyId && gatewayCreds?.keySecret) {
      if (booking.cancellation?.refundStatus !== 'completed') {
        booking.cancellation.refundStatus = 'processing';
        await booking.save();

        try {
          const refundPayload = await razorpayRefund({
            paymentId: booking.payment.paymentId,
            amount: booking.amount,
            notes: {
              tripId: String(trip._id),
              bookingCode: booking.bookingCode,
              reason: 'Trip cancelled by operator',
            },
            keyId: gatewayCreds.keyId,
            keySecret: gatewayCreds.keySecret,
          });

          booking.cancellation.refundStatus = 'completed';
          booking.cancellation.refundId = refundPayload?.id || '';
          booking.cancellation.refundAmount = booking.amount;
          booking.cancellation.refundProcessedAt = new Date();
          booking.financialSnapshot.refundedAmount = booking.amount;
        } catch (refundErr) {
          booking.cancellation.refundStatus = 'failed';
          booking.failureReason = 'trip_cancelled_refund_failed';
          console.error(`Refund failed for booking ${booking._id}:`, refundErr);
        }
      }
    }

    await booking.save();
    results.push({ bookingId: String(booking._id), status: booking.status, refundStatus: booking.cancellation?.refundStatus });

    try {
      await sendPushNotificationToEntities({
        entityType: 'user',
        entityIds: [booking.userId],
        title: 'Trip Cancelled',
        body: `Your bus trip from ${booking.routeSnapshot?.originCity} to ${booking.routeSnapshot?.destinationCity} was cancelled by the operator. A 100% refund of ₹${booking.amount} has been processed.`,
        data: { bookingId: String(booking._id), scope: 'bus' },
      });
    } catch (pushErr) {
      console.error('Failed to dispatch trip cancellation push notification:', pushErr);
    }
  }

  return {
    success: true,
    tripId: String(trip._id),
    cancelledBookingsCount: confirmedBookings.length,
    results,
  };
};
