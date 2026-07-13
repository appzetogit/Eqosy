import mongoose from 'mongoose';
import {
  ADMIN_LEVELS,
  ADMIN_MODULES,
  MODULE_SUPERADMIN_LEVELS,
} from './adminHierarchy.constants.js';
import {
  normalizeAdminPermissions,
  normalizeAdminType,
  permissionsIncludeAll,
  assertPermissionsSubset,
  assertIdSubset,
  expandLegacyPermissions,
  hasResourcePermission,
  parsePermissionKey,
} from './adminAccess.util.js';

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
};

export const normalizeObjectIdList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];

export const resolveAdminLevel = (admin = {}) => {
  const explicit = String(admin.adminLevel || admin.admin_level || '').trim().toLowerCase();
  if (Object.values(ADMIN_LEVELS).includes(explicit)) {
    return explicit;
  }

  const adminType = normalizeAdminType(admin.admin_type || admin.role);
  const servicesAccess = Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [];
  const hasAllServices =
    servicesAccess.includes(ADMIN_MODULES.FOOD) &&
    servicesAccess.includes(ADMIN_MODULES.TAXI);

  if (adminType === 'subadmin') {
    return ADMIN_LEVELS.SUBADMIN;
  }

  if (adminType === 'superadmin' || String(admin.role || '').toLowerCase() === 'superadmin') {
    if (hasAllServices || servicesAccess.length >= 2) {
      return ADMIN_LEVELS.PLATFORM_SUPERADMIN;
    }
    if (servicesAccess.includes(ADMIN_MODULES.TAXI) && !servicesAccess.includes(ADMIN_MODULES.FOOD)) {
      return ADMIN_LEVELS.TAXI_SUPERADMIN;
    }
    return ADMIN_LEVELS.FOOD_SUPERADMIN;
  }

  if (hasAllServices || servicesAccess.length >= 2) {
    return ADMIN_LEVELS.PLATFORM_SUPERADMIN;
  }

  if (servicesAccess.includes(ADMIN_MODULES.TAXI)) {
    return ADMIN_LEVELS.TAXI_SUPERADMIN;
  }

  return ADMIN_LEVELS.FOOD_SUPERADMIN;
};

export const resolveAdminModule = (admin = {}) => {
  const explicit = String(admin.module || '').trim().toLowerCase();
  if (explicit && Object.values(ADMIN_MODULES).includes(explicit)) {
    return explicit;
  }

  const level = resolveAdminLevel(admin);
  if (level === ADMIN_LEVELS.FOOD_SUPERADMIN) return ADMIN_MODULES.FOOD;
  if (level === ADMIN_LEVELS.TAXI_SUPERADMIN) return ADMIN_MODULES.TAXI;

  if (level === ADMIN_LEVELS.SUBADMIN) {
    if (Array.isArray(admin.service_location_ids) && admin.service_location_ids.length > 0) {
      return ADMIN_MODULES.TAXI;
    }
    if (Array.isArray(admin.food_zone_ids) && admin.food_zone_ids.length > 0) {
      return ADMIN_MODULES.FOOD;
    }
  }

  return null;
};

export const isPlatformSuperAdmin = (admin = {}) =>
  resolveAdminLevel(admin) === ADMIN_LEVELS.PLATFORM_SUPERADMIN;

export const isModuleSuperAdmin = (admin = {}, module = null) => {
  const level = resolveAdminLevel(admin);
  if (!module) {
    return level === ADMIN_LEVELS.FOOD_SUPERADMIN || level === ADMIN_LEVELS.TAXI_SUPERADMIN;
  }
  return level === MODULE_SUPERADMIN_LEVELS[module];
};

export const isSuperAdminLike = (admin = {}) => {
  const level = resolveAdminLevel(admin);
  return (
    level === ADMIN_LEVELS.PLATFORM_SUPERADMIN ||
    level === ADMIN_LEVELS.FOOD_SUPERADMIN ||
    level === ADMIN_LEVELS.TAXI_SUPERADMIN ||
    normalizeAdminType(admin.admin_type || admin.role) === 'superadmin'
  );
};

export const hasModuleAccess = (admin = {}, module) => {
  if (!module) return true;
  if (isPlatformSuperAdmin(admin)) return true;

  const adminModule = resolveAdminModule(admin);
  if (adminModule && adminModule !== module) {
    return false;
  }

  const servicesAccess = Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [];
  if (servicesAccess.length > 0 && !servicesAccess.includes(module)) {
    return false;
  }

  return true;
};

export const hasAdminPermission = (admin = {}, permission, { module = null, action = null } = {}) => {
  if (module && !hasModuleAccess(admin, module)) {
    return false;
  }

  if (isSuperAdminLike(admin)) {
    if (module) {
      return hasModuleAccess(admin, module);
    }
    return true;
  }

  const permissions = expandLegacyPermissions(admin.permissions || []);
  if (permissionsIncludeAll(permissions)) {
    return true;
  }

  if (action) {
    return hasResourcePermission(permissions, permission, action);
  }

  const parsed = parsePermissionKey(permission);
  if (parsed.resource && (permission.includes('.') || parsed.action !== 'read')) {
    return hasResourcePermission(permissions, parsed.resource, parsed.action === 'write' ? 'write' : 'read');
  }

  return permissions.includes(permission) || hasResourcePermission(permissions, permission, 'read');
};

export const canManageAdmins = (admin = {}) =>
  isSuperAdminLike(admin) || hasAdminPermission(admin, 'subadmins', { action: 'write' });

export const getCreatableAdminLevels = (currentAdmin = {}) => {
  const level = resolveAdminLevel(currentAdmin);

  if (level === ADMIN_LEVELS.PLATFORM_SUPERADMIN) {
    return [
      ADMIN_LEVELS.FOOD_SUPERADMIN,
      ADMIN_LEVELS.TAXI_SUPERADMIN,
      ADMIN_LEVELS.SUBADMIN,
    ];
  }

  if (level === ADMIN_LEVELS.FOOD_SUPERADMIN || level === ADMIN_LEVELS.TAXI_SUPERADMIN) {
    return [ADMIN_LEVELS.SUBADMIN];
  }

  if (level === ADMIN_LEVELS.SUBADMIN && hasAdminPermission(currentAdmin, 'subadmins', { action: 'write' })) {
    return [ADMIN_LEVELS.SUBADMIN];
  }

  return [];
};

export const resolveTargetModule = (currentAdmin = {}, payload = {}) => {
  const requestedLevel = String(payload.adminLevel || payload.admin_level || '').trim().toLowerCase();
  const requestedModule = String(payload.module || '').trim().toLowerCase();

  if (requestedLevel === ADMIN_LEVELS.FOOD_SUPERADMIN) return ADMIN_MODULES.FOOD;
  if (requestedLevel === ADMIN_LEVELS.TAXI_SUPERADMIN) return ADMIN_MODULES.TAXI;

  if (requestedModule && Object.values(ADMIN_MODULES).includes(requestedModule)) {
    return requestedModule;
  }

  const currentModule = resolveAdminModule(currentAdmin);
  if (currentModule) return currentModule;

  if (Array.isArray(payload.service_location_ids) && payload.service_location_ids.length > 0) {
    return ADMIN_MODULES.TAXI;
  }

  if (Array.isArray(payload.food_zone_ids) && payload.food_zone_ids.length > 0) {
    return ADMIN_MODULES.FOOD;
  }

  return null;
};

export const assertCanCreateAdmin = (currentAdmin = {}, payload = {}) => {
  if (!canManageAdmins(currentAdmin)) {
    throw new Error('You do not have permission to manage admins');
  }

  const currentLevel = resolveAdminLevel(currentAdmin);
  const targetLevel = String(payload.adminLevel || payload.admin_level || ADMIN_LEVELS.SUBADMIN).trim().toLowerCase();
  const creatableLevels = getCreatableAdminLevels(currentAdmin);

  if (!creatableLevels.includes(targetLevel)) {
    throw new Error('You cannot create an admin at this level');
  }

  const targetModule = resolveTargetModule(currentAdmin, payload);
  if (targetLevel === ADMIN_LEVELS.SUBADMIN) {
    const currentModule = resolveAdminModule(currentAdmin);
    if (currentModule && targetModule && currentModule !== targetModule) {
      throw new Error('Cannot create admins outside your module');
    }
  }

  if (currentLevel === ADMIN_LEVELS.SUBADMIN) {
    assertPermissionsSubset(currentAdmin.permissions || [], payload.permissions || []);
    assertIdSubset(currentAdmin.service_location_ids || [], payload.service_location_ids || [], 'service locations');
    assertIdSubset(currentAdmin.zone_ids || [], payload.zone_ids || [], 'zones');
    assertIdSubset(currentAdmin.food_zone_ids || [], payload.food_zone_ids || [], 'food zones');
  }

  return { targetLevel, targetModule };
};

export const getDescendantAdminIds = async (AdminModel, rootAdminId) => {
  const rootId = String(rootAdminId || '').trim();
  if (!rootId) return [];

  const descendants = [];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await AdminModel.find({ parentAdminId: { $in: frontier.map(toObjectId).filter(Boolean) } })
      .select('_id')
      .lean();

    const childIds = children.map((item) => String(item._id));
    if (childIds.length === 0) break;

    descendants.push(...childIds);
    frontier = childIds;
  }

  return descendants;
};

export const isDescendantOf = async (AdminModel, childId, ancestorId) => {
  const normalizedChild = String(childId || '').trim();
  const normalizedAncestor = String(ancestorId || '').trim();
  if (!normalizedChild || !normalizedAncestor) return false;
  if (normalizedChild === normalizedAncestor) return false;

  const descendants = await getDescendantAdminIds(AdminModel, normalizedAncestor);
  return descendants.includes(normalizedChild);
};

export const assertCanManageTargetAdmin = async (AdminModel, currentAdmin = {}, targetAdmin = {}) => {
  const currentId = String(currentAdmin.id || currentAdmin._id || '').trim();
  const targetId = String(targetAdmin._id || targetAdmin.id || '').trim();

  if (!currentId || !targetId) {
    throw new Error('Admin account not found');
  }

  if (currentId === targetId) {
    throw new Error('Use your profile flow to update your own admin account');
  }

  if (isPlatformSuperAdmin(currentAdmin)) {
    const targetLevel = resolveAdminLevel(targetAdmin);
    if (targetLevel === ADMIN_LEVELS.PLATFORM_SUPERADMIN) {
      throw new Error('Platform super admins cannot be managed through this flow');
    }
    return;
  }

  const isDescendant = await isDescendantOf(AdminModel, targetId, currentId);
  if (!isDescendant) {
    throw new Error('You can only manage admins in your branch');
  }

  const currentModule = resolveAdminModule(currentAdmin);
  const targetModule = resolveAdminModule(targetAdmin);
  if (currentModule && targetModule && currentModule !== targetModule) {
    throw new Error('Cross-module admin management is not allowed');
  }
};

export const buildDescendantAdminQuery = async (AdminModel, currentAdmin = {}) => {
  const currentId = String(currentAdmin.id || currentAdmin._id || '').trim();
  if (!currentId) {
    return { _id: { $in: [] } };
  }

  const descendantIds = await getDescendantAdminIds(AdminModel, currentId);
  return { _id: { $in: descendantIds.map(toObjectId).filter(Boolean) } };
};

export const serializeAdminContext = (admin = {}) => ({
  id: String(admin._id || admin.id || ''),
  email: admin.email || '',
  name: admin.name || '',
  role: admin.role || '',
  adminLevel: resolveAdminLevel(admin),
  module: resolveAdminModule(admin),
  parentAdminId: admin.parentAdminId ? String(admin.parentAdminId) : null,
  admin_type: normalizeAdminType(admin.admin_type || admin.role),
  permissions: normalizeAdminPermissions(admin.permissions || []),
  servicesAccess: Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [],
  service_location_ids: normalizeObjectIdList(admin.service_location_ids),
  zone_ids: normalizeObjectIdList(admin.zone_ids),
  food_zone_ids: normalizeObjectIdList(admin.food_zone_ids),
  isActive: admin.isActive !== false && admin.active !== false,
  active: admin.active !== false && admin.isActive !== false,
  status: admin.status || (admin.isActive === false || admin.active === false ? 'inactive' : 'active'),
});
