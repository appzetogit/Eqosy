export const ADMIN_LEVELS = {
  PLATFORM_SUPERADMIN: 'platform_superadmin',
  FOOD_SUPERADMIN: 'food_superadmin',
  TAXI_SUPERADMIN: 'taxi_superadmin',
  SUBADMIN: 'subadmin',
};

export const ADMIN_MODULES = {
  FOOD: 'food',
  TAXI: 'taxi',
  QUICK_COMMERCE: 'quickCommerce',
};

export const ALL_ADMIN_MODULES = Object.values(ADMIN_MODULES);

export const MODULE_SUPERADMIN_LEVELS = {
  [ADMIN_MODULES.FOOD]: ADMIN_LEVELS.FOOD_SUPERADMIN,
  [ADMIN_MODULES.TAXI]: ADMIN_LEVELS.TAXI_SUPERADMIN,
};

export const SUPERADMIN_PERMISSION = '*';
