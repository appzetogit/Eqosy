import { Ride } from '../../user/models/Ride.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { buildRideGstBreakdown } from '../../services/gstService.js';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const SERVICE_TYPES = ['ride', 'parcel', 'intercity'];
const SERVICE_LABELS = { ride: 'Ride', parcel: 'Parcel', intercity: 'Intercity' };

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

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Weeks run Monday to Sunday. */
const startOfWeek = (d) => {
  const day = (d.getDay() + 6) % 7;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day));
};

/** Same date-range names the Food tax report uses, plus the legacy from/to query params. */
const resolveRange = (query = {}) => {
  const now = new Date();
  const type = String(query.dateRangeType || '').trim();

  switch (type) {
    case 'Today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'Yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'This Week':
      return { from: startOfWeek(now), to: endOfDay(now) };
    case 'Last Week': {
      const start = startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
      return { from: start, to: endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)) };
    }
    case 'This Month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case 'Last Month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'Past 3 Months':
      return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: endOfDay(now) };
    case 'Past 6 Months':
      return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: endOfDay(now) };
    case 'This Year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case 'Last Year':
      return { from: new Date(now.getFullYear() - 1, 0, 1), to: endOfDay(new Date(now.getFullYear() - 1, 11, 31)) };
    case 'Specific Month & Year': {
      const month = Number.parseInt(query.selectedMonth, 10);
      const year = Number.parseInt(query.selectedYear, 10);
      if (month >= 1 && month <= 12 && year > 1970) {
        return { from: new Date(year, month - 1, 1), to: endOfDay(new Date(year, month, 0)) };
      }
      return { from: null, to: null };
    }
    case 'Custom Range':
      return { from: parseDate(query.fromDate), to: parseDate(query.toDate, true) };
    case 'All Time':
      return { from: null, to: null };
    default:
      // Legacy callers pass plain from/to dates.
      return { from: parseDate(query.from), to: parseDate(query.to, true) };
  }
};

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
 * Completed rides inside the requested filters, each with its GST breakdown. Uses the GST snapshot stored on the
 * ride, so changing the admin rate later never rewrites past reports.
 */
const loadFilteredRides = async (query = {}) => {
  const { from, to } = resolveRange(query);
  const serviceType = String(query.service_type || '').trim();
  const taxFilter = String(query.taxFilter || 'all').trim();
  const term = String(query.search || '').trim().toLowerCase();

  const dbQuery = { status: RIDE_STATUS.COMPLETED };
  if (SERVICE_TYPES.includes(serviceType)) dbQuery.serviceType = serviceType;
  if (from || to) {
    // completedAt can be missing on older rides, in which case the report falls back to createdAt.
    const window = {};
    if (from) window.$gte = from;
    if (to) window.$lte = to;
    dbQuery.$or = [{ completedAt: window }, { completedAt: null, createdAt: window }];
  }

  const rides = await Ride.find(dbQuery)
    .select('serviceType fare previousCancellationFee pricingSnapshot.gst completedAt createdAt userId driverId')
    .populate({ path: 'userId', select: 'name phone', options: { lean: true } })
    .populate({ path: 'driverId', select: 'name phone', options: { lean: true } })
    .sort({ completedAt: -1, createdAt: -1 })
    .lean();

  const list = [];
  rides.forEach((ride) => {
    const when = new Date(ride.completedAt || ride.createdAt);
    const sales = Math.max(0, Number(ride.fare || 0) - Number(ride.previousCancellationFee || 0));
    const breakdown = buildRideGstBreakdown(ride);

    if (taxFilter === 'taxed' && !breakdown) return;
    if (taxFilter === 'untaxed' && breakdown) return;
    if (taxFilter === 'split' && !(breakdown && breakdown.cgstAmount !== null)) return;

    const service = ride.serviceType || 'ride';
    const entry = {
      id: String(ride._id),
      rideId: String(ride._id).slice(-8).toUpperCase(),
      serviceType: service,
      serviceLabel: SERVICE_LABELS[service] || service,
      date: when,
      dayKey: dayKey(when),
      monthKey: monthKey(when),
      userName: ride.userId?.name || '',
      userPhone: ride.userId?.phone || '',
      driverName: ride.driverId?.name || '',
      driverPhone: ride.driverId?.phone || '',
      sales,
      breakdown,
    };

    if (term) {
      const haystack = [
        entry.id, entry.rideId, entry.serviceLabel, entry.dayKey, entry.monthKey,
        entry.userName, entry.userPhone, entry.driverName, entry.driverPhone,
      ].join(' ').toLowerCase();
      if (!haystack.includes(term)) return;
    }

    list.push(entry);
  });
  return list;
};

export const buildTaxReport = async (query = {}) => {
  const rides = await loadFilteredRides(query);

  const summary = emptyRow('all');
  const byService = new Map();
  const byDay = new Map();
  const byMonth = new Map();

  const bump = (map, key, entry) => {
    if (!map.has(key)) map.set(key, emptyRow(key));
    addRide(map.get(key), entry);
  };

  rides.forEach((entry) => {
    addRide(summary, entry);
    bump(byService, entry.serviceType, entry);
    bump(byDay, entry.dayKey, entry);
    bump(byMonth, entry.monthKey, entry);
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

/** Individual rides behind one row of the report (a service, a day or a month). */
export const buildTaxReportDetail = async (query = {}) => {
  const groupBy = ['service', 'day', 'month'].includes(query.groupBy) ? query.groupBy : 'service';
  const key = String(query.key || '').trim();
  const rides = await loadFilteredRides(query);

  const keyOf = { service: (r) => r.serviceType, day: (r) => r.dayKey, month: (r) => r.monthKey }[groupBy];

  return {
    rides: rides
      .filter((r) => !key || keyOf(r) === key)
      .map((r) => ({
        id: r.id,
        rideId: r.rideId,
        serviceLabel: r.serviceLabel,
        date: r.date,
        userName: r.userName,
        userPhone: r.userPhone,
        driverName: r.driverName,
        driverPhone: r.driverPhone,
        totalAmount: round(r.sales),
        taxableAmount: round(r.breakdown ? r.breakdown.taxableAmount : r.sales),
        gstRate: r.breakdown ? r.breakdown.rate : 0,
        gstAmount: round(r.breakdown?.gstAmount || 0),
        cgstAmount: round(r.breakdown?.cgstAmount || 0),
        sgstAmount: round(r.breakdown?.sgstAmount || 0),
      })),
  };
};
