export const ADMIN_LEVELS = {
  PLATFORM_SUPERADMIN: 'platform_superadmin',
  FOOD_SUPERADMIN: 'food_superadmin',
  TAXI_SUPERADMIN: 'taxi_superadmin',
  SUBADMIN: 'subadmin',
};

export const TAXI_PERMISSION_RESOURCES = [
  // Core Access
  { key: 'dashboard', label: 'Dashboard & Main Analytics', group: 'Core Access', readOnly: true },
  { key: 'cancellation_analytics', label: 'Cancellation Analytics', group: 'Core Access', readOnly: true },
  { key: 'earnings', label: 'Admin Earnings & Financials', group: 'Core Access' },
  { key: 'chat', label: 'Live Support Chat', group: 'Core Access' },
  { key: 'promotions', label: 'Promotions (Promo Codes & Push Notifications)', group: 'Core Access' },
  { key: 'subadmins', label: 'Subadmin Account Management', group: 'Core Access' },

  // Operations & Rides
  { key: 'trips', label: 'Trip Requests & Ride Details (Active & Past Rides)', group: 'Operations & Rides' },
  { key: 'deliveries', label: 'Delivery Requests & Parcel Trips', group: 'Operations & Rides' },
  { key: 'ongoing', label: 'Ongoing Requests & Live Rides', group: 'Operations & Rides' },
  { key: 'drivers', label: 'Driver Management (Active Drivers, Pending & Approved Drivers)', group: 'Operations & Rides' },
  { key: 'users', label: 'Customers (User List & Subscriptions)', group: 'Operations & Rides' },
  { key: 'wallet', label: 'Wallet & Withdrawal Requests', group: 'Operations & Rides' },
  { key: 'owners', label: 'Owners & Fleet Management', group: 'Operations & Rides' },
  { key: 'support', label: 'Support Tickets & Help Desk', group: 'Operations & Rides' },
  { key: 'reports', label: 'Reports (User, Driver, Duty & Finance Reports)', group: 'Operations & Rides' },
  { key: 'referrals', label: 'Referral Program Settings', group: 'Operations & Rides' },

  // Pricing & System Scope
  { key: 'service_locations', label: 'Service Locations Setup', group: 'Pricing & System Scope' },
  { key: 'zones', label: 'Zones Setup (Working & Operating Zones)', group: 'Pricing & System Scope' },
  { key: 'airports', label: 'Airports Setup', group: 'Pricing & System Scope' },
  { key: 'service_stores', label: 'Service Stores', group: 'Pricing & System Scope' },
  { key: 'vehicle_types', label: 'Vehicle Types', group: 'Pricing & System Scope' },
  { key: 'set_prices', label: 'Set Prices (Fare & Distance Rates)', group: 'Pricing & System Scope' },
  { key: 'goods_types', label: 'Goods Types', group: 'Pricing & System Scope' },
  { key: 'rental', label: 'Rental Packages & Fleet Vehicles', group: 'Pricing & System Scope' },
  { key: 'bus_service', label: 'Bus Service Management', group: 'Pricing & System Scope' },
  { key: 'pooling', label: 'Car Pooling Management', group: 'Pricing & System Scope' },
  { key: 'geofencing', label: 'Geofencing (Heat Map, God\'s Eye & Peak Zones)', group: 'Pricing & System Scope' },
  { key: 'settings', label: 'Settings & Master Data', group: 'Pricing & System Scope' },
];

export const buildPermissionKey = (resource, action = 'read') => {
  const normalizedResource = String(resource || '').trim();
  const normalizedAction = String(action || 'read').trim().toLowerCase();
  if (!normalizedResource) return '';
  if (normalizedAction === 'write') return `${normalizedResource}.write`;
  return `${normalizedResource}.read`;
};

const LEGACY_MANAGE_TO_WRITE = {
  'subadmins.manage': 'subadmins',
};

const parsePermissionKey = (key = '') => {
  const normalized = String(key || '').trim();
  if (!normalized || normalized === '*') {
    return { resource: null, action: 'all', raw: normalized };
  }

  const manageResource = LEGACY_MANAGE_TO_WRITE[normalized];
  if (manageResource) {
    return { resource: manageResource, action: 'write', raw: normalized };
  }

  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex === -1) {
    return { resource: normalized, action: 'read', raw: normalized };
  }

  const resource = normalized.slice(0, dotIndex);
  const suffix = normalized.slice(dotIndex + 1);

  if (suffix === 'view' || suffix === 'read') {
    return { resource, action: 'read', raw: normalized };
  }

  if (suffix === 'write' || suffix === 'manage') {
    return { resource, action: 'write', raw: normalized };
  }

  return { resource: normalized, action: 'read', raw: normalized };
};

const normalizePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) return [];
  const normalized = permissions.map((item) => String(item || '').trim()).filter(Boolean);
  if (normalized.includes('*')) return ['*'];
  return [...new Set(normalized)];
};

export const expandLegacyPermissions = (permissions = []) => {
  const normalized = normalizePermissions(permissions);
  if (normalized.includes('*')) return ['*'];

  const expanded = new Set();
  normalized.forEach((permission) => {
    const parsed = parsePermissionKey(permission);
    if (!parsed.resource) return;
    if (parsed.action === 'write') {
      expanded.add(buildPermissionKey(parsed.resource, 'write'));
      expanded.add(buildPermissionKey(parsed.resource, 'read'));
      return;
    }
    expanded.add(buildPermissionKey(parsed.resource, 'read'));
  });

  return [...expanded];
};

export const resourcePermissionsFromFlat = (permissions = []) => {
  const map = {};
  expandLegacyPermissions(permissions).forEach((permission) => {
    const parsed = parsePermissionKey(permission);
    if (!parsed.resource) return;
    if (!map[parsed.resource]) {
      map[parsed.resource] = { read: false, write: false };
    }
    if (parsed.action === 'write') {
      map[parsed.resource].write = true;
      map[parsed.resource].read = true;
    } else {
      map[parsed.resource].read = true;
    }
  });
  return map;
};

export const flattenResourcePermissions = (resourcePermissions = {}) => {
  const flat = [];
  Object.entries(resourcePermissions || {}).forEach(([resource, access]) => {
    if (access?.read) flat.push(buildPermissionKey(resource, 'read'));
    if (access?.write) flat.push(buildPermissionKey(resource, 'write'));
  });
  return [...new Set(flat)];
};

export const ADMIN_PERMISSION_GROUPS = TAXI_PERMISSION_RESOURCES.reduce((groups, resource) => {
  let group = groups.find((item) => item.title === resource.group);
  if (!group) {
    group = { title: resource.group, items: [] };
    groups.push(group);
  }
  group.items.push({
    key: resource.key,
    label: resource.label,
    readOnly: Boolean(resource.readOnly),
    readKey: buildPermissionKey(resource.key, 'read'),
    writeKey: resource.readOnly ? null : buildPermissionKey(resource.key, 'write'),
  });
  return groups;
}, []);

export const ALL_ADMIN_PERMISSIONS = TAXI_PERMISSION_RESOURCES.flatMap((resource) => {
  const keys = [buildPermissionKey(resource.key, 'read')];
  if (!resource.readOnly) keys.push(buildPermissionKey(resource.key, 'write'));
  return keys;
});
export const ALL_TAXI_ADMIN_PERMISSIONS = ALL_ADMIN_PERMISSIONS;

export const resolveAdminLevel = (admin = {}) => {
  const explicit = String(admin.adminLevel || admin.admin_level || '').trim().toLowerCase();
  const adminTypeLower = String(admin.admin_type || '').trim().toLowerCase();
  const roleLower = String(admin.role || '').trim().toLowerCase();
  const permissions = normalizePermissions(admin.permissions);

  const isExplicitSubadmin =
    adminTypeLower === 'subadmin' ||
    adminTypeLower.includes('sub') ||
    explicit === ADMIN_LEVELS.SUBADMIN ||
    roleLower === 'subadmin' ||
    roleLower.includes('sub');

  if (isExplicitSubadmin || (permissions.length > 0 && !permissions.includes('*'))) {
    return ADMIN_LEVELS.SUBADMIN;
  }

  if (Object.values(ADMIN_LEVELS).includes(explicit)) return explicit;

  const servicesAccess = Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [];

  if (servicesAccess.includes('food') && servicesAccess.includes('taxi')) {
    return ADMIN_LEVELS.PLATFORM_SUPERADMIN;
  }
  if (adminTypeLower === 'superadmin' || roleLower === 'superadmin') {
    return ADMIN_LEVELS.TAXI_SUPERADMIN;
  }
  if (permissions.includes('*')) return ADMIN_LEVELS.TAXI_SUPERADMIN;

  return ADMIN_LEVELS.SUBADMIN;
};

export const isTaxiSuperAdminLike = (admin = {}) => {
  if (!admin || typeof admin !== 'object') return false;
  const adminTypeLower = String(admin.admin_type || '').trim().toLowerCase();
  const roleLower = String(admin.role || '').trim().toLowerCase();
  const explicit = String(admin.adminLevel || admin.admin_level || '').trim().toLowerCase();
  const permissions = normalizePermissions(admin.permissions);

  const isExplicitSubadmin =
    adminTypeLower === 'subadmin' ||
    adminTypeLower.includes('sub') ||
    explicit === ADMIN_LEVELS.SUBADMIN ||
    roleLower === 'subadmin' ||
    roleLower.includes('sub');

  if (isExplicitSubadmin) {
    return false;
  }

  if (
    adminTypeLower === 'superadmin' ||
    roleLower === 'superadmin' ||
    explicit === ADMIN_LEVELS.PLATFORM_SUPERADMIN ||
    explicit === ADMIN_LEVELS.TAXI_SUPERADMIN ||
    explicit === ADMIN_LEVELS.FOOD_SUPERADMIN ||
    permissions.includes('*')
  ) {
    return true;
  }

  if (permissions.length > 0 && !permissions.includes('*')) {
    return false;
  }

  const level = resolveAdminLevel(admin);
  return (
    level === ADMIN_LEVELS.PLATFORM_SUPERADMIN ||
    level === ADMIN_LEVELS.TAXI_SUPERADMIN ||
    permissions.includes('*')
  );
};

export const getCreatableAdminTypes = (admin = {}) => {
  const level = resolveAdminLevel(admin);
  if (level === ADMIN_LEVELS.PLATFORM_SUPERADMIN) {
    return [
      { key: 'taxi_superadmin', label: 'Taxi Super Admin' },
      { key: 'subadmin', label: 'Subadmin' },
    ];
  }
  return [{ key: 'subadmin', label: 'Subadmin' }];
};

const hasResourcePermission = (permissions = [], resource, action = 'read') => {
  const normalizedResource = String(resource || '').trim();
  const normalizedAction = String(action || 'read').trim().toLowerCase();
  if (!normalizedResource) return true;

  const rawPermissions = normalizePermissions(permissions);
  if (rawPermissions.includes('*') || rawPermissions.includes('all')) return true;

  const expanded = expandLegacyPermissions(permissions);
  if (expanded.includes('*')) return true;

  const readKey = buildPermissionKey(normalizedResource, 'read');
  const writeKey = buildPermissionKey(normalizedResource, 'write');
  const viewKey = `${normalizedResource}.view`;
  const manageKey = `${normalizedResource}.manage`;

  if (
    rawPermissions.includes(normalizedResource) ||
    rawPermissions.includes(viewKey) ||
    rawPermissions.includes(readKey) ||
    rawPermissions.includes(writeKey) ||
    rawPermissions.includes(manageKey)
  ) {
    if (normalizedAction === 'read') return true;
  }

  if (normalizedAction === 'write') {
    return expanded.includes(writeKey) || rawPermissions.includes(manageKey) || rawPermissions.includes(writeKey);
  }

  return expanded.includes(readKey) || expanded.includes(writeKey);
};

export const hasTaxiAdminPermission = (admin = {}, resourceOrPermission, action = null) => {
  if (isTaxiSuperAdminLike(admin)) return true;

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : [];

  let resource = String(resourceOrPermission || '').trim();
  let requestedAction = action || 'read';

  if (resource.includes('.')) {
    const parsed = parsePermissionKey(resource);
    resource = parsed.resource || resource;
    if (!action && parsed.action) {
      requestedAction = parsed.action;
    }
  }

  return hasResourcePermission(permissions, resource, requestedAction);
};

export const hasAdminPermission = (adminInfo = {}, permission, action = 'read') => {
  if (!permission) return true;
  return hasTaxiAdminPermission(adminInfo, permission, action);
};

export const canReadTaxi = (admin = {}, resource) => hasTaxiAdminPermission(admin, resource, 'read');
export const canWriteTaxi = (admin = {}, resource) => hasTaxiAdminPermission(admin, resource, 'write');

export const canManageSubadmins = (adminInfo = {}) =>
  hasAdminPermission(adminInfo, 'subadmins', 'write') || hasAdminPermission(adminInfo, 'subadmins', 'read');

export const parentCanAssignRead = (parent = {}, resource) => {
  if (isTaxiSuperAdminLike(parent)) return true;
  return canReadTaxi(parent, resource);
};

export const parentCanAssignWrite = (parent = {}, resource) => {
  if (isTaxiSuperAdminLike(parent)) return true;
  return canWriteTaxi(parent, resource);
};

const TAXI_RESOURCE_KEYWORDS = [
  'cancellation', 'trip', 'delivery', 'ongoing', 'driver',
  'owner', 'location', 'airport', 'store', 'vehicle',
  'price', 'goods', 'rental', 'bus', 'pooling', 'geofencing', 'chat'
];

const FOOD_RESOURCE_KEYWORDS = [
  'pos', 'order', 'restaurant', 'food', 'category', 'delivery', 'dining', 'fee', 'cms'
];

export const normalizeTaxiAdminProfile = (profile = {}) => {
  const source = profile && typeof profile === 'object' ? profile : {};
  const adminLevel = resolveAdminLevel(source);
  const isSuper = isTaxiSuperAdminLike(source);
  const permissions = normalizePermissions(source.permissions);

  const foodZoneIds = Array.isArray(source.food_zone_ids) ? source.food_zone_ids : [];
  const serviceLocIds = Array.isArray(source.service_location_ids) ? source.service_location_ids : [];
  const taxiZoneIds = Array.isArray(source.zone_ids) ? source.zone_ids : [];

  let servicesAccess = Array.isArray(source.servicesAccess) ? [...source.servicesAccess] : [];
  if (servicesAccess.length === 0 && !isSuper) {
    const permStrings = permissions.map((p) => String(p || '').toLowerCase());
    const hasTaxiPerm = permStrings.some((p) => TAXI_RESOURCE_KEYWORDS.some((kw) => p.includes(kw)));
    const hasFoodPerm = permStrings.some((p) => FOOD_RESOURCE_KEYWORDS.some((kw) => p.includes(kw)));

    if (hasTaxiPerm || serviceLocIds.length > 0 || taxiZoneIds.length > 0) {
      servicesAccess.push('taxi');
    }
    if (hasFoodPerm || foodZoneIds.length > 0) {
      servicesAccess.push('food');
    }
    if (servicesAccess.length === 0) {
      servicesAccess = [source.module || 'taxi'];
    }
  }

  const derivedModule = source.module || (servicesAccess.includes('food') && !servicesAccess.includes('taxi') ? 'food' : 'taxi');

  return {
    ...source,
    adminLevel,
    module: derivedModule,
    admin_type: isSuper ? 'superadmin' : 'subadmin',
    permissions: isSuper ? (permissions.includes('*') ? permissions : ['*', ...permissions]) : expandLegacyPermissions(permissions),
    service_location_ids: serviceLocIds,
    zone_ids: taxiZoneIds,
    food_zone_ids: foodZoneIds,
    servicesAccess: isSuper ? ['food', 'taxi'] : servicesAccess,
  };
};
