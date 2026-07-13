import {
  SUPERADMIN_PERMISSION,
  normalizeAdminPermissions,
  normalizeAdminType,
} from '../../../../core/admin/adminAccess.util.js';
import {
  hasAdminPermission as hasHierarchyAdminPermission,
  isSuperAdminLike,
  resolveAdminLevel,
  resolveAdminModule,
} from '../../../../core/admin/adminHierarchy.service.js';
import { ADMIN_MODULES } from '../../../../core/admin/adminHierarchy.constants.js';

export { SUPERADMIN_PERMISSION, normalizeAdminPermissions, normalizeAdminType };

export const ADMIN_PERMISSIONS = [
  'dashboard.view',
  'earnings.view',
  'chat.view',
  'promotions.view',
  'users.view',
  'wallet.view',
  'drivers.view',
  'referrals.view',
  'subadmins.manage',
  'owners.view',
  'reports.view',
  'support.view',
  'service_locations.view',
  'zones.view',
  'airports.view',
  'service_stores.view',
  'vehicle_types.view',
  'rental.view',
  'set_prices.view',
  'goods_types.view',
  'bus_service.view',
  'pooling.view',
  'geofencing.view',
  'trips.view',
  'deliveries.view',
  'ongoing.view',
  'settings.view',
];

export const hasAdminPermission = (admin, permission) =>
  hasHierarchyAdminPermission(admin, permission, { module: ADMIN_MODULES.TAXI });

export const isTaxiSuperAdmin = (admin = {}) =>
  isSuperAdminLike(admin) && hasHierarchyAdminPermission(admin, '*', { module: ADMIN_MODULES.TAXI });

export const getTaxiAdminContext = (admin = {}) => ({
  ...admin,
  adminLevel: resolveAdminLevel(admin),
  module: resolveAdminModule(admin) || ADMIN_MODULES.TAXI,
});
