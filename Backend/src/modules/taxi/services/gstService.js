import { ApiError } from '../../../utils/ApiError.js';
import { createDefaultAppSettings } from '../admin/data/defaultAppSettings.js';
import { AdminAppSetting } from '../admin/models/AdminAppSetting.js';

// Taxi services that carry GST. Rates themselves are only ever read from admin settings.
export const GST_SERVICE_KEYS = ['ride', 'parcel', 'intercity'];

const defaultGstSetting = createDefaultAppSettings().gst_setting;

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

const parseRate = (value, { strict, serviceKey }) => {
  const numeric = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    if (strict) {
      throw new ApiError(400, `GST rate for ${serviceKey} must be a number between 0 and 100`);
    }
    return 0;
  }
  return numeric;
};

/**
 * Normalizes raw gst_setting into { gstin, show_cgst_sgst_split, services: { [key]: { enabled, rate } } }.
 * strict=true (admin save) rejects invalid rates; strict=false (read path) coerces them to 0.
 */
export const normalizeGstSettings = (raw = {}, { strict = false } = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const services = {};

  GST_SERVICE_KEYS.forEach((serviceKey) => {
    const row = source.services?.[serviceKey] || defaultGstSetting.services[serviceKey] || {};
    const enabled = toBoolean(row.enabled);
    services[serviceKey] = {
      enabled,
      rate: parseRate(row.rate ?? 0, { strict: strict && enabled, serviceKey }),
    };
  });

  return {
    gstin: String(source.gstin ?? defaultGstSetting.gstin ?? '').trim().toUpperCase(),
    show_cgst_sgst_split: source.show_cgst_sgst_split === undefined
      ? Boolean(defaultGstSetting.show_cgst_sgst_split)
      : toBoolean(source.show_cgst_sgst_split),
    services,
  };
};

export const getGstSettings = async () => {
  const doc = await AdminAppSetting.findOne({ scope: 'default' }).select('gst_setting').lean();
  return normalizeGstSettings(doc?.gst_setting || {});
};

/** Returns the effective { serviceKey, enabled, rate } for a ride service type. */
export const resolveGstForService = (settings, serviceType) => {
  const serviceKey = GST_SERVICE_KEYS.includes(serviceType) ? serviceType : 'ride';
  const row = settings?.services?.[serviceKey] || { enabled: false, rate: 0 };
  const rate = row.enabled ? Number(row.rate) || 0 : 0;
  return { serviceKey, enabled: Boolean(row.enabled) && rate > 0, rate };
};

/** Splits a GST-inclusive amount into taxable value + GST. */
export const splitInclusiveGst = (inclusiveAmount, rate) => {
  const total = Math.max(0, Number(inclusiveAmount) || 0);
  const safeRate = Math.max(0, Number(rate) || 0);
  if (!safeRate) {
    return { taxableAmount: roundMoney(total), gstAmount: 0, totalAmount: roundMoney(total) };
  }
  const taxableAmount = roundMoney(total / (1 + safeRate / 100));
  return { taxableAmount, gstAmount: roundMoney(total - taxableAmount), totalAmount: roundMoney(total) };
};

/**
 * GST breakdown shown to the rider and the driver. Built from the rate snapshotted on the ride, so later admin
 * changes never rewrite an existing ride. Previous cancellation dues are not part of the taxable fare.
 */
export const buildRideGstBreakdown = (ride) => {
  const snapshot = ride?.pricingSnapshot?.gst;
  if (!snapshot?.enabled || !(Number(snapshot.rate) > 0)) {
    return null;
  }

  const duesIncluded = Number(ride.previousCancellationFee || 0);
  const rideFare = Math.max(0, Number(ride.fare || 0) - duesIncluded);
  const { taxableAmount, gstAmount, totalAmount } = splitInclusiveGst(rideFare, snapshot.rate);
  const half = snapshot.showCgstSgstSplit ? roundMoney(gstAmount / 2) : null;

  return {
    serviceKey: snapshot.serviceKey || 'ride',
    rate: Number(snapshot.rate),
    gstin: snapshot.gstin || '',
    taxableAmount,
    gstAmount,
    cgstAmount: half,
    sgstAmount: half === null ? null : roundMoney(gstAmount - half),
    totalAmount,
  };
};

/** Value stored in ride.pricingSnapshot.gst when a ride is created. */
export const buildGstSnapshot = (settings, serviceType) => {
  const resolved = resolveGstForService(settings, serviceType);
  return {
    serviceKey: resolved.serviceKey,
    enabled: resolved.enabled,
    rate: resolved.enabled ? resolved.rate : 0,
    gstin: settings?.gstin || '',
    showCgstSgstSplit: Boolean(settings?.show_cgst_sgst_split),
  };
};
