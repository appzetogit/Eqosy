import { createDefaultBusinessSettings } from '../admin/data/defaultBusinessSettings.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';

const defaultTransportRideSettings = createDefaultBusinessSettings().transport_ride || {};
const defaultBidRideSettings = createDefaultBusinessSettings().bid_ride || {};

const toPositiveNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
};

// The dispatch/notify loops read these settings per ride per driver ping, but the values change
// only when an admin edits them. Cache the single AdminBusinessSetting read for a short TTL so a
// busy dispatch does not hammer Mongo; edits propagate within TTL_MS (no explicit invalidation).
const SETTINGS_CACHE_TTL_MS = Number(process.env.TRANSPORT_SETTINGS_CACHE_TTL_MS) || 30000;
let settingsCache = null;
let settingsCacheExpiresAt = 0;
let settingsCachePromise = null;

const loadBusinessSettings = async () => {
  const now = Date.now();
  if (settingsCache && now < settingsCacheExpiresAt) {
    return settingsCache;
  }
  // Collapse concurrent callers onto a single in-flight read.
  if (!settingsCachePromise) {
    settingsCachePromise = AdminBusinessSetting.findOne({ scope: 'default' })
      .select('transport_ride bid_ride')
      .lean()
      .then((doc) => {
        settingsCache = doc || {};
        settingsCacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
        return settingsCache;
      })
      .finally(() => {
        settingsCachePromise = null;
      });
  }
  return settingsCachePromise;
};

// Drop the cache immediately after an admin writes settings, so changes take effect at once.
export const invalidateTransportSettingsCache = () => {
  settingsCache = null;
  settingsCacheExpiresAt = 0;
};

export const getTransportRideSettings = async () => {
  const businessSettings = await loadBusinessSettings();

  return {
    ...defaultTransportRideSettings,
    ...(businessSettings?.transport_ride || {}),
  };
};

export const getBidRideSettings = async () => {
  const businessSettings = await loadBusinessSettings();

  return {
    ...defaultBidRideSettings,
    ...(businessSettings?.bid_ride || {}),
  };
};

export const resolveTransportDispatchConfig = async () => {
  const settings = await getTransportRideSettings();
  const driverSearchRadiusKm = toPositiveNumber(
    settings.driver_search_radius,
    toPositiveNumber(defaultTransportRideSettings.driver_search_radius, 5),
  );
  const retryWindowSeconds = toPositiveNumber(
    settings.trip_accept_reject_duration_for_driver,
    toPositiveNumber(defaultTransportRideSettings.trip_accept_reject_duration_for_driver, 15),
  );
  const maxSearchSeconds = toPositiveNumber(
    settings.maximum_time_for_find_drivers_for_regular_ride,
    toPositiveNumber(defaultTransportRideSettings.maximum_time_for_find_drivers_for_regular_ride, 300),
  );

  return {
    settings,
    dispatchType: String(settings.trip_dispatch_type || defaultTransportRideSettings.trip_dispatch_type) === '2'
      ? 'broadcast'
      : 'one_by_one',
    baseDistanceMeters: Math.round(driverSearchRadiusKm * 1000),
    maxDistanceMeters: Math.round(driverSearchRadiusKm * 1000),
    retryWindowSeconds,
    retryDelayMs: Math.round(retryWindowSeconds * 1000),
    maxSearchSeconds,
    maxAttempts: Math.max(1, Math.ceil(maxSearchSeconds / retryWindowSeconds)),
  };
};
