export const ADMIN_LEVELS = {
  PLATFORM_SUPERADMIN: 'platform_superadmin',
  FOOD_SUPERADMIN: 'food_superadmin',
  TAXI_SUPERADMIN: 'taxi_superadmin',
  SUBADMIN: 'subadmin',
};

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
  Object.entries(resourcePermissions).forEach(([resource, access]) => {
    if (access?.read) flat.push(buildPermissionKey(resource, 'read'));
    if (access?.write) flat.push(buildPermissionKey(resource, 'write'));
  });
  return [...new Set(flat)];
};

export const FOOD_PERMISSION_GROUPS = FOOD_PERMISSION_RESOURCES.reduce((groups, resource) => {
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

export const ALL_FOOD_ADMIN_PERMISSIONS = FOOD_PERMISSION_RESOURCES.flatMap((resource) => {
  const keys = [buildPermissionKey(resource.key, 'read')];
  if (!resource.readOnly) keys.push(buildPermissionKey(resource.key, 'write'));
  return keys;
});

export const resolveAdminLevel = (admin = {}) => {
  const explicit = String(admin.adminLevel || admin.admin_level || '').trim().toLowerCase();
  if (Object.values(ADMIN_LEVELS).includes(explicit)) return explicit;

  const adminType = String(admin.admin_type || admin.role || '').toLowerCase();
  const servicesAccess = Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [];

  if (adminType === 'subadmin') return ADMIN_LEVELS.SUBADMIN;
  if (servicesAccess.includes('food') && servicesAccess.includes('taxi')) {
    return ADMIN_LEVELS.PLATFORM_SUPERADMIN;
  }
  if (adminType === 'superadmin') return ADMIN_LEVELS.FOOD_SUPERADMIN;
  return ADMIN_LEVELS.FOOD_SUPERADMIN;
};

export const isFoodSuperAdminLike = (admin = {}) => {
  const level = resolveAdminLevel(admin);
  return (
    level === ADMIN_LEVELS.PLATFORM_SUPERADMIN ||
    level === ADMIN_LEVELS.FOOD_SUPERADMIN ||
    normalizePermissions(admin.permissions).includes('*')
  );
};

export const isPlatformSuperAdmin = (admin = {}) =>
  resolveAdminLevel(admin) === ADMIN_LEVELS.PLATFORM_SUPERADMIN;

export const getCreatableAdminTypes = (admin = {}) => {
  const level = resolveAdminLevel(admin);
  if (level === ADMIN_LEVELS.PLATFORM_SUPERADMIN) {
    return [
      { key: 'food_superadmin', label: 'Food Super Admin' },
      { key: 'subadmin', label: 'Subadmin' },
    ];
  }
  return [{ key: 'subadmin', label: 'Subadmin' }];
};

const hasResourcePermission = (permissions = [], resource, action = 'read') => {
  const expanded = expandLegacyPermissions(permissions);
  if (expanded.includes('*')) return true;

  const readKey = buildPermissionKey(resource, 'read');
  const writeKey = buildPermissionKey(resource, 'write');

  if (action === 'write') {
    return expanded.includes(writeKey);
  }

  return expanded.includes(readKey) || expanded.includes(writeKey);
};

export const hasFoodAdminPermission = (admin = {}, resourceOrPermission, action = null) => {
  if (isFoodSuperAdminLike(admin)) return true;

  const permissions = admin.permissions || [];
  if (action) {
    return hasResourcePermission(permissions, resourceOrPermission, action);
  }

  const permission = String(resourceOrPermission || '');
  if (permission.includes('.')) {
    const parsed = parsePermissionKey(permission);
    return hasResourcePermission(permissions, parsed.resource, parsed.action === 'write' ? 'write' : 'read');
  }

  return hasResourcePermission(permissions, permission, 'read');
};

export const canReadFood = (admin = {}, resource) => hasFoodAdminPermission(admin, resource, 'read');
export const canWriteFood = (admin = {}, resource) => hasFoodAdminPermission(admin, resource, 'write');

const PATH_RESOURCE_RULES = [
  { prefix: '/admin/food/management', resource: 'subadmins' },
  { prefix: '/admin/food/point-of-sale', resource: 'pos' },
  { prefix: '/admin/food/orders', resource: 'orders' },
  { prefix: '/admin/food/restaurants', resource: 'restaurants' },
  { prefix: '/admin/food/foods', resource: 'foods' },
  { prefix: '/admin/food/addons', resource: 'foods' },
  { prefix: '/admin/food/food-approval', resource: 'foods' },
  { prefix: '/admin/food/categories', resource: 'categories' },
  { prefix: '/admin/food/zone-setup', resource: 'zones' },
  { prefix: '/admin/food/delivery', resource: 'delivery' },
  { prefix: '/admin/food/delivery-partners', resource: 'delivery' },
  { prefix: '/admin/food/customers', resource: 'customers' },
  { prefix: '/admin/food/support', resource: 'support' },
  { prefix: '/admin/food/support-tickets', resource: 'support' },
  { prefix: '/admin/food/chattings', resource: 'support' },
  { prefix: '/admin/food/contact-messages', resource: 'support' },
  { prefix: '/admin/food/safety-emergency-reports', resource: 'support' },
  { prefix: '/admin/food/reports', resource: 'reports' },
  { prefix: '/admin/food/transaction-report', resource: 'reports' },
  { prefix: '/admin/food/order-report', resource: 'reports' },
  { prefix: '/admin/food/tax-report', resource: 'reports' },
  { prefix: '/admin/food/restaurant-report', resource: 'reports' },
  { prefix: '/admin/food/customer-report', resource: 'reports' },
  { prefix: '/admin/food/wallet', resource: 'wallet' },
  { prefix: '/admin/food/transactions', resource: 'wallet' },
  { prefix: '/admin/food/restaurant-withdraws', resource: 'wallet' },
  { prefix: '/admin/food/campaigns', resource: 'promotions' },
  { prefix: '/admin/food/coupons', resource: 'promotions' },
  { prefix: '/admin/food/banners', resource: 'promotions' },
  { prefix: '/admin/food/promotional-banner', resource: 'promotions' },
  { prefix: '/admin/food/hero-banner-management', resource: 'promotions' },
  { prefix: '/admin/food/referral-settings', resource: 'referrals' },
  { prefix: '/admin/food/fee-settings', resource: 'fee_settings' },
  { prefix: '/admin/food/dining', resource: 'dining' },
  { prefix: '/admin/food/business-setup', resource: 'settings' },
  { prefix: '/admin/food/settings', resource: 'settings' },
  { prefix: '/admin/food/system', resource: 'settings' },
  { prefix: '/admin/food/broadcast-notification', resource: 'settings' },
  { prefix: '/admin/food/pages-social-media', resource: 'cms' },
];

export const getRouteResource = (pathname = '') => {
  if (pathname === '/admin/food' || pathname === '/admin/food/') return 'dashboard';
  const match = PATH_RESOURCE_RULES.find((rule) => pathname.startsWith(rule.prefix));
  return match?.resource || null;
};

export const getRoutePermission = (pathname = '') => {
  const resource = getRouteResource(pathname);
  return resource ? buildPermissionKey(resource, 'read') : null;
};

const itemHasAccess = (admin, item) => {
  if (item.resource) {
    return canReadFood(admin, item.resource);
  }

  if (item.permission) {
    return hasFoodAdminPermission(admin, item.permission);
  }

  if (item.path) {
    const resource = getRouteResource(item.path);
    if (resource) return canReadFood(admin, resource);
  }

  if (item.subItems?.length) {
    return item.subItems.some((subItem) => itemHasAccess(admin, subItem));
  }

  return true;
};

export const filterFoodSidebarMenu = (menu = [], admin = {}) => {
  if (isFoodSuperAdminLike(admin)) return menu;

  return menu
    .map((item) => {
      if (item.type === 'link') {
        return itemHasAccess(admin, item) ? item : null;
      }

      if (item.type === 'section') {
        const items = (item.items || [])
          .map((subItem) => {
            if (subItem.type === 'expandable') {
              const subItems = (subItem.subItems || []).filter((entry) => itemHasAccess(admin, entry));
              if (subItems.length === 0) return null;
              return { ...subItem, subItems };
            }
            return itemHasAccess(admin, subItem) ? subItem : null;
          })
          .filter(Boolean);

        if (items.length === 0) return null;
        return { ...item, items };
      }

      if (item.type === 'expandable') {
        if (item.resource && !canReadFood(admin, item.resource)) return null;
        const subItems = (item.subItems || []).filter((entry) => itemHasAccess(admin, entry));
        if (subItems.length === 0) return null;
        return { ...item, subItems };
      }

      return itemHasAccess(admin, item) ? item : null;
    })
    .filter(Boolean);
};

export const parentCanAssignRead = (parent = {}, resource) => {
  if (isFoodSuperAdminLike(parent)) return true;
  return canReadFood(parent, resource);
};

export const parentCanAssignWrite = (parent = {}, resource) => {
  if (isFoodSuperAdminLike(parent)) return true;
  return canWriteFood(parent, resource);
};

export const normalizeFoodAdminProfile = (profile = {}) => {
  const source = profile && typeof profile === 'object' ? profile : {};
  const adminLevel = resolveAdminLevel(source);
  const isSuper = isFoodSuperAdminLike(source);
  const permissions = normalizePermissions(source.permissions);

  return {
    ...source,
    adminLevel,
    module: source.module || 'food',
    admin_type: isSuper ? 'superadmin' : 'subadmin',
    permissions: isSuper ? (permissions.includes('*') ? permissions : ['*', ...permissions]) : expandLegacyPermissions(permissions),
    food_zone_ids: Array.isArray(source.food_zone_ids) ? source.food_zone_ids : [],
  };
};
