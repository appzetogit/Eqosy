import { Ride } from '../../user/models/Ride.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { buildRideGstBreakdown } from '../../services/gstService.js';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const parseDate = (value, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) date.setHours(23, 59, 59, 999);
  return date;
};

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const emptyRow = (key) => ({
  key,
  rides: 0,
  taxedRides: 0,
  totalSales: 0,
  taxableAmount: 0,
  gstAmount: 0,
  cgstAmount: 0,
  sgstAmount: 0,
});

const addRide = (row, { sales, breakdown }) => {
  row.rides += 1;
  row.totalSales += sales;
  if (!breakdown) {
    row.taxableAmount += sales;
    return;
  }
  row.taxedRides += 1;
  row.taxableAmount += breakdown.taxableAmount;
  row.gstAmount += breakdown.gstAmount;
  row.cgstAmount += breakdown.cgstAmount || 0;
  row.sgstAmount += breakdown.sgstAmount || 0;
};

const finalize = (row) => ({
  ...row,
  totalSales: round(row.totalSales),
  taxableAmount: round(row.taxableAmount),
  gstAmount: round(row.gstAmount),
  cgstAmount: round(row.cgstAmount),
  sgstAmount: round(row.sgstAmount),
});

/**
 * GST collected on completed taxi rides. Uses the GST snapshot stored on each ride, so changing the admin rate
 * later never rewrites past reports.
 */
export const buildTaxReport = async ({ from, to, service_type: serviceType } = {}) => {
  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);
  const query = { status: RIDE_STATUS.COMPLETED };
  if (['ride', 'parcel', 'intercity'].includes(serviceType)) query.serviceType = serviceType;

  const rides = await Ride.find(query)
    .select('serviceType fare previousCancellationFee pricingSnapshot.gst completedAt createdAt')
    .lean();

  const summary = emptyRow('all');
  const byService = new Map();
  const byDay = new Map();
  const byMonth = new Map();

  const bump = (map, key, entry) => {
    if (!map.has(key)) map.set(key, emptyRow(key));
    addRide(map.get(key), entry);
  };

  rides.forEach((ride) => {
    const when = new Date(ride.completedAt || ride.createdAt);
    if ((fromDate && when < fromDate) || (toDate && when > toDate)) return;

    const sales = Math.max(0, Number(ride.fare || 0) - Number(ride.previousCancellationFee || 0));
    const entry = { sales, breakdown: buildRideGstBreakdown(ride) };

    addRide(summary, entry);
    bump(byService, ride.serviceType || 'ride', entry);
    bump(byDay, dayKey(when), entry);
    bump(byMonth, monthKey(when), entry);
  });

  const toList = (map, sortDesc = false) => {
    const list = [...map.values()].map(finalize);
    return sortDesc ? list.sort((a, b) => b.key.localeCompare(a.key)) : list.sort((a, b) => a.key.localeCompare(b.key));
  };

  return {
    summary: finalize(summary),
    byService: toList(byService),
    byDay: toList(byDay, true),
    byMonth: toList(byMonth, true),
  };
};
