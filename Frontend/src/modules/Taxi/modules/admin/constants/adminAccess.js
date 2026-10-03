export const ADMIN_PERMISSION_GROUPS = [
  {
    title: 'Core Access',
    items: [
      { key: 'dashboard', label: 'Dashboard & Main Analytics' },
      { key: 'cancellation_analytics', label: 'Cancellation Analytics' },
      { key: 'earnings', label: 'Admin Earnings & Financials' },
      { key: 'chat', label: 'Live Support Chat' },
      { key: 'promotions', label: 'Promotions (Promo Codes & Push Notifications)' },
      { key: 'subadmins', label: 'Subadmin Account Management' },
    ],
  },
  {
    title: 'Operations & Rides',
    items: [
      { key: 'trips', label: 'Trip Requests & Ride Details (Active & Past Rides)' },
      { key: 'deliveries', label: 'Delivery Requests & Parcel Trips' },
      { key: 'ongoing', label: 'Ongoing Requests & Live Rides' },
      { key: 'drivers', label: 'Driver Management (Active Drivers, Pending & Approved Drivers)' },
      { key: 'users', label: 'Customers (User List & Subscriptions)' },
      { key: 'wallet', label: 'Wallet & Withdrawal Requests' },
      { key: 'owners', label: 'Owners & Fleet Management' },
      { key: 'support', label: 'Support Tickets & Help Desk' },
      { key: 'reports', label: 'Reports (User, Driver, Duty & Finance Reports)' },
      { key: 'referrals', label: 'Referral Program Settings' },
    ],
  },
  {
    title: 'Pricing & System Scope',
    items: [
      { key: 'service_locations', label: 'Service Locations Setup' },
      { key: 'zones', label: 'Zones Setup (Working & Operating Zones)' },
      { key: 'airports', label: 'Airports Setup' },
      { key: 'service_stores', label: 'Service Stores' },
      { key: 'vehicle_types', label: 'Vehicle Types' },
      { key: 'set_prices', label: 'Set Prices (Fare & Distance Rates)' },
      { key: 'goods_types', label: 'Goods Types' },
      { key: 'rental', label: 'Rental Packages & Fleet Vehicles' },
      { key: 'bus_service', label: 'Bus Service Management' },
      { key: 'pooling', label: 'Car Pooling Management' },
      { key: 'geofencing', label: 'Geofencing (Heat Map, God\'s Eye & Peak Zones)' },
      { key: 'settings', label: 'Settings & Master Data' },
    ],
  },
];

export const ALL_ADMIN_PERMISSIONS = ADMIN_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export const resourcePermissionsFromFlat = (flatPermissions = []) => {
  const map = {};
  const list = Array.isArray(flatPermissions) ? flatPermissions : [];
  list.forEach((permission) => {
    const raw = String(permission || '').trim();
    if (!raw || raw === '*') return;
    const parts = raw.split('.');
    const resource = parts[0];
    const action = parts[1] || 'read';

    if (!map[resource]) {
      map[resource] = { read: false, write: false };
    }

    if (action === 'write' || action === 'manage') {
      map[resource].write = true;
      map[resource].read = true;
    } else {
      map[resource].read = true;
    }
  });
  return map;
};

export const flattenResourcePermissions = (resourcePermissions = {}) => {
  const flat = [];
  Object.entries(resourcePermissions || {}).forEach(([resource, access]) => {
    if (access?.read) {
      flat.push(`${resource}.read`);
      flat.push(`${resource}.view`);
    }
    if (access?.write) {
      flat.push(`${resource}.write`);
      if (resource === 'subadmins') {
        flat.push('subadmins.manage');
      }
    }
  });
  return [...new Set(flat)];
};

export const hasAdminPermission = (adminInfo = {}, permission, action = 'read') => {
  if (!permission) return true;

  const adminLevel = String(adminInfo?.adminLevel || adminInfo?.admin_level || '').trim().toLowerCase();
  const adminType = String(adminInfo?.admin_type || '').trim().toLowerCase();
  const role = String(adminInfo?.role || '').trim().toLowerCase();
  const permissions = Array.isArray(adminInfo?.permissions) ? adminInfo.permissions.map(String) : [];

  const isExplicitSubadmin =
    adminType === 'subadmin' ||
    adminLevel === 'subadmin' ||
    role === 'subadmin' ||
    role.includes('subadmin');

  if (!isExplicitSubadmin) {
    if (
      adminLevel === 'platform_superadmin' ||
      adminLevel === 'food_superadmin' ||
      adminLevel === 'taxi_superadmin' ||
      adminLevel === 'system_admin' ||
      adminType === 'superadmin' ||
      role === 'superadmin' ||
      permissions.includes('*')
    ) {
      return true;
    }
  }

  if (permissions.includes('*')) {
    return true;
  }

  const parts = String(permission).split('.');
  const resource = parts[0];

  if (action === 'write') {
    return (
      permissions.includes(`${resource}.write`) ||
      permissions.includes(`${resource}.manage`) ||
      permissions.includes(`${permission}.write`)
    );
  }

  return (
    permissions.includes(permission) ||
    permissions.includes(resource) ||
    permissions.includes(`${resource}.read`) ||
    permissions.includes(`${resource}.view`) ||
    permissions.includes(`${resource}.write`) ||
    permissions.includes(`${resource}.manage`)
  );
};

export const canManageSubadmins = (adminInfo = {}) => hasAdminPermission(adminInfo, 'subadmins.manage', 'write') || hasAdminPermission(adminInfo, 'subadmins.view', 'read');

