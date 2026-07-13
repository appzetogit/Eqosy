import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { FoodZone } from '../models/zone.model.js';
import {
  ADMIN_LEVELS,
  ADMIN_MODULES,
} from '../../../../core/admin/adminHierarchy.constants.js';
import {
  assertCanCreateAdmin,
  assertCanManageTargetAdmin,
  buildDescendantAdminQuery,
  resolveAdminLevel,
  resolveAdminModule,
  isSuperAdminLike,
  isPlatformSuperAdmin,
  isModuleSuperAdmin,
} from '../../../../core/admin/adminHierarchy.service.js';
import {
  SUPERADMIN_PERMISSION,
  normalizeAdminPermissions,
  normalizeAdminType,
  assertPermissionsSubset,
  assertIdSubset,
} from '../../../../core/admin/adminAccess.util.js';
import {
  FOOD_ADMIN_PERMISSIONS,
  hasFoodAdminPermission,
  listFoodPermissionCatalog,
} from './foodAdminAccessService.js';

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
};

const normalizeObjectIdList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))]
    .map(toObjectId)
    .filter(Boolean);

const extractFoodZoneIds = (values = []) =>
  normalizeObjectIdList(
    (Array.isArray(values) ? values : []).map((value) => {
      if (value && typeof value === 'object') {
        return value._id || value.id || null;
      }
      return value;
    }),
  );

const canAssignAllFoodZones = (admin = {}) =>
  isPlatformSuperAdmin(admin) || isModuleSuperAdmin(admin, ADMIN_MODULES.FOOD);

const normalizeBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const assertFoodAdminPermission = (admin, resourceOrPermission, label = 'resource', action = null) => {
  if (!hasFoodAdminPermission(admin, resourceOrPermission, action)) {
    if (action === 'write' && hasFoodAdminPermission(admin, resourceOrPermission, 'read')) {
      throw new ApiError(403, `You have read-only permission for this section. Actions are restricted by the admin.`);
    }
    throw new ApiError(403, `You do not have permission to access ${label}`);
  }
};

const serializeFoodAdminSummary = (admin, zoneMap = new Map()) => {
  const foodZoneIds = (Array.isArray(admin.food_zone_ids) ? admin.food_zone_ids : []).map((id) => String(id));

  return {
    _id: admin._id,
    id: admin._id,
    name: admin.name || '',
    email: admin.email || '',
    phone: admin.phone || '',
    role: admin.role || '',
    adminLevel: resolveAdminLevel(admin),
    module: resolveAdminModule(admin) || ADMIN_MODULES.FOOD,
    parentAdminId: admin.parentAdminId ? String(admin.parentAdminId) : null,
    admin_type: normalizeAdminType(admin.admin_type || admin.role),
    permissions: normalizeAdminPermissions(admin.permissions || []),
    food_zone_ids: foodZoneIds,
    food_zones: foodZoneIds
      .map((id) => zoneMap.get(id))
      .filter(Boolean)
      .map((item) => ({
        id: String(item._id || item.id || ''),
        name: item.name || '',
      })),
    active: admin.active !== false && admin.isActive !== false,
    status: admin.status || (admin.isActive === false || admin.active === false ? 'inactive' : 'active'),
    createdAt: admin.createdAt || null,
    updatedAt: admin.updatedAt || null,
  };
};

const enrichFoodAdminSummaries = async (admins = []) => {
  const zoneIds = [
    ...new Set(
      admins.flatMap((admin) =>
        (Array.isArray(admin.food_zone_ids) ? admin.food_zone_ids : []).map((id) => String(id)),
      ),
    ),
  ];

  const zones =
    zoneIds.length > 0
      ? await FoodZone.find({ _id: { $in: zoneIds.map(toObjectId).filter(Boolean) } })
          .select('_id name')
          .lean()
      : [];

  const zoneMap = new Map(zones.map((item) => [String(item._id), item]));
  return admins.map((admin) => serializeFoodAdminSummary(admin, zoneMap));
};

const validateFoodAdminPayload = async (currentAdmin = {}, payload = {}, existingAdminId = null) => {
  const targetLevel = String(payload.adminLevel || payload.admin_level || ADMIN_LEVELS.SUBADMIN).trim().toLowerCase();
  const isCreatingModuleSuperAdmin = targetLevel === ADMIN_LEVELS.FOOD_SUPERADMIN;

  let adminType = normalizeAdminType(payload.admin_type || payload.role);
  if (isCreatingModuleSuperAdmin) {
    adminType = 'superadmin';
  } else if (targetLevel === ADMIN_LEVELS.SUBADMIN) {
    adminType = 'subadmin';
  }

  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = String(payload.phone || '').trim();
  const role = String(payload.role || (adminType === 'superadmin' ? 'superadmin' : 'subadmin')).trim();
  const permissions = normalizeAdminPermissions(
    adminType === 'superadmin' ? [SUPERADMIN_PERMISSION] : payload.permissions || [],
  );
  const foodZoneIds = normalizeObjectIdList(payload.food_zone_ids);
  const active = payload.active === undefined ? true : normalizeBoolean(payload.active);
  const status =
    String(payload.status || (active ? 'active' : 'inactive')).trim().toLowerCase() === 'inactive'
      ? 'inactive'
      : 'active';

  if (!name) throw new ApiError(400, 'Admin name is required');
  if (!email) throw new ApiError(400, 'Admin email is required');

  const duplicate = await FoodAdmin.findOne({
    email,
    ...(existingAdminId ? { _id: { $ne: existingAdminId } } : {}),
  }).lean();

  if (duplicate) {
    throw new ApiError(409, 'Admin email already exists');
  }

  if (!existingAdminId) {
    try {
      assertCanCreateAdmin(currentAdmin, { ...payload, module: ADMIN_MODULES.FOOD, adminLevel: targetLevel });
    } catch (error) {
      throw new ApiError(403, error.message);
    }
  }

  if (adminType === 'subadmin' && permissions.length === 0) {
    throw new ApiError(400, 'Select at least one permission for the subadmin');
  }

  if (adminType === 'subadmin' && foodZoneIds.length === 0) {
    throw new ApiError(400, 'Assign at least one food zone to the subadmin');
  }

  if (!isSuperAdminLike(currentAdmin)) {
    try {
      assertPermissionsSubset(currentAdmin.permissions || [], permissions);
      assertIdSubset(currentAdmin.food_zone_ids || [], foodZoneIds, 'food zones');
    } catch (error) {
      throw new ApiError(403, error.message);
    }
  }

  if (foodZoneIds.length > 0) {
    const count = await FoodZone.countDocuments({ _id: { $in: foodZoneIds } });
    if (count !== foodZoneIds.length) {
      throw new ApiError(400, 'One or more selected food zones are invalid');
    }
  }

  return {
    adminLevel: isCreatingModuleSuperAdmin ? ADMIN_LEVELS.FOOD_SUPERADMIN : ADMIN_LEVELS.SUBADMIN,
    module: ADMIN_MODULES.FOOD,
    parentAdminId: existingAdminId ? undefined : currentAdmin?.id || currentAdmin?._id || null,
    admin_type: adminType,
    name,
    email,
    phone,
    role,
    permissions,
    food_zone_ids: adminType === 'superadmin' ? [] : foodZoneIds,
    servicesAccess: isCreatingModuleSuperAdmin ? [ADMIN_MODULES.FOOD] : undefined,
    active,
    status,
    isActive: active,
  };
};

export const listFoodAdminPermissions = async () => listFoodPermissionCatalog();

export const listAssignableFoodZones = async (currentAdmin) => {
  assertFoodAdminPermission(currentAdmin, 'subadmins', 'subadmins', 'read');

  const filter = {};
  if (!canAssignAllFoodZones(currentAdmin)) {
    const parentZoneIds = extractFoodZoneIds(currentAdmin.food_zone_ids || []);
    if (parentZoneIds.length === 0) {
      return [];
    }
    filter._id = { $in: parentZoneIds };
  }

  return FoodZone.find(filter)
    .select('_id name zoneName isActive')
    .sort({ name: 1 })
    .lean();
};

export const listFoodAdmins = async (currentAdmin) => {
  assertFoodAdminPermission(currentAdmin, 'subadmins', 'subadmins', 'read');

  const descendantQuery = await buildDescendantAdminQuery(FoodAdmin, currentAdmin);
  const admins = await FoodAdmin.find({
    ...descendantQuery,
    module: ADMIN_MODULES.FOOD,
  })
    .select('-password -resetPasswordOtp -resetPasswordExpires')
    .sort({ createdAt: -1 })
    .lean();

  return enrichFoodAdminSummaries(admins);
};

export const getFoodAdminById = async (currentAdmin, adminId) => {
  assertFoodAdminPermission(currentAdmin, 'subadmins', 'subadmins', 'read');

  const descendantQuery = await buildDescendantAdminQuery(FoodAdmin, currentAdmin);
  const admin = await FoodAdmin.findOne({
    ...descendantQuery,
    _id: toObjectId(adminId),
    module: ADMIN_MODULES.FOOD,
  })
    .select('-password -resetPasswordOtp -resetPasswordExpires')
    .lean();

  if (!admin) {
    throw new ApiError(404, 'Admin not found');
  }

  const [serializedAdmin] = await enrichFoodAdminSummaries([admin]);
  return serializedAdmin;
};

export const createFoodAdminAccount = async (currentAdmin, payload = {}) => {
  assertFoodAdminPermission(currentAdmin, 'subadmins', 'subadmins', 'write');

  const password = String(payload.password || '').trim();
  const passwordConfirmation = String(payload.password_confirmation || payload.passwordConfirmation || '').trim();

  if (!password || password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }

  if (!passwordConfirmation || password !== passwordConfirmation) {
    throw new ApiError(400, 'Passwords do not match');
  }

  const validated = await validateFoodAdminPayload(currentAdmin, payload);
  const createPayload = { ...validated };
  if (createPayload.parentAdminId) {
    createPayload.parentAdminId = toObjectId(createPayload.parentAdminId);
  }
  if (createPayload.servicesAccess === undefined) {
    delete createPayload.servicesAccess;
  }

  const created = await FoodAdmin.create({
    ...createPayload,
    password,
  });

  const [serializedAdmin] = await enrichFoodAdminSummaries([created.toObject()]);
  return serializedAdmin;
};

export const updateFoodAdminAccount = async (currentAdmin, id, payload = {}) => {
  assertFoodAdminPermission(currentAdmin, 'subadmins', 'subadmins', 'write');

  const admin = await FoodAdmin.findById(id);
  if (!admin) {
    throw new ApiError(404, 'Admin account not found');
  }

  try {
    await assertCanManageTargetAdmin(FoodAdmin, currentAdmin, admin);
  } catch (error) {
    throw new ApiError(403, error.message);
  }

  const validated = await validateFoodAdminPayload(currentAdmin, payload, admin._id);
  const { parentAdminId, ...updateFields } = validated;
  Object.assign(admin, updateFields);

  if (payload.password) {
    const password = String(payload.password || '').trim();
    const passwordConfirmation = String(payload.password_confirmation || payload.passwordConfirmation || '').trim();
    if (password.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters');
    }
    if (password !== passwordConfirmation) {
      throw new ApiError(400, 'Passwords do not match');
    }
    admin.password = password;
  }

  await admin.save();
  const [serializedAdmin] = await enrichFoodAdminSummaries([admin.toObject()]);
  return serializedAdmin;
};

export const deleteFoodAdminAccount = async (currentAdmin, id) => {
  assertFoodAdminPermission(currentAdmin, 'subadmins', 'subadmins', 'write');

  const admin = await FoodAdmin.findById(id).lean();
  if (!admin) {
    throw new ApiError(404, 'Admin account not found');
  }

  try {
    await assertCanManageTargetAdmin(FoodAdmin, currentAdmin, admin);
  } catch (error) {
    throw new ApiError(403, error.message);
  }

  if (normalizeAdminType(admin.admin_type) === 'superadmin' && resolveAdminLevel(admin) !== ADMIN_LEVELS.SUBADMIN) {
    throw new ApiError(400, 'Super admin accounts cannot be deleted through this endpoint');
  }

  await FoodAdmin.deleteOne({ _id: admin._id });
  return { deleted: true };
};

export const buildFoodZoneScopeQuery = (admin = {}, field = '_id') => {
  if (isSuperAdminLike(admin)) {
    return {};
  }

  const zoneIds = normalizeObjectIdList(admin.food_zone_ids);
  if (zoneIds.length === 0) {
    return { [field]: { $in: [] } };
  }

  return { [field]: { $in: zoneIds } };
};

export { assertFoodAdminPermission, hasFoodAdminPermission };
