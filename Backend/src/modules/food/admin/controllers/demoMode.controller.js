import { ForbiddenError } from '../../../../core/auth/errors.js';
import { isSuperAdminLike } from '../../../../core/admin/adminHierarchy.service.js';
import {
  getDemoStatus,
  getPaymentMethodSettings,
  seedIndoreDemoData,
  updateDemoSettings,
  updatePaymentMethodSettings,
  getPublicDemoInfo,
} from '../services/demoMode.service.js';

const requireSuperAdmin = (req) => {
  if (!isSuperAdminLike(req.adminContext || {})) {
    throw new ForbiddenError('Only a super admin can use Dev Mode');
  }
};

const isLocalUrl = (url) => /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.\d+\.\d+/i.test(url);

/**
 * Image links are stored absolutely (apps resolve bare relative paths against the API origin), and the
 * database is shared with the live site, so never store a localhost URL.
 */
const resolveSiteBaseUrl = (req) => {
  const allowed = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (origin && allowed.includes(origin) && !isLocalUrl(origin)) return origin;
  return allowed.find((url) => !isLocalUrl(url)) || '';
};

export async function getDemoMode(req, res, next) {
  try {
    requireSuperAdmin(req);
    res.status(200).json({ success: true, message: 'Dev mode status fetched', data: await getDemoStatus() });
  } catch (error) {
    next(error);
  }
}

export async function updateDemoMode(req, res, next) {
  try {
    requireSuperAdmin(req);
    const data = await updateDemoSettings(req.body || {}, req.user?.userId);
    res.status(200).json({ success: true, message: 'Dev mode updated', data });
  } catch (error) {
    next(error);
  }
}

export async function seedDemoData(req, res, next) {
  try {
    requireSuperAdmin(req);
    const data = await seedIndoreDemoData({ baseUrl: resolveSiteBaseUrl(req), adminId: req.user?.userId });
    res.status(200).json({ success: true, message: 'Indore demo data loaded', data });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentMethods(_req, res, next) {
  try {
    res.status(200).json({ success: true, message: 'Payment methods fetched', data: await getPaymentMethodSettings() });
  } catch (error) {
    next(error);
  }
}

export async function updatePaymentMethods(req, res, next) {
  try {
    const data = await updatePaymentMethodSettings(req.body || {});
    res.status(200).json({ success: true, message: 'Payment methods updated', data });
  } catch (error) {
    next(error);
  }
}

/** Public (no auth): lets the customer apps know whether to bypass the location check. */
export async function getPublicDemoMode(_req, res, next) {
  try {
    res.status(200).json({ success: true, message: 'ok', data: await getPublicDemoInfo() });
  } catch (error) {
    next(error);
  }
}
