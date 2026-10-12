/**
 * Business Settings Utility
 * Handles loading and updating business settings (favicon, title, logo)
 */

import apiClient from "@food/api/axios";
import { API_ENDPOINTS } from "@food/api/config";
import { publicGetOnce } from "@food/api";

const SETTINGS_KEY = 'food_business_settings';

export const normalizeCompanyName = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "Eqosy";
  if (raw.toLowerCase() === "appzeto") return "Eqosy";
  return raw;
};

// Initialize from localStorage immediately so it's available for components on mount
let cachedSettings = (() => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
})();

// Apply cached settings immediately on module load if they exist
if (cachedSettings) {
  setTimeout(() => {
    updateFavicon(cachedSettings.favicon?.url);
    updateTitle(normalizeCompanyName(cachedSettings.companyName));
    applyThemeColors(cachedSettings);
  }, 0);
}

const applyThemeColors = (settings) => {
  if (typeof document === 'undefined' || !settings) return;
  const root = document.documentElement;
  const entries = [
    ['--app-theme-color', settings.themeColor],
    ['--landing-theme-color', settings.landingThemeColor],
    ['--admin-sidebar-text-color', settings.sidebarTextColor],
  ];
  entries.forEach(([name, value]) => {
    if (/^#([0-9a-fA-F]{6})$/.test(String(value || ''))) root.style.setProperty(name, value);
  });
};

let inFlightSettingsPromise = null;

/**
 * Load business settings from backend (public endpoint - no auth required)
 */
export const loadBusinessSettings = async () => {
  try {
    // If we have no cached settings, we MUST fetch
    // If we have cached settings, we still try to fetch in background to ensure they are fresh
    const endpoint = API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS_PUBLIC;
    if (!endpoint || (typeof endpoint === "string" && !endpoint.trim())) {
      return cachedSettings;
    }

    if (inFlightSettingsPromise) {
      return await inFlightSettingsPromise;
    }

    inFlightSettingsPromise = (async () => {
      // Use public endpoint that doesn't require authentication
      // Use noCache to ensure we get fresh data from server this time
      const response = await publicGetOnce(endpoint, { noCache: true });
      const settings = response?.data?.data || response?.data;

      if (settings) {
        const normalizedSettings = {
          ...settings,
          companyName: normalizeCompanyName(settings.companyName),
        };
        cachedSettings = normalizedSettings;
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizedSettings));
        } catch (e) {}
        
        updateFavicon(normalizedSettings.favicon?.url);
        updateTitle(normalizedSettings.companyName);
        applyThemeColors(normalizedSettings);
        return normalizedSettings;
      }
      return cachedSettings;
    })();

    return await inFlightSettingsPromise;
  } catch (error) {
    // Return cached if failed
    return cachedSettings;
  } finally {
    inFlightSettingsPromise = null;
  }
};

/**
 * Update favicon in document
 */
export const updateFavicon = (url) => {
  if (!url || typeof document === 'undefined') return;

  // Remove existing favicons
  const existingFavicons = document.querySelectorAll("link[rel*='icon']");
  existingFavicons.forEach(el => el.remove());

  // Add new favicon
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = url;
  // Prevent third-party cookie warning (Cloudinary)
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
};

/**
 * Update page title
 */
export const updateTitle = (companyName) => {
  if (typeof document !== 'undefined') {
    document.title = normalizeCompanyName(companyName);
  }
};

/**
 * Set cached settings manually (useful after update)
 */
export const setCachedSettings = (settings) => {
  if (settings) {
    const normalizedSettings = {
      ...settings,
      companyName: normalizeCompanyName(settings.companyName),
    };
    cachedSettings = normalizedSettings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizedSettings));
    } catch (e) {}
    
    updateFavicon(normalizedSettings.favicon?.url);
    updateTitle(normalizedSettings.companyName);
  }
};

/**
 * Clear cached settings (call after updating settings)
 */
export const clearCache = () => {
  cachedSettings = null;
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {}
};

/**
 * Get cached settings
 */
export const getCachedSettings = () => {
  return cachedSettings;
};

/**
 * Get company name from business settings with fallback
 * @returns {string} Company name or default "Eqosy Food"
 */
export const getCompanyName = () => {
  const settings = getCachedSettings();
  return normalizeCompanyName(settings?.companyName);
};

/**
 * Get company name asynchronously (loads if not cached)
 * @returns {Promise<string>} Company name or default "Eqosy Food"
 */
export const getCompanyNameAsync = async () => {
  try {
    const settings = await loadBusinessSettings();
    return normalizeCompanyName(settings?.companyName);
  } catch (error) {
    return "Eqosy";
  }
};

