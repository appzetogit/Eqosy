import { FoodGigBooking } from '../models/foodGigBooking.model.js';
import { sendNotificationToOwner } from '../../../../core/notifications/firebase.service.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Periodically checks booked gigs and:
 * 1. Sends a notification 10 minutes before the gig start time if delivery partner is offline.
 * 2. Rings mobile (high priority push + alarm sound + socket event) once shift time starts if delivery partner hasn't logged in online yet.
 */
export const checkAndSendGigReminders = async () => {
  try {
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

      // -------------------------------------------------------------
      // FEATURE 1: 10 Minutes Before Gig Start Notification
      // -------------------------------------------------------------
      const timeUntilStartMs = startMs - nowMs;
      const TEN_MIN_MS = 10 * 60 * 1000;
      const ELEVEN_MIN_MS = 11 * 60 * 1000;

      if (
        !booking.reminder10MinSent &&
        timeUntilStartMs > 0 &&
        timeUntilStartMs <= ELEVEN_MIN_MS &&
        timeUntilStartMs >= (TEN_MIN_MS - 2 * 60 * 1000) && // flexible 8-11 min window
        !isPartnerOnline
      ) {
        logger.info(
          `[Gig Reminder] Sending 10-minute pre-shift notification to partner ${partner.name} (${partner._id}) for gig "${gig.title}" (${gig.startTime})`
        );

        const title = '⏰ Upcoming Shift Reminder!';
        const message = `Your booked shift "${gig.title}" starts in 10 minutes (${gig.startTime}). Please log in online to get ready!`;

        // 1. Send FCM Push Notification
        await sendNotificationToOwner({
          ownerType: 'DELIVERY_PARTNER',
          ownerId: partner._id,
          payload: {
            title,
            body: message,
            data: {
              type: 'GIG_REMINDER_10MIN',
              gigId: String(gig._id),
              startTime: gig.startTime
            }
          }
        });

        // 2. Add to Inbox Notifications
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

        // 3. Emit real-time Socket Event if connected
        const io = getIO();
        if (io) {
          io.to(rooms.delivery(partner._id)).emit('gig:reminder_10min', {
            gigId: gig._id,
            title: gig.title,
            startTime: gig.startTime,
            message
          });
        }

        // Mark 10-minute reminder as sent
        booking.reminder10MinSent = true;
        booking.reminder10MinSentAt = now;
        await booking.save();
      }

      // -------------------------------------------------------------
      // FEATURE 2: Shift Started & Driver Hasn't Logged In -> Ring Mobile Alarm
      // -------------------------------------------------------------
      // Condition: shift has started (nowMs >= startMs), hasn't ended (nowMs <= endMs), and partner is OFFLINE
      if (nowMs >= startMs && nowMs <= endMs && !isPartnerOnline) {
        // Throttle ringing so it rings every 2 minutes while offline during active shift
        const TWO_MIN_MS = 2 * 60 * 1000;
        const lastRingTime = booking.lastRingAt ? new Date(booking.lastRingAt).getTime() : 0;

        if (nowMs - lastRingTime >= TWO_MIN_MS) {
          logger.warn(
            `[Gig Ring Alarm] Shift started! Ringing mobile for partner ${partner.name} (${partner._id}) for gig "${gig.title}" (${gig.startTime}) - Driver offline!`
          );

          const title = '🚨 SHIFT STARTED - GO ONLINE NOW!';
          const message = `Your booked shift "${gig.title}" (${gig.startTime} - ${gig.endTime}) has started! Please open the app and turn ON your status immediately.`;

          // 1. Send High-Priority FCM Push Notification (Ring sound / Alarm payload)
          await sendNotificationToOwner({
            ownerType: 'DELIVERY_PARTNER',
            ownerId: partner._id,
            payload: {
              title,
              body: message,
              data: {
                type: 'GIG_SHIFT_RING_ALARM',
                ring: 'true',
                sound: 'alarm',
                priority: 'high',
                gigId: String(gig._id),
                startTime: gig.startTime
              },
              android: {
                priority: 'high',
                notification: {
                  sound: 'alarm',
                  channel_id: 'high_importance_channel',
                  priority: 'max',
                  default_vibrate_timings: true
                }
              }
            }
          });

          // 2. Add to Inbox Notifications
          await createInboxNotifications({
            notifications: [
              {
                ownerType: 'DELIVERY_PARTNER',
                ownerId: partner._id,
                title,
                message,
                category: 'gig_ring_alarm',
                metadata: { gigId: String(gig._id), startTime: gig.startTime }
              }
            ]
          });

          // 3. Emit real-time Socket Ring Alarm Event
          const io = getIO();
          if (io) {
            io.to(rooms.delivery(partner._id)).emit('gig:ring_alarm', {
              gigId: gig._id,
              title: gig.title,
              startTime: gig.startTime,
              message,
              ring: true,
              timestamp: nowMs
            });
          }

          // Update booking ring tracking
          booking.shiftStartedRingSent = true;
          booking.lastRingAt = now;
          booking.ringCount = (booking.ringCount || 0) + 1;
          await booking.save();
        }
      }
    }
  } catch (error) {
    logger.error(`[Gig Reminder Service] Error checking gig reminders: ${error.message}`);
  }
};
