import { asyncHandler } from '../../../../utils/asyncHandler.js';
import * as gigService from '../services/gig.service.js';
import * as selfieService from '../services/selfieVerification.service.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';

// --- Admin Gig Handlers ---
export const createGigHandler = asyncHandler(async (req, res) => {
  const adminId = req.user?.userId || req.user?.id;
  const result = await gigService.createGig(req.body, adminId);
  res.status(201).json({ success: true, data: result });
});

export const updateGigHandler = asyncHandler(async (req, res) => {
  const { gigId } = req.params;
  const result = await gigService.updateGig(gigId, req.body);
  res.status(200).json({ success: true, data: result });
});

export const deleteGigHandler = asyncHandler(async (req, res) => {
  const { gigId } = req.params;
  const result = await gigService.deleteGig(gigId);
  res.status(200).json({ success: true, data: result });
});

export const listAdminGigsHandler = asyncHandler(async (req, res) => {
  const result = await gigService.listAdminGigs(req.query);
  res.status(200).json({ success: true, data: result });
});

export const getGigStatsHandler = asyncHandler(async (req, res) => {
  const result = await gigService.getGigAttendanceStats();
  res.status(200).json({ success: true, data: result });
});

export const listGigBookingsHandler = asyncHandler(async (req, res) => {
  const result = await gigService.listGigBookingsForAdmin(req.query);
  res.status(200).json({ success: true, data: result });
});

export const remindGigBookingHandler = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const result = await gigService.remindGigBookingForAdmin(bookingId, req.body);
  res.status(200).json({ success: true, ...result });
});

// --- Partner Gig Handlers ---
export const listPartnerGigsHandler = asyncHandler(async (req, res) => {
  const partnerId = req.user?.userId || req.user?.id;
  const result = await gigService.listAvailableGigsForPartner(partnerId, req.query);
  res.status(200).json({ success: true, data: result });
});

export const bookGigHandler = asyncHandler(async (req, res) => {
  const partnerId = req.user?.userId || req.user?.id;
  const { gigId } = req.body;
  const result = await gigService.bookGigForPartner(partnerId, gigId);
  res.status(200).json({ success: true, data: result });
});

export const cancelGigHandler = asyncHandler(async (req, res) => {
  const partnerId = req.user?.userId || req.user?.id;
  const { gigId } = req.params;
  const result = await gigService.cancelGigBooking(partnerId, gigId);
  res.status(200).json({ success: true, data: result });
});

export const getActiveGigHandler = asyncHandler(async (req, res) => {
  const partnerId = req.user?.userId || req.user?.id;
  const activeGig = await gigService.getActiveGigForPartner(partnerId);
  let availabilityStatus = undefined;
  if (!activeGig && partnerId) {
    const partner = await FoodDeliveryPartner.findById(partnerId);
    if (partner && partner.availabilityStatus === 'online') {
      try {
        const { FoodOrder } = await import('../../orders/models/order.model.js');
        const activeOrder = await FoodOrder.findOne({
          'dispatch.deliveryPartnerId': partner._id,
          orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop'] }
        }).select('_id').lean();

        if (!activeOrder) {
          partner.availabilityStatus = 'offline';
          await partner.save();
          availabilityStatus = 'offline';

          const notificationTitle = 'Shift Ended — You are now Offline ⏰';
          const notificationBody = 'Aapki gig shift end ho gayi hai. Dubara online aane ke liye nayi gig book karein.';

          try {
            const { getIO, rooms } = await import('../../../../config/socket.js');
            const io = getIO();
            if (io) {
              io.to(rooms.delivery(partner._id)).emit('availability_status_changed', {
                availabilityStatus: 'offline',
                reason: 'gig_expired',
                message: notificationBody
              });
            }
          } catch (_) {}

          try {
            const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnerSafely(
              { ownerType: 'DELIVERY_PARTNER', ownerId: partner._id },
              {
                title: notificationTitle,
                body: notificationBody,
                data: { type: 'auto_offline', reason: 'gig_expired' }
              }
            );
          } catch (_) {}

          try {
            const { createInboxNotifications } = await import('../../../../core/notifications/notification.service.js');
            await createInboxNotifications({
              notifications: [
                {
                  ownerType: 'DELIVERY_PARTNER',
                  ownerId: partner._id,
                  title: notificationTitle,
                  message: notificationBody,
                  category: 'gig_expired',
                  metadata: { reason: 'gig_expired' }
                }
              ]
            });
          } catch (_) {}
        }
      } catch (err) {}
    }
  }
  res.status(200).json({ success: true, data: { activeGig, ...(availabilityStatus ? { availabilityStatus } : {}) } });
});

// --- Selfie Verification Handlers ---
export const verifySelfieHandler = asyncHandler(async (req, res) => {
  const partnerId = req.user?.userId || req.user?.id;
  const result = await selfieService.verifyLiveSelfie(partnerId, req.body, req.files);
  res.status(200).json({ success: true, data: result });
});

export const listSelfieLogsHandler = asyncHandler(async (req, res) => {
  const result = await selfieService.listSelfieLogsForAdmin(req.query);
  res.status(200).json({ success: true, data: result });
});

export const reviewSelfieLogHandler = asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const result = await selfieService.adminReviewSelfieLog(logId, req.body);
  res.status(200).json({ success: true, data: result });
});
