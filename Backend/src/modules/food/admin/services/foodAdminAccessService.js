import {
  SUPERADMIN_PERMISSION,
  normalizeAdminPermissions,
  normalizeAdminType,
  buildPermissionKey,
  expandLegacyPermissions,
} from '../../../../core/admin/adminAccess.util.js';
import {
  hasAdminPermission as hasHierarchyAdminPermission,
  isSuperAdminLike,
  resolveAdminLevel,
  resolveAdminModule,
} from '../../../../core/admin/adminHierarchy.service.js';
import { ADMIN_MODULES } from '../../../../core/admin/adminHierarchy.constants.js';

export { SUPERADMIN_PERMISSION, normalizeAdminPermissions, normalizeAdminType };

export const FOOD_PERMISSION_RESOURCES = [
  { key: 'dashboard', label: 'Dashboard', group: 'Core Access', readOnly: true },
  { key: 'subadmins', label: 'Subadmins', group: 'Core Access' },
  { key: 'pos', label: 'Point of Sale', group: 'Core Access' },
  { key: 'orders', label: 'Orders', group: 'Operations' },
  { key: 'restaurants', label: 'Restaurants', group: 'Operations' },
  { key: 'foods', label: 'Foods & Addons', group: 'Operations' },
  { key: 'categories', label: 'Categories', group: 'Operations' },
  { key: 'zones', label: 'Zones', group: 'Operations' },
  { key: 'delivery', label: 'Delivery Partners', group: 'Operations' },
  { key: 'customers', label: 'Customers', group: 'Operations' },
  { key: 'support', label: 'Support', group: 'Operations' },
  { key: 'dining', label: 'Dining', group: 'Operations' },
  { key: 'wallet', label: 'Wallet & Transactions', group: 'Finance & Reports' },
  { key: 'reports', label: 'Reports', group: 'Finance & Reports' },
  { key: 'promotions', label: 'Promotions & Campaigns', group: 'Finance & Reports' },
  { key: 'referrals', label: 'Referral Settings', group: 'Finance & Reports' },
  { key: 'fee_settings', label: 'Fee Settings', group: 'Settings' },
  { key: 'settings', label: 'System Settings', group: 'Settings' },
  { key: 'cms', label: 'Pages & CMS', group: 'Settings' },
];

export const FOOD_ADMIN_PERMISSIONS = FOOD_PERMISSION_RESOURCES.flatMap((resource) => {
  const keys = [buildPermissionKey(resource.key, 'read')];
  if (!resource.readOnly) {
    keys.push(buildPermissionKey(resource.key, 'write'));
  }
  return keys;
});

export const listFoodPermissionCatalog = () =>
  FOOD_PERMISSION_RESOURCES.map((resource) => ({
    key: resource.key,
    label: resource.label,
    group: resource.group,
    readOnly: Boolean(resource.readOnly),
    readKey: buildPermissionKey(resource.key, 'read'),
    writeKey: resource.readOnly ? null : buildPermissionKey(resource.key, 'write'),
  }));

export const hasFoodAdminPermission = (admin, resourceOrPermission, action = null) => {
  if (action) {
    return hasHierarchyAdminPermission(admin, resourceOrPermission, {
      module: ADMIN_MODULES.FOOD,
      action,
    });
  }

  const permission = String(resourceOrPermission || '');
  if (permission.includes('.')) {
    return hasHierarchyAdminPermission(admin, permission, { module: ADMIN_MODULES.FOOD });
  }

  return hasHierarchyAdminPermission(admin, permission, {
    module: ADMIN_MODULES.FOOD,
    action: 'read',
  });
};

export const isFoodSuperAdmin = (admin = {}) =>
  isSuperAdminLike(admin) && hasHierarchyAdminPermission(admin, '*', { module: ADMIN_MODULES.FOOD });

export const getFoodAdminContext = (admin = {}) => ({
  ...admin,
  adminLevel: resolveAdminLevel(admin),
  module: resolveAdminModule(admin) || ADMIN_MODULES.FOOD,
  permissions: expandLegacyPermissions(admin.permissions || []),
});
