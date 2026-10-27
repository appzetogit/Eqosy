import { useEffect, useState } from 'react';
import api from '../api/axiosInstance';

// GST is configured by admin (Admin > App Settings > GST Settings). The app never assumes a rate of its own.
const EMPTY_GST_SETTINGS = { gstin: '', show_cgst_sgst_split: false, services: {} };

const CACHE_TTL_MS = 60 * 1000;

let cachedSettings = null;
let cachedAt = 0;
let inflight = null;

const hasFreshCache = () => Boolean(cachedSettings) && Date.now() - cachedAt < CACHE_TTL_MS;

const loadGstSettings = () => {
  if (hasFreshCache()) return Promise.resolve(cachedSettings);
  if (!inflight) {
    inflight = api.get('/rides/app-settings/gst')
      .then((response) => {
        cachedSettings = response?.data?.settings || response?.settings || EMPTY_GST_SETTINGS;
        cachedAt = Date.now();
        return cachedSettings;
      })
      .catch(() => EMPTY_GST_SETTINGS)
      .finally(() => { inflight = null; });
  }
  return inflight;
};

/** Returns the admin-configured { enabled, rate } for a service key (ride | parcel | intercity). */
export const getGstRateForService = (settings, serviceKey) => {
  const row = settings?.services?.[serviceKey];
  const rate = Number(row?.rate);
  const enabled = Boolean(row?.enabled) && Number.isFinite(rate) && rate > 0;
  return { enabled, rate: enabled ? rate : 0 };
};

/** Adds GST on top of a pre-GST amount. */
export const addGst = (amount, rate) => {
  const base = Math.max(0, Number(amount) || 0);
  const safeRate = Math.max(0, Number(rate) || 0);
  const gstAmount = (base * safeRate) / 100;
  return { base, gstAmount, total: base + gstAmount };
};

export const useGstSettings = () => {
  const [settings, setSettings] = useState(cachedSettings || EMPTY_GST_SETTINGS);
  const [loaded, setLoaded] = useState(Boolean(cachedSettings));

  useEffect(() => {
    let active = true;
    loadGstSettings().then((next) => {
      if (active) {
        setSettings(next);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, []);

  return { gstSettings: settings, gstLoaded: loaded };
};
