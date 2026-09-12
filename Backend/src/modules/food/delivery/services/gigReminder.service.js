import { FoodGigBooking } from '../models/foodGigBooking.model.js';
import { sendNotificationToOwner } from '../../../../core/notifications/firebase.service.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';
import { checkAndAutoOfflineExpiredGigs } from './gig.service.js';

/**
 * Periodically checks booked gigs and:
 * 1. Sends a single notification 30 minutes before the gig start time if delivery partner is offline.
 * 2. Auto-offlines drivers whose gig has ended and have no next gig.
 */
export const checkAndSendGigReminders = async () => {
  try {
    // Step 0: Auto-offline drivers whose gig has ended with no next gig
    await checkAndAutoOfflineExpiredGigs();

    const now = new Date();
    const nowMs = now.getTime();

    // Fetch active bookings with status 'booked'
    const activeBookings = await FoodGigBooking.find({
      status: 'booked'
    })
      .populate('gigId')
      .populate('deliveryPartnerId');

    if (!activeBookings.length) return;

    for (const booking of activeBookings) {
      const gig = booking.gigId;
      const partner = booking.deliveryPartnerId;

      if (!gig || gig.status !== 'active' || !partner) continue;

      const startMs = new Date(gig.startDateTime).getTime();
      const endMs = new Date(gig.endDateTime).getTime();

      // If gig already expired, skip (processNoShows will handle status cleanup)
      if (nowMs > endMs) continue;

      const isPartnerOnline = partner.availabilityStatus === 'online';

      const timeUntilStartMs = startMs - nowMs;

      // -------------------------------------------------------------
      // 30 Minutes Before Gig Start Notification (Sends ONCE only)
      // -------------------------------------------------------------
      const THIRTY_MIN_MS = 30 * 60 * 1000;
      if (
        !booking.reminder30MinSent &&
        timeUntilStartMs > 0 &&
        timeUntilStartMs <= THIRTY_MIN_MS &&
        !isPartnerOnline
      ) {
        logger.info(
          `[Gig Reminder] Sending 30-minute pre-shift notification to partner ${partner.name} (${partner._id}) for gig "${gig.title}" (${gig.startTime})`
        );

        const title = '⏰ Upcoming Shift Reminder (30m)';
        const message = `Your booked shift "${gig.title}" starts in 30 minutes (${gig.startTime}). Please get ready!`;

        await sendNotificationToOwner({
          ownerType: 'DELIVERY_PARTNER',
          ownerId: partner._id,
          payload: {
            title,
            body: message,
            data: {
              type: 'GIG_REMINDER_30MIN',
              gigId: String(gig._id),
              startTime: gig.startTime
            }
          }
        });

        await createInboxNotifications({
          notifications: [
            {
              ownerType: 'DELIVERY_PARTNER',
              ownerId: partner._id,
              title,
              message,
              category: 'gig_reminder',
              metadata: { gigId: String(gig._id), startTime: gig.startTime }
            }
          ]
        });

        const io = getIO();
        if (io) {
          io.to(rooms.delivery(partner._id)).emit('gig:reminder_30min', {
            gigId: gig._id,
            title: gig.title,
            startTime: gig.startTime,
            message
          });
        }

        booking.reminder30MinSent = true;
        booking.reminder30MinSentAt = now;
        await booking.save();
      }
    }
  } catch (error) {
    logger.error(`[Gig Reminder Service] Error checking gig reminders: ${error.message}`);
  }
};
