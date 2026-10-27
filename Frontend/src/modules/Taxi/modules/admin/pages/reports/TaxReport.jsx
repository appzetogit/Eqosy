import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Receipt, IndianRupee, Car, FileText } from 'lucide-react';
import { adminService } from '../../services/adminService';

const SERVICE_LABELS = { ride: 'Ride', parcel: 'Parcel', intercity: 'Intercity' };
const TABS = [
  { id: 'service', label: 'By Service' },
  { id: 'day', label: 'Day-Wise' },
  { id: 'month', label: 'Month-Wise' },
];

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getPresetRange = (preset) => {
  const now = new Date();
  const today = fmtDate(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'month') return { from: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (preset === 'last_month') {
    return {
      from: fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: fmtDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === 'year') return { from: `${now.getFullYear()}-01-01`, to: today };
  if (preset === 'last_year') return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
  return { from: '', to: '' };
};

const PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
];

const TaxReport = () => {
  const [preset, setPreset] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [serviceType, setServiceType] = useState('');
  const [tab, setTab] = useState('service');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextRange, nextService) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (nextRange.from) params.from = nextRange.from;
      if (nextRange.to) params.to = nextRange.to;
      if (nextService) params.service_type = nextService;
      setData(await adminService.getTaxReport(params));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load tax report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ from: '', to: '' }, '');
  }, [load]);

  const selectPreset = (id) => {
    const next = getPresetRange(id);
    setPreset(id);
    setRange(next);
    load(next, serviceType);
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const list = tab === 'day' ? data.byDay : tab === 'month' ? data.byMonth : data.byService;
    const term = search.trim().toLowerCase();
    return (list || []).filter((row) => {
      const label = tab === 'service' ? SERVICE_LABELS[row.key] || row.key : row.key;
      return !term || label.toLowerCase().includes(term);
    });
  }, [data, tab, search]);

  const exportCsv = () => {
    const header = ['Period / Service', 'Rides', 'Taxed Rides', 'Total Sales', 'Taxable Amount', 'CGST', 'SGST', 'GST'];
    const lines = rows.map((r) => [
      tab === 'service' ? SERVICE_LABELS[r.key] || r.key : r.key,
      r.rides, r.taxedRides, r.totalSales, r.taxableAmount, r.cgstAmount, r.sgstAmount, r.gstAmount,
    ].join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taxi-tax-report-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const cards = [
    { label: 'GST Collected', value: money(summary?.gstAmount), icon: Receipt, tone: 'text-rose-600 bg-rose-50' },
    { label: 'Total Sales (incl. GST)', value: money(summary?.totalSales), icon: IndianRupee, tone: 'text-indigo-600 bg-indigo-50' },
    { label: 'Taxable Amount', value: money(summary?.taxableAmount), icon: FileText, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Completed Rides', value: summary?.rides ?? 0, icon: Car, tone: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#334155] tracking-tight">Tax &amp; GST Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            GST collected on completed Ride, Parcel and Intercity trips. Rates come from each trip&apos;s own snapshot.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPreset(p.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${preset === p.id ? 'bg-[#4338CA] text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-xs font-bold uppercase text-slate-500">
            From
            <input
              type="date"
              value={range.from}
              onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, from: e.target.value })); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-bold uppercase text-slate-500">
            To
            <input
              type="date"
              value={range.to}
              onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, to: e.target.value })); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-bold uppercase text-slate-500">
            Service
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
            >
              <option value="">All Services</option>
              {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => load(range, serviceType)}
              className="rounded-xl bg-[#4338CA] px-5 py-2 text-sm font-bold text-white"
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={() => { setServiceType(''); selectPreset('all'); load({ from: '', to: '' }, ''); }}
              className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
            </div>
            <span className={`rounded-xl p-3 ${tone}`}><Icon size={22} /></span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setSearch(''); }}
                className={`rounded-full px-4 py-2 text-sm font-bold ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service or date..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-3 pr-4">{tab === 'service' ? 'Service' : tab === 'day' ? 'Date' : 'Month'}</th>
                <th className="py-3 pr-4 text-right">Rides</th>
                <th className="py-3 pr-4 text-right">Total Sales</th>
                <th className="py-3 pr-4 text-right">Taxable</th>
                <th className="py-3 pr-4 text-right">CGST</th>
                <th className="py-3 pr-4 text-right">SGST</th>
                <th className="py-3 text-right">GST</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No completed rides in this period.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-semibold text-slate-700">
                    {tab === 'service' ? SERVICE_LABELS[row.key] || row.key : row.key}
                  </td>
                  <td className="py-3 pr-4 text-right">{row.rides}</td>
                  <td className="py-3 pr-4 text-right">{money(row.totalSales)}</td>
                  <td className="py-3 pr-4 text-right">{money(row.taxableAmount)}</td>
                  <td className="py-3 pr-4 text-right">{money(row.cgstAmount)}</td>
                  <td className="py-3 pr-4 text-right">{money(row.sgstAmount)}</td>
                  <td className="py-3 text-right font-bold text-rose-600">{money(row.gstAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400">CGST/SGST show values only for trips where the split was enabled in GST Settings.</p>
      </div>
    </div>
  );
};

export default TaxReport;
