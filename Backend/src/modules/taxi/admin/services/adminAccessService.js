import {
  SUPERADMIN_PERMISSION,
  normalizeAdminPermissions,
  normalizeAdminType,
  buildPermissionKey,
} from '../../../../core/admin/adminAccess.util.js';
import {
  hasAdminPermission as hasHierarchyAdminPermission,
  isSuperAdminLike,
  resolveAdminLevel,
  resolveAdminModule,
} from '../../../../core/admin/adminHierarchy.service.js';
import { ADMIN_MODULES } from '../../../../core/admin/adminHierarchy.constants.js';

export { SUPERADMIN_PERMISSION, normalizeAdminPermissions, normalizeAdminType };

export const TAXI_PERMISSION_RESOURCES = [
  { key: 'dashboard', label: 'Dashboard & Main Analytics', group: 'Core Access', readOnly: true },
  { key: 'cancellation_analytics', label: 'Cancellation Analytics', group: 'Core Access', readOnly: true },
  { key: 'earnings', label: 'Admin Earnings & Financials', group: 'Core Access' },
  { key: 'chat', label: 'Live Support Chat', group: 'Core Access' },
  { key: 'promotions', label: 'Promotions (Promo Codes & Push Notifications)', group: 'Core Access' },
  { key: 'subadmins', label: 'Subadmin Account Management', group: 'Core Access' },

  { key: 'trips', label: 'Trip Requests & Ride Details', group: 'Operations & Rides' },
  { key: 'deliveries', label: 'Delivery Requests & Parcel Trips', group: 'Operations & Rides' },
  { key: 'ongoing', label: 'Ongoing Requests & Live Rides', group: 'Operations & Rides' },
  { key: 'drivers', label: 'Driver Management', group: 'Operations & Rides' },
  { key: 'users', label: 'Customers (User List & Subscriptions)', group: 'Operations & Rides' },
  { key: 'wallet', label: 'Wallet & Withdrawal Requests', group: 'Operations & Rides' },
  { key: 'owners', label: 'Owners & Fleet Management', group: 'Operations & Rides' },
  { key: 'support', label: 'Support Tickets & Help Desk', group: 'Operations & Rides' },
  { key: 'reports', label: 'Reports', group: 'Operations & Rides' },
  { key: 'referrals', label: 'Referral Program Settings', group: 'Operations & Rides' },

  { key: 'service_locations', label: 'Service Locations Setup', group: 'Pricing & System Scope' },
  { key: 'zones', label: 'Zones Setup', group: 'Pricing & System Scope' },
  { key: 'airports', label: 'Airports Setup', group: 'Pricing & System Scope' },
  { key: 'service_stores', label: 'Service Stores', group: 'Pricing & System Scope' },
  { key: 'vehicle_types', label: 'Vehicle Types', group: 'Pricing & System Scope' },
  { key: 'set_prices', label: 'Set Prices', group: 'Pricing & System Scope' },
  { key: 'goods_types', label: 'Goods Types', group: 'Pricing & System Scope' },
  { key: 'rental', label: 'Rental Packages & Fleet Vehicles', group: 'Pricing & System Scope' },
  { key: 'bus_service', label: 'Bus Service Management', group: 'Pricing & System Scope' },
  { key: 'pooling', label: 'Car Pooling Management', group: 'Pricing & System Scope' },
  { key: 'geofencing', label: 'Geofencing', group: 'Pricing & System Scope' },
  { key: 'settings', label: 'Settings & Master Data', group: 'Pricing & System Scope' },
];

export const ADMIN_PERMISSIONS = TAXI_PERMISSION_RESOURCES.flatMap((resource) => {
  const keys = [buildPermissionKey(resource.key, 'read')];
  if (!resource.readOnly) {
    keys.push(buildPermissionKey(resource.key, 'write'));
  }
  return keys;
});

export const listTaxiPermissionCatalog = () =>
  TAXI_PERMISSION_RESOURCES.map((resource) => ({
    key: resource.key,
    label: resource.label,
    group: resource.group,
    readOnly: Boolean(resource.readOnly),
    readKey: buildPermissionKey(resource.key, 'read'),
    writeKey: resource.readOnly ? null : buildPermissionKey(resource.key, 'write'),
  }));

export const hasAdminPermission = (admin, permission, action = null) => {
  if (action) {
    return hasHierarchyAdminPermission(admin, permission, {
      module: ADMIN_MODULES.TAXI,
      action,
    });
  }
  return hasHierarchyAdminPermission(admin, permission, { module: ADMIN_MODULES.TAXI });
};

export const isTaxiSuperAdmin = (admin = {}) =>
  isSuperAdminLike(admin) && hasHierarchyAdminPermission(admin, '*', { module: ADMIN_MODULES.TAXI });

export const getTaxiAdminContext = (admin = {}) => ({
  ...admin,
  adminLevel: resolveAdminLevel(admin),
  module: resolveAdminModule(admin) || ADMIN_MODULES.TAXI,
});
