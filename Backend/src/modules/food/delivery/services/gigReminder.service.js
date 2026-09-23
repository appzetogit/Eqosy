import { FoodGigBooking } from '../models/foodGigBooking.model.js';
import { sendNotificationToOwner } from '../../../../core/notifications/firebase.service.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';
import { checkAndAutoOfflineExpiredGigs } from './gig.service.js';

/**
 * Periodically checks booked gigs and:
 * 1. Sends a SINGLE notification 30 minutes before the gig start time if delivery partner is offline.
 * 2. Sends a SINGLE notification 15 minutes before the gig start time (regardless of online status).
 * 3. Auto-offlines drivers whose gig has ended and have no next gig.
 *
 * Both reminders are guarded by a DB flag (reminderXXMinSent) so they fire EXACTLY ONCE
 * even though this function runs every 60 seconds.
 */
export const checkAndSendGigReminders = async () => {
  try {
    // Step 0: Auto-offline drivers whose gig has ended with no next gig
    await checkAndAutoOfflineExpiredGigs();

    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD (today only)

    // Fetch ONLY active bookings for TODAY's gigs.
    // Bookings from previous days are NEVER processed here — daily re-booking is mandatory.
    // We join via gigId and filter by gig.date === todayStr inside the loop.
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

      // ✅ STRICT: Only process bookings for TODAY's gig.
      // If partner booked yesterday's gig, it should NOT carry over to today.
      // processNoShows() will mark those old bookings as no_show.
      if (gig.date && gig.date !== todayStr) continue;

      const startMs = new Date(gig.startDateTime).getTime();
      const endMs = new Date(gig.endDateTime).getTime();

      // If gig already expired, skip (processNoShows will handle status cleanup)
      if (nowMs > endMs) continue;

      const isPartnerOnline = partner.availabilityStatus === 'online';
      const timeUntilStartMs = startMs - nowMs;

      // -------------------------------------------------------------
      // 30 Minutes Before Gig Start Notification (Sends ONCE only)
      // Only fires if partner is offline — nudge to come online.
      // -------------------------------------------------------------
      const THIRTY_MIN_MS = 30 * 60 * 1000;
      const FIFTEEN_MIN_MS = 15 * 60 * 1000;

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

        try {
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
        } catch (sendErr) {
          logger.error(`[Gig Reminder] Failed to send 30-min reminder for booking ${booking._id}: ${sendErr.message}`);
        }
      }

      // -------------------------------------------------------------
      // 15 Minutes Before Gig Start Notification (Sends ONCE only)
      // Fires regardless of online/offline status — last call reminder.
      // -------------------------------------------------------------
      if (
        !booking.reminder15MinSent &&
        timeUntilStartMs > 0 &&
        timeUntilStartMs <= FIFTEEN_MIN_MS
      ) {
        logger.info(
          `[Gig Reminder] Sending 15-minute pre-shift notification to partner ${partner.name} (${partner._id}) for gig "${gig.title}" (${gig.startTime})`
        );

        const title = '🚨 Shift Starting Soon (15m)';
        const message = `Your shift "${gig.title}" starts in 15 minutes (${gig.startTime}). Please log in and go online now!`;

        try {
          await sendNotificationToOwner({
            ownerType: 'DELIVERY_PARTNER',
            ownerId: partner._id,
            payload: {
              title,
              body: message,
              data: {
                type: 'GIG_REMINDER_15MIN',
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
            io.to(rooms.delivery(partner._id)).emit('gig:reminder_15min', {
              gigId: gig._id,
              title: gig.title,
              startTime: gig.startTime,
              message
            });
          }

          booking.reminder15MinSent = true;
          booking.reminder15MinSentAt = now;
          await booking.save();
        } catch (sendErr) {
          logger.error(`[Gig Reminder] Failed to send 15-min reminder for booking ${booking._id}: ${sendErr.message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`[Gig Reminder Service] Error checking gig reminders: ${error.message}`);
  }
};
