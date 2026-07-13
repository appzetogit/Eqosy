import { AuthError, ForbiddenError } from '../../../../core/auth/errors.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { serializeAdminContext } from '../../../../core/admin/adminHierarchy.service.js';
import { hasFoodAdminPermission } from '../services/foodAdminAccessService.js';

export const attachFoodAdminContext = async (req, _res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return next(new AuthError('Admin access required'));
    }

    const admin = await FoodAdmin.findById(userId).lean();
    if (!admin) {
      return next(new AuthError('Admin account not found'));
    }

    req.adminContext = serializeAdminContext(admin);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireFoodAdminPermission = (permission, label = 'resource') => (req, _res, next) => {
  if (!hasFoodAdminPermission(req.adminContext, permission)) {
    return next(new AuthError(`You do not have permission to access ${label}`));
  }
  return next();
};

export const requireFoodResourceAccess = (resource, label = 'resource') => (req, _res, next) => {
  const action = ['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase()) ? 'read' : 'write';
  if (!hasFoodAdminPermission(req.adminContext, resource, action)) {
    if (action === 'write' && hasFoodAdminPermission(req.adminContext, resource, 'read')) {
      return next(new ForbiddenError(`You have read-only permission for this section. Actions are restricted by the admin.`));
    }
    return next(new AuthError(`You do not have ${action} permission for ${label}`));
  }
  return next();
};
