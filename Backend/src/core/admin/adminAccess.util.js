import { SUPERADMIN_PERMISSION } from './adminHierarchy.constants.js';

export { SUPERADMIN_PERMISSION };

const LEGACY_MANAGE_TO_WRITE = {
  'subadmins.manage': 'subadmins',
};

export const parsePermissionKey = (key = '') => {
  const normalized = String(key || '').trim();
  if (!normalized || normalized === SUPERADMIN_PERMISSION) {
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

export const buildPermissionKey = (resource, action = 'read') => {
  const normalizedResource = String(resource || '').trim();
  const normalizedAction = String(action || 'read').trim().toLowerCase();
  if (!normalizedResource) return '';
  if (normalizedAction === 'write') return `${normalizedResource}.write`;
  return `${normalizedResource}.read`;
};

export const normalizeAdminPermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    return [];
  }

  const normalized = permissions
    .map((permission) => String(permission || '').trim())
    .filter(Boolean);

  if (normalized.includes(SUPERADMIN_PERMISSION)) {
    return [SUPERADMIN_PERMISSION];
  }

  return [...new Set(normalized)];
};

export const expandLegacyPermissions = (permissions = []) => {
  const normalized = normalizeAdminPermissions(permissions);
  if (permissionsIncludeAll(normalized)) {
    return [SUPERADMIN_PERMISSION];
  }

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

export const normalizeAdminType = (value = '') =>
  String(value || '').trim().toLowerCase() === 'subadmin' ? 'subadmin' : 'superadmin';

export const permissionsIncludeAll = (permissions = []) =>
  normalizeAdminPermissions(permissions).includes(SUPERADMIN_PERMISSION);

export const hasResourcePermission = (permissions = [], resource, action = 'read') => {
  const normalizedResource = String(resource || '').trim();
  const normalizedAction = String(action || 'read').trim().toLowerCase();
  const expanded = expandLegacyPermissions(permissions);

  if (permissionsIncludeAll(expanded)) {
    return true;
  }

  const readKey = buildPermissionKey(normalizedResource, 'read');
  const writeKey = buildPermissionKey(normalizedResource, 'write');

  if (normalizedAction === 'write') {
    return expanded.includes(writeKey);
  }

  return expanded.includes(readKey) || expanded.includes(writeKey);
};

export const parentGrantsChildPermission = (parentPermissions = [], childPermission) => {
  const parent = expandLegacyPermissions(parentPermissions);
  if (permissionsIncludeAll(parent)) {
    return true;
  }

  const parsed = parsePermissionKey(childPermission);
  if (!parsed.resource) {
    return parent.includes(childPermission);
  }

  return hasResourcePermission(parent, parsed.resource, parsed.action);
};

export const assertPermissionsSubset = (parentPermissions = [], childPermissions = []) => {
  const parent = normalizeAdminPermissions(parentPermissions);
  const child = normalizeAdminPermissions(childPermissions);

  if (permissionsIncludeAll(parent)) {
    return;
  }

  if (permissionsIncludeAll(child)) {
    throw new Error('Child admin cannot have full access when parent does not');
  }

  const expandedChild = expandLegacyPermissions(child);
  const invalid = expandedChild.filter((permission) => !parentGrantsChildPermission(parent, permission));

  if (invalid.length > 0) {
    throw new Error(`Child permissions exceed parent scope: ${invalid.join(', ')}`);
  }
};

export const assertIdSubset = (parentIds = [], childIds = [], label = 'scope') => {
  const parentSet = new Set((Array.isArray(parentIds) ? parentIds : []).map((id) => String(id)));
  const childList = (Array.isArray(childIds) ? childIds : []).map((id) => String(id));

  if (parentSet.size === 0) {
    return;
  }

  const invalid = childList.filter((id) => !parentSet.has(id));
  if (invalid.length > 0) {
    throw new Error(`Assigned ${label} is outside parent scope`);
  }
};

export const flattenResourcePermissions = (resourcePermissions = {}) => {
  const flat = [];

  Object.entries(resourcePermissions).forEach(([resource, access]) => {
    if (access?.read) flat.push(buildPermissionKey(resource, 'read'));
    if (access?.write) flat.push(buildPermissionKey(resource, 'write'));
  });

  return [...new Set(flat)];
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
