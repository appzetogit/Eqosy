import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
  createGigHandler,
  updateGigHandler,
  deleteGigHandler,
  listAdminGigsHandler,
  getGigStatsHandler,
  listPartnerGigsHandler,
  bookGigHandler,
  cancelGigHandler,
  getActiveGigHandler,
  verifySelfieHandler,
  listSelfieLogsHandler,
  reviewSelfieLogHandler
} from '../controllers/gig.controller.js';

const router = express.Router();

const selfieUpload = upload.fields([
  { name: 'selfiePhoto', maxCount: 1 }
]);

// --- Delivery Partner Endpoints ---
router.get('/partner/gigs', authMiddleware, requireRoles('DELIVERY_PARTNER'), listPartnerGigsHandler);
router.post('/partner/gigs/book', authMiddleware, requireRoles('DELIVERY_PARTNER'), bookGigHandler);
router.delete('/partner/gigs/cancel/:gigId', authMiddleware, requireRoles('DELIVERY_PARTNER'), cancelGigHandler);
router.get('/partner/gigs/active', authMiddleware, requireRoles('DELIVERY_PARTNER'), getActiveGigHandler);
router.post('/partner/gigs/verify-selfie', authMiddleware, requireRoles('DELIVERY_PARTNER'), selfieUpload, verifySelfieHandler);

// --- Admin Endpoints ---
router.post('/admin/gigs', authMiddleware, requireRoles('ADMIN'), createGigHandler);
router.patch('/admin/gigs/:gigId', authMiddleware, requireRoles('ADMIN'), updateGigHandler);
router.delete('/admin/gigs/:gigId', authMiddleware, requireRoles('ADMIN'), deleteGigHandler);
router.get('/admin/gigs', authMiddleware, requireRoles('ADMIN'), listAdminGigsHandler);
router.get('/admin/gigs/stats', authMiddleware, requireRoles('ADMIN'), getGigStatsHandler);
router.get('/admin/gigs/selfie-logs', authMiddleware, requireRoles('ADMIN'), listSelfieLogsHandler);
router.patch('/admin/gigs/selfie-logs/:logId', authMiddleware, requireRoles('ADMIN'), reviewSelfieLogHandler);

export default router;
