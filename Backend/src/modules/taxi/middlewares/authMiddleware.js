import { Admin } from '../admin/models/Admin.js';
import { Owner } from '../admin/models/Owner.js';
import { ServiceStore } from '../admin/models/ServiceStore.js';
import { ServiceCenterStaff } from '../admin/models/ServiceCenterStaff.js';
import { ApiError } from '../../../utils/ApiError.js';
import { Driver } from '../driver/models/Driver.js';
import { BusDriver } from '../driver/models/BusDriver.js';
import { User } from '../user/models/User.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { serializeAdminContext, resolveAdminModule } from '../../../core/admin/adminHierarchy.service.js';

const roleModelMap = {
  admin: Admin,
  'super-admin': Admin,
  driver: Driver,
  bus_driver: BusDriver,
  owner: Owner,
  service_center: ServiceStore,
  service_center_staff: ServiceCenterStaff,
  user: User,
};

const normalizeRole = (role = '') => {
  const value = String(role || '').toLowerCase();
  if (
    value === 'super-admin' ||
    value === 'superadmin' ||
    value === 'system-admin' ||
    value === 'system_admin' ||
    value === 'platform_superadmin' ||
    value === 'taxi_superadmin'
  ) {
    return 'admin';
  }
  return value;
};

const attachResolvedAuth = (req, payload) => {
  req.auth = {
    sub: payload.sub,
    role: normalizeRole(payload.role),
    originalRole: payload.role,
  };
};

const resolveOpenUserIdentity = async (req) => {
  const explicitUserId =
    req.headers['x-user-id'] ||
    req.body?.userId ||
    req.query?.userId ||
    req.params?.userId ||
    null;

  let user = null;
  try {
    const query = explicitUserId ? { _id: explicitUserId } : {};
    user = await User.findOne(query).sort({ createdAt: 1 });
  } catch (err) {
    user = null;
  }

  attachResolvedAuth(req, {
    sub: user ? String(user._id) : null,
    role: 'user',
  });
};

export const authenticate = (allowedRoles = [], options = {}) => async (req, _res, next) => {
  try {
    const allowPending = options?.allowPending === true;
    const authorization = req.headers.authorization || '';
    const [, token] = authorization.split(' ');

    if (!token) {
      throw new ApiError(401, 'Authorization token is required');
    }

    const payload = verifyAccessToken(token);

    const normalizedRole = normalizeRole(payload.role);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedRole)) {
      throw new ApiError(403, 'Insufficient permissions for this resource');
    }

    const Model = roleModelMap[payload.role] || roleModelMap[normalizedRole];
    const subjectId = payload.sub || payload.userId || payload.id || null;

    if (!Model) {
      throw new ApiError(401, 'Unsupported auth role');
    }

    if (!subjectId) {
      throw new ApiError(401, 'Authorization token is invalid');
    }

    const entity = await Model.findById(subjectId);

    if (!entity) {
      throw new ApiError(401, 'Authenticated account no longer exists');
    }

    if (
      normalizedRole === 'user' &&
      (entity.deletedAt || entity.isActive === false || entity.active === false)
    ) {
      throw new ApiError(401, 'User account is not active');
    }

    if (
      normalizedRole === 'driver' &&
      !allowPending &&
      (entity.approve === false || String(entity.status || '').toLowerCase() === 'pending')
    ) {
      throw new ApiError(403, 'Driver account is pending approval');
    }

    if (
      normalizedRole === 'owner' &&
      !allowPending &&
      (entity.active === false ||
        entity.approve === false ||
        String(entity.status || '').toLowerCase() === 'pending')
    ) {
      throw new ApiError(403, 'Owner account is pending approval');
    }

    if (
      normalizedRole === 'bus_driver' &&
      (entity.active === false ||
        entity.approve === false ||
        ['pending', 'blocked'].includes(String(entity.status || '').toLowerCase()))
    ) {
      throw new ApiError(403, 'Bus driver account is pending approval');
    }

    if (
      normalizedRole === 'service_center' &&
      (entity.active === false || String(entity.status || '').toLowerCase() === 'inactive')
    ) {
      throw new ApiError(403, 'Service center account is inactive');
    }

    if (
      normalizedRole === 'service_center_staff' &&
      (entity.active === false || String(entity.status || '').toLowerCase() === 'inactive')
    ) {
      throw new ApiError(403, 'Service center staff account is inactive');
    }

    attachResolvedAuth(req, { ...payload, sub: String(subjectId) });
    req.auth.entity = entity;

    if (normalizedRole === 'admin') {
      const adminContext = serializeAdminContext(entity);
      req.auth.admin = {
        ...adminContext,
        role: entity.role || '',
        adminLevel: adminContext.adminLevel,
        module: adminContext.module || resolveAdminModule(entity),
      };

      if (req.auth.admin.active === false || String(req.auth.admin.status).toLowerCase() === 'inactive') {
        throw new ApiError(403, 'Admin account is inactive');
      }
    }

    next();
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Authorization token has expired'));
    }
    if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') {
      return next(new ApiError(401, 'Authorization token is invalid'));
    }
    next(error);
  }
};

export const authenticateOrResolveUser = (allowedRoles = ['user']) => async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const [, token] = authorization.split(' ');

  if (token) {
    return authenticate(allowedRoles)(req, res, next);
  }

  try {
    if (!allowedRoles.includes('user')) {
      throw new ApiError(401, 'Authorization token is required');
    }

    await resolveOpenUserIdentity(req);
    next();
  } catch (error) {
    next(error);
  }
};
