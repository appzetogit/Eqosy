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
      partner.availabilityStatus = 'offline';
      await partner.save();
      availabilityStatus = 'offline';
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
