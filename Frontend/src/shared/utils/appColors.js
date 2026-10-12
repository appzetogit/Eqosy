// Per-app color combinations edited in Admin -> Global -> Branding & Colors.
// Defaults equal the colors the apps already ship with, so nothing changes until an admin edits them.
export const APP_COLOR_KEYS = [
  { key: 'admin', label: 'Admin Panel', hint: 'Buttons, links and highlights in Food and Taxi admin' },
  { key: 'user', label: 'Food User App', hint: 'Customer food ordering app' },
  { key: 'delivery', label: 'Delivery Partner App', hint: 'Delivery partner app' },
  { key: 'restaurant', label: 'Vendor / Restaurant App', hint: 'Restaurant partner app' },
  { key: 'taxiUser', label: 'Taxi User App', hint: 'Taxi rider app' },
  { key: 'taxiDriver', label: 'Taxi Driver App', hint: 'Taxi driver / owner app' },
];

export const DEFAULT_APP_COLORS = {
  admin: { primary: '#4F46E5', secondary: '#3730A3' },
  user: { primary: '#EB590E', secondary: '#D94F0C' },
  delivery: { primary: '#F38F24', secondary: '#D97706' },
  restaurant: { primary: '#F38F24', secondary: '#D97706' },
  taxiUser: { primary: '#F38F24', secondary: '#D97706' },
  taxiDriver: { primary: '#FF6B00', secondary: '#D95A00' },
};

const HEX = /^#([0-9a-fA-F]{6})$/;

export const normalizeAppColors = (raw = {}) => {
  const result = {};
  APP_COLOR_KEYS.forEach(({ key }) => {
    const entry = raw?.[key] || {};
    result[key] = {
      primary: HEX.test(entry.primary || '') ? entry.primary.toUpperCase() : DEFAULT_APP_COLORS[key].primary,
      secondary: HEX.test(entry.secondary || '') ? entry.secondary.toUpperCase() : DEFAULT_APP_COLORS[key].secondary,
    };
  });
  return result;
};

export const getAppKeyForPath = (pathname = '') => {
  const path = String(pathname).toLowerCase();
  if (path.startsWith('/admin') || path.startsWith('/taxi/admin')) return 'admin';
  if (path.startsWith('/taxi/driver') || path.startsWith('/taxi/owner')) return 'taxiDriver';
  if (path.startsWith('/taxi')) return 'taxiUser';
  if (path.startsWith('/food/restaurant') || path.startsWith('/restaurant')) return 'restaurant';
  if (path.startsWith('/food/delivery') || path.startsWith('/delivery')) return 'delivery';
  return 'user';
};

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (hex, targetHex, amount) => {
  const a = channels(hex);
  const b = channels(targetHex);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
};

const SHADES = {
  50: ['#FFFFFF', 0.92],
  100: ['#FFFFFF', 0.84],
  200: ['#FFFFFF', 0.68],
  300: ['#FFFFFF', 0.5],
  400: ['#FFFFFF', 0.25],
  500: ['#FFFFFF', 0.1],
  600: null,
  700: ['#000000', 0.15],
  800: ['#000000', 0.3],
  900: ['#000000', 0.45],
};
// Admin screens use Tailwind's indigo/blue utilities; Tailwind v4 reads them from CSS variables.
const ADMIN_FAMILIES = ['indigo', 'blue'];

const adminVarNames = ADMIN_FAMILIES.flatMap((family) => Object.keys(SHADES).map((shade) => `--color-${family}-${shade}`));

export const applyAppColors = (appColors, pathname) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const colors = normalizeAppColors(appColors);
  const appKey = getAppKeyForPath(pathname);
  const { primary, secondary } = colors[appKey];

  root.style.setProperty('--app-primary', primary);
  root.style.setProperty('--app-secondary', secondary);
  root.style.setProperty('--app-primary-soft', mix(primary, '#FFFFFF', 0.9));
  root.dataset.appKey = appKey;

  if (appKey === 'admin') {
    ADMIN_FAMILIES.forEach((family) => {
      Object.entries(SHADES).forEach(([shade, spec]) => {
        root.style.setProperty(`--color-${family}-${shade}`, spec ? mix(primary, spec[0], spec[1]) : primary);
      });
    });
    root.style.setProperty('--admin-theme-color', primary);
  } else {
    adminVarNames.forEach((name) => root.style.removeProperty(name));
  }
};
